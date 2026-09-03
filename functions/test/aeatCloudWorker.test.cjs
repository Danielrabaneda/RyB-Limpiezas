const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createAeatCloudWorker, LEASE_MS } = require('../lib/aeatCloudWorker');

const BASE = 'companies/a';
const JOB = `${BASE}/aeatSubmissions/alta_i`;
const FISCAL = `${BASE}/fiscalRecords/alta_i`;
const INVOICE = `${BASE}/invoices/i`;
const DELIVERY = `${BASE}/verifactuConfig/delivery_test`;
const SETTINGS = `${BASE}/settings/billing`;
const CERT = `${BASE}/verifactuConfig/certificate`;
const AUTO = `${BASE}/verifactuConfig/automation`;
const START = Date.parse('2026-08-31T12:00:00Z');

function reply({ state = 'Correcto', number = 'TEST-VF-2026-0001', issuer = 'B04843843',
  date = '31-08-2026', wait = '60', duplicate = false, lines = 1, shipment = 'Correcto', operation = 'Alta', subsanation = false } = {}) {
  const line = `<r:RespuestaLinea><r:IDFactura><r:IDEmisorFactura>${issuer}</r:IDEmisorFactura>` +
    `<r:NumSerieFactura>${number}</r:NumSerieFactura><r:FechaExpedicionFactura>${date}</r:FechaExpedicionFactura>` +
    `</r:IDFactura><r:Operacion><r:TipoOperacion>${operation}</r:TipoOperacion>${subsanation ? '<r:Subsanacion>S</r:Subsanacion>' : ''}</r:Operacion><r:EstadoRegistro>${state}</r:EstadoRegistro>${duplicate ? '<r:RegistroDuplicado><r:EstadoRegistroDuplicado>Correcto</r:EstadoRegistroDuplicado></r:RegistroDuplicado>' : ''}</r:RespuestaLinea>`;
  return { statusCode: 200, body: `<s:Envelope><s:Body><r:RespuestaRegFactuSistemaFacturacion><r:CSV>TEST-CSV</r:CSV>` +
    `<r:EstadoEnvio>${shipment}</r:EstadoEnvio><r:TiempoEsperaEnvio>${wait}</r:TiempoEsperaEnvio>${line.repeat(lines)}` +
    '</r:RespuestaRegFactuSistemaFacturacion></s:Body></s:Envelope>' };
}

