const test = require('node:test');
const assert = require('node:assert/strict');
const { createAeatRecoveryScheduler, STATE_PATH, LEASE_MS } = require('../lib/aeatRecoveryScheduler');

function harness({ count = 100, delay = 6000, fail = false } = {}) {
  let time = 1000000, enabled = true, serial = Promise.resolve(), token = 0;
  const visited = [], data = new Map();
  const ids = Array.from({ length: count }, (_, i) => `tenant-${String(i).padStart(4, '0')}`);
  const doc = path => ({ path, id: path.split('/').at(-1), get: async () => ({ data: () => data.get(path) }),
    set: async value => data.set(path, value) });
  for (const id of ids) data.set(`companies/${id}/verifactuConfig/automation`,
    { environment: 'test', autoCloudTestEnabled: true });
  const db = { doc, collection: path => {
    assert.equal(path, 'companies'); let cursor = '', limit;
    const q = { orderBy: name => { assert.equal(name, '__name__'); return q; },
      limit: n => { limit = n; return q; }, startAfter: value => { cursor = value; return q; },
      get: async () => { const docs = ids.filter(id => id > cursor).slice(0, limit)
        .map(id => ({ id, ref: doc(`companies/${id}`) })); return { empty: !docs.length, docs }; } };
    return q;
  }, runTransaction: fn => {
    const p = serial.then(() => fn({ get: ref => ref.get(),
      set: (ref, value) => data.set(ref.path, { ...data.get(ref.path), ...value }) }));
    serial = p.catch(() => {}); return p;
  } };
  const scheduler = createAeatRecoveryScheduler({ db, now: () => time, token: () => `owner-${++token}`,
    enabled: () => enabled, recover: async ref => { visited.push(ref.id); time += delay;
      if (fail) throw new Error('synthetic'); } });
  return { ...scheduler, visited, data, advance: n => { time += n; }, disable: () => { enabled = false; } };
}

test('100 slow tenants continue across invocations instead of restarting at the first', async () => {
  const h = harness(); await h.run();
  assert.equal(h.visited.length, 70);
  await h.run(); assert.equal(h.visited.length, 100);
  assert.equal(new Set(h.visited).size, 100);
  await h.run(); assert.equal(h.visited[100], 'tenant-0000');
});
test('tenant failures still advance the durable cursor', async () => {
  const h = harness({ fail: true }); await h.run(); await h.run();
  assert.equal(new Set(h.visited).size, 100);
});
test('concurrent invocations have only one scheduler owner', async () => {
  const h = harness(); await Promise.all([h.run(), h.run()]);
  assert.equal(h.visited.length, 70);
});
test('expired scheduler lease resumes after a crash, not before expiry', async () => {
  const h = harness({ count: 4 });
  h.data.set(STATE_PATH, { owner: 'crashed', leaseUntil: 1000000 + LEASE_MS, cursor: 'tenant-0001' });
  await h.run(); assert.equal(h.visited.length, 0);
  h.advance(LEASE_MS + 1); await h.run();
  assert.deepEqual(h.visited, ['tenant-0002', 'tenant-0003']);
});
test('production and opt-out tenants are skipped', async () => {
  const h = harness({ count: 3 });
  h.data.set('companies/tenant-0000/verifactuConfig/automation', { environment: 'production', autoCloudTestEnabled: true });
  h.data.set('companies/tenant-0001/verifactuConfig/automation', { environment: 'test', autoCloudTestEnabled: false });
  await h.run(); assert.deepEqual(h.visited, ['tenant-0002']);
});
test('disabled gate makes zero state changes', async () => {
  const h = harness(); h.disable(); await h.run();
  assert.equal(h.data.has(STATE_PATH), false); assert.equal(h.visited.length, 0);
});
