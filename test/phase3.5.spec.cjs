const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");
const fs = require("fs");

let testEnv;

function adminDb(companyId = "rayba", uid = "raybaAdmin") {
  return testEnv
    .authenticatedContext(uid, {
      companyId,
      role: "admin",
      active: true,
    })
    .firestore();
}

describe("Phase 3.5: emisión segura y registros fiscales inmutables", function () {
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
      await setDoc(doc(db, "companies", "tenantB"), {
        status: "active",
        subscriptionStatus: "active",
      });
      await setDoc(doc(db, "users", "raybaAdmin"), {
        companyId: "rayba",
        role: "admin",
        active: true,
      });
      await setDoc(doc(db, "users", "tenantBAdmin"), {
        companyId: "tenantB",
        role: "admin",
        active: true,
      });
      await setDoc(doc(db, "users", "raybaOperario"), {
        companyId: "rayba",
        role: "operario",
        active: true,
      });
      await setDoc(
        doc(db, "companies", "rayba", "settings", "billing"),
        { verifactuEnabled: false, nextInvoiceSeq: 1 },
      );
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  it("permite al administrador crear únicamente borradores sin datos fiscales", async () => {
    const db = adminDb();
    const validDraft = doc(db, "companies", "rayba", "invoices", "draft1");
    await assertSucceeds(
      setDoc(validDraft, {
        status: "draft",
        invoiceNumber: "Borrador",
        totalAmount: 121,
      }),
    );

    const emitted = doc(db, "companies", "rayba", "invoices", "emitted1");
    await assertFails(
      setDoc(emitted, {
        status: "pending",
        invoiceNumber: "1",
        totalAmount: 121,
      }),
    );

    const fakeFiscalDraft = doc(
      db,
      "companies",
      "rayba",
      "invoices",
      "draftWithHash",
    );
    await assertFails(
      setDoc(fakeFiscalDraft, {
        status: "draft",
        invoiceNumber: "Borrador",
        hash: "FAKE",
      }),
    );
  });

  it("impide que el cliente emita directamente un borrador", async () => {
    const db = adminDb();
    const invoiceRef = doc(db, "companies", "rayba", "invoices", "draft1");
    await setDoc(invoiceRef, {
      status: "draft",
      invoiceNumber: "Borrador",
      totalAmount: 121,
    });

    await assertFails(
      updateDoc(invoiceRef, {
        status: "pending",
        invoiceNumber: "1",
        emittedAt: new Date(),
      }),
    );
  });

  it("permite cambiar cobro y metadatos, pero no reabrir ni editar una emitida", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(
        doc(db, "companies", "rayba", "invoices", "emitted1"),
        {
          status: "pending",
          paymentStatus: "pending",
          invoiceNumber: "1",
          totalAmount: 121,
          hash: "HASH",
          fiscalRecordId: "alta_emitted1",
        },
      );
    });

    const db = adminDb();
    const invoiceRef = doc(db, "companies", "rayba", "invoices", "emitted1");
    await assertSucceeds(
      updateDoc(invoiceRef, {
        status: "paid",
        paymentStatus: "paid",
        updatedAt: new Date(),
      }),
    );
    await assertSucceeds(
      updateDoc(invoiceRef, {
        pdfUrl: "https://example.test/invoice.pdf",
        updatedAt: new Date(),
      }),
    );
    await assertFails(updateDoc(invoiceRef, { totalAmount: 1 }));
    await assertFails(updateDoc(invoiceRef, { status: "draft" }));
    await assertFails(deleteDoc(invoiceRef));
  });

  it("reserva la escritura de fiscalRecords al backend", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "companies",
          "rayba",
          "fiscalRecords",
          "alta_1",
        ),
        { recordType: "alta", hash: "HASH" },
      );
    });

    const db = adminDb();
    const recordRef = doc(
      db,
      "companies",
      "rayba",
      "fiscalRecords",
      "alta_1",
    );
    await assertSucceeds(getDoc(recordRef));
    await assertFails(updateDoc(recordRef, { hash: "ALTERED" }));
    await assertFails(deleteDoc(recordRef));
    await assertFails(
      setDoc(
        doc(
          db,
          "companies",
          "rayba",
          "fiscalRecords",
          "alta_fake",
        ),
        { recordType: "alta", hash: "FAKE" },
      ),
    );
  });

  it("reserva la cola aeatSubmissions al backend", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "companies",
          "rayba",
          "aeatSubmissions",
          "alta_1",
        ),
        {
          invoiceId: "invoice_1",
          status: "awaiting_sender",
          environment: "test",
        },
      );
    });

    const db = adminDb();
    const submissionRef = doc(
      db,
      "companies",
      "rayba",
      "aeatSubmissions",
      "alta_1",
    );
    await assertSucceeds(getDoc(submissionRef));
    await assertFails(updateDoc(submissionRef, { status: "accepted" }));
    await assertFails(deleteDoc(submissionRef));
    await assertFails(
      setDoc(
        doc(
          db,
          "companies",
          "rayba",
          "aeatSubmissions",
          "fake",
        ),
        { status: "accepted" },
      ),
    );
  });

  it("mantiene el aislamiento entre empresas", async () => {
    const db = adminDb();
    const foreignDraft = doc(
      db,
      "companies",
      "tenantB",
      "invoices",
      "foreign",
    );
    await assertFails(
      setDoc(foreignDraft, {
        status: "draft",
        invoiceNumber: "Borrador",
      }),
    );
    await assertFails(getDoc(foreignDraft));
  });
});