function harness(options = {}) {
  let clock = START;
  let enabled = options.enabled ?? true;
  let tenantEnabled = true;
  let token = 0;
  let eventId = 0;
  let serial = Promise.resolve();
  const calls = { secrets: 0, transport: 0, tenant: 0, envelopes: 0, payloads: [], writes: [] };
  const data = new Map(Object.entries({
    [SETTINGS]: { nif: 'B04843843', verifactuEnabled: true, verifactuMode: 'test', aeatConnection: { channel: 'cloud_certificate', environment: 'test' } },
    [CERT]: { connected: true, environment: 'test', taxId: 'B04843843', secretVersion: 'mock-version',
      validFrom: '2026-01-01T00:00:00Z', validTo: '2026-11-20T00:00:00Z' },
    [AUTO]: { autoCloudTestEnabled: true, environment: 'test' },
    [JOB]: { companyId: 'a', environment: 'test', channel: 'cloud_certificate', status: 'awaiting_cloud_sender',
      fiscalRecordId: 'alta_i', invoiceId: 'i', invoiceNumber: 'TEST-VF-2026-0001', fiscalHash: 'HASH', recordType: 'alta',
      attempts: 0, createdAt: new Date(START), nextAttemptAt: new Date(START) },
    [FISCAL]: { companyId: 'a', environment: 'test', invoiceId: 'i', invoiceNumber: 'TEST-VF-2026-0001',
      issuerNif: 'B04843843', recordType: 'alta', fechaHoraHusoGenRegistro: new Date(START).toISOString(),
      fechaExpedicionFactura: '31-08-2026', chain: { hash: 'HASH', previousHash: '', previousFiscalRecordId: null } },
    [INVOICE]: { fiscalRecordId: 'alta_i', aeatStatus: 'queued' },
  }));
  const ref = path => ({ path, id: path.split('/').at(-1) });
  if (options.local) {
    data.get(SETTINGS).aeatConnection.channel = 'local_connector';
    data.get(JOB).channel = 'local_connector'; data.get(JOB).status = 'awaiting_local_connector';
    data.set(`${BASE}/verifactuConfig/localConnector`, { status: 'connected', environment: 'test', protocolVersion: 2,
      expectedTaxId: 'B04843843', certificateValidFrom: '2026-01-01', certificateValidTo: '2026-11-20',
      certificateThumbprint: 'ABC', connectorTokenHash: 'binding-a', lastSeenAt: new Date(START) });
  }
  const db = { doc: ref, collection: path => ({ doc: () => ref(`${path}/event_${++eventId}`),
    where: (field, _op, value) => ({ path, field, value, query: true }) }),
    runTransaction: fn => {
      const result = serial.then(async () => {
        const writes = [];
        const tx = {
          get: async r => { assert.equal(writes.length, 0, 'all reads must precede writes');
            if (r.query) return { docs: [...data.entries()].filter(([path, value]) => path.startsWith(`${r.path}/`) && value[r.field] === r.value)
              .map(([path, value]) => ({ id: path.split('/').at(-1), data: () => structuredClone(value) })) };
            return { exists: data.has(r.path), data: () => structuredClone(data.get(r.path)) }; },
          update: (r, value) => { assert.ok(data.has(r.path)); writes.push([r.path, value, true]); },
          set: (r, value, opt) => writes.push([r.path, value, opt?.merge === true]),
          create: (r, value) => { assert.ok(!data.has(r.path)); writes.push([r.path, value, false]); },
        };
        const value = await fn(tx);
        for (const [path, patch, merge] of writes) {
          data.set(path, merge ? { ...data.get(path), ...patch } : patch);
          calls.writes.push(path);
        }
        return value;
      });
      serial = result.catch(() => {});
      return result;
    },
  };
  const worker = createAeatCloudWorker({ db, timestamp: value => new Date(value), now: () => clock,
    channel: options.local ? 'local_connector' : 'cloud_certificate',
    automaticEnabled: () => enabled, newToken: () => `attempt-${++token}`,
    assertTenantEnabled: async () => { calls.tenant++; if (!tenantEnabled) throw new Error('tenant_disabled'); },
    buildEnvelope: (fiscal, settings) => { calls.envelopes++; return `<immutable>${fiscal.chain.hash}|${settings.nif}|${settings.name || 'original'}</immutable>`; },
    loadCertificate: async () => { calls.secrets++; if (options.loadCertificate) await options.loadCertificate(h);
      return { pfx: Buffer.from('MOCK-NOT-A-CERTIFICATE'), passphrase: 'MOCK' }; },
    transport: async payload => { calls.transport++; calls.payloads.push(payload.soapXml);
      return options.transport ? options.transport(h, payload) : reply(); },
  });
  const h = { data, calls, worker, db, now: () => clock, advance: ms => { clock += ms; },
    enable: value => { enabled = value; }, tenant: value => { tenantEnabled = value; },
    patch: (path, patch) => data.set(path, { ...data.get(path), ...patch }),
    run: args => worker.run({ companyId: 'a', submissionId: 'alta_i', ...args }),
    claim: args => worker.claimLocal({ companyId: 'a', submissionId: 'alta_i', protocolVersion: 2, binding: 'binding-a', ...args }),
    result: (job, args) => worker.resultLocal({ companyId: 'a', submissionId: 'alta_i', protocolVersion: 2, binding: 'binding-a',
      attemptToken: job.attemptToken, attemptNumber: job.attemptNumber, httpStatus: 200, responseXml: reply().body, ...args }),
  };
  return h;
}

