const { createHash, randomUUID } = require('node:crypto');
const { assertFiscalScope, isTestSubmissionEligible } = require('./verifactuEnvironment');
const { buildAeatQuerySoapEnvelope, parseAeatQueryResponse, evaluateAeatReconciliation, normalizeTaxId } = require('./aeatReconciliation');

const QUERY_LEASE_MS = 120000;
const id = value => /^[a-zA-Z0-9_-]{1,128}$/.test(String(value || ''));
const millis = value => value?.toMillis?.() ?? (value ? new Date(value).getTime() : 0);
const digest = value => createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

function createAeatReconciliationWorker({ db, timestamp, assertTenantEnabled, loadCertificate, transport,
  now = Date.now, newToken = randomUUID, buildQuery = buildAeatQuerySoapEnvelope, channel = 'cloud_certificate' }) {
  if (!['cloud_certificate', 'local_connector'].includes(channel)) throw new Error('Unsupported reconciliation channel');
  const local = channel === 'local_connector';
  const certificateData = data => local ? { ...data, connected: data.status === 'connected', taxId: data.expectedTaxId,
    validFrom: data.certificateValidFrom, validTo: data.certificateValidTo } : data;
  const refs = (companyId, submissionId) => {
    if (!id(companyId) || !id(submissionId)) throw new Error('Identificador de consulta no válido.');
    const base = `companies/${companyId}`;
    return { base, job: db.doc(`${base}/aeatSubmissions/${submissionId}`), settings: db.doc(`${base}/settings/billing`),
      certificate: db.doc(`${base}/verifactuConfig/${local ? 'localConnector' : 'certificate'}`),
      lease: db.doc(`${base}/verifactuConfig/delivery_test`) };
  };

  async function claim(companyId, submissionId, actorId) {
    const r = refs(companyId, submissionId);
    return db.runTransaction(async tx => {
      const time = now();
      const snaps = await Promise.all([r.job, r.settings, r.certificate, r.lease].map(ref => tx.get(ref)));
      const [job, settings, rawCertificate, lease] = snaps.map(snap => snap.data() || {});
      const certificate = certificateData(rawCertificate);
      if (!snaps[0].exists || !isTestSubmissionEligible(job, companyId) || job.status !== 'needs_review') {
        return { blocked: 'Solo se pueden conciliar registros de pruebas que necesitan revisión.' };
      }
      if (settings.verifactuEnabled !== true || settings.verifactuMode !== 'test' ||
          settings.aeatConnection?.environment !== 'test' || settings.aeatConnection?.channel !== channel ||
          settings.aeatConnection?.productionEnabled === true || settings.verifactuProduction?.enabled === true) {
        return { blocked: 'Guarda VeriFactu de pruebas con el certificado conectado. La producción sigue bloqueada.' };
      }
      if (certificate.connected !== true || certificate.environment !== 'test' || (!local && !certificate.secretVersion) ||
          (local && !Array.isArray(certificate.capabilities)) || (local && !certificate.capabilities.includes('query_reconciliation_v1')) ||
          normalizeTaxId(certificate.taxId) !== normalizeTaxId(settings.nif) || millis(certificate.validFrom) > time || millis(certificate.validTo) <= time) {
        return { blocked: 'Conecta un certificado vigente que corresponda al NIF de la empresa.' };
      }
      if (lease.attemptToken && millis(lease.leaseUntil) > time) return { blocked: 'Ya hay una consulta en curso para esta empresa.' };
      if (millis(lease.nextAllowedAt) > time) return { blocked: 'Espera unos segundos antes de volver a consultar a la AEAT.' };
      if (job.reconciliation?.attemptToken && millis(job.reconciliation.leaseUntil) > time) return { blocked: 'Esta factura ya se está consultando.' };
      if (local && job.reconciliation?.status !== 'awaiting_local_connector') return { blocked: 'La consulta no ha sido solicitada desde LimpiaGest.' };
      if (!id(job.fiscalRecordId) || !id(job.invoiceId)) return { blocked: 'El registro pendiente no tiene referencias fiscales válidas.' };
      const fiscalRef = db.doc(`${r.base}/fiscalRecords/${job.fiscalRecordId}`);
      const invoiceRef = db.doc(`${r.base}/invoices/${job.invoiceId}`);
      const [fiscalSnap, invoiceSnap] = await Promise.all([tx.get(fiscalRef), tx.get(invoiceRef)]);
      const fiscal = fiscalSnap.data();
      const invoice = invoiceSnap.data() || {};
      try { assertFiscalScope(fiscal, companyId, 'test'); } catch { return { blocked: 'El registro fiscal no pertenece a esta empresa y entorno.' }; }
      if (!invoiceSnap.exists || fiscal.invoiceId !== job.invoiceId || fiscal.invoiceNumber !== job.invoiceNumber ||
          fiscal.recordType !== job.recordType || !job.fiscalHash || fiscal.chain?.hash !== job.fiscalHash ||
          normalizeTaxId(fiscal.issuerNif) !== normalizeTaxId(settings.nif)) {
        return { blocked: 'La cola no coincide con el registro fiscal inmutable.' };
      }
      const queryXml = job.reconciliation?.queryXml || buildQuery(fiscal, { ...settings, companyId });
      const querySha256 = digest(queryXml);
      if (job.reconciliation?.querySha256 && job.reconciliation.querySha256 !== querySha256) {
        return { blocked: 'La consulta guardada no coincide con su huella de control.' };
      }
      const attemptToken = newToken();
      const leaseUntil = timestamp(time + QUERY_LEASE_MS);
      const attemptNumber = Number(job.reconciliation?.attempts || 0) + 1;
      const expected = { issuerNif: fiscal.issuerNif, invoiceNumber: fiscal.invoiceNumber,
        issueDate: fiscal.fechaExpedicionFactura, fingerprint: fiscal.chain.hash, recordType: fiscal.recordType };
      tx.update(r.job, { reconciliation: { status: 'processing', attemptToken, attemptNumber, attempts: attemptNumber,
        leaseUntil, startedAt: timestamp(time), startedBy: actorId, queryXml, querySha256, expected } });
      tx.set(r.lease, { environment: 'test', productionEnabled: false, attemptToken, submissionId, leaseUntil }, { merge: true });
      return { claimed: true, companyId, submissionId, invoiceId: job.invoiceId, fiscalRecordId: job.fiscalRecordId,
        actorId, attemptToken, attemptNumber, queryXml, expected, certificate,
        leaseExpiresAt: new Date(time + QUERY_LEASE_MS).toISOString() };
    });
  }

  async function complete(c, parsed) {
    const r = refs(c.companyId, c.submissionId);
    const evaluation = evaluateAeatReconciliation(parsed, c.expected);
    return db.runTransaction(async tx => {
      const time = now();
      const invoiceRef = db.doc(`${r.base}/invoices/${c.invoiceId}`);
      const snaps = await Promise.all([r.job, r.lease, invoiceRef].map(ref => tx.get(ref)));
      const [job, lease, invoice] = snaps.map(snap => snap.data() || {});
      if (!isTestSubmissionEligible(job, c.companyId) || job.status !== 'needs_review' ||
          job.reconciliation?.attemptToken !== c.attemptToken || lease.attemptToken !== c.attemptToken) {
        return { ignored: true, reason: 'stale_query' };
      }
      const accepted = ['accepted', 'accepted_with_errors'].includes(evaluation.outcome);
      const evidence = evaluation.entry ? {
        issuerNif: normalizeTaxId(evaluation.entry.issuerNif), invoiceNumber: String(evaluation.entry.invoiceNumber || '').slice(0, 60),
        issueDate: String(evaluation.entry.issueDate || '').slice(0, 10), fingerprint: String(evaluation.entry.fingerprint || '').slice(0, 64),
        state: String(evaluation.entry.state || '').slice(0, 40), code: String(evaluation.entry.code || '').slice(0, 50),
        message: String(evaluation.entry.message || '').slice(0, 500), modifiedAt: String(evaluation.entry.modifiedAt || '').slice(0, 40),
      } : null;
      const reconciliation = { ...job.reconciliation, status: accepted ? 'confirmed' : evaluation.outcome,
        attemptToken: null, leaseUntil: null, completedAt: timestamp(time), outcome: evaluation.outcome,
        message: String(evaluation.message || '').slice(0, 1000), evidence };
      const update = { reconciliation, processedAt: timestamp(time),
        ...(accepted ? { status: evaluation.outcome, lastError: null, aeatResponse: {
          ...(job.aeatResponse || {}), recordState: evidence?.state || '', code: evidence?.code || '', message: evaluation.message,
          reconciledByQuery: true,
        } } : { lastError: String(evaluation.message || '').slice(0, 1000) }) };
      tx.update(r.job, update);
      tx.set(r.lease, { attemptToken: null, leaseUntil: null, lastCompletedAt: timestamp(time) }, { merge: true });
      if (local) tx.set(r.certificate, { pendingReview: null }, { merge: true });
      const currentFiscalId = invoice.cancellationFiscalRecordId || invoice.lastSubsanationFiscalRecordId || invoice.fiscalRecordId;
      if (accepted && snaps[2].exists && currentFiscalId === c.fiscalRecordId) {
        tx.update(invoiceRef, { aeatStatus: evaluation.outcome, aeatEnvironment: 'test', aeatProductionAccepted: false,
          aeatProcessedAt: timestamp(time), aeatReconciledAt: timestamp(time) });
      }
      tx.create(db.collection(`${r.base}/verifactuEvents`).doc(), { companyId: c.companyId, environment: 'test',
        productionEnabled: false, type: accepted ? 'aeat_test_reconciliation_confirmed' : 'aeat_test_reconciliation_review',
        actorId: c.actorId, submissionId: c.submissionId, invoiceId: c.invoiceId, fiscalRecordId: c.fiscalRecordId,
        details: { outcome: evaluation.outcome, recordState: evidence?.state || '' }, createdAt: timestamp(time) });
      return { submissionId: c.submissionId, status: accepted ? evaluation.outcome : 'needs_review',
        reconciliationStatus: reconciliation.status, message: reconciliation.message, environment: 'test', productionEnabled: false };
    });
  }

  async function stillAuthorised(c) {
    const r = refs(c.companyId, c.submissionId);
    return db.runTransaction(async tx => {
      const snaps = await Promise.all([r.job, r.settings, r.certificate, r.lease].map(ref => tx.get(ref)));
      const [job, settings, rawCertificate, lease] = snaps.map(snap => snap.data() || {});
      const certificate = certificateData(rawCertificate);
      const time = now();
      return isTestSubmissionEligible(job, c.companyId) && job.status === 'needs_review' &&
        job.reconciliation?.attemptToken === c.attemptToken && millis(job.reconciliation?.leaseUntil) > time &&
        lease.attemptToken === c.attemptToken && millis(lease.leaseUntil) > time &&
        settings.verifactuEnabled === true && settings.verifactuMode === 'test' &&
        settings.aeatConnection?.environment === 'test' && settings.aeatConnection?.channel === channel &&
        settings.aeatConnection?.productionEnabled !== true && settings.verifactuProduction?.enabled !== true &&
        certificate.connected === true && certificate.environment === 'test' &&
        (local ? certificate.connectorTokenHash === c.certificate.connectorTokenHash :
          certificate.secretVersion === c.certificate.secretVersion && certificate.fingerprintSha256 === c.certificate.fingerprintSha256) &&
        normalizeTaxId(certificate.taxId) === normalizeTaxId(settings.nif) &&
        millis(certificate.validFrom) <= time && millis(certificate.validTo) > time;
    });
  }

  async function run({ companyId, submissionId, confirmTestQuery, actorId }) {
    if (local) throw new Error('Use the versioned connector protocol');
    if (confirmTestQuery !== true) return { blocked: 'Confirma la consulta al entorno de pruebas de la AEAT.' };
    await assertTenantEnabled(companyId);
    const c = await claim(companyId, submissionId, actorId);
    if (!c.claimed) return c;
    let parsed;
    try {
      if (!await stillAuthorised(c)) throw new Error('gate_closed');
      const credentials = await loadCertificate(companyId, c.certificate);
      await assertTenantEnabled(companyId);
      if (!await stillAuthorised(c)) throw new Error('gate_closed');
      parsed = parseAeatQueryResponse(await transport({ soapXml: c.queryXml, ...credentials }));
    } catch {
      parsed = { transportOk: false, message: 'No se pudo completar la consulta segura. El registro sigue bloqueado para revisión.' };
    }
    return complete(c, parsed);
  }

  async function requestLocal({ companyId, submissionId, confirmTestQuery, actorId }) {
    if (!local || confirmTestQuery !== true) return { blocked: 'Confirma la consulta al entorno de pruebas de la AEAT.' };
    await assertTenantEnabled(companyId);
    const r = refs(companyId, submissionId);
    return db.runTransaction(async tx => {
      const snaps = await Promise.all([r.job, r.settings, r.certificate].map(ref => tx.get(ref)));
      const [job, settings, rawCertificate] = snaps.map(snap => snap.data() || {});
      const certificate = certificateData(rawCertificate);
      const time = now();
      if (!snaps[0].exists || !isTestSubmissionEligible(job, companyId) || job.status !== 'needs_review') {
        return { blocked: 'Solo se pueden conciliar registros de pruebas que necesitan revisión.' };
      }
      if (settings.verifactuEnabled !== true || settings.verifactuMode !== 'test' || settings.aeatConnection?.channel !== channel ||
          settings.aeatConnection?.environment !== 'test' || settings.aeatConnection?.productionEnabled === true ||
          certificate.connected !== true || certificate.protocolVersion !== 2 || normalizeTaxId(certificate.taxId) !== normalizeTaxId(settings.nif) ||
          !Array.isArray(certificate.capabilities) || !certificate.capabilities.includes('query_reconciliation_v1') ||
          millis(certificate.validFrom) > time || millis(certificate.validTo) <= time) {
        return { blocked: 'Conecta y actualiza el conector de Windows antes de consultar.' };
      }
      tx.update(r.job, { reconciliation: { ...(job.reconciliation || {}), status: 'awaiting_local_connector',
        requestedAt: timestamp(time), requestedBy: actorId, attemptToken: null, leaseUntil: null,
        message: 'Consulta pendiente del conector de Windows.' } });
      return { submissionId, status: 'awaiting_local_connector', environment: 'test', productionEnabled: false };
    });
  }

  async function claimLocal({ companyId, submissionId, protocolVersion }) {
    if (!local || protocolVersion !== 2) return { blocked: 'Actualiza el conector de Windows.' };
    await assertTenantEnabled(companyId);
    const c = await claim(companyId, submissionId, 'local_connector');
    if (!c.claimed) return c;
    return { context: c, job: { submissionId, operation: 'query', protocolVersion: 2, environment: 'test', productionEnabled: false,
      attemptToken: c.attemptToken, attemptNumber: c.attemptNumber,
      leaseExpiresAt: c.leaseExpiresAt, soapXml: c.queryXml,
      soapSha256: digest(c.queryXml), expectedTaxId: c.expected.issuerNif } };
  }

  async function resultLocal({ companyId, submissionId, protocolVersion, attemptToken, attemptNumber, httpStatus, responseXml, failureKind }) {
    if (!local || protocolVersion !== 2 || !/^[a-zA-Z0-9-]{1,80}$/.test(String(attemptToken || '')) ||
        !Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 100 ||
        !Number.isInteger(httpStatus) || httpStatus < 0 || httpStatus > 599 || typeof responseXml !== 'string' ||
        Buffer.byteLength(responseXml, 'utf8') > 512 * 1024) return { ignored: true, reason: 'invalid_query_result' };
    const r = refs(companyId, submissionId);
    const job = await db.runTransaction(async tx => (await tx.get(r.job)).data());
    if (!job?.reconciliation?.expected || job.reconciliation.attemptToken !== attemptToken ||
        job.reconciliation.attemptNumber !== attemptNumber || !id(job.invoiceId) || !id(job.fiscalRecordId)) {
      return { ignored: true, reason: 'stale_query' };
    }
    const parsed = httpStatus ? parseAeatQueryResponse({ statusCode: httpStatus, body: responseXml }) : {
      transportOk: false, permanentFailure: failureKind !== 'network',
      message: 'No se pudo completar la consulta segura. El registro sigue bloqueado para revisión.',
    };
    return complete({ companyId, submissionId, invoiceId: job.invoiceId, fiscalRecordId: job.fiscalRecordId,
      actorId: 'local_connector', attemptToken, attemptNumber, expected: job.reconciliation.expected }, parsed);
  }

  return local ? { requestLocal, claimLocal, resultLocal } : { run, claim, complete };
}

module.exports = { createAeatReconciliationWorker, QUERY_LEASE_MS };
