const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fiscal = require('../lib/invoiceEmission');
const aeat = require('../lib/aeatSubmission');
const environment = require('../lib/verifactuEnvironment');

const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
const handlerSource = source.slice(source.indexOf('exports.emitInvoices ='), source.indexOf('exports.configureAeatConnection ='));

function harness(settings, ids = ['draft-1']) {
  const writes = [];
  const reads = [];
  const invoice = { status: 'draft', year: 2026, items: [{ description: 'Test', quantity: 1, price: 1 }], client: { name: 'Test', cif: 'B04843843' } };
  const snapshot = (ref) => ({ id: ref.id, exists: !ref.path.includes('fiscalRecords') && !ref.path.includes('verifactuConfig'), data: () => ref.id === 'billing' ? settings : invoice });
  const transaction = {
    get: async (ref) => { reads.push(ref.path); return snapshot(ref); },
    create: (ref, data) => writes.push({ op: 'create', path: ref.path, data }),
    update: (ref, data) => writes.push({ op: 'update', path: ref.path, data }),
    set: (ref, data) => writes.push({ op: 'set', path: ref.path, data }),
  };
  const db = {
    doc: (path) => ({ id: path.split('/').at(-1), path }),
    collection: (path) => ({ doc: (id) => ({ id, path: `${path}/${id}`, get: async () => ({ exists: true, data: () => ({ role: 'admin', active: true, companyId: 'test' }) }) }) }),
    runTransaction: (fn) => fn(transaction),
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const scope = {
    ...fiscal, ...aeat, ...environment, exports: {}, db, HttpsError,
    onCall: (_options, fn) => fn,
    assertTenantEnabled: async () => {},
    normalizeTaxId: (value) => value.replace(/[^A-Z0-9]/g, ''),
    Timestamp: { fromDate: (date) => ({ toDate: () => date }) },
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
    buildAeatSubmissionDocument: () => null,
    appendVerifactuEvent: () => {},
    logger: { error: () => {} },
  };
  vm.runInNewContext(handlerSource, scope);
  return { writes, reads, run: () => scope.exports.emitInvoices({ auth: { uid: 'admin', token: { companyId: 'test' } }, data: { invoiceIds: ids } }) };
}

for (const enabled of [undefined, false, 'true', 1]) {
  for (const ids of [['draft-1'], ['draft-1', 'draft-2']]) {
    test(`server blocks disabled/malformed mode (${enabled}), batch ${ids.length}, without writes`, async () => {
      const h = harness({ verifactuEnabled: enabled }, ids);
      await assert.rejects(h.run, (error) => error.code === 'failed-precondition' && /borradores/.test(error.message));
      assert.equal(h.writes.length, 0);
      assert.deepEqual(h.reads, ['companies/test/settings/billing']);
    });
  }
}

for (const profile of [{ environment: 'production' }, { environment: 'invalid' }, { environment: 'test', productionEnabled: true }]) {
  test(`server keeps production blocked: ${JSON.stringify(profile)}`, async () => {
    const h = harness({ verifactuEnabled: true, aeatConnection: profile });
    await assert.rejects(h.run, /producción permanece bloqueada/);
    assert.equal(h.writes.length, 0);
  });
}

test('test-mode batch creates fiscal records with release identity and isolated numbering', async () => {
  const h = harness({ verifactuEnabled: true, nif: 'B04843843', nextInvoiceSeq: 347, aeatConnection: { environment: 'test', channel: 'disabled' } }, ['draft-1', 'draft-2']);
  const result = await h.run();
  assert.deepEqual(Array.from(result.emitted, (item) => item.invoiceNumber), ['TEST-VF-2026-0001', 'TEST-VF-2026-0002']);
  const records = h.writes.filter((item) => item.path.includes('/fiscalRecords/'));
  assert.equal(records.length, 2);
  for (const { data } of records) {
    assert.deepEqual(data.system, fiscal.SYSTEM);
    const xml = aeat.buildAeatOfficialSoapEnvelope(data);
    assert.ok(xml.includes(`<sf:Version>${fiscal.SYSTEM_VERSION}</sf:Version>`));
    assert.match(xml, /<sf:NombreSistemaInformatico>LimpiaGest</);
  }
  assert.equal(h.writes.find((item) => item.op === 'set').data.nextInvoiceSeq, 347);
});

for (const recordType of ['alta', 'anulacion']) {
  test(`${recordType}: XML preserves historical release instead of relabelling it`, () => {
    for (const version of [undefined, '0.1.0-phase2', '0.1.0-phase4', '1.0.1']) {
      const record = { recordType, system: version ? { version } : undefined, chain: {} };
      const xml = aeat.buildAeatOfficialSoapEnvelope(record);
      assert.ok(xml.includes(`<sf:Version>${version === '1.0.1' ? version : '1.0.0'}</sf:Version>`));
    }
  });
}

test('new cancellation records use the same release identity', () => {
  const cancellation = source.slice(source.indexOf('const cancellationRecord ='), source.indexOf('exports.subsanateInvoiceFiscalRecord ='));
  assert.match(cancellation, /system: \{ \.\.\.SYSTEM \}/);
});