test('default runtime gate and manual confirmation: zero reads, secrets or sends', async () => {
  const h = harness({ enabled: false });
  assert.ok((await h.run()).blocked);
  assert.ok((await h.run({ automatic: false })).blocked);
  assert.equal(h.calls.tenant, 0);
  assert.equal(h.calls.secrets, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(h.calls.writes.length, 0);
});

for (const [name, path, patch] of [
  ['tenant permission', AUTO, { autoCloudTestEnabled: false }],
  ['tenant production permission', AUTO, { environment: 'production' }],
  ['disabled billing', SETTINGS, { verifactuEnabled: false }],
  ['production mode', SETTINGS, { verifactuMode: 'production' }],
  ['production channel', SETTINGS, { aeatConnection: { channel: 'cloud_certificate', environment: 'production' } }],
  ['different channel', SETTINGS, { aeatConnection: { channel: 'local_connector', environment: 'test' } }],
  ['expired certificate', CERT, { validTo: '2026-08-30T00:00:00Z' }],
  ['future certificate', CERT, { validFrom: '2026-09-01T00:00:00Z' }],
  ['wrong certificate NIF', CERT, { taxId: 'B11111111' }],
  ['disconnected certificate', CERT, { connected: false }],
  ['certificate without start date', CERT, { validFrom: null }],
  ['other tenant job', JOB, { companyId: 'b' }],
  ['production job', JOB, { environment: 'production' }],
  ['contradictory production job', JOB, { productionEnabled: true }],
]) {
  test(`gate refuses ${name} without sends or writes`, async () => {
    const h = harness(); h.patch(path, patch);
    assert.ok((await h.run()).blocked);
    assert.equal(h.calls.secrets, 0); assert.equal(h.calls.transport, 0); assert.equal(h.calls.writes.length, 0);
  });
}

test('manual confirmed test can run while automation remains off', async () => {
  const h = harness({ enabled: false }); h.patch(AUTO, { autoCloudTestEnabled: false });
  const result = await h.run({ automatic: false, confirmTestSend: true, actorId: 'admin' });
  assert.equal(result.status, 'accepted');
  assert.equal(result.productionEnabled, false);
  assert.equal(h.data.get(INVOICE).aeatStatus, 'accepted');
  assert.equal(h.data.get(INVOICE).aeatProductionAccepted, false);
  assert.equal(h.calls.transport, 1);
  assert.equal(h.data.get(JOB).attemptToken, null);
  assert.ok(h.calls.writes.every(path => !path.includes('/fiscalRecords/') && !path.includes('production')));
});

test('concurrent double click only sends once', async () => {
  const h = harness();
  const results = await Promise.all([h.run(), h.run()]);
  assert.equal(results.filter(result => result.status === 'accepted').length, 1);
  assert.equal(results.filter(result => result.blocked).length, 1);
  assert.equal(h.calls.transport, 1);
  assert.equal(h.data.get(JOB).attempts, 1);
});

test('stale first submission becomes an incident, not a regenerated record', async () => {
  const h = harness(); const original = structuredClone(h.data.get(FISCAL)); h.advance(180001);
  const result = await h.run();
  assert.equal(result.status, 'needs_review');
  assert.match(result.message, /sin borrar ni regenerar/);
  assert.deepEqual(h.data.get(FISCAL), original); assert.equal(h.calls.transport, 0);
});

test('invalid fiscal hash or cross-environment predecessor cannot be sent', async () => {
  for (const patch of [{ chain: { hash: 'OTHER' } }, { environment: 'production' }, { invoiceId: 'other' }]) {
    const h = harness(); h.patch(FISCAL, patch);
    assert.equal((await h.run()).status, 'needs_review'); assert.equal(h.calls.transport, 0);
  }
});

test('chain order and prior acceptance are required', async () => {
  const h = harness();
  h.patch(FISCAL, { chain: { hash: 'HASH', previousHash: 'PREV', previousFiscalRecordId: 'previous' } });
  h.patch(`${BASE}/fiscalRecords/previous`, { companyId: 'a', environment: 'test', issuerNif: 'B04843843', chain: { hash: 'PREV' } });
  h.patch(`${BASE}/aeatSubmissions/previous`, { companyId: 'a', environment: 'test', fiscalHash: 'PREV', status: 'retry_pending' });
  assert.ok((await h.run()).blocked); assert.equal(h.calls.transport, 0);
  h.patch(`${BASE}/aeatSubmissions/previous`, { status: 'accepted' });
  assert.equal((await h.run()).status, 'accepted');
});

test('pending Windows processing prevents cloud channel takeover, even after lease expiry', async () => {
  const h = harness();
  h.patch(`${BASE}/aeatSubmissions/windows`, { status: 'processing', channel: 'local_connector', leaseUntil: new Date(START - 1) });
  assert.ok((await h.run()).blocked); assert.equal(h.calls.transport, 0);
});

test('cancellation waits for its own alta and uses the Anulacion response identity', async () => {
  const h = harness({ transport: () => reply({ operation: 'Anulacion' }) });
  h.patch(`${BASE}/aeatSubmissions/anulacion_i`, { ...h.data.get(JOB), fiscalRecordId: 'anulacion_i', recordType: 'anulacion' });
  h.patch(`${BASE}/fiscalRecords/anulacion_i`, { ...h.data.get(FISCAL), recordType: 'anulacion' });
  h.patch(INVOICE, { cancellationFiscalRecordId: 'anulacion_i' });
  assert.ok((await h.run({ submissionId: 'anulacion_i' })).blocked);
  h.patch(JOB, { status: 'accepted' });
  assert.equal((await h.run({ submissionId: 'anulacion_i' })).status, 'accepted');
  assert.equal(h.data.get(INVOICE).aeatStatus, 'accepted');
});

test('correction response must identify itself as Subsanacion', async () => {
  const h = harness({ transport: () => reply({ subsanation: true }) });
  h.patch(FISCAL, { recordType: 'subsanacion', subsanacion: true });
  h.patch(JOB, { recordType: 'subsanacion' });
  assert.equal((await h.run()).status, 'accepted');
});

test('HTTP outage retries identical XML despite subsequent settings changes', async () => {
  const h = harness({ transport: h => h.calls.transport === 1 ? { statusCode: 503, body: 'Unavailable' } : reply() });
  assert.equal((await h.run()).status, 'retry_pending');
  assert.ok((await h.run()).blocked);
  h.patch(SETTINGS, { name: 'changed after initial send' }); h.advance(120001);
  assert.equal((await h.run()).status, 'accepted');
  assert.equal(h.calls.payloads[0], h.calls.payloads[1]); assert.equal(h.calls.envelopes, 1);
  assert.equal(h.data.get(JOB).attempts, 2);
});

test('uncertain timeout never becomes rejected and does not expose exceptions', async () => {
  const h = harness({ transport: () => { throw new Error('SECRET-should-never-appear'); } });
  assert.equal((await h.run()).status, 'retry_pending');
  assert.ok(!JSON.stringify([...h.data.values()]).includes('SECRET-should-never-appear'));
});

test('lost result after a crash recovers with new token; late response cannot overwrite it', async () => {
  let release;
  const h = harness({ transport: h => h.calls.transport === 1 ? new Promise(resolve => { release = resolve; }) : reply() });
  const first = h.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const firstToken = h.data.get(JOB).attemptToken;
  h.advance(LEASE_MS + 1);
  const second = await h.run();
  assert.equal(second.status, 'accepted');
  assert.equal(h.data.get(JOB).attempts, 2);
  release(reply({ state: 'Incorrecto' }));
  assert.equal((await first).ignored, true);
  assert.equal(h.data.get(JOB).status, 'accepted');
  assert.equal(h.calls.payloads[0], h.calls.payloads[1]);
  assert.ok(firstToken);
});

test('after eight uncertain attempts stop for review instead of falsely rejecting', async () => {
  const h = harness({ transport: () => { throw new Error('offline'); } });
  for (let attempt = 1; attempt <= 8; attempt++) {
    assert.equal((await h.run()).status, attempt === 8 ? 'needs_review' : 'retry_pending');
    h.advance(24 * 60 * 60 * 1000);
  }
  assert.ok((await h.run()).blocked); assert.equal(h.calls.transport, 8);
});

for (const [name, response, expectedStatus] of [
  ['explicit rejection', reply({ state: 'Incorrecto', shipment: 'Incorrecto' }), 'rejected'],
  ['accepted with errors', reply({ state: 'AceptadoConErrores' }), 'accepted_with_errors'],
  ['duplicate with original accepted state', reply({ duplicate: true, state: 'Incorrecto' }), 'needs_review'],
  ['another invoice', reply({ number: 'OTHER' }), 'needs_review'],
  ['another issuer', reply({ issuer: 'B11111111' }), 'needs_review'],
  ['another issue date', reply({ date: '01-01-2020' }), 'needs_review'],
  ['wrong operation', reply({ operation: 'Anulacion' }), 'needs_review'],
  ['unexpected correction response', reply({ subsanation: true }), 'needs_review'],
  ['missing response line', reply({ lines: 0 }), 'needs_review'],
  ['multiple response lines', reply({ lines: 2 }), 'needs_review'],
  ['invalid wait', reply({ wait: '-1' }), 'needs_review'],
  ['HTML response', { statusCode: 200, body: '<html>OK</html>' }, 'needs_review'],
  ['SOAP fault', { statusCode: 200, body: '<Fault><faultstring>Bad request</faultstring></Fault>' }, 'needs_review'],
  ['HTTP forbidden', { statusCode: 403, body: 'Forbidden' }, 'needs_review'],
]) {
  test(`response: ${name}`, async () => {
    const h = harness({ transport: () => response });
    assert.equal((await h.run()).status, expectedStatus);
  });
}

test('AEAT wait is tenant-wide and is not truncated to one hour', async () => {
  const h = harness({ transport: () => reply({ wait: '7200' }) });
  await h.run();
  assert.equal(h.data.get(DELIVERY).nextAllowedAt.getTime(), START + 7200000);
  h.patch(`${BASE}/aeatSubmissions/second`, { ...h.data.get(JOB), status: 'awaiting_cloud_sender', attempts: 0 });
  assert.ok((await h.run({ submissionId: 'second' })).blocked);
  assert.equal(h.calls.transport, 1);
});

test('disconnect or kill switch while loading credentials prevents network access', async () => {
  for (const mutate of [h => h.enable(false), h => h.patch(CERT, { connected: false }), h => h.tenant(false)]) {
    const h = harness({ loadCertificate: mutate });
    assert.equal((await h.run()).status, 'retry_pending'); assert.equal(h.calls.transport, 0);
  }
});

test('a preceding result never overwrites a later cancellation status on the invoice', async () => {
  const h = harness(); h.patch(INVOICE, { cancellationFiscalRecordId: 'anulacion_i', aeatStatus: 'queued_cancellation' });
  assert.equal((await h.run()).status, 'accepted');
  assert.equal(h.data.get(INVOICE).aeatStatus, 'queued_cancellation');
});

test('legacy uncertain attempts and damaged frozen XML require review', async () => {
  const legacy = harness(); legacy.patch(JOB, { attempts: 1, status: 'retry_pending' });
  assert.equal((await legacy.run()).status, 'needs_review'); assert.equal(legacy.calls.transport, 0);
  const damaged = harness({ transport: () => { throw new Error('offline'); } });
  await damaged.run(); damaged.advance(120001); damaged.patch(JOB, { cloudSoapXml: '<changed/>' });
  assert.equal((await damaged.run()).status, 'needs_review'); assert.equal(damaged.calls.transport, 1);
});

test('production reference is never written by the worker', async () => {
  const h = harness();
  h.patch(`${BASE}/verifactuConfig/delivery_production`, { sentinel: true });
  h.patch(`${BASE}/verifactuConfig/state_production`, { lastInvoiceHash: 'REAL' });
  await h.run();
  assert.deepEqual(h.data.get(`${BASE}/verifactuConfig/state_production`), { lastInvoiceHash: 'REAL' });
  assert.deepEqual(h.data.get(`${BASE}/verifactuConfig/delivery_production`), { sentinel: true });
});

test('deployed entrypoints remain inert without explicit runtime gate', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  let accesses = 0;
  const scope = { exports: {}, onDocumentCreated: (_options, fn) => fn, onSchedule: (_options, fn) => fn,
    automaticAeatTestEnabled: () => false, cloudTestWorker: { run: () => { accesses++; } },
    db: { collectionGroup: () => { accesses++; throw new Error('unexpected access'); } } };
  vm.runInNewContext(source.slice(source.indexOf('exports.onAeatCloudTestSubmissionCreated ='),
    source.indexOf('exports.startLocalConnectorPairing =')), scope);
  await scope.exports.onAeatCloudTestSubmissionCreated({ params: { companyId: 'a', submissionId: 'alta_i' } });
  await scope.exports.recoverAeatCloudTestSubmissions();
  assert.equal(accesses, 0);
});

