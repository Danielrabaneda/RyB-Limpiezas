const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const env = require('../lib/verifactuEnvironment');
const fiscal = require('../lib/invoiceEmission');
const aeat = require('../lib/aeatSubmission');
const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');

function database(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  let id = 0;
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const db = { doc: ref, collection: (path) => ({ doc: (key) => ref(`${path}/${key || `auto_${++id}`}`) }) };
  db.runTransaction = async (fn) => {
    const staged = [];
    const transaction = {
      get: async (reference) => {
        assert.equal(staged.length, 0, 'Firestore requires all reads before writes');
        return { id: reference.id, exists: data.has(reference.path), data: () => data.get(reference.path) };
      },
      create: (reference, value) => { assert.ok(!data.has(reference.path)); staged.push([reference, value, false]); },
      update: (reference, value) => { assert.ok(data.has(reference.path)); staged.push([reference, value, true]); },
      set: (reference, value, options) => staged.push([reference, value, options?.merge === true]),
    };
    const result = await fn(transaction);
    for (const [reference, value, merge] of staged) {
      data.set(reference.path, merge ? { ...data.get(reference.path), ...value } : value);
      writes.push(reference.path);
    }
    return result;
  };
  return { db, data, writes };
}

const settings = { nif: 'B04843843', lastFiscalRecordId: 'last', lastInvoiceHash: 'ABC', seriesCounters: { 'TEST-VF': 3 } };
const previous = { companyId: 'a', environment: 'test', issuerNif: 'B04843843', chain: { hash: 'ABC' } };

test('production starts empty even if test history and real legacy counters exist', () => {
  const state = env.initialFiscalState('a', 'production', settings);
  assert.equal(state.lastFiscalRecordId, null);
  assert.equal(state.lastInvoiceHash, '');
  assert.deepEqual(state.seriesCounters, {});
  assert.notEqual(env.fiscalStatePath('a', 'test'), env.fiscalStatePath('a', 'production'));
  assert.notEqual(env.fiscalStatePath('a', 'test'), env.fiscalStatePath('b', 'test'));
  assert.throws(() => env.fiscalStatePath('../b', 'test'));
  assert.throws(() => env.fiscalStatePath('a', 'invalid'));
});

test('first test operation imports and validates the historical chain without writing or touching records', async () => {
  const h = database({ 'companies/a/fiscalRecords/last': previous });
  const result = await h.db.runTransaction((tx) => env.readFiscalState(tx, h.db, 'a', 'test', settings));
  assert.equal(result.state.lastInvoiceHash, 'ABC');
  assert.equal(result.state.seriesCounters['TEST-VF'], 3);
  assert.deepEqual(h.writes, []);
});

test('private state overrides legacy billing mirrors after initial migration', async () => {
  const state = env.initialFiscalState('a', 'test', settings);
  const h = database({ [env.fiscalStatePath('a', 'test')]: state, 'companies/a/fiscalRecords/last': previous });
  const result = await h.db.runTransaction((tx) => env.readFiscalState(tx, h.db, 'a', 'test', { nif: 'B04843843', lastFiscalRecordId: 'forged', seriesCounters: { 'TEST-VF': 1 } }));
  assert.equal(result.state.lastFiscalRecordId, 'last');
  assert.equal(result.state.seriesCounters['TEST-VF'], 3);
});

for (const invalidPrevious of [undefined, { ...previous, companyId: 'b' }, { ...previous, environment: 'production' }, { ...previous, issuerNif: 'B12345678' }, { ...previous, chain: { hash: 'WRONG' } }]) {
  test(`reject invalid predecessor: ${JSON.stringify(invalidPrevious)}`, async () => {
    const h = database(invalidPrevious ? { 'companies/a/fiscalRecords/last': invalidPrevious } : {});
    await assert.rejects(h.db.runTransaction((tx) => env.readFiscalState(tx, h.db, 'a', 'test', settings)));
    assert.deepEqual(h.writes, []);
  });
}

test('test transport refuses production, missing scope, other tenant and contradictory flags', () => {
  assert.ok(env.isTestSubmissionEligible(previous, 'a'));
  for (const record of [{}, { ...previous, companyId: 'b' }, { ...previous, environment: 'production' }, { ...previous, productionEnabled: true }]) {
    assert.equal(env.isTestSubmissionEligible(record, 'a'), false);
    assert.throws(() => env.assertFiscalScope(record, 'a', 'test'));
  }
});

