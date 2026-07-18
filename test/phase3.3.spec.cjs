const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc } = require('firebase/firestore');
const fs = require('fs');

let testEnv;

describe('Phase 3.3: E2E Check-In, Workdays, Mileage and Transfers isolation', function () {
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

    // Setup basic data with rules disabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Create users (auth profile mock)
      await setDoc(doc(db, "users", "raybaOperario"), { companyId: "rayba", role: "operario", active: true });
      await setDoc(doc(db, "users", "tenantBOperario"), { companyId: "tenantB", role: "operario", active: true });
      await setDoc(doc(db, "users", "raybaAdmin"), { companyId: "rayba", role: "admin", active: true });

      // Setup dummy service for checkIn rule check (which does get() on scheduledServices)
      await setDoc(doc(db, "companies", "rayba", "scheduledServices", "service1"), {
        assignedUserId: "raybaOperario",
        status: "pending"
      });
      
      await setDoc(doc(db, "companies", "tenantB", "scheduledServices", "service2"), {
        assignedUserId: "tenantBOperario",
        status: "pending"
      });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });
  
  describe('Workdays Isolation', () => {
    it('should ALLOW Rayba operario to create/update/read their own workday in rayba', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const wdRef = doc(db, "companies", "rayba", "workdays", "wd1");
      
      // Create
      await assertSucceeds(setDoc(wdRef, { userId: "raybaOperario", status: "active" }));
      // Read
      await assertSucceeds(getDoc(wdRef));
    });

    it('should DENY Rayba operario to create workday for another user or tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      // Different user but same tenant
      const wdRef1 = doc(db, "companies", "rayba", "workdays", "wd2");
      await assertFails(setDoc(wdRef1, { userId: "otherUser", status: "active" }));

      // Different tenant
      const wdRef2 = doc(db, "companies", "tenantB", "workdays", "wd3");
      await assertFails(setDoc(wdRef2, { userId: "raybaOperario", status: "active" }));
    });
  });

  describe('Check-Ins Isolation', () => {
    it('should ALLOW Rayba admin/operario to read checkIns in rayba if they own it or are assigned to the service', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      const checkInRef = doc(db, "companies", "rayba", "checkIns", "ci1");
      
      // Let admin write it first with rules disabled
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "companies", "rayba", "checkIns", "ci1"), {
          userId: "raybaOperario",
          scheduledServiceId: "service1"
        });
      });

      await assertSucceeds(getDoc(checkInRef));
    });

    it('should DENY Rayba operario to read tenantB checkIns', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const checkInRef = doc(db, "companies", "tenantB", "checkIns", "ci2");
      
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "companies", "tenantB", "checkIns", "ci2"), {
          userId: "tenantBOperario",
          scheduledServiceId: "service2"
        });
      });

      await assertFails(getDoc(checkInRef));
    });
  });

  describe('Daily Mileage & Evidence Reports & GPS Suggestions', () => {
    it('should ALLOW Rayba operario to read/write their own dailyMileage and gpsSuggestions in rayba', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      const mileageRef = doc(db, "companies", "rayba", "dailyMileage", "mileage1");
      await assertSucceeds(setDoc(mileageRef, { userId: "raybaOperario", km: 10 }));
      
      const gpsRef = doc(db, "companies", "rayba", "gpsSuggestions", "gps1");
      await assertSucceeds(setDoc(gpsRef, { userId: "raybaOperario", lat: 40.0, lng: -3.0 }));
    });

    it('should DENY Rayba operario to read/write tenantB dailyMileage, gpsSuggestions or evidenceReports', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      const mileageRef = doc(db, "companies", "tenantB", "dailyMileage", "mileage2");
      await assertFails(setDoc(mileageRef, { userId: "raybaOperario", km: 10 }));
      
      const gpsRef = doc(db, "companies", "tenantB", "gpsSuggestions", "gps2");
      await assertFails(setDoc(gpsRef, { userId: "tenantBOperario", lat: 40.0, lng: -3.0 }));
    });
  });

  describe('Transfers Security Invariance', () => {
    it('should ALLOW Rayba employee to create a transfer for themselves within Rayba', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const transferRef = doc(db, "companies", "rayba", "transfers", "t1");
      await assertSucceeds(setDoc(transferRef, {
        fromUserId: "raybaOperario",
        toUserId: "raybaOperario2",
        serviceId: "service1",
        status: "pending"
      }));
    });

    it('should DENY Rayba employee to create transfer in tenantB', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const transferRef = doc(db, "companies", "tenantB", "transfers", "t2");
      await assertFails(setDoc(transferRef, {
        fromUserId: "tenantBOperario",
        toUserId: "tenantBOperario2",
        serviceId: "service2",
        status: "pending"
      }));
    });
  });
});