test('recovery scans past equal-timestamp successors and across pages to find the chain predecessor', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  const seen = [];
  const cursors = [];
  let page = 0;
  const query = { where: () => query, orderBy: () => query, limit: () => query,
    startAfter: cursor => { cursors.push(cursor.id); return query; },
    get: async () => ({ empty: false, docs: (page++ === 0 ? ['later1', 'later2'] : ['earliest']).map(id => ({ id })) }) };
  const scope = { automaticAeatTestEnabled: () => true, db: { collection: () => query },
    cloudTestWorker: { run: async ({ submissionId }) => { seen.push(submissionId);
      return submissionId === 'earliest' ? { status: 'accepted' } : { blocked: 'predecessor_pending' }; } } };
  vm.runInNewContext(source.slice(source.indexOf('async function recoverAeatCompanyTest('),
    source.indexOf('exports.recoverAeatCloudTestSubmissions =')), scope);
  await scope.recoverAeatCompanyTest({ id: 'a', path: 'companies/a' });
  assert.deepEqual(seen, ['later1', 'later2', 'earliest']); assert.deepEqual(cursors, ['later2']);
});

test('manual callable requires authentication and confirmation before invoking the shared worker', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  let called = 0;
  let auth = true;
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const scope = { exports: {}, onCall: (_options, fn) => fn, HttpsError,
    requireTenantAdmin: async () => { if (!auth) throw new Error('unauthenticated'); return 'a'; },
    cloudTestWorker: { run: async input => { called++; assert.equal(input.companyId, 'a');
      assert.equal(input.automatic, false); assert.equal(input.confirmTestSend, true); assert.equal(input.actorId, 'admin');
      return { status: 'accepted' }; } } };
  vm.runInNewContext(source.slice(source.indexOf('exports.sendAeatCloudTestSubmission ='),
    source.indexOf('exports.onAeatCloudTestSubmissionCreated =')), scope);
  const send = scope.exports.sendAeatCloudTestSubmission;
  await assert.rejects(send({ auth: { uid: 'admin' }, data: { submissionId: 'alta_i' } }));
  auth = false;
  await assert.rejects(send({ data: { submissionId: 'alta_i', confirmTestSend: true } }));
  assert.equal(called, 0); auth = true;
  assert.equal((await send({ auth: { uid: 'admin' }, data: { submissionId: 'alta_i', confirmTestSend: true } })).status, 'accepted');
  assert.equal(called, 1);
});

