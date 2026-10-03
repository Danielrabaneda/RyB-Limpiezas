const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.GCLOUD_PROJECT = "demo-project";
}
initializeApp({ projectId: "demo-project" });
const db = getFirestore();
const auth = getAuth();

async function seed() {
  console.log("Seeding data...");
  await db.collection("settings").doc("billing").set({
    nextInvoiceSeq: 100,
    lastInvoiceHash: "abc123hash456",
    invoiceNumberFormat: "INV-2026-{{seq}}",
    issueDateMode: "auto",
    nif: "B12345678"
  });
  await db.collection("settings").doc("global").set({
    companyName: "Rayba Limpiezas",
    invitationCode: "TEST-CODE-123",
  });

  await db.collection("accessCodes").doc("TEST-CODE-123").set({
    role: "operario",
    active: true,
    createdBy: "admin1"
  });

  try { await auth.createUser({ uid: "user1", email: "john@example.com" }); } catch (e) {}
  await db.collection("users").doc("user1").set({
    name: "John Doe",
    email: "john@example.com",
    role: "operario",
    active: true
  });

  try { await auth.createUser({ uid: "user2", email: "jane@example.com" }); } catch (e) {}
  await db.collection("users").doc("user2").set({
    name: "Jane Smith",
    email: "jane@example.com",
    role: "admin",
    active: true
  });

  await db.collection("communities").doc("comm1").set({
    name: "Community A",
    address: "Street 1"
  });

  console.log("Seeding 550 notifications to test batching...");
  const batch1 = db.batch();
  for (let i = 1; i <= 500; i++) {
    batch1.set(db.collection("systemNotifications").doc(`notif${i}`), { msg: `Test ${i}` });
  }
  await batch1.commit();

  const batch2 = db.batch();
  for (let i = 501; i <= 550; i++) {
    batch2.set(db.collection("systemNotifications").doc(`notif${i}`), { msg: `Test ${i}` });
  }
  await batch2.commit();

  await db.collection("transfers").doc("trans1").set({
    amount: 50,
    status: "completed"
  });

  console.log("Data seeded!");
}

seed().catch(console.error);
