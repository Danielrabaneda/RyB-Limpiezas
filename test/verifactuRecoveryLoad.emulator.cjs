const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAeatRecoveryScheduler } = require('../functions/lib/aeatRecoveryScheduler');
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Local emulator required; real data forbidden');
}
const app = initializeApp({ projectId: 'demo-verifactu-load' }, 'recovery-load');
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });
test('1000 synthetic tenants finish a fair cycle in three bounded runs', async t => {
  for (let offset = 0; offset < 1000; offset += 200) {
    const batch = db.batch();
    for (let i = offset; i < offset + 200; i++) {
      const ref = db.doc(`companies/load-${String(i).padStart(4, '0')}`);
      batch.set(ref, { synthetic: true });
      batch.set(ref.collection('verifactuConfig').doc('automation'), { environment: 'test', autoCloudTestEnabled: true });
    }
    await batch.commit();
  }
  const visited = [], durations = [], sizes = [];
  const scheduler = createAeatRecoveryScheduler({ db, enabled: () => true,
    recover: async ref => { visited.push(ref.id); } });
  for (let run = 0; run < 3; run++) {
    const before = visited.length, start = performance.now();
    await scheduler.run(); durations.push(Math.round(performance.now() - start));
    sizes.push(visited.length - before);
  }
  assert.deepEqual(sizes, [400, 400, 200]);
  assert.equal(new Set(visited).size, 1000);
  t.diagnostic(JSON.stringify({ tenants: 1000, runs: sizes, wallMilliseconds: durations,
    scope: 'local emulator, no AEAT transport, no fiscal workload' }));
});