test('an old Windows result cannot bypass the versioned protocol', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  let statusCode;
  const scope = { exports: {}, onRequest: (_options, fn) => fn, parseConnectorBody: () => ({ submissionId: 'alta_i' }),
    authenticateLocalConnector: async () => ({ companyId: 'a' }), isTestSubmissionEligible: () => true,
    db: { doc: () => ({}), runTransaction: fn => fn({ get: async () => ({ exists: true, data: () => ({ deliveryOwner: 'cloud_worker' }) }),
      update: () => { throw new Error('must not overwrite cloud result'); } }) } };
  vm.runInNewContext(source.slice(source.indexOf('exports.localConnectorResult ='), source.indexOf('exports.prepareAeatSubmissions =')), scope);
  const response = { status: value => { statusCode = value; return response; }, json: () => {} };
  await scope.exports.localConnectorResult({ method: 'POST' }, response);
  assert.equal(statusCode, 426);
});

test('legacy manual-result endpoint cannot manufacture or overwrite cloud results', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const scope = { exports: {}, onCall: (_options, fn) => fn, HttpsError, requireTenantAdmin: async () => 'a',
    isTestSubmissionEligible: () => true,
    db: { collection: () => ({ doc: () => ({}) }), runTransaction: fn => fn({
      get: async () => ({ exists: true, data: () => ({ channel: 'cloud_certificate' }) }),
      update: () => { throw new Error('must not write'); },
    }) } };
  vm.runInNewContext(source.slice(source.indexOf('exports.recordAeatTestResult ='),
    source.indexOf('exports.cancelInvoiceFiscalRecord =')), scope);
  await assert.rejects(scope.exports.recordAeatTestResult({ auth: { uid: 'admin' },
    data: { submissionId: 'alta_i', status: 'accepted' } }), /envío seguro/);
});

