const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
const fs = require("fs");

let testEnv;

describe("Phase 3.5 smoke: borrador -> backend -> registro fiscal", function () {
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
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "companies", "rayba"), {
        status: "active",
        subscriptionStatus: "active",
      });
      await setDoc(doc(db, "users", "admin"), {
        companyId: "rayba",
        role: "admin",
        active: true,
      });
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  it("completa el flujo manteniendo la emisión y el registro fuera del cliente", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin", {
        companyId: "rayba",
        role: "admin",
        active: true,
      })
      .firestore();
    const invoiceRef = doc(
      adminDb,
      "companies",
      "rayba",
      "invoices",
      "invoice1",
    );

    await assertSucceeds(
      setDoc(invoiceRef, {
        status: "draft",
        invoiceNumber: "Borrador",
        totalAmount: 121,
      }),
    );
    await assertFails(
      updateDoc(invoiceRef, { status: "pending", invoiceNumber: "1" }),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const backendDb = context.firestore();
      await updateDoc(
        doc(
          backendDb,
          "companies",
          "rayba",
          "invoices",
          "invoice1",
        ),
        {
          status: "pending",
          paymentStatus: "pending",
          invoiceNumber: "1",
          emissionMode: "verifactu_test",
          fiscalRecordId: "alta_invoice1",
          hash: "HASH",
        },
      );
      await setDoc(
        doc(
          backendDb,
          "companies",
          "rayba",
          "fiscalRecords",
          "alta_invoice1",
        ),
        {
          recordType: "alta",
          invoiceId: "invoice1",
          hash: "HASH",
          aeatStatus: "not_connected",
        },
      );
    });

    const emittedSnap = await getDoc(invoiceRef);
    const fiscalSnap = await getDoc(
      doc(
        adminDb,
        "companies",
        "rayba",
        "fiscalRecords",
        "alta_invoice1",
      ),
    );
    if (!emittedSnap.exists() || !fiscalSnap.exists()) {
      throw new Error("El flujo no creó los documentos esperados");
    }
    await assertFails(updateDoc(invoiceRef, { totalAmount: 1 }));
  });
});
