const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('saving document settings strips stale fiscal state but preserves editable fields', async () => {
  const source = fs.readFileSync('src/services/invoiceService.js', 'utf8');
  const start = source.indexOf('export async function saveBillingSettings(');
  const end = source.indexOf('\n}', start) + 2;
  let saved;
  const context = { db: {}, tenantDoc: () => 'billing', setDoc: async (_ref, value) => { saved = value; } };
  vm.runInNewContext(source.slice(start, end).replace('export ', ''), context);
  const input = { companyName: 'Company', nextInvoiceSeq: 347, lastInvoiceHash: 'old', lastFiscalRecordId: 'old', seriesCounters: {}, lastEmissionMode: 'legacy', verifactuProduction: { enabled: true } };
  await context.saveBillingSettings('a', input);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { companyName: 'Company', nextInvoiceSeq: 347 });
  assert.equal(input.lastInvoiceHash, 'old');
});
