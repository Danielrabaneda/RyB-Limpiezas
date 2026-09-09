const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc } = require("firebase/firestore");
const { ref, uploadBytes } = require("firebase/storage");
const fs = require("node:fs");

describe("Storage security hardening", function () {
  this.timeout(15000);
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-project",
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
      storage: {
        host: "127.0.0.1",
        port: 9199,
        rules: fs.readFileSync("storage.rules", "utf8"),
      },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "companies", "rayba"), {
        status: "active",
        subscriptionStatus: "legacy",
      });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("blocks writes to the unscoped legacy logos folder", async () => {
    const storage = testEnv.authenticatedContext("admin-a", {
      companyId: "rayba",
      role: "admin",
      active: true,
    }).storage();
    await assertFails(uploadBytes(ref(storage, "logos/legacy.png"), new Uint8Array([1, 2, 3])));
  });

  it("keeps tenant-scoped logo uploads working for tenant admins", async () => {
    const storage = testEnv.authenticatedContext("admin-a", {
      companyId: "rayba",
      role: "admin",
      active: true,
    }).storage();
    await assertSucceeds(uploadBytes(
      ref(storage, "companies/rayba/logos/current.png"),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png" },
    ));
  });

  it("allows Rayba admins to upload quote PDFs with a legacy subscription", async () => {
    const storage = testEnv.authenticatedContext("admin-a", {
      companyId: "rayba",
      role: "admin",
      active: true,
    }).storage();
    await assertSucceeds(uploadBytes(
      ref(storage, "companies/rayba/quotes/quote-1/PRE-2026-0004.pdf"),
      new Uint8Array([1, 2, 3]),
      { contentType: "application/pdf" },
    ));
  });

  it("keeps quote uploads blocked for operarios and non-PDF files", async () => {
    const adminStorage = testEnv.authenticatedContext("admin-a", {
      companyId: "rayba",
      role: "admin",
      active: true,
    }).storage();
    const workerStorage = testEnv.authenticatedContext("worker-a", {
      companyId: "rayba",
      role: "operario",
      active: true,
    }).storage();
    await assertFails(uploadBytes(
      ref(workerStorage, "companies/rayba/quotes/quote-1/worker.pdf"),
      new Uint8Array([1, 2, 3]),
      { contentType: "application/pdf" },
    ));
    await assertFails(uploadBytes(
      ref(adminStorage, "companies/rayba/quotes/quote-1/not-a-pdf.txt"),
      new Uint8Array([1, 2, 3]),
      { contentType: "text/plain" },
    ));
  });
});
