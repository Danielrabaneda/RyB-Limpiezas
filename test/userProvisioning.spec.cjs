const assert = require("assert");
const crypto = require("crypto");

process.env.GCLOUD_PROJECT ||= "demo-project";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: "demo-project" });
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

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

async function waitForDocument(ref, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await ref.get();
    if (snap.exists) return snap;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout esperando ${ref.path}`);
}

describe("Tenant user provisioning Cloud Functions", function () {
  this.timeout(60000);
  const db = getFirestore();

  before(async () => {
    await Promise.all([
      db.collection("companies").doc("rayba").set({
        name: "Rayba",
        status: "active",
        subscriptionStatus: "active",
      }),
      db.collection("companies").doc("tenantB").set({
        name: "Tenant B",
        status: "active",
        subscriptionStatus: "active",
      }),
    ]);
  });

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

  it("aprovisiona una empresa, su administrador y el trial desde una solicitud", async () => {
    const headers = await getAuthHeaders("platformAdmin", {
      companyId: "rayba",
      role: "admin",
      active: true,
      platformAdmin: true,
    });
    const suffix = Date.now();
    const requestId = `lead-${suffix}`;
    const companyId = `tenant-${suffix}`;
    const invitationCode = `TENANT${suffix}`;
    await db.collection("companyRequests").doc(requestId).set({
      companyName: `Empresa ${suffix}`,
      contactName: "Propietario Prueba",
      email: `owner-${suffix}@example.test`,
      phone: "600000001",
      plan: "starter",
      status: "pending",
      createdAt: new Date(),
    });
    const { response, body } = await callFunction(
      "provisionCompanyFromRequest",
      headers,
      {
        requestId,
        companyId,
        invitationCode,
        temporaryPassword: "Temporary123!",
        plan: "starter",
      },
    );
    assert.strictEqual(response.status, 200, JSON.stringify(body));
    const company = (await db.collection("companies").doc(companyId).get()).data();
    const owner = (
      await db.collection("users").doc(body.result.adminUid).get()
    ).data();
    assert.strictEqual(company.subscriptionStatus, "trialing");
    assert.strictEqual(company.status, "active");
    assert.strictEqual(owner.role, "admin");
    assert.strictEqual(owner.companyId, companyId);
    assert.strictEqual(
      (await db.collection("accessCodeIndex").doc(invitationCode).get()).data()
        .companyId,
      companyId,
    );
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

  it("impide superar el límite de 5 operarios del plan Autónomo", async () => {
    const companyId = `limited-${Date.now()}`;
    await db.collection("companies").doc(companyId).set({
      name: "Empresa limitada",
      status: "active",
      subscriptionStatus: "active",
      plan: "autonomo",
    });
    const batch = db.batch();
    for (let index = 0; index < 5; index += 1) {
      batch.set(db.collection("users").doc(`${companyId}-op-${index}`), {
        companyId,
        role: "operario",
        active: true,
      });
    }
    await batch.commit();
    const headers = await getAuthHeaders(`${companyId}-admin`, {
      companyId,
      role: "admin",
      active: true,
    });
    const { response } = await callFunction("createOperarioUser", headers, {
      email: `${companyId}@example.test`,
      password: "TestPassword123!",
      name: "Operario 6",
    });
    assert.notStrictEqual(response.status, 200);
  });

  it("impide superar el límite de comunidades del plan Starter", async () => {
    const companyId = `community-limited-${Date.now()}`;
    await db.collection("companies").doc(companyId).set({
      name: "Empresa con comunidades limitadas",
      status: "active",
      subscriptionStatus: "active",
      plan: "starter",
    });
    const batch = db.batch();
    for (let index = 0; index < 100; index += 1) {
      batch.set(
        db.collection(`companies/${companyId}/communities`).doc(`comm-${index}`),
        { name: `Comunidad ${index}` },
      );
    }
    await batch.commit();
    const headers = await getAuthHeaders(`${companyId}-admin`, {
      companyId,
      role: "admin",
      active: true,
    });
    const { response } = await callFunction("createTenantCommunity", headers, {
      name: "Comunidad 101",
      address: "Dirección de prueba",
    });
    assert.notStrictEqual(response.status, 200);
  });

  it("permite abrir la consola global solo desde el tenant Rayba", async () => {
    const raybaHeaders = await getAuthHeaders(`rayba-platform-${Date.now()}`, {
      companyId: "rayba",
      role: "admin",
      active: true,
      platformAdmin: true,
    });
    const allowed = await callFunction("getPlatformDashboard", raybaHeaders, {});
    assert.strictEqual(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.ok(Array.isArray(allowed.body.result.companies));
    assert.strictEqual(allowed.body.result.planCatalog.autonomo.operarios, 5);
    assert.strictEqual(allowed.body.result.planCatalog.starter.communities, 100);
    assert.strictEqual(allowed.body.result.planCatalog.starter.admins, null);

    const otherTenantHeaders = await getAuthHeaders(`other-platform-${Date.now()}`, {
      companyId: "tenantB",
      role: "admin",
      active: true,
      platformAdmin: true,
    });
    const denied = await callFunction("getPlatformDashboard", otherTenantHeaders, {});
    assert.notStrictEqual(denied.response.status, 200);
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
