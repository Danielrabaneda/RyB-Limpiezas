const assert = require("assert");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

if (admin.getApps().length === 0) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 1024,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  admin.initializeApp({
    credential: admin.cert({
      projectId: "demo-project",
      clientEmail: "tests@demo-project.iam.gserviceaccount.com",
      privateKey,
    }),
    projectId: "demo-project",
  });
}

async function getAuthHeaders(uid, claims) {
  const token = await getAuth().createCustomToken(uid, claims);
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  );
  const data = await response.json();
  assert.ok(data.idToken, JSON.stringify(data));
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.idToken}`,
  };
}

async function callFunction(name, headers, data) {
  const response = await fetch(
    `http://127.0.0.1:5001/demo-project/europe-west1/${name}`,
    { method: "POST", headers, body: JSON.stringify({ data }) },
  );
  return { response, body: await response.json() };
}

async function waitForDocument(ref, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await ref.get();
    if (snap.exists) return snap;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout esperando ${ref.path}`);
}

describe("Tenant user provisioning Cloud Functions", function () {
  this.timeout(20000);
  const db = getFirestore();

  it("crea un operario en Auth y /users usando el companyId del admin", async () => {
    const headers = await getAuthHeaders("provisioningAdmin", {
      companyId: "rayba",
      role: "admin",
      active: true,
    });
    const email = `operario-${Date.now()}@example.test`;
    const { response, body } = await callFunction("createOperarioUser", headers, {
      email,
      password: "TestPassword123!",
      name: "Operario Provisionado",
      phone: "600000000",
    });
    assert.strictEqual(response.status, 200, JSON.stringify(body));
    const uid = body.result.uid;
    const profile = (await db.collection("users").doc(uid).get()).data();
    const authUser = await getAuth().getUser(uid);
    assert.strictEqual(profile.companyId, "rayba");
    assert.strictEqual(profile.role, "operario");
    assert.strictEqual(authUser.customClaims.companyId, "rayba");
  });

  it("rechaza la creación de operarios por otro operario", async () => {
    const headers = await getAuthHeaders("nonAdminProvisioner", {
      companyId: "rayba",
      role: "operario",
      active: true,
    });
    const { response } = await callFunction("createOperarioUser", headers, {
      email: `forbidden-${Date.now()}@example.test`,
      password: "TestPassword123!",
      name: "No permitido",
    });
    assert.notStrictEqual(response.status, 200);
  });

  it("sincroniza accessCodeIndex y completa el autorregistro en Rayba", async () => {
    const code = `RAYBA-${Date.now()}`;
    await db.collection("companies/rayba/accessCodes").doc(code).set({ active: true });
    await waitForDocument(db.collection("accessCodeIndex").doc(code));

    const uid = `self-register-${Date.now()}`;
    const headers = await getAuthHeaders(uid, {});
    const { response, body } = await callFunction("completeTenantRegistration", headers, {
      name: "Registro Rayba",
      accessCode: code,
    });
    assert.strictEqual(response.status, 200, JSON.stringify(body));
    const profile = (await db.collection("users").doc(uid).get()).data();
    const authUser = await getAuth().getUser(uid);
    assert.strictEqual(profile.companyId, "rayba");
    assert.strictEqual(authUser.customClaims.companyId, "rayba");
  });

  it("impide usar otro código para cambiar de tenant un perfil existente", async () => {
    const code = `TENANT-B-${Date.now()}`;
    await db.collection("companies/tenantB/accessCodes").doc(code).set({ active: true });
    await waitForDocument(db.collection("accessCodeIndex").doc(code));

    const uid = `existing-rayba-${Date.now()}`;
    const headers = await getAuthHeaders(uid, {});
    await db.collection("users").doc(uid).set({
      uid,
      name: "Usuario existente",
      role: "operario",
      active: true,
      companyId: "rayba",
    });
    const { response } = await callFunction("completeTenantRegistration", headers, {
      name: "Intento de salto",
      accessCode: code,
    });
    assert.notStrictEqual(response.status, 200);
    const profile = (await db.collection("users").doc(uid).get()).data();
    assert.strictEqual(profile.companyId, "rayba");
  });
});
