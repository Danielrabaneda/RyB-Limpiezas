const { strict: assert } = require("node:assert");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");
const fs = require("node:fs");

if (admin.getApps().length === 0) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  admin.initializeApp({
    credential: admin.cert({
      projectId: "demo-project",
      clientEmail: "security-tests@demo-project.iam.gserviceaccount.com",
      privateKey,
    }),
  });
}

describe("Callable security hardening", function () {
  this.timeout(30000);
  let testEnv;
  let staleHeaders;
  let assignedWorkerHeaders;
  let unrelatedWorkerHeaders;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-project",
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, "companies", "rayba"), {
        status: "active",
        subscriptionStatus: "active",
      });
      await setDoc(doc(database, "users", "inactive-worker"), {
        companyId: "rayba",
        role: "operario",
        active: false,
      });
      await setDoc(doc(database, "users", "assigned-worker"), {
        companyId: "rayba",
        role: "operario",
        active: true,
      });
      await setDoc(doc(database, "users", "companion-worker"), {
        companyId: "rayba",
        role: "operario",
        active: true,
      });
      await setDoc(doc(database, "users", "unrelated-worker"), {
        companyId: "rayba",
        role: "operario",
        active: true,
      });
      await setDoc(doc(database, "companies", "rayba", "scheduledServices", "service-a"), {
        assignedUserId: "assigned-worker",
        status: "pending",
        companionIds: [],
        participantIds: [],
        companionLogs: [],
      });
    });

    const customToken = await getAuth().createCustomToken("inactive-worker", {
      companyId: "rayba",
      role: "operario",
      active: true,
    });
    const authResponse = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const authBody = await authResponse.json();
    assert.ok(authBody.idToken, JSON.stringify(authBody));
    staleHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authBody.idToken}`,
    };
    assignedWorkerHeaders = await authHeaders("assigned-worker");
    unrelatedWorkerHeaders = await authHeaders("unrelated-worker");
  });

  after(async () => {
    await testEnv.cleanup();
  });

  async function call(name, data, headers = { "Content-Type": "application/json" }) {
    const response = await fetch(
      `http://127.0.0.1:5001/demo-project/europe-west1/${name}`,
      { method: "POST", headers, body: JSON.stringify({ data }) },
    );
    return { response, body: await response.json() };
  }

  async function authHeaders(uid) {
    const customToken = await getAuth().createCustomToken(uid, {
      companyId: "rayba",
      role: "operario",
      active: true,
    });
    const response = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const body = await response.json();
    assert.ok(body.idToken, JSON.stringify(body));
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.idToken}`,
    };
  }

  for (const [name, data] of [
    ["secureCheckIn", { userId: "inactive-worker", scheduledServiceId: "missing" }],
    ["secureCheckOut", { checkInId: "missing" }],
    ["secureDeleteCheckIn", { checkInId: "missing" }],
  ]) {
    it(`rejects a stale token for ${name} when the profile is inactive`, async () => {
      const result = await call(name, data, staleHeaders);
      assert.notEqual(result.response.status, 200);
      assert.equal(result.body.error.status, "PERMISSION_DENIED");
    });
  }

  it("moves companion changes to an authorized server operation", async () => {
    const denied = await call(
      "addServiceCompanion",
      { serviceId: "service-a", companionId: "companion-worker" },
      unrelatedWorkerHeaders,
    );
    assert.equal(denied.body.error.status, "PERMISSION_DENIED");

    const allowed = await call(
      "addServiceCompanion",
      { serviceId: "service-a", companionId: "companion-worker" },
      assignedWorkerHeaders,
    );
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(doc(
        context.firestore(),
        "companies",
        "rayba",
        "scheduledServices",
        "service-a",
      ));
      assert.deepEqual(snapshot.data().companionIds, ["companion-worker"]);
      assert.deepEqual(snapshot.data().participantIds, ["companion-worker"]);
    });
  });

  it("rate-limits repeated public company requests", async () => {
    for (let index = 0; index < 3; index += 1) {
      const result = await call("submitCompanyRequest", {
        companyName: `Empresa ${index}`,
        contactName: "Contacto",
        email: `contacto${index}@example.com`,
        phone: "600000000",
        plan: "starter",
        website: "",
      });
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.result.accepted, true);
    }

    const blocked = await call("submitCompanyRequest", {
      companyName: "Empresa 4",
      contactName: "Contacto",
      email: "contacto4@example.com",
      phone: "600000000",
      plan: "starter",
      website: "",
    });
    assert.notEqual(blocked.response.status, 200);
    assert.equal(blocked.body.error.status, "RESOURCE_EXHAUSTED");
  });
});
