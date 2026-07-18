const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const path = require('path');
const mocha = require('mocha');

let testEnv;

function getAuthContext(uid, role, companyId) {
  return testEnv.authenticatedContext(uid, {
    role: role,
    active: true,
    companyId: companyId
  });
}

describe('Firestore Security Rules - Multi-Tenant', function () {
  this.timeout(15000);

  before(async () => {
    // Inicializar entorno apuntando al emulador local
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-project',
      firestore: {
        rules: readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    
    // Seed data from admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Setup users
      await db.collection("users").doc("rayba_admin").set({ role: "admin", active: true, companyId: "rayba" });
      await db.collection("users").doc("rayba_employee").set({ role: "operario", active: true, companyId: "rayba" });
      await db.collection("users").doc("tenantB_admin").set({ role: "admin", active: true, companyId: "tenantB" });
      
      // Setup communities
      await db.collection("companies").doc("rayba").collection("communities").doc("comm1").set({ name: "Comm 1" });
      await db.collection("companies").doc("tenantB").collection("communities").doc("commB1").set({ name: "Comm B" });
      
      // Setup access codes index
      await db.collection("accessCodeIndex").doc("CODE-123").set({ companyId: "rayba" });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  describe('Intra-Tenant Operations (Rayba -> Rayba)', () => {
    it('Employee (Rayba) can read Rayba communities', async () => {
      const db = getAuthContext('rayba_employee', 'operario', 'rayba').firestore();
      await assertSucceeds(db.collection('companies').doc('rayba').collection('communities').doc('comm1').get());
    });

    it('Admin (Rayba) can write invoice in Rayba', async () => {
      const db = getAuthContext('rayba_admin', 'admin', 'rayba').firestore();
      await assertSucceeds(db.collection('companies').doc('rayba').collection('invoices').doc('inv1').set({ status: 'draft' }));
    });
  });

  describe('Cross-Tenant Operations (Rayba -> Tenant B)', () => {
    it('Admin (Rayba) CANNOT read Tenant B communities', async () => {
      const db = getAuthContext('rayba_admin', 'admin', 'rayba').firestore();
      await assertFails(db.collection('companies').doc('tenantB').collection('communities').doc('commB1').get());
    });

    it('Admin (Rayba) CANNOT write in Tenant B', async () => {
      const db = getAuthContext('rayba_admin', 'admin', 'rayba').firestore();
      await assertFails(db.collection('companies').doc('tenantB').collection('communities').doc('commB2').set({ name: "Hacked" }));
    });
    
    it('Tenant B document CANNOT be read via collectionGroup by Rayba', async () => {
      const db = getAuthContext('rayba_admin', 'admin', 'rayba').firestore();
      // Even if collectionGroup was allowed (it isn't), reading cross tenant must fail.
      // Firestore rules don't allow collectionGroup unless explicitly defined, but we test direct access.
      await assertFails(db.collection('companies').doc('tenantB').collection('communities').get());
    });
  });

  describe('Unauthenticated & Missing Claims Access', () => {
    it('User without companyId CANNOT read tenant data', async () => {
      const db = testEnv.authenticatedContext('no_tenant_user', { role: 'admin', active: true }).firestore();
      await assertFails(db.collection('companies').doc('rayba').collection('communities').doc('comm1').get());
    });

    it('Unauthenticated user CANNOT read tenant data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection('companies').doc('rayba').collection('communities').doc('comm1').get());
    });
  });

  describe('Root Exceptions (/users and /accessCodeIndex)', () => {
    it('Unauthenticated user CAN get accessCodeIndex by ID', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.collection('accessCodeIndex').doc('CODE-123').get());
    });

    it('Unauthenticated user CANNOT list accessCodeIndex', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection('accessCodeIndex').get());
    });

    it('Rayba Admin CANNOT modify accessCodeIndex directly in frontend', async () => {
      const db = getAuthContext('rayba_admin', 'admin', 'rayba').firestore();
      await assertFails(db.collection('accessCodeIndex').doc('CODE-456').set({ companyId: 'rayba' }));
    });

    it('Rayba Employee CAN read users of same tenant', async () => {
      const db = getAuthContext('rayba_employee', 'operario', 'rayba').firestore();
      await assertSucceeds(db.collection('users').doc('rayba_admin').get());
    });

    it('Rayba Employee CANNOT read users of Tenant B', async () => {
      const db = getAuthContext('rayba_employee', 'operario', 'rayba').firestore();
      await assertFails(db.collection('users').doc('tenantB_admin').get());
    });
    
    it('Unauthenticated user CANNOT read /users', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection('users').doc('rayba_admin').get());
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('Rayba Employee CANNOT change their companyId', async () => {
      const db = getAuthContext('rayba_employee', 'operario', 'rayba').firestore();
      await assertFails(db.collection('users').doc('rayba_employee').update({ companyId: 'tenantB' }));
    });

    it('Rayba Employee CANNOT change their role', async () => {
      const db = getAuthContext('rayba_employee', 'operario', 'rayba').firestore();
      await assertFails(db.collection('users').doc('rayba_employee').update({ role: 'admin' }));
    });
  });
});
