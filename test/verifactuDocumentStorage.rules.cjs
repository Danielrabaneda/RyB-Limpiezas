const fs = require('node:fs');
const { test, before, after } = require('node:test');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes, list, updateMetadata, deleteObject } = require('firebase/storage');
const { doc, setDoc } = require('firebase/firestore');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-verifactu-docs',
    firestore: { rules: 'rules_version = "2"; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }' },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const id of ['a', 'b']) await setDoc(doc(ctx.firestore(), 'companies', id), { status: 'active', subscriptionStatus: 'active' });
    await setDoc(doc(ctx.firestore(), 'companies', 'suspended'), { status: 'inactive' });
    await setDoc(doc(ctx.firestore(), 'companies', 'legacy'), { status: 'active', subscriptionStatus: 'legacy' });
    await setDoc(doc(ctx.firestore(), 'companies', 'expired'), { status: 'active', subscriptionStatus: 'trialing', trialEndsAt: new Date('2000-01-01') });
  });
});
after(async () => { if (env) await env.cleanup(); });
const context = (tenant, role = 'admin', active = true) => env.authenticatedContext(`${tenant}-${role}`, { companyId: tenant, role, active }).storage();
const metadata = { contentType: 'application/pdf', customMetadata: { purpose: 'test_evidence', title: 'Informe', sha256: 'a'.repeat(64), signatureKind: 'handwritten' } };
const bytes = new TextEncoder().encode('%PDF-1.4\noriginal');
test('private and immutable across tenant, role, authentication and status', async () => {
  const path = 'companies/a/verifactuDocuments/report.pdf';
  const owner = ref(context('a'), path);
  await assertSucceeds(uploadBytes(owner, bytes, metadata));
  await assertSucceeds(getBytes(owner));
  await assertSucceeds(list(ref(context('a'), 'companies/a/verifactuDocuments')));
  for (const client of [context('b'), context('a', 'operario'), context('a', 'admin', false), env.unauthenticatedContext().storage()]) {
    await assertFails(getBytes(ref(client, path)));
    await assertFails(list(ref(client, 'companies/a/verifactuDocuments')));
    await assertFails(uploadBytes(ref(client, 'companies/a/verifactuDocuments/forbidden.pdf'), bytes, metadata));
  }
  await assertFails(uploadBytes(owner, bytes, metadata));
  await assertFails(updateMetadata(owner, { customMetadata: { title: 'changed' } }));
  await assertFails(deleteObject(owner));
  await assertFails(uploadBytes(ref(context('suspended'), 'companies/suspended/verifactuDocuments/report.pdf'), bytes, metadata));
  await assertFails(uploadBytes(ref(context('expired'), 'companies/expired/verifactuDocuments/report.pdf'), bytes, metadata));
});
test('legacy subscriptions still require the correct active tenant administrator', async () => {
  const path = 'companies/legacy/verifactuDocuments/report.pdf';
  await assertSucceeds(uploadBytes(ref(context('legacy'), path), bytes, metadata));
  await assertSucceeds(getBytes(ref(context('legacy'), path)));
  for (const client of [context('a'), context('legacy', 'operario'), context('legacy', 'admin', false)]) {
    await assertFails(getBytes(ref(client, path)));
    await assertFails(list(ref(client, 'companies/legacy/verifactuDocuments')));
  }
});
test('rejects invalid type, size, purpose and metadata', async () => {
  const target = (name) => ref(context('a'), `companies/a/verifactuDocuments/${name}.pdf`);
  await assertFails(uploadBytes(target('type'), bytes, { ...metadata, contentType: 'application/x-pkcs12' }));
  await assertFails(uploadBytes(target('empty'), new Uint8Array(), metadata));
  await assertFails(uploadBytes(target('large'), new Uint8Array(10 * 1024 * 1024 + 1), metadata));
  await assertFails(uploadBytes(target('purpose'), bytes, { ...metadata, customMetadata: { ...metadata.customMetadata, purpose: 'production_declaration' } }));
  await assertFails(uploadBytes(target('metadata'), bytes, { contentType: 'application/pdf' }));
});
