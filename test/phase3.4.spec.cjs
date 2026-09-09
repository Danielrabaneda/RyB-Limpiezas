const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc } = require('firebase/firestore');
const fs = require('fs');

let testEnv;

describe('Phase 3.4: Inventory + Materials Isolation', function () {
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
      await setDoc(doc(db, "users", "tenantBAdmin"), { companyId: "tenantB", role: "admin", active: true });

      // Seed some products
      await setDoc(doc(db, "companies", "rayba", "products", "prodRayba"), { name: "Lejía Rayba", unit: "litros", currentStock: 10 });
      await setDoc(doc(db, "companies", "tenantB", "products", "prodB"), { name: "Lejía B", unit: "litros", currentStock: 20 });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  describe('Products Catalog Isolation', () => {
    it('should ALLOW Rayba employee to read products from Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "products", "prodRayba");
      await assertSucceeds(getDoc(ref));
    });

    it('should DENY Rayba employee to read products from Tenant B', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "tenantB", "products", "prodB");
      await assertFails(getDoc(ref));
    });

    it('should ALLOW Rayba admin to write/update products in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "products", "prodRaybaNew");
      await assertSucceeds(setDoc(ref, { name: "Detergente", currentStock: 5 }));
    });

    it('should DENY Rayba admin to write/update products in Tenant B', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const ref = doc(db, "companies", "tenantB", "products", "prodBNew");
      await assertFails(setDoc(ref, { name: "Detergente Hacked", currentStock: 5 }));
    });

    it('should DENY Rayba operario to write products in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "products", "prodRaybaNew2");
      await assertFails(setDoc(ref, { name: "Detergente Operario", currentStock: 5 }));
    });
  });

  describe('Material Requests Isolation', () => {
    it('should ALLOW Rayba operario to create a request in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "materialRequests", "req1");
      await assertSucceeds(setDoc(ref, {
        userId: "raybaOperario",
        productId: "prodRayba",
        quantity: 2,
        status: "pending"
      }));
    });

    it('should DENY Rayba operario to create a request in Tenant B', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "tenantB", "materialRequests", "req2");
      await assertFails(setDoc(ref, {
        userId: "raybaOperario",
        productId: "prodB",
        quantity: 2,
        status: "pending"
      }));
    });

    it('should ALLOW Rayba admin to read materialRequests in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const q = query(collection(db, "companies", "rayba", "materialRequests"));
      await assertSucceeds(getDocs(q));
    });

    it('should DENY Rayba admin to read materialRequests in Tenant B', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const q = query(collection(db, "companies", "tenantB", "materialRequests"));
      await assertFails(getDocs(q));
    });
  });

  describe('Stock Movements Isolation', () => {
    it('should ALLOW Rayba admin to read/write stockMovements in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "stockMovements", "mov1");
      await assertSucceeds(setDoc(ref, {
        productId: "prodRayba",
        type: "in",
        quantity: 5,
        adminId: "raybaAdmin"
      }));
    });

    it('should DENY Rayba admin to read/write stockMovements in Tenant B', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const ref = doc(db, "companies", "tenantB", "stockMovements", "mov2");
      await assertFails(setDoc(ref, {
        productId: "prodB",
        type: "in",
        quantity: 5,
        adminId: "raybaAdmin"
      }));
    });

    it('should DENY Rayba operario to write stockMovements in Rayba tenant', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      const ref = doc(db, "companies", "rayba", "stockMovements", "mov3");
      await assertFails(setDoc(ref, {
        productId: "prodRayba",
        type: "in",
        quantity: 5
      }));
    });
  });

  describe('Transaction Safety / Product ID Integrity', () => {
    it('should enforce that Rayba cannot write/touch Tenant B products even if matching IDs', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      // Trying to write a stockMovement under rayba but targeting tenantB product path (it's fine, it will just write the field as a string, but the actual B product remains untouched by rayba)
      const ref = doc(db, "companies", "rayba", "stockMovements", "mov4");
      await assertSucceeds(setDoc(ref, {
        productId: "prodB",
        type: "in",
        quantity: 5
      }));

      // Verify that Rayba admin CANNOT update prodB directly
      const bProdRef = doc(db, "companies", "tenantB", "products", "prodB");
      await assertFails(setDoc(bProdRef, { currentStock: 100 }));
    });
  });
});