function correctionHarness(environment = 'test') {
  const invoice = { emissionMode: 'verifactu_test', fiscalRecordId: 'alta_i', invoiceStatus: 'issued', invoiceNumber: 'TEST-VF-2026-0001', invoiceSeq: 1, invoiceType: 'F1', series: 'TEST-VF', issueDate: new Date('2026-08-31T12:00:00Z'), client: { name: 'Test', cif: 'B04843843' }, items: [{ description: 'Test', quantity: 1, price: 1 }] };
  const h = database({
    'companies/a/settings/billing': { ...settings, verifactuEnabled: true, aeatConnection: { environment: 'test', channel: 'cloud_certificate' } },
    'companies/a/invoices/i': invoice,
    'companies/a/fiscalRecords/alta_i': { ...previous, environment, invoiceId: 'i' },
    'companies/a/fiscalRecords/last': previous,
  });
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const scope = { ...env, ...fiscal, ...aeat, exports: {}, db: h.db,
    HttpsError, onCall: (_options, fn) => fn, requireTenantAdmin: async () => 'a',
    normalizeTaxId: (value) => value.replace(/[^A-Z0-9]/g, ''),
    Timestamp: { now: () => new Date(), fromDate: (date) => date }, FieldValue: { serverTimestamp: () => new Date() },
    appendVerifactuEvent: () => {},
  };
  vm.runInNewContext(source.slice(source.indexOf('function buildAeatSubmissionDocument('), source.indexOf('function appendVerifactuEvent(')), scope);
  vm.runInNewContext(source.slice(source.indexOf('exports.cancelInvoiceFiscalRecord ='), source.indexOf('exports.sendInvoiceEmails =')), scope);
  return { ...h, call: (name) => scope.exports[name]({ auth: { uid: 'admin' }, data: { invoiceId: 'i', reason: 'Test', corrections: { clientName: 'Corrected' } } }) };
}

for (const name of ['cancelInvoiceFiscalRecord', 'subsanateInvoiceFiscalRecord']) {
  test(`${name}: state, queue and immutable record stay in test, without touching production`, async () => {
    const h = correctionHarness();
    const result = await h.call(name);
    assert.ok(result.hash);
    const state = h.data.get(env.fiscalStatePath('a', 'test'));
    assert.equal(state.lastInvoiceHash, result.hash);
    assert.equal(state.seriesCounters['TEST-VF'], 3);
    assert.equal(h.data.get(`companies/a/fiscalRecords/${state.lastFiscalRecordId}`).chain.previousHash, 'ABC');
    assert.ok(h.writes.every((path) => !path.includes('production')));
    assert.equal(h.data.get('companies/a/fiscalRecords/last'), previous);
  });
  test(`${name}: cannot relabel a production invoice as test`, async () => {
    const h = correctionHarness('production');
    await assert.rejects(h.call(name));
    assert.deepEqual(h.writes, []);
  });
}

test('consecutive correction and cancellation continue the private chain without overwriting history', async () => {
  const h = correctionHarness();
  const corrected = await h.call('subsanateInvoiceFiscalRecord');
  const cancelled = await h.call('cancelInvoiceFiscalRecord');
  const cancellation = h.data.get('companies/a/fiscalRecords/anulacion_i');
  assert.equal(cancellation.chain.previousHash, corrected.hash);
  assert.equal(h.data.get(env.fiscalStatePath('a', 'test')).lastInvoiceHash, cancelled.hash);
  assert.equal(h.data.get('companies/a/fiscalRecords/last').chain.hash, 'ABC');
});

test('legacy local connector cannot claim any candidate without protocol v2', async () => {
  for (const candidate of [
    { companyId: 'a', environment: 'production' },
    { companyId: 'b', environment: 'test' },
    { companyId: 'a' },
    { companyId: 'a', environment: 'test', productionEnabled: true },
    { companyId: 'a', environment: 'test', attempts: aeat.MAX_SUBMISSION_ATTEMPTS },
  ]) {
    let claims = 0;
    let result;
    const scope = { ...env, ...fiscal, ...aeat, exports: {},
      onRequest: (_options, fn) => fn, parseConnectorBody: () => ({}), authenticateLocalConnector: async () => ({ companyId: 'a' }),
      db: {
        doc: () => ({ get: async () => ({ data: () => ({ verifactuEnabled: true, aeatConnection: { channel: 'local_connector', environment: 'test' } }) }) }),
        collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ id: 'job', data: () => ({ status: 'retry_pending', ...candidate }) }] }) }) }) }),
        runTransaction: () => { claims++; throw new Error('Must not claim'); },
      },
    };
    vm.runInNewContext(source.slice(source.indexOf('exports.localConnectorClaim ='), source.indexOf('exports.localConnectorResult =')), scope);
    const response = { status: () => response, json: (body) => { result = body; } };
    await scope.exports.localConnectorClaim({ method: 'POST' }, response);
    assert.equal(claims, 0);
    assert.equal(result.job, null);
  }
});
