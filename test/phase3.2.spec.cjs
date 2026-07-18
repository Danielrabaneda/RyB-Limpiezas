const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc } = require('firebase/firestore');
const fs = require('fs');

let testEnv;

before(async () => {
  // Configurar testEnv
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

  // Setup basic data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Create users
    await setDoc(doc(db, "users", "raybaUser"), { companyId: "rayba", role: "operario", active: true });
    await setDoc(doc(db, "users", "tenantBUser"), { companyId: "tenantB", role: "operario", active: true });

    // Create companies
    await setDoc(doc(db, "companies", "rayba", "settings", "billing"), { dummy: true });
    await setDoc(doc(db, "companies", "tenantB", "settings", "billing"), { dummy: true });

    // Create a community in rayba
    await setDoc(doc(db, "companies", "rayba", "communities", "commRayba"), { name: "Comm Rayba", active: true });
    
    // Create a community in tenantB
    await setDoc(doc(db, "companies", "tenantB", "communities", "commB"), { name: "Comm B", active: true });
  });
});

after(async () => {
  await testEnv.cleanup();
});

describe('Phase 3.2: Communities Vertical Isolation', () => {
  describe('Global users queries', () => {
    it('should ALLOW Rayba user to query users where companyId == rayba', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      const q = query(collection(db, "users"), where("companyId", "==", "rayba"));
      await assertSucceeds(getDocs(q));
    });

    it('should DENY Rayba user to query users without companyId filter', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      const q = query(collection(db, "users")); // No filter
      await assertFails(getDocs(q));
    });

    it('should DENY Rayba user to query users where companyId == tenantB', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      const q = query(collection(db, "users"), where("companyId", "==", "tenantB"));
      await assertFails(getDocs(q));
    });
  });

  describe('Communities isolation', () => {
    it('should ALLOW Rayba user to read rayba communities', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertSucceeds(getDoc(doc(db, "companies", "rayba", "communities", "commRayba")));
    });

    it('should DENY Rayba user to read tenantB communities', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertFails(getDoc(doc(db, "companies", "tenantB", "communities", "commB")));
    });

    it('should DENY Rayba user to write to tenantB communities', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      await assertFails(addDoc(collection(db, "companies", "tenantB", "communities"), { name: "Hacked" }));
    });
  });

  describe('Community Tasks and Scheduled Services isolation', () => {
    it('should ALLOW Rayba user to create task and service in rayba', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      
      const taskRef = doc(db, "companies", "rayba", "communityTasks", "task1");
      await assertSucceeds(setDoc(taskRef, { communityId: "commRayba", name: "Task 1", active: true }));

      const serviceRef = doc(db, "companies", "rayba", "scheduledServices", "service1");
      await assertSucceeds(setDoc(serviceRef, { communityId: "commRayba", communityTaskId: "task1" }));
    });

    it('should DENY Rayba user to create task in tenantB', async () => {
      const db = testEnv.authenticatedContext("raybaUser", { companyId: "rayba", role: "admin", active: true }).firestore();
      const taskRef = doc(db, "companies", "tenantB", "communityTasks", "task1");
      await assertFails(setDoc(taskRef, { communityId: "commB", name: "Task 1", active: true }));
    });
  });
});
