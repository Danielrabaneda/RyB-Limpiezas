const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

let testEnv;

describe('Phase 3.7: Storage Multi-Tenant Hardening', function () {
  this.timeout(10000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-project",
      storage: {
        host: "127.0.0.1",
        port: 9199,
        rules: fs.readFileSync("storage.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    try {
      await testEnv.clearStorage();
    } catch (e) {
      // Ignored
    }
  });

  after(async () => {
    await testEnv.cleanup();
  });

  describe('Invoice PDFs isolation', () => {
    it('should ALLOW Rayba admin to read/write invoices in Rayba tenant', async () => {
      const storage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      const fileRef = storage.ref("companies/rayba/invoices/inv1/factura.pdf");
      
      // Write
      await assertSucceeds(fileRef.put(Buffer.from("dummy pdf data"), { contentType: "application/pdf" }));
      // Read
      await assertSucceeds(fileRef.getDownloadURL());
    });

    it('should DENY Rayba admin to read/write invoices in Tenant B', async () => {
      const storage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      const fileRef = storage.ref("companies/tenantB/invoices/inv1/factura.pdf");
      
      // Write should fail
      await assertFails(fileRef.put(Buffer.from("dummy pdf data"), { contentType: "application/pdf" }));
      // Read should fail
      await assertFails(fileRef.getDownloadURL());
    });

    it('should DENY Rayba operario to read/write invoices in Rayba tenant', async () => {
      const storage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const fileRef = storage.ref("companies/rayba/invoices/inv1/factura.pdf");
      
      // Write should fail
      await assertFails(fileRef.put(Buffer.from("dummy pdf data"), { contentType: "application/pdf" }));
      // Read should fail
      await assertFails(fileRef.getDownloadURL());
    });
  });

  describe('Evidence / Guides / Proofs isolation', () => {
    it('should ALLOW Rayba operario to upload their own evidence in Rayba', async () => {
      const storage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const fileRef = storage.ref("companies/rayba/evidence/raybaOperario/service1/photo.jpg");
      
      await assertSucceeds(fileRef.put(Buffer.from("dummy image"), { contentType: "image/jpeg" }));
      await assertSucceeds(fileRef.getDownloadURL());
    });

    it('should DENY Rayba operario to upload evidence for another user in Rayba', async () => {
      const storage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const fileRef = storage.ref("companies/rayba/evidence/anotherUser/service1/photo.jpg");
      
      await assertFails(fileRef.put(Buffer.from("dummy image"), { contentType: "image/jpeg" }));
    });

    it('should DENY Rayba operario to upload evidence in Tenant B', async () => {
      const storage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const fileRef = storage.ref("companies/tenantB/evidence/raybaOperario/service1/photo.jpg");
      
      await assertFails(fileRef.put(Buffer.from("dummy image"), { contentType: "image/jpeg" }));
    });

    it('should ALLOW Rayba admin to read Rayba operario evidence, but DENY Tenant B admin', async () => {
      // First seed a file with security disabled or as the operario
      const userStorage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const fileRef = userStorage.ref("companies/rayba/evidence/raybaOperario/service1/photo.jpg");
      await fileRef.put(Buffer.from("dummy image"), { contentType: "image/jpeg" });

      // Rayba Admin read
      const adminStorage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      const adminFileRef = adminStorage.ref("companies/rayba/evidence/raybaOperario/service1/photo.jpg");
      await assertSucceeds(adminFileRef.getDownloadURL());

      // Tenant B Admin read should fail
      const bAdminStorage = testEnv.authenticatedContext("tenantBAdmin", { companyId: "tenantB", role: "admin", active: true }).storage();
      const bAdminFileRef = bAdminStorage.ref("companies/rayba/evidence/raybaOperario/service1/photo.jpg");
      await assertFails(bAdminFileRef.getDownloadURL());
    });

    it('should ALLOW any Rayba employee to read community guides in Rayba', async () => {
      // Seed a guide file as Rayba Admin
      const adminStorage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      const fileRef = adminStorage.ref("companies/rayba/evidence/raybaAdmin/guides_comm1/manual.pdf");
      await fileRef.put(Buffer.from("dummy guide"), { contentType: "application/pdf" });

      // Rayba Operario should be able to read it
      const operarioStorage = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).storage();
      const operarioFileRef = operarioStorage.ref("companies/rayba/evidence/raybaAdmin/guides_comm1/manual.pdf");
      await assertSucceeds(operarioFileRef.getDownloadURL());

      // Tenant B Operario should NOT be able to read it
      const bOperarioStorage = testEnv.authenticatedContext("tenantBOperario", { companyId: "tenantB", role: "operario", active: true }).storage();
      const bOperarioFileRef = bOperarioStorage.ref("companies/rayba/evidence/raybaAdmin/guides_comm1/manual.pdf");
      await assertFails(bOperarioFileRef.getDownloadURL());
    });
  });

  describe('Logos isolation', () => {
    it('should ALLOW public read of logos', async () => {
      // Seed logo as Rayba Admin
      const adminStorage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      const fileRef = adminStorage.ref("companies/rayba/logos/logo.png");
      await fileRef.put(Buffer.from("logo data"), { contentType: "image/png" });

      // Unauthenticated read
      const unauthStorage = testEnv.unauthenticatedContext().storage();
      const unauthFileRef = unauthStorage.ref("companies/rayba/logos/logo.png");
      await assertSucceeds(unauthFileRef.getDownloadURL());
    });

    it('should ALLOW Rayba admin to upload logos in Rayba, but DENY Tenant B logo uploads from Rayba Admin', async () => {
      const storage = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).storage();
      
      // Rayba logo write
      const ref1 = storage.ref("companies/rayba/logos/logo2.png");
      await assertSucceeds(ref1.put(Buffer.from("logo data"), { contentType: "image/png" }));

      // Tenant B logo write from Rayba Admin should fail
      const ref2 = storage.ref("companies/tenantB/logos/logo2.png");
      await assertFails(ref2.put(Buffer.from("logo data"), { contentType: "image/png" }));
    });
  });
});
