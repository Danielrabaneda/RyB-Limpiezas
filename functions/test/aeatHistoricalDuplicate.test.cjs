const test = require('node:test');
const assert = require('node:assert/strict');
const { createAeatReconciliationWorker } = require('../lib/aeatReconciliationWorker');

function harness({ status = 'rejected', message = 'Registro de facturación duplicado.', environment = 'test', sameHash = true } = {}) {
  const base = 'companies/a';
  const jobPath = `${base}/aeatSubmissions/duplicate`;
  const originalResponse = { code: 'historical', message };
  const data = new Map(Object.entries({
    [jobPath]: { companyId: 'a', environment, status, invoiceId: 'i', fiscalRecordId: 'duplicate',
      fiscalHash: 'ABC', recordType: 'alta_subsanacion', invoiceNumber: 'TEST-1', attempts: 1,
      aeatResponse: originalResponse },
    [`${base}/settings/billing`]: { nif: 'B12345678', companyName: 'Demo', verifactuEnabled: true,
      verifactuMode: 'test', aeatConnection: { environment: 'test', channel: 'cloud_certificate' } },
    [`${base}/verifactuConfig/certificate`]: { connected: true, environment: 'test', taxId: 'B12345678',
      secretVersion: 'mock', validFrom: '2026-01-01', validTo: '2027-01-01' },
    [`${base}/invoices/i`]: { fiscalRecordId: 'duplicate', aeatStatus: 'rejected' },
    [`${base}/fiscalRecords/duplicate`]: { companyId: 'a', environment: 'test', invoiceId: 'i',
      invoiceNumber: 'TEST-1', recordType: 'alta_subsanacion', issuerNif: 'B12345678',
      fechaExpedicionFactura: '31-07-2026', chain: { hash: 'ABC' } },
  }));
  let serial = Promise.resolve(), count = 0, queries = 0, secrets = 0;
  const db = {
    doc: path => ({ path }), collection: path => ({ doc: () => ({ path: `${path}/event${++count}` }) }),
    runTransaction: fn => {
      const result = serial.then(async () => {
        const writes = [];
        const tx = {
          get: async ref => {
            assert.equal(writes.length, 0);
            return { exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) };
          },
          update: (ref, value) => writes.push([ref.path, value, true]),
          set: (ref, value, options) => writes.push([ref.path, value, options?.merge]),
          create: (ref, value) => writes.push([ref.path, value, false]),
        };
        const result = await fn(tx);
        for (const [path, value, merge] of writes) data.set(path, merge ? { ...data.get(path), ...value } : value);
        return result;
      });
      serial = result.catch(() => {});
      return result;
    },
  };
  const worker = createAeatReconciliationWorker({ db, timestamp: n => new Date(n), now: () => Date.parse('2026-09-05'),
    newToken: () => `query-${++count}`, assertTenantEnabled: async () => {},
    loadCertificate: async () => { secrets++; return {}; },
    transport: async ({ soapXml }) => {
      queries++;
      assert.match(soapXml, /ConsultaFactuSistemaFacturacion/);
      assert.doesNotMatch(soapXml, /<sfLR:RegFactuSistemaFacturacion/);
      return { statusCode: 200, body: `<RespuestaConsultaFactuSistemaFacturacion><ResultadoConsulta>ConDatos</ResultadoConsulta><IndicadorPaginacion>N</IndicadorPaginacion><RegistroRespuestaConsultaFactuSistemaFacturacion><IDFactura><IDEmisorFactura>B12345678</IDEmisorFactura><NumSerieFactura>TEST-1</NumSerieFactura><FechaExpedicionFactura>31-07-2026</FechaExpedicionFactura></IDFactura><Huella>${sameHash ? 'ABC' : 'OTHER'}</Huella><EstadoRegistro>Correcto</EstadoRegistro></RegistroRespuestaConsultaFactuSistemaFacturacion></RespuestaConsultaFactuSistemaFacturacion>` };
    },
  });
  return { run: confirmTestQuery => worker.run({ companyId: 'a', submissionId: 'duplicate', actorId: 'admin', confirmTestQuery }),
    job: () => data.get(jobPath), originalResponse, counts: () => ({ queries, secrets }) };
}

test('historical duplicate queries preserve the original response and do not resubmit', async () => {
  const h = harness();
  assert.equal((await h.run(true)).status, 'accepted');
  assert.deepEqual(h.job().reconciliation.originalSubmission.aeatResponse, h.originalResponse);
  assert.equal(h.job().reconciliation.originalSubmission.status, 'rejected');
  assert.equal(h.job().attempts, 1);
  assert.equal(h.counts().queries, 1);
});

test('a different fingerprint retains the original rejection across repeated queries', async () => {
  const h = harness({ sameHash: false });
  for (let i = 0; i < 2; i++) {
    assert.equal((await h.run(true)).status, 'rejected');
    assert.deepEqual(h.job().aeatResponse, h.originalResponse);
    assert.deepEqual(h.job().reconciliation.originalSubmission.aeatResponse, h.originalResponse);
    assert.equal(h.job().attempts, 1);
  }
  assert.equal(h.job().reconciliation.attempts, 2);
});

test('unconfirmed, unrelated rejections and production jobs never open credentials or network', async () => {
  for (const [options, confirmation] of [[{}, false], [{ message: 'NIF incorrecto' }, true],
    [{ status: 'accepted' }, true], [{ environment: 'production' }, true]]) {
    const h = harness(options);
    assert.ok((await h.run(confirmation)).blocked);
    assert.deepEqual(h.counts(), { queries: 0, secrets: 0 });
  }
});

test('two concurrent clicks only execute one query', async () => {
  const h = harness();
  await Promise.all([h.run(true), h.run(true)]);
  assert.equal(h.counts().queries, 1);
});
