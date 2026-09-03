// This suite deliberately refuses to run against a real Firebase project.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { createAeatCloudWorker, LEASE_MS } = require('../functions/lib/aeatCloudWorker');
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Run only with the local Firestore emulator. Real data is forbidden.');
}
const app = initializeApp({ projectId: 'demo-verifactu-isolation' }, 'cloud-worker-offline-tests');
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });
const START = Date.parse('2026-08-31T12:00:00Z');
const response = { statusCode: 200, body: '<r:RespuestaRegFactuSistemaFacturacion><r:EstadoEnvio>Correcto</r:EstadoEnvio><r:TiempoEsperaEnvio>1</r:TiempoEsperaEnvio><r:RespuestaLinea><r:IDFactura><r:IDEmisorFactura>B04843843</r:IDEmisorFactura><r:NumSerieFactura>TEST-1</r:NumSerieFactura><r:FechaExpedicionFactura>31-08-2026</r:FechaExpedicionFactura></r:IDFactura><r:Operacion><r:TipoOperacion>Alta</r:TipoOperacion></r:Operacion><r:EstadoRegistro>Correcto</r:EstadoRegistro></r:RespuestaLinea></r:RespuestaRegFactuSistemaFacturacion>' };

async function setup(suffix, transport, local = false) {
  const companyId = `worker-emulator-${suffix}`;
  const base = `companies/${companyId}`;
  const seed = {
    'settings/billing': { nif: 'B04843843', verifactuEnabled: true, verifactuMode: 'test', aeatConnection: { environment: 'test', channel: 'cloud_certificate' } },
    'verifactuConfig/certificate': { connected: true, environment: 'test', taxId: 'B04843843', secretVersion: 'mock-only', validFrom: '2026-01-01', validTo: '2026-11-20' },
    'verifactuConfig/automation': { autoCloudTestEnabled: true, environment: 'test' },
    'aeatSubmissions/alta_i': { companyId, environment: 'test', channel: 'cloud_certificate', status: 'awaiting_cloud_sender', attempts: 0,
      recordType: 'alta', invoiceId: 'i', invoiceNumber: 'TEST-1', fiscalRecordId: 'alta_i', fiscalHash: 'HASH', createdAt: Timestamp.fromMillis(START) },
    'fiscalRecords/alta_i': { companyId, environment: 'test', recordType: 'alta', invoiceId: 'i', invoiceNumber: 'TEST-1',
      issuerNif: 'B04843843', chain: { hash: 'HASH', previousHash: '' }, fechaExpedicionFactura: '31-08-2026', fechaHoraHusoGenRegistro: new Date(START).toISOString() },
    'invoices/i': { fiscalRecordId: 'alta_i', aeatStatus: 'queued' },
  };
  if (local) {
    seed['settings/billing'].aeatConnection.channel = 'local_connector';
    seed['aeatSubmissions/alta_i'].channel = 'local_connector';
    seed['aeatSubmissions/alta_i'].status = 'awaiting_local_connector';
    seed['verifactuConfig/localConnector'] = { status: 'connected', environment: 'test', protocolVersion: 2,
      expectedTaxId: 'B04843843', certificateValidFrom: '2026-01-01', certificateValidTo: '2026-11-20',
      certificateThumbprint: 'MOCK', connectorTokenHash: 'mock-binding', lastSeenAt: Timestamp.fromMillis(START) };
  }
  const batch = db.batch();
  for (const [path, value] of Object.entries(seed)) batch.set(db.doc(`${base}/${path}`), value);
  await batch.commit();
  let time = START;
  let sends = 0;
  const worker = createAeatCloudWorker({ db, timestamp: Timestamp.fromMillis, automaticEnabled: () => true, now: () => time,
    channel: local ? 'local_connector' : 'cloud_certificate',
    assertTenantEnabled: async () => {}, loadCertificate: async () => ({ mock: true }), buildEnvelope: () => '<offline-test/>',
    transport: async () => { sends++; return transport ? transport(sends) : response; },
  });
  return { base, sends: () => sends, advance: ms => { time += ms; },
    run: () => worker.run({ companyId, submissionId: 'alta_i' }),
    claim: () => worker.claimLocal({ companyId, submissionId: 'alta_i', protocolVersion: 2, binding: 'mock-binding' }),
    result: job => worker.resultLocal({ companyId, submissionId: 'alta_i', protocolVersion: 2, binding: 'mock-binding',
      attemptToken: job.attemptToken, attemptNumber: job.attemptNumber, httpStatus: 200, responseXml: response.body }),
    job: async () => (await db.doc(`${base}/aeatSubmissions/alta_i`).get()).data(),
  };
}

test('real Firestore transactions serialize competing invocations without double sending', async () => {
  const h = await setup('race');
  const results = await Promise.all([h.run(), h.run(), h.run()]);
  assert.equal(results.filter(result => result.status === 'accepted').length, 1);
  assert.equal(h.sends(), 1);
  assert.equal((await h.job()).attempts, 1);
});

test('expired claim is recovered and late response cannot overwrite the confirmed result', async () => {
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const h = await setup('recovery', count => count === 1 ? new Promise(resolve => { release = resolve; entered(); }) : response);
  const first = h.run();
  await ready;
  h.advance(LEASE_MS + 1);
  assert.equal((await h.run()).status, 'accepted');
  release({ statusCode: 503, body: 'late outage response' });
  assert.equal((await first).ignored, true);
  assert.equal((await h.job()).status, 'accepted');
  assert.equal((await h.job()).attempts, 2);
});

test('Windows concurrent claims and receipt retries are transactional and idempotent', async () => {
  const h = await setup('windows-race', null, true);
  const claims = await Promise.all([h.claim(), h.claim(), h.claim()]);
  assert.equal(claims.filter(result => result.job).length, 1);
  const job = claims.find(result => result.job).job;
  const results = await Promise.all([h.result(job), h.result(job)]);
  assert.equal(results.filter(result => result.duplicateReceipt).length, 1);
  assert.ok(results.every(result => result.status === 'accepted'));
  assert.equal((await h.job()).attempts, 1); assert.equal(h.sends(), 0);
});

test('Windows journal recovery records an expired but unsuperseded receipt without new send', async () => {
  const h = await setup('windows-journal', null, true);
  const { job } = await h.claim(); h.advance(LEASE_MS + 1);
  assert.equal((await h.result(job)).status, 'accepted');
  assert.equal((await h.result(job)).duplicateReceipt, true);
  assert.equal(h.sends(), 0); assert.equal((await h.job()).attempts, 1);
});
