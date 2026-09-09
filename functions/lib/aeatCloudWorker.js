const { createHash, randomUUID } = require('node:crypto');
const { assertFiscalScope, isTestSubmissionEligible } = require('./verifactuEnvironment');
const { buildAeatOfficialSoapEnvelope, getRetryDelayMs, MAX_SUBMISSION_ATTEMPTS,
  isAeatGenerationTimestampFresh } = require('./aeatSubmission');
const { parseAeatSoapResponse } = require('./aeatCloudSender');

const LEASE_MS = 120000;
const ACCEPTED = new Set(['accepted', 'accepted_with_errors']);
const PENDING = new Set(['awaiting_cloud_sender', 'awaiting_local_connector', 'awaiting_sender', 'retry_pending']);
const id = value => /^[a-zA-Z0-9_-]{1,128}$/.test(String(value || ''));
const nif = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const millis = value => value?.toMillis?.() ?? (value ? new Date(value).getTime() : 0);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');

function gate(settings, certificate, automation, automatic, now, channel = 'cloud_certificate', binding = '') {
  if (settings.verifactuEnabled !== true || settings.verifactuMode !== 'test' ||
      settings.aeatConnection?.environment !== 'test' || settings.aeatConnection?.productionEnabled === true ||
      settings.verifactuProduction?.enabled === true || settings.aeatConnection?.channel !== channel) {
    return 'Guarda el modo de pruebas con el canal seleccionado. La producción sigue bloqueada.';
  }
  if (automatic && (automation.autoCloudTestEnabled !== true || automation.environment !== 'test')) {
    return 'El envío automático de pruebas no está autorizado para esta empresa.';
  }
  if (channel === 'local_connector' && (certificate.protocolVersion !== 2 || !binding || certificate.connectorTokenHash !== binding ||
      !certificate.thumbprint || millis(certificate.lastSeenAt) < now - 180000)) {
    return 'Actualiza y conecta el conector Windows antes de enviar.';
  }
  if (certificate.connected !== true || certificate.environment !== 'test' || (channel === 'cloud_certificate' && !certificate.secretVersion) ||
      !certificate.validFrom || !certificate.validTo || !nif(settings.nif) || nif(certificate.taxId) !== nif(settings.nif) ||
      !Number.isFinite(millis(certificate.validFrom)) || !Number.isFinite(millis(certificate.validTo)) ||
      millis(certificate.validFrom) > now || millis(certificate.validTo) <= now) {
    return 'Conecta un certificado vigente que corresponda al NIF de la empresa.';
  }
  return null;
}

// A transport failure is not a tax-authority rejection. A duplicate needs
// reconciliation: never infer acceptance merely from the duplicate error code.
function classifyResponse(response, expected, attempts) {
  if (!response.transportOk) {
    const retryable = !response.permanentFailure && (!response.httpStatus || response.httpStatus === 408 ||
      response.httpStatus === 429 || response.httpStatus >= 500);
    return retryable && attempts < MAX_SUBMISSION_ATTEMPTS ? 'retry_pending' : 'needs_review';
  }
  if (response.lineCount !== 1 || response.duplicate || !response.waitValid ||
      !['Correcto', 'ParcialmenteCorrecto', 'Incorrecto'].includes(response.shipmentState) ||
      response.invoiceNumber !== expected.invoiceNumber || nif(response.issuerNif) !== nif(expected.issuerNif) ||
      response.issueDate !== expected.issueDate || response.operation !== expected.operation ||
      (response.subsanation === 'S') !== expected.subsanation) return 'needs_review';
  if (response.recordState === 'Incorrecto') return 'rejected';
  if (response.shipmentState === 'Incorrecto') return 'needs_review';
  if (response.recordState === 'Correcto') return 'accepted';
  if (response.recordState === 'AceptadoConErrores') return 'accepted_with_errors';
  return 'needs_review';
}

/**
 * Shared manual/automatic TEST sender. Network, secret access, clock and tenant
 * authorisation are injected. Creating a worker does not send or enable anything.
 * Firestore transaction retries must be free of network/secret side effects.
 */
