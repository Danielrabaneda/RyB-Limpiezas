const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAeatRecoveryScheduler } = require('../functions/lib/aeatRecoveryScheduler');
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Local emulator required; real data forbidden');
}
const app = initializeApp({ projectId: 'demo-verifactu-recovery' }, 'recovery-offline');
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });

test('candidate cursor survives document deletion and tied creation timestamps', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../functions/index.js'), 'utf8');
  const ref = db.doc('companies/cursor-only');
  for (const id of ['a', 'b', 'c']) await ref.collection('aeatSubmissions').doc(id).set({
    createdAt: new Date('2026-01-01'), channel: 'cloud_certificate', status: 'retry_pending' });
  const seen = [];
  const scope = { db, automaticAeatTestEnabled: () => true,
    cloudTestWorker: { run: async ({ submissionId }) => { seen.push(submissionId); return { status: 'accepted' }; } } };
  vm.runInNewContext(source.slice(source.indexOf('async function recoverAeatCompanyTest('),
    source.indexOf('exports.recoverAeatCloudTestSubmissions =')), scope);
  await scope.recoverAeatCompanyTest(ref);
  await ref.collection('aeatSubmissions').doc('a').delete();
  await scope.recoverAeatCompanyTest(ref);
  assert.deepEqual(seen, ['a', 'b']);
});

test('Firestore scheduler lease and durable cursor rotate 100 tenants across bounded runs', async () => {
  const batch = db.batch();
  for (let i = 0; i < 100; i++) {
    const ref = db.doc(`companies/t${String(i).padStart(3, '0')}`);
    batch.set(ref, { synthetic: true });
    batch.set(ref.collection('verifactuConfig').doc('automation'), { environment: 'test', autoCloudTestEnabled: true });
  }
  await batch.commit();
  let time = Date.now(); const visited = [];
  const scheduler = createAeatRecoveryScheduler({ db, enabled: () => true, now: () => time,
    recover: async ref => { visited.push(ref.id); time += 6000; } });
  await scheduler.run(); assert.equal(visited.length, 70);
  await scheduler.run(); assert.equal(visited.length, 100);
  assert.equal(new Set(visited).size, 100);
});

test('Firestore transaction denies a second overlapping scheduler', async () => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  let calls = 0;
  const a = createAeatRecoveryScheduler({ db, enabled: () => true,
    recover: async () => { calls++; if (calls === 1) { entered(); await new Promise(resolve => { release = resolve; }); } } });
  const first = a.run(); await ready;
  const b = createAeatRecoveryScheduler({ db, enabled: () => true, recover: async () => assert.fail('overlap') });
  await b.run(); release(); await first;
  assert.equal(calls, 100);
});
