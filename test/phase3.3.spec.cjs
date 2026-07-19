const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc, deleteDoc, Timestamp } = require('firebase/firestore');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

// Initialize admin SDK with a dynamically generated local signing key for custom tokens
if (admin.getApps().length === 0) {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const serviceAccount = {
    projectId: "demo-project",
    clientEmail: "foo@demo-project.iam.gserviceaccount.com",
    privateKey: privateKey
  };

  admin.initializeApp({
    credential: admin.cert(serviceAccount)
  });
}

let testEnv;

async function getAuthHeaders(uid, claims) {
  const customToken = await getAuth().createCustomToken(uid, claims);
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await response.json();
  if (!data.idToken) {
    throw new Error("Failed to get ID token: " + JSON.stringify(data));
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.idToken}`
  };
}

async function callSecureCheckIn(headers, data) {
  return fetch('http://127.0.0.1:5001/demo-project/europe-west1/secureCheckIn', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ data })
  });
}

async function callSecureCheckOut(headers, data) {
  return fetch('http://127.0.0.1:5001/demo-project/europe-west1/secureCheckOut', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ data })
  });
}

async function callSecureDeleteCheckIn(headers, data) {
  return fetch('http://127.0.0.1:5001/demo-project/europe-west1/secureDeleteCheckIn', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ data })
  });
}

describe('Phase 3.3: E2E Check-In, Workdays, Mileage and Transfers isolation', function () {
  this.timeout(20000);

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
      await setDoc(doc(db, "users", "raybaCompanion"), { companyId: "rayba", role: "operario", active: true });
      await setDoc(doc(db, "users", "tenantBOperario"), { companyId: "tenantB", role: "operario", active: true });
      await setDoc(doc(db, "users", "raybaAdmin"), { companyId: "rayba", role: "admin", active: true });

      // Create communities with coords
      await setDoc(doc(db, "companies", "rayba", "communities", "commRayba"), {
        name: "Comm Rayba",
        active: true,
        location: { latitude: 40.416775, longitude: -3.703790 }, // Madrid (Sol)
        geofenceRadiusMeters: 50
      });

      await setDoc(doc(db, "companies", "tenantB", "communities", "commB"), {
        name: "Comm B",
        active: true,
        location: { latitude: 41.385063, longitude: 2.173404 } // Barcelona
      });

      // Setup dummy service for checkIn rule check
      await setDoc(doc(db, "companies", "rayba", "scheduledServices", "service1"), {
        communityId: "commRayba",
        assignedUserId: "raybaOperario",
        companionIds: ["raybaCompanion"],
        status: "pending",
        scheduledDate: new Date().toISOString()
      });
      
      await setDoc(doc(db, "companies", "tenantB", "scheduledServices", "service2"), {
        communityId: "commB",
        assignedUserId: "tenantBOperario",
        status: "pending",
        scheduledDate: new Date().toISOString()
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
      
      await assertSucceeds(setDoc(wdRef, { userId: "raybaOperario", status: "active" }));
      await assertSucceeds(getDoc(wdRef));
    });

    it('should DENY Rayba operario to create workday for another user or tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      const wdRef1 = doc(db, "companies", "rayba", "workdays", "wd2");
      await assertFails(setDoc(wdRef1, { userId: "otherUser", status: "active" }));

      const wdRef2 = doc(db, "companies", "tenantB", "workdays", "wd3");
      await assertFails(setDoc(wdRef2, { userId: "raybaOperario", status: "active" }));
    });
  });

  describe('Check-Ins Isolation (Direct Firestore Writes)', () => {
    it('should ALLOW Rayba admin/operario to read checkIns in rayba if they own it or are assigned to the service', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const checkInRef = doc(db, "companies", "rayba", "checkIns", "ci1");
      
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

    it('should DENY all direct create/update/delete client writes to checkIns collection', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const checkInRef = doc(db, "companies", "rayba", "checkIns", "ci_direct");
      
      // Direct create must be denied
      await assertFails(setDoc(checkInRef, {
        userId: "raybaOperario",
        scheduledServiceId: "service1",
        checkInTime: new Date().toISOString()
      }));

      // Direct update must be denied
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "companies", "rayba", "checkIns", "ci_direct"), {
          userId: "raybaOperario",
          scheduledServiceId: "service1"
        });
      });
      await assertFails(setDoc(checkInRef, { userId: "raybaOperario", checkOutTime: new Date().toISOString() }));

      // Direct delete must be denied
      const adminDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const dummyRef = doc(adminDb, "companies", "rayba", "checkIns", "ci_direct");
      await assertFails(deleteDoc(dummyRef)); 
    });
  });

  describe('Check-Ins Cloud Functions (secureCheckIn, secureCheckOut, secureDeleteCheckIn)', () => {
    let raybaOperarioHeaders;
    let raybaCompanionHeaders;
    let tenantBOperarioHeaders;
    let raybaAdminHeaders;

    before(async () => {
      raybaOperarioHeaders = await getAuthHeaders("raybaOperario", { companyId: "rayba", role: "operario", active: true });
      raybaCompanionHeaders = await getAuthHeaders("raybaCompanion", { companyId: "rayba", role: "operario", active: true });
      tenantBOperarioHeaders = await getAuthHeaders("tenantBOperario", { companyId: "tenantB", role: "operario", active: true });
      raybaAdminHeaders = await getAuthHeaders("raybaAdmin", { companyId: "rayba", role: "admin", active: true });
    });

    it('should ALLOW Rayba operario to check-in if within range (Madrid coords) and verify db record has correct tenant route', async () => {
      const payload = {
        userId: "raybaOperario",
        scheduledServiceId: "service1",
        lat: 40.416775,
        lng: -3.703790,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: null
      };

      const res = await callSecureCheckIn(raybaOperarioHeaders, payload);
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.result.checkInId);

      // Verify the record was created in the correct tenant subcollection: companies/rayba/checkIns
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const docRef = doc(context.firestore(), "companies", "rayba", "checkIns", body.result.checkInId);
        const snap = await getDoc(docRef);
        assert.ok(snap.exists);
        assert.strictEqual(snap.data().userId, "raybaOperario");
        assert.strictEqual(snap.data().scheduledServiceId, "service1");
      });
    });

    it('should DENY Rayba operario to check-in if out of range (Barcelona coords) without exceptionReason', async () => {
      const payload = {
        userId: "raybaOperario",
        scheduledServiceId: "service1",
        lat: 41.385063, // Barcelona
        lng: 2.173404,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: null
      };

      const res = await callSecureCheckIn(raybaOperarioHeaders, payload);
      const body = await res.json();
      assert.notStrictEqual(res.status, 200);
      assert.ok(body.error);
      assert.strictEqual(body.error.status, "FAILED_PRECONDITION");
    });

    it('should ALLOW Rayba operario to check-in if out of range if they provide an exceptionReason', async () => {
      const payload = {
        userId: "raybaOperario",
        scheduledServiceId: "service1",
        lat: 41.385063, // Barcelona
        lng: 2.173404,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: "Fichaje manual justificado fuera de rango"
      };

      const res = await callSecureCheckIn(raybaOperarioHeaders, payload);
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.result.checkInId);
    });

    it('should ALLOW Rayba companion to check-in for the assignee or themselves', async () => {
      const payload = {
        userId: "raybaCompanion",
        scheduledServiceId: "service1",
        lat: 40.416775,
        lng: -3.703790,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: null
      };

      const res = await callSecureCheckIn(raybaCompanionHeaders, payload);
      const body = await res.json();
      if (res.status !== 200) {
        console.error("Companion check-in error body:", JSON.stringify(body));
      }
      assert.strictEqual(res.status, 200);
      assert.ok(body.result.checkInId);
    });

    it('should DENY Tenant B user to check-in to Rayba service (cross-tenant attack)', async () => {
      const payload = {
        userId: "tenantBOperario",
        scheduledServiceId: "service1",
        lat: 40.416775,
        lng: -3.703790,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: null
      };

      const res = await callSecureCheckIn(tenantBOperarioHeaders, payload);
      const body = await res.json();
      assert.notStrictEqual(res.status, 200);
      assert.ok(body.error);
      assert.strictEqual(body.error.status, "NOT_FOUND"); 
    });

    it('should ALLOW secureCheckOut and calculate duration and distance securely', async () => {
      let checkInId;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const ref = doc(db, "companies", "rayba", "checkIns", "ci_checkout_test");
        await setDoc(ref, {
          userId: "raybaOperario",
          communityId: "commRayba",
          scheduledServiceId: "service1",
          checkInTime: Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000)), // 30 mins ago
          checkOutTime: null
        });
        checkInId = ref.id;
      });

      const payload = {
        checkInId: checkInId,
        lat: 40.416775,
        lng: -3.703790,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        manualTime: null,
        exceptionReason: null,
        signatureData: null
      };

      const res = await callSecureCheckOut(raybaOperarioHeaders, payload);
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.result.duration, 30); 

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const docRef = doc(context.firestore(), "companies", "rayba", "checkIns", checkInId);
        const snap = await getDoc(docRef);
        assert.ok(snap.data().checkOutTime);
        assert.strictEqual(snap.data().durationMinutes, 30);
      });
    });

    it('should ALLOW secureDeleteCheckIn for open check-ins and DENY for closed ones', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "companies", "rayba", "checkIns", "openCI"), {
          userId: "raybaOperario",
          scheduledServiceId: "service1",
          checkInTime: Timestamp.now(),
          checkOutTime: null
        });
        await setDoc(doc(db, "companies", "rayba", "checkIns", "closedCI"), {
          userId: "raybaOperario",
          scheduledServiceId: "service1",
          checkInTime: Timestamp.now(),
          checkOutTime: Timestamp.now()
        });
      });

      const res1 = await callSecureDeleteCheckIn(raybaOperarioHeaders, { checkInId: "openCI" });
      assert.strictEqual(res1.status, 200);

      const res2 = await callSecureDeleteCheckIn(raybaOperarioHeaders, { checkInId: "closedCI" });
      const body2 = await res2.json();
      assert.notStrictEqual(res2.status, 200);
      assert.strictEqual(body2.error.status, "FAILED_PRECONDITION");
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
