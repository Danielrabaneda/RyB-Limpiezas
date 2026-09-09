const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc } = require('firebase/firestore');
const fs = require('fs');

let testEnv;

describe('Phase 3.6: Remaining Verticals Isolation', function () {
  this.timeout(15000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-project",
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Setup basic tenant data
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Create user records
      await setDoc(doc(db, "users", "rayba_admin"), { companyId: "rayba", role: "admin", active: true });
      await setDoc(doc(db, "users", "rayba_operario"), { companyId: "rayba", role: "operario", active: true });
      await setDoc(doc(db, "users", "tenantB_admin"), { companyId: "tenantB", role: "admin", active: true });
      await setDoc(doc(db, "users", "tenantB_operario"), { companyId: "tenantB", role: "operario", active: true });

      // Seed dummy records in rayba
      await setDoc(doc(db, "companies", "rayba", "absences", "absRayba"), { userId: "rayba_operario", status: "pending" });
      await setDoc(doc(db, "companies", "rayba", "documentVault", "docRayba"), { name: "Rayba Guide", category: "manuals" });
      await setDoc(doc(db, "companies", "rayba", "geoDetections", "detRayba"), { userId: "rayba_operario", type: "entry" });
      await setDoc(doc(db, "companies", "rayba", "fcmTokens", "tokenRayba"), { userId: "rayba_operario", token: "rayba-token-xyz" });
      await setDoc(doc(db, "companies", "rayba", "systemNotifications", "notifRayba"), { userId: "rayba_operario", read: false });
      await setDoc(doc(db, "companies", "rayba", "taskTemplates", "tmplRayba"), { name: "Clean Stairs" });

      // Seed dummy records in tenantB
      await setDoc(doc(db, "companies", "tenantB", "absences", "absB"), { userId: "tenantB_operario", status: "pending" });
      await setDoc(doc(db, "companies", "tenantB", "documentVault", "docB"), { name: "B Guide", category: "manuals" });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  describe('Absences Isolation', () => {
    it('should ALLOW Rayba operario to request (create) their own absence in Rayba', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "absences", "newAbs");
      await assertSucceeds(setDoc(ref, { userId: "rayba_operario", status: "pending" }));
    });

    it('should DENY Rayba operario to request absence with another user ID or in another tenant', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      // 1. Mismatched userId
      const ref1 = doc(db, "companies", "rayba", "absences", "newAbs1");
      await assertFails(setDoc(ref1, { userId: "hacker_id", status: "pending" }));

      // 2. Mismatched tenant
      const ref2 = doc(db, "companies", "tenantB", "absences", "newAbs2");
      await assertFails(setDoc(ref2, { userId: "rayba_operario", status: "pending" }));
    });

    it('should ALLOW Rayba employee to read Rayba absences but DENY reading Tenant B absences', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      await assertSucceeds(getDoc(doc(db, "companies", "rayba", "absences", "absRayba")));
      await assertFails(getDoc(doc(db, "companies", "tenantB", "absences", "absB")));
    });

    it('should ALLOW Rayba admin to approve (update) absences in Rayba but DENY in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_admin", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertSucceeds(setDoc(doc(db, "companies", "rayba", "absences", "absRayba"), { status: "approved" }, { merge: true }));
      await assertFails(setDoc(doc(db, "companies", "tenantB", "absences", "absB"), { status: "approved" }, { merge: true }));
    });
  });

  describe('Document Vault Isolation', () => {
    it('should ALLOW Rayba admin to upload (write) documents in Rayba but DENY in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_admin", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertSucceeds(setDoc(doc(db, "companies", "rayba", "documentVault", "newDoc"), { name: "Manual", category: "manuals" }));
      await assertFails(setDoc(doc(db, "companies", "tenantB", "documentVault", "newDoc"), { name: "Manual", category: "manuals" }));
    });

    it('should ALLOW Rayba employee to read documents in Rayba but DENY in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      await assertSucceeds(getDoc(doc(db, "companies", "rayba", "documentVault", "docRayba")));
      await assertFails(getDoc(doc(db, "companies", "tenantB", "documentVault", "docB")));
    });

    it('should DENY Rayba operario to upload documents in Rayba', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      await assertFails(setDoc(doc(db, "companies", "rayba", "documentVault", "newDoc"), { name: "Manual", category: "manuals" }));
    });
  });

  describe('GeoDetections Isolation', () => {
    it('should ALLOW Rayba employee to create detection for themselves in Rayba', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "geoDetections", "newDet");
      await assertSucceeds(setDoc(ref, { userId: "rayba_operario", type: "entry" }));
    });

    it('should DENY Rayba employee to create detection in Tenant B or for another user', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref1 = doc(db, "companies", "tenantB", "geoDetections", "newDet");
      await assertFails(setDoc(ref1, { userId: "rayba_operario", type: "entry" }));

      const ref2 = doc(db, "companies", "rayba", "geoDetections", "newDet2");
      await assertFails(setDoc(ref2, { userId: "another_user", type: "entry" }));
    });
  });

  describe('FCM Tokens Isolation', () => {
    it('should ALLOW Rayba employee to save their FCM token in Rayba', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "fcmTokens", "newTok");
      await assertSucceeds(setDoc(ref, { userId: "rayba_operario", token: "token123" }));
    });

    it('should DENY Rayba employee to save FCM token in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "tenantB", "fcmTokens", "newTok");
      await assertFails(setDoc(ref, { userId: "rayba_operario", token: "token123" }));
    });
  });

  describe('Task Templates Isolation', () => {
    it('should ALLOW Rayba admin to write templates in Rayba but DENY in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_admin", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertSucceeds(setDoc(doc(db, "companies", "rayba", "taskTemplates", "tmplNew"), { name: "Clean Glass" }));
      await assertFails(setDoc(doc(db, "companies", "tenantB", "taskTemplates", "tmplNew"), { name: "Clean Glass" }));
    });

    it('should ALLOW Rayba employee to read templates in Rayba but DENY in Tenant B', async () => {
      const db = testEnv.authenticatedContext("rayba_operario", { companyId: "rayba", role: "operario", active: true }).firestore();
      await assertSucceeds(getDoc(doc(db, "companies", "rayba", "taskTemplates", "tmplRayba")));
      // Since Rayba user has no access to Tenant B
      await assertFails(getDoc(doc(db, "companies", "tenantB", "taskTemplates", "tmplB")));
    });
  });
});
