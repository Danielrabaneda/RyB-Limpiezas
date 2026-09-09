const fs = require('node:fs');
const { test, before, after } = require('node:test');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-verifactu-isolation', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'companies/a'), { status: 'active', subscriptionStatus: 'active' });
    await setDoc(doc(ctx.firestore(), 'companies/a/settings/billing'), { companyName: 'Test', nextInvoiceSeq: 347, lastInvoiceHash: 'ABC', lastFiscalRecordId: 'last', seriesCounters: { 'TEST-VF': 3 } });
    await setDoc(doc(ctx.firestore(), 'companies/a/verifactuConfig/state_test'), { companyId: 'a', environment: 'test' });
  });
});
after(async () => { if (env) await env.cleanup(); });
const client = (companyId = 'a', role = 'admin') => env.authenticatedContext(`${companyId}-${role}`, { companyId, role, active: true }).firestore();
test('admin can edit document settings but cannot alter or erase chain/counters/production state', async () => {
  const billing = doc(client(), 'companies/a/settings/billing');
  await assertSucceeds(updateDoc(billing, { companyName: 'Updated', nextInvoiceSeq: 348 }));
  for (const patch of [{ lastInvoiceHash: 'forged' }, { lastFiscalRecordId: 'other' }, { seriesCounters: {} }, { lastEmissionMode: 'legacy' }, { verifactuProduction: { enabled: true } }]) await assertFails(updateDoc(billing, patch));
  await assertFails(deleteDoc(billing));
  await assertFails(setDoc(billing, { companyName: 'Reset' }));
});
test('environment state is readable only by own admin and writable by no client', async () => {
  const state = 'companies/a/verifactuConfig/state_test';
  await assertSucceeds(getDoc(doc(client(), state)));
  await assertFails(getDoc(doc(client('b'), state)));
  await assertFails(getDoc(doc(client('a', 'operario'), state)));
  await assertFails(updateDoc(doc(client(), state), { environment: 'production' }));
  await assertFails(deleteDoc(doc(client(), state)));
  await assertFails(setDoc(doc(client(), 'companies/a/verifactuConfig/state_production'), { enabled: true }));
});
test('creating a draft remains permitted without VeriFactu', async () => {
  await assertSucceeds(setDoc(doc(client(), 'companies/a/invoices/draft'), { status: 'draft', invoiceNumber: 'Borrador', items: [] }));
  await assertFails(updateDoc(doc(client(), 'companies/a/invoices/draft'), { status: 'pending', invoiceNumber: '1' }));
});

test('an administrator cannot enable automatic sends or forge cloud leases/results', async () => {
  for (const [path, value] of [
    ['verifactuConfig/automation', { autoCloudTestEnabled: true, environment: 'test' }],
    ['verifactuConfig/delivery_test', { attemptToken: 'forged', nextAllowedAt: null }],
    ['verifactuConfig/delivery_production', { attemptToken: 'forged' }],
    ['aeatSubmissions/fake', { status: 'accepted', deliveryOwner: 'cloud_worker', attemptToken: 'forged' }],
  ]) await assertFails(setDoc(doc(client(), `companies/a/${path}`), value));
});