function createAeatCloudWorker({ db, timestamp, assertTenantEnabled, loadCertificate, transport,
  automaticEnabled = () => false, now = Date.now, newToken = randomUUID,
  buildEnvelope = buildAeatOfficialSoapEnvelope, channel = 'cloud_certificate' }) {
  if (!['cloud_certificate', 'local_connector'].includes(channel)) throw new Error('Unsupported delivery channel');
  const local = channel === 'local_connector';
  const owner = local ? 'local_worker_v2' : 'cloud_worker';
  const xmlField = local ? 'localSoapXml' : 'cloudSoapXml';
  const hashField = local ? 'localSoapSha256' : 'cloudSoapSha256';
  const certificateData = data => local ? { ...data, connected: data.status === 'connected',
    taxId: data.expectedTaxId, validFrom: data.certificateValidFrom, validTo: data.certificateValidTo,
    thumbprint: data.certificateThumbprint } : data;
  const refs = (companyId, submissionId) => {
    if (!id(companyId) || !id(submissionId)) throw new Error('Identificador de envío no válido.');
    const base = `companies/${companyId}`;
    return { base, job: db.doc(`${base}/aeatSubmissions/${submissionId}`),
      settings: db.doc(`${base}/settings/billing`), certificate: db.doc(`${base}/verifactuConfig/${local ? 'localConnector' : 'certificate'}`),
      automation: db.doc(`${base}/verifactuConfig/automation`), delivery: db.doc(`${base}/verifactuConfig/delivery_test`) };
  };
  const event = (tx, base, data, time) => tx.create(db.collection(`${base}/verifactuEvents`).doc(), {
    ...data, companyId: base.split('/')[1], environment: 'test', productionEnabled: false, createdAt: timestamp(time),
  });

  async function claim(companyId, submissionId, automatic, actorId, binding = '') {
    const r = refs(companyId, submissionId);
    return db.runTransaction(async tx => {
      const time = now();
      if (automatic && !automaticEnabled()) return { blocked: 'El envío automático permanece desactivado.' };
      const snaps = await Promise.all([r.job, r.settings, r.certificate, r.automation, r.delivery].map(ref => tx.get(ref)));
      const [job, settings, rawCertificate, automation, delivery] = snaps.map(snap => snap.data() || {});
      const certificate = certificateData(rawCertificate);
      const blocked = gate(settings, certificate, automation, automatic, time, channel, binding);
      if (blocked) return { blocked };
      if (!snaps[0].exists || !isTestSubmissionEligible(job, companyId)) return { blocked: 'Registro ajeno al entorno de pruebas.' };
      if ((automatic || local) && job.channel !== channel) return { blocked: 'Registro pendiente de otro canal.' };
      if (delivery.attemptToken && millis(delivery.leaseUntil) > time) return { blocked: 'Ya hay un envío en curso para esta empresa.', reason: 'company_busy' };
      if (millis(delivery.nextAllowedAt) > time || millis(job.nextAttemptAt) > time) {
        return { blocked: 'Espera al próximo intento permitido antes de volver a enviar.', reason: 'cooldown' };
      }
      if (job.status === 'processing') {
        if (job.deliveryOwner !== owner || millis(job.leaseUntil) > time) return { blocked: 'El registro ya se está procesando.' };
      } else if (!PENDING.has(job.status)) return { blocked: 'Este registro no está pendiente de envío.' };

      // Older Windows/manual senders did not acquire the shared delivery lease.
      // Do not switch channels while one of their outcomes is still uncertain.
      const processing = await tx.get(db.collection(`${r.base}/aeatSubmissions`).where('status', '==', 'processing'));
      if (processing.docs.some(snap => snap.data().deliveryOwner !== owner)) {
        return { blocked: 'Resuelve el envío en curso del conector anterior antes de cambiar de canal.' };
      }

      const invoiceRef = id(job.invoiceId) ? db.doc(`${r.base}/invoices/${job.invoiceId}`) : null;
      const invoiceSnap = invoiceRef ? await tx.get(invoiceRef) : null;
      const invoice = invoiceSnap?.data() || {};
      const currentFiscalId = invoice.cancellationFiscalRecordId || invoice.lastSubsanationFiscalRecordId || invoice.fiscalRecordId;

      const review = message => {
        tx.update(r.job, { status: 'needs_review', lastError: message, nextAttemptAt: null, leaseUntil: null,
          attemptToken: null, processedAt: timestamp(time) });
        if (invoiceSnap?.exists && currentFiscalId === job.fiscalRecordId) {
          tx.update(invoiceRef, { aeatStatus: 'needs_review', aeatEnvironment: 'test', aeatProductionAccepted: false });
        }
        if (delivery.submissionId === submissionId) {
          tx.set(r.delivery, { attemptToken: null, leaseUntil: null }, { merge: true });
        }
        event(tx, r.base, { type: local ? 'aeat_local_review_required' : 'aeat_cloud_review_required', submissionId, actorId, details: { message } }, time);
        return { status: 'needs_review', message };
      };
      const attempts = Number(job.attempts || 0);
      if (!Number.isInteger(attempts) || attempts < 0 || attempts >= MAX_SUBMISSION_ATTEMPTS) {
        return review('Se han agotado los intentos. Revisa la incidencia antes de continuar.');
      }
      if (!id(job.fiscalRecordId) || !id(job.invoiceId)) return review('La cola contiene referencias incompletas.');
      const fiscalSnap = await tx.get(db.doc(`${r.base}/fiscalRecords/${job.fiscalRecordId}`));
      const fiscal = fiscalSnap.data();
      try { assertFiscalScope(fiscal, companyId, 'test'); } catch { return review('El registro fiscal no pertenece a esta empresa y entorno.'); }
      if (!invoiceSnap?.exists || !job.fiscalHash || fiscal.chain?.hash !== job.fiscalHash ||
          nif(fiscal.issuerNif) !== nif(settings.nif) || fiscal.invoiceId !== job.invoiceId ||
          fiscal.invoiceNumber !== job.invoiceNumber || fiscal.recordType !== job.recordType) {
        return review('La cola no coincide con el registro fiscal inmutable.');
      }
      let previous = null;
      if (fiscal.chain?.previousFiscalRecordId) {
        if (!id(fiscal.chain.previousFiscalRecordId)) return review('La referencia al registro anterior no es válida.');
        const [previousSnap, previousJobSnap] = await Promise.all([
          tx.get(db.doc(`${r.base}/fiscalRecords/${fiscal.chain.previousFiscalRecordId}`)),
          tx.get(db.doc(`${r.base}/aeatSubmissions/${fiscal.chain.previousFiscalRecordId}`)),
        ]);
        previous = previousSnap.data();
        try { assertFiscalScope(previous, companyId, 'test'); } catch { return review('No se puede validar el encadenamiento anterior.'); }
        if (!fiscal.chain.previousHash || fiscal.chain.previousHash !== previous.chain?.hash ||
            nif(previous.issuerNif) !== nif(fiscal.issuerNif)) return review('La huella del registro anterior no coincide.');
        const previousJob = previousJobSnap.data();
        if (!isTestSubmissionEligible(previousJob, companyId) || previousJob.fiscalHash !== previous.chain.hash ||
            !ACCEPTED.has(previousJob.status)) return { blocked: 'Primero debe resolverse el envío anterior de la cadena.' };
      } else if (fiscal.chain?.previousHash) return review('Existe una huella anterior sin registro de origen.');
      if (job.recordType === 'anulacion') {
        const alta = (await tx.get(db.doc(`${r.base}/aeatSubmissions/alta_${job.invoiceId}`))).data();
        if (!isTestSubmissionEligible(alta, companyId) || !ACCEPTED.has(alta.status)) {
          return { blocked: 'Primero debe aceptarse el alta de esta factura en pruebas.' };
        }
      }
      if (attempts === 0 && !isAeatGenerationTimestampFresh(fiscal.fechaHoraHusoGenRegistro, new Date(time))) {
        return review('El primer envío se ha demorado. Revisa la incidencia sin borrar ni regenerar el registro emitido.');
      }
      if (attempts > 0 && (!job[xmlField] || !job[hashField] || job.deliveryOwner !== owner)) {
        return review('Este intento anterior requiere revisión: no hay una copia verificable del envío original.');
      }
      const soapXml = job[xmlField] || buildEnvelope(fiscal, { ...settings, companyId }, previous);
      if (!soapXml || (job[hashField] && digest(soapXml) !== job[hashField])) {
        return review('La copia del envío no coincide con su huella de control.');
      }
      const attemptToken = newToken();
      const leaseUntil = timestamp(time + LEASE_MS);
      const expected = { issuerNif: fiscal.issuerNif, invoiceNumber: fiscal.invoiceNumber, issueDate: fiscal.fechaExpedicionFactura,
        operation: fiscal.recordType === 'anulacion' ? 'Anulacion' : 'Alta',
        subsanation: fiscal.subsanacion === true || ['subsanacion', 'alta_subsanacion'].includes(fiscal.recordType) };
      tx.update(r.job, { status: 'processing', deliveryOwner: owner, channel,
        attempts: attempts + 1, attemptToken, leaseUntil, claimedAt: timestamp(time), claimedBy: actorId,
        [xmlField]: soapXml, [hashField]: digest(soapXml), nextAttemptAt: null,
        ...(local ? { localExpected: expected, localBinding: binding } : {}) });
      tx.set(r.delivery, { companyId, environment: 'test', attemptToken, submissionId, leaseUntil }, { merge: true });
      return { claimed: true, companyId, submissionId, actorId, attemptToken, attemptNumber: attempts + 1,
        invoiceId: job.invoiceId, fiscalRecordId: job.fiscalRecordId, soapXml, certificate, expected, binding,
        leaseExpiresAt: new Date(time + LEASE_MS).toISOString() };
    });
  }

  async function stillAuthorised(c, automatic) {
    if (automatic && !automaticEnabled()) return false;
    const r = refs(c.companyId, c.submissionId);
    return db.runTransaction(async tx => {
      const snaps = await Promise.all([r.job, r.delivery, r.settings, r.certificate, r.automation].map(ref => tx.get(ref)));
      const [job, delivery, settings, certificate, automation] = snaps.map(snap => snap.data() || {});
      return job.status === 'processing' && job.attemptToken === c.attemptToken && delivery.attemptToken === c.attemptToken &&
        millis(job.leaseUntil) > now() && millis(delivery.leaseUntil) > now() &&
        certificate.secretVersion === c.certificate.secretVersion && !gate(settings, certificate, automation, automatic, now());
    });
  }

  async function complete(c, response) {
    const r = refs(c.companyId, c.submissionId);
    return db.runTransaction(async tx => {
      const time = now();
      const invoiceRef = db.doc(`${r.base}/invoices/${c.invoiceId}`);
      const snaps = await Promise.all([r.job, r.delivery, invoiceRef].map(ref => tx.get(ref)));
      const [job, delivery, invoice] = snaps.map(snap => snap.data() || {});
      if (!isTestSubmissionEligible(job, c.companyId) || job.deliveryOwner !== owner || job.channel !== channel) {
        return { ignored: true, reason: 'invalid_scope' };
      }
      if (local) {
        const connector = (await tx.get(r.certificate)).data() || {};
        if (!c.binding || connector.connectorTokenHash !== c.binding || job.localBinding !== c.binding) return { ignored: true, reason: 'pairing_changed' };
        if (job.completedAttemptToken === c.attemptToken && job.completedAttemptNumber === c.attemptNumber) {
          return { submissionId: c.submissionId, status: job.completedAttemptStatus, acknowledged: true, duplicateReceipt: true };
        }
      }
      if (!isTestSubmissionEligible(job, c.companyId) || job.status !== 'processing' || job.attemptToken !== c.attemptToken ||
          job.deliveryOwner !== owner || job.channel !== channel ||
          delivery.attemptToken !== c.attemptToken || delivery.submissionId !== c.submissionId ||
          job.attempts !== c.attemptNumber || (!local && (millis(job.leaseUntil) <= time || millis(delivery.leaseUntil) <= time))) {
        return { ignored: true, reason: 'stale_attempt' };
      }
      const status = classifyResponse(response, c.expected, c.attemptNumber);
      const waitSeconds = response.waitValid ? response.waitSeconds : 60;
      const sanitized = {
        csv: String(response.csv || '').slice(0, 100), code: String(response.code || '').slice(0, 100),
        message: String(response.message || (status === 'needs_review' ? 'La respuesta requiere revisión antes de continuar.' : '')).slice(0, 1500),
        recordState: String(response.recordState || '').slice(0, 50), shipmentState: String(response.shipmentState || '').slice(0, 50),
        waitSeconds, httpStatus: Number(response.httpStatus) || 0,
      };
      const nextAllowed = Math.max(time + Math.max(1, waitSeconds) * 1000, millis(delivery.nextAllowedAt) || 0);
      tx.update(r.job, { status, nextAttemptAt: status === 'retry_pending' ? timestamp(Math.max(nextAllowed, time + getRetryDelayMs(c.attemptNumber))) : null,
        leaseUntil: null, attemptToken: null, aeatResponse: sanitized,
        lastError: ACCEPTED.has(status) ? null : sanitized.message, processedAt: timestamp(time), processedBy: owner,
        ...(local ? { completedAttemptToken: c.attemptToken, completedAttemptNumber: c.attemptNumber, completedAttemptStatus: status } : {}) });
      tx.set(r.delivery, { attemptToken: null, leaseUntil: null, nextAllowedAt: timestamp(nextAllowed) }, { merge: true });
      if (local) tx.set(r.certificate, { pendingReview: null }, { merge: true });
      const currentFiscalId = invoice.cancellationFiscalRecordId || invoice.lastSubsanationFiscalRecordId || invoice.fiscalRecordId;
      if (snaps[2].exists && currentFiscalId === c.fiscalRecordId) {
        tx.update(invoiceRef, { aeatStatus: status, aeatEnvironment: 'test', aeatProductionAccepted: false,
          aeatResponseCode: sanitized.code, aeatCsv: sanitized.csv, aeatProcessedAt: timestamp(time) });
      }
      event(tx, r.base, { type: local ? 'aeat_connector_result_recorded' : 'aeat_cloud_test_result_recorded', actorId: c.actorId,
        submissionId: c.submissionId, fiscalRecordId: c.fiscalRecordId, invoiceId: c.invoiceId,
        channel, details: { status, attempt: c.attemptNumber, httpStatus: sanitized.httpStatus } }, time);
      return { submissionId: c.submissionId, status, environment: 'test', productionEnabled: false, response: sanitized };
    });
  }

  async function run({ companyId, submissionId, automatic = true, confirmTestSend = false, actorId = 'automatic_test_worker' }) {
    if (local) throw new Error('Use the versioned connector protocol');
    if (automatic ? !automaticEnabled() : confirmTestSend !== true) return { blocked: 'El envío no está autorizado.' };
    await assertTenantEnabled(companyId);
    const c = await claim(companyId, submissionId, automatic, actorId);
    if (!c.claimed) return c;
    let response;
    try {
      if (!await stillAuthorised(c, automatic)) throw new Error('gate_closed');
      const credentials = await loadCertificate(companyId, c.certificate);
      await assertTenantEnabled(companyId);
      if (!await stillAuthorised(c, automatic)) throw new Error('gate_closed');
      // Only the injected transport knows how to reach the test endpoint.
      response = parseAeatSoapResponse(await transport({ soapXml: c.soapXml, ...credentials }));
    } catch {
      // Never persist raw exceptions: SDK errors can contain secret resource IDs
      // or credential data. The original SOAP remains frozen for safe retries.
      response = { transportOk: false, httpStatus: 0,
        message: 'No se ha podido completar el envío seguro. Se reintentará cuando vuelva a estar disponible.' };
    }
    return complete(c, response);
  }

  async function claimLocal({ companyId, submissionId, protocolVersion, binding }) {
    if (!local || protocolVersion !== 2) return { blocked: 'Actualiza el conector de Windows.', reason: 'connector_update_required' };
    await assertTenantEnabled(companyId);
    const c = await claim(companyId, submissionId, false, 'local_connector', binding);
    if (!c.claimed) return c;
    return { job: { submissionId, operation: 'submit', protocolVersion: 2, environment: 'test', productionEnabled: false,
      attemptToken: c.attemptToken, attemptNumber: c.attemptNumber, leaseExpiresAt: c.leaseExpiresAt,
      soapXml: c.soapXml, soapSha256: digest(c.soapXml), expectedTaxId: c.expected.issuerNif } };
  }

  async function resultLocal({ companyId, submissionId, protocolVersion, binding, attemptToken, attemptNumber, httpStatus, responseXml, failureKind }) {
    if (!local || protocolVersion !== 2 || !/^[a-zA-Z0-9-]{1,80}$/.test(String(attemptToken || '')) ||
        !Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > MAX_SUBMISSION_ATTEMPTS) {
      return { ignored: true, reason: 'invalid_attempt' };
    }
    const r = refs(companyId, submissionId);
    const job = await db.runTransaction(async tx => (await tx.get(r.job)).data());
    if (!job || job.deliveryOwner !== owner || job.localBinding !== binding || !job.localExpected || !id(job.invoiceId)) {
      return { ignored: true, reason: 'invalid_attempt' };
    }
    if (!Number.isInteger(httpStatus) || httpStatus < 0 || httpStatus > 599 ||
        typeof responseXml !== 'string' || Buffer.byteLength(responseXml, 'utf8') > 512 * 1024) {
      return { ignored: true, reason: 'invalid_response' };
    }
    const response = httpStatus ? parseAeatSoapResponse({ statusCode: httpStatus, body: responseXml }) : {
      transportOk: false, httpStatus: 0, permanentFailure: ['schema', 'certificate', 'endpoint', 'payload'].includes(failureKind),
      message: failureKind === 'network' ? 'No se pudo confirmar la conexión con la AEAT. Se reintentará el mismo registro.' :
        'El conector no ha podido completar el envío. Revisa el certificado y el registro sin volver a emitir la factura.',
    };
    return complete({ companyId, submissionId, binding, attemptToken, attemptNumber, expected: job.localExpected,
      invoiceId: job.invoiceId, fiscalRecordId: job.fiscalRecordId, actorId: 'local_connector' }, response);
  }

  return local ? { claimLocal, resultLocal } : { run };
}

module.exports = { createAeatCloudWorker, classifyResponse, LEASE_MS };