test('Windows v2 freezes SOAP and sends no certificate/credential to the job response', async () => {
  const h = harness({ local: true }); const { job } = await h.claim();
  assert.equal(job.protocolVersion, 2); assert.equal(job.environment, 'test'); assert.equal(job.productionEnabled, false);
  assert.equal(job.soapSha256, h.data.get(JOB).localSoapSha256);
  assert.ok(!JSON.stringify(job).includes('binding-a')); assert.equal(h.calls.secrets, 0); assert.equal(h.calls.transport, 0);
  assert.equal((await h.result(job)).status, 'accepted');
});

test('Windows rejects wrong protocol, pairing, expired cert, production or another company', async () => {
  for (const mutation of [h => h.patch(`${BASE}/verifactuConfig/localConnector`, { protocolVersion: 1 }),
    h => h.patch(`${BASE}/verifactuConfig/localConnector`, { connectorTokenHash: 'other' }),
    h => h.patch(`${BASE}/verifactuConfig/localConnector`, { certificateValidTo: '2020-01-01' }),
    h => h.patch(JOB, { environment: 'production' }), h => h.patch(JOB, { companyId: 'b' })]) {
    const h = harness({ local: true }); mutation(h);
    assert.ok((await h.claim()).blocked); assert.equal(h.calls.writes.length, 0);
  }
  const h = harness({ local: true }); assert.ok((await h.claim({ protocolVersion: 1 })).blocked);
});

