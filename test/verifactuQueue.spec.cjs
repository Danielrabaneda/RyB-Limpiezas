const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/utils/verifactuQueue.js');
test('dates use Madrid including month and year boundaries', async () => {
  const { queueDate } = await modulePromise;
  assert.equal(queueDate('2025-12-31T23:30:00Z').year, '2026');
  assert.equal(queueDate({ toDate: () => new Date('2026-08-31T22:30:00Z') }).month, '09');
  assert.equal(queueDate({ seconds: 0 }).year, '1970');
  assert.equal(queueDate(null), null); assert.equal(queueDate('invalid'), null);
});
test('filters combine creation year/month and never the invoice date', async () => {
  const { selectQueuePage } = await modulePromise;
  const items = [{ id: 1, createdAt: '2026-08-01', issueDate: '2025-01-01' }, { id: 2, createdAt: '2025-08-01' }, { id: 3 }];
  assert.deepEqual(selectQueuePage(items, '2026', '08').items.map(i => i.id), [1]);
  assert.equal(selectQueuePage(items, '', '08').total, 2);
  assert.equal(selectQueuePage(items).total, 3);
  assert.equal(selectQueuePage(items, '2026', '01').total, 0);
});
test('pagination reaches records beyond 50 and clamps after filtering', async () => {
  const { selectQueuePage } = await modulePromise;
  const items = Array.from({ length: 61 }, (_, id) => ({ id, createdAt: '2026-08-01' }));
  assert.equal(selectQueuePage(items, '', '', 7).items[0].id, 60);
  assert.equal(selectQueuePage(items, '', '', 99).currentPage, 7);
  assert.equal(selectQueuePage([], '', '', 7).currentPage, 1);
  assert.equal(items.length, 61);
});
