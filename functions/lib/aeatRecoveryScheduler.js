const { randomUUID } = require('node:crypto');

const STATE_PATH = 'internalVerifactuRecovery/test';
const LEASE_MS = 600000; // Longer than the function's 540-second hard timeout.
const RUN_MS = 420000; // Leave headroom for an in-flight worker/network request.

function createAeatRecoveryScheduler({ db, enabled, recover, now = Date.now, token = randomUUID }) {
  async function run() {
    if (!enabled()) return;
    const ref = db.doc(STATE_PATH);
    const owner = token(), started = now();
    const claimed = await db.runTransaction(async tx => {
      const state = (await tx.get(ref)).data() || {};
      if (Number(state.leaseUntil) > now()) return false;
      tx.set(ref, { owner, leaseUntil: started + LEASE_MS, environment: 'test' }, { merge: true });
      return true;
    });
    if (!claimed) return;
    const active = async () => enabled() && now() - started < RUN_MS &&
      await db.runTransaction(async tx => {
        const state = (await tx.get(ref)).data() || {};
        return state.owner === owner && state.leaseUntil > now();
      });
    try {
      // Bounded reads; no unbounded collectionGroup snapshot.
      for (let pages = 0; pages < 20 && await active(); pages++) {
        const state = (await ref.get()).data() || {};
        let query = db.collection('companies').orderBy('__name__').limit(20);
        if (state.cursor) query = query.startAfter(state.cursor);
        const batch = await query.get();
        if (batch.empty) {
          await checkpoint(null);
          break; // Start a new fair cycle on the next invocation.
        }
        for (const company of batch.docs) {
          if (!await active()) return;
          // Advance BEFORE work: a crashing tenant cannot starve the next one.
          // It is revisited on the next cycle; existing job leases fence retries.
          if (!await checkpoint(company.id)) return;
          try {
            const config = (await db.doc(`${company.ref.path}/verifactuConfig/automation`).get()).data() || {};
            if (config.environment === 'test' && config.autoCloudTestEnabled === true && await active()) {
              await recover(company.ref, active);
            }
          } catch {
            // Never store SDK errors, credentials or response payloads here.
          }
        }
      }
    } finally {
      await db.runTransaction(async tx => {
        const state = (await tx.get(ref)).data() || {};
        if (state.owner === owner) tx.set(ref, { owner: null, leaseUntil: 0 }, { merge: true });
      });
    }
    async function checkpoint(cursor) {
      return db.runTransaction(async tx => {
        const state = (await tx.get(ref)).data() || {};
        if (!enabled() || state.owner !== owner || state.leaseUntil <= now()) return false;
        tx.set(ref, { cursor }, { merge: true });
        return true;
      });
    }
  }
  return { run };
}

module.exports = { createAeatRecoveryScheduler, STATE_PATH, LEASE_MS, RUN_MS };