test('Windows can acknowledge the same receipt twice without more writes or attempts', async () => {
  const h = harness({ local: true }); const { job } = await h.claim();
  const first = await h.result(job); const writes = h.calls.writes.length;
  assert.equal(first.status, 'accepted');
  const again = await h.result(job, { responseXml: reply({ state: 'Incorrecto' }).body });
  assert.equal(again.duplicateReceipt, true); assert.equal(again.status, 'accepted');
  assert.equal(h.calls.writes.length, writes); assert.equal(h.data.get(JOB).attempts, 1);
});

test('a stored Windows receipt can arrive after lease expiry if no new claim superseded it', async () => {
  const h = harness({ local: true }); const { job } = await h.claim(); h.advance(LEASE_MS + 1);
  assert.equal((await h.result(job)).status, 'accepted'); assert.equal(h.data.get(JOB).attempts, 1);
});

test('Windows expired attempt is recovered with identical XML and late result is fenced', async () => {
  const h = harness({ local: true }); const first = (await h.claim()).job;
  h.advance(LEASE_MS + 1); h.patch(SETTINGS, { name: 'changed' });
  const second = (await h.claim()).job;
  assert.equal(second.soapXml, first.soapXml); assert.notEqual(second.attemptToken, first.attemptToken);
  assert.equal((await h.result(second)).status, 'accepted');
  assert.equal((await h.result(first, { responseXml: reply({ state: 'Incorrecto' }).body })).ignored, true);
  assert.equal(h.data.get(JOB).status, 'accepted');
});

test('Windows results cannot complete a cloud attempt or use a forged pairing/token', async () => {
  const h = harness({ local: true }); const { job } = await h.claim();
  assert.equal((await h.result(job, { binding: 'wrong' })).ignored, true);
  assert.equal((await h.result(job, { attemptToken: 'wrong' })).ignored, true);
  h.patch(JOB, { deliveryOwner: 'cloud_worker', channel: 'cloud_certificate' });
  assert.equal((await h.result(job)).ignored, true);
  assert.equal(h.data.get(JOB).status, 'processing');
});

test('Windows requires review for mismatched or duplicate AEAT responses', async () => {
  for (const response of [reply({ number: 'other' }), reply({ operation: 'Anulacion' }), reply({ duplicate: true }), reply({ lines: 0 })]) {
    const h = harness({ local: true }); const { job } = await h.claim();
    assert.equal((await h.result(job, { responseXml: response.body })).status, 'needs_review');
  }
});

test('Windows retry honors cooldown and ignores overlarge or unversioned receipts', async () => {
  const h = harness({ local: true }); const { job } = await h.claim();
  assert.equal((await h.result(job, { protocolVersion: 1 })).ignored, true);
  assert.equal((await h.result(job, { responseXml: 'x'.repeat(524289) })).ignored, true);
  assert.equal((await h.result(job, { httpStatus: 503, responseXml: 'Unavailable' })).status, 'retry_pending');
  assert.ok((await h.claim()).blocked);
  h.advance(120001); assert.ok((await h.claim()).job);
});

test('Windows heartbeat updates health but never changes the billing channel', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8'); let saved;
  const scope = { exports: {}, onRequest: (_opts, fn) => fn, FieldValue: { serverTimestamp: () => 'now' },
    parseConnectorBody: () => ({ certificateTaxId: 'B04843843', protocolVersion: 2, certificateValidFrom: '2026-01-01' }),
    authenticateLocalConnector: async () => ({ companyId: 'a', data: { expectedTaxId: 'B04843843' }, ref: { set: async value => { saved = value; } } }),
    db: { doc: () => { throw new Error('heartbeat must not touch billing'); } } };
  vm.runInNewContext(source.slice(source.indexOf('exports.localConnectorHeartbeat ='), source.indexOf('const localTestWorker =')), scope);
  const response = { status: () => response, json: () => {} };
  await scope.exports.localConnectorHeartbeat({ method: 'POST' }, response);
  assert.equal(saved.protocolVersion, 2); assert.equal(saved.certificateValidFrom, '2026-01-01');
});
