const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc, runTransaction, serverTimestamp } = require('firebase/firestore');
const fs = require('fs');
const assert = require('assert');

let testEnv;

describe('Phase 3.4: Programmatic Smoke Test - E2E Material Flow', function () {
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

    // Seed basic users with rules disabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "raybaOperario"), { companyId: "rayba", role: "operario", active: true });
      await setDoc(doc(db, "users", "tenantBOperario"), { companyId: "tenantB", role: "operario", active: true });
      await setDoc(doc(db, "users", "raybaAdmin"), { companyId: "rayba", role: "admin", active: true });
      await setDoc(doc(db, "users", "tenantBAdmin"), { companyId: "tenantB", role: "admin", active: true });

      // Seed Tenant B product to test cross-tenant validation
      await setDoc(doc(db, "companies", "tenantB", "products", "prodB"), { name: "Lejía Tenant B", unit: "litros", currentStock: 20 });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('should complete the entire admin -> operario -> admin approval flow cleanly under security rules', async () => {
    // 1. ADMIN RAYBA: Crear producto
    const adminDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
    const productRef = doc(adminDb, "companies", "rayba", "products", "prod1");
    
    await assertSucceeds(setDoc(productRef, {
      name: "Lejía Rayba",
      unit: "litros",
      category: "limpieza",
      currentStock: 0,
      minStock: 5,
      createdAt: serverTimestamp()
    }));

    // 2. ADMIN RAYBA: Añadir stock (transacción)
    await assertSucceeds(runTransaction(adminDb, async (transaction) => {
      const snap = await transaction.get(productRef);
      const current = snap.data().currentStock || 0;
      const added = 10;
      
      transaction.update(productRef, { currentStock: current + added });
      
      const movementRef = doc(collection(adminDb, "companies", "rayba", "stockMovements"));
      transaction.set(movementRef, {
        productId: "prod1",
        productName: "Lejía Rayba",
        type: "in",
        quantity: added,
        previousStock: current,
        newStock: current + added,
        date: serverTimestamp(),
        userId: "raybaAdmin"
      });
    }));

    // Verificar que el stock sea 10
    const prodSnapAfterIn = await getDoc(productRef);
    assert.strictEqual(prodSnapAfterIn.data().currentStock, 10);

    // 3. OPERARIO RAYBA: Crear solicitud
    const operarioDb = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
    
    // Validar pertenencia del producto antes de solicitar (operario hace get en producto)
    await assertSucceeds(getDoc(doc(operarioDb, "companies", "rayba", "products", "prod1")));
    
    const requestRef = doc(operarioDb, "companies", "rayba", "materialRequests", "req1");
    await assertSucceeds(setDoc(requestRef, {
      userId: "raybaOperario",
      productId: "prod1",
      productName: "Lejía Rayba",
      quantity: 2,
      unit: "litros",
      status: "pending",
      createdAt: serverTimestamp()
    }));

    // 4. ADMIN RAYBA: Aprobar solicitud (transacción para descontar stock)
    const requestRefAdmin = doc(adminDb, "companies", "rayba", "materialRequests", "req1");
    await assertSucceeds(runTransaction(adminDb, async (transaction) => {
      const requestSnap = await transaction.get(requestRefAdmin);
      const requestData = requestSnap.data();
      
      const pRef = doc(adminDb, "companies", "rayba", "products", requestData.productId);
      const pSnap = await transaction.get(pRef);
      
      const current = pSnap.data().currentStock || 0;
      const toDeduct = requestData.quantity;
      const newStock = current - toDeduct;
      
      transaction.update(pRef, { currentStock: newStock });
      
      const movementRef = doc(collection(adminDb, "companies", "rayba", "stockMovements"));
      transaction.set(movementRef, {
        productId: requestData.productId,
        productName: requestData.productName,
        type: "out",
        quantity: toDeduct,
        previousStock: current,
        newStock: newStock,
        date: serverTimestamp(),
        userId: requestData.userId,
        adminId: "raybaAdmin",
        referenceId: "req1"
      });
      
      transaction.update(requestRefAdmin, {
        status: "completed",
        updatedAt: serverTimestamp()
      });
    }));

    // 5. VERIFICACIONES DE INTEGRIDAD
    // A. El stock del producto se redujo exactamente a 8
    const finalProdSnap = await getDoc(productRef);
    assert.strictEqual(finalProdSnap.data().currentStock, 8);

    // B. La solicitud cambió a completada
    const finalReqSnap = await getDoc(requestRef);
    assert.strictEqual(finalReqSnap.data().status, "completed");

    // C. Los movimientos de stock contienen el registro de entrada (in) y salida (out)
    const movementsSnap = await getDocs(query(collection(adminDb, "companies", "rayba", "stockMovements")));
    assert.strictEqual(movementsSnap.size, 2);
    
    const movements = movementsSnap.docs.map(d => d.data());
    assert.ok(movements.some(m => m.type === "in" && m.quantity === 10));
    assert.ok(movements.some(m => m.type === "out" && m.quantity === 2));
  });

  it('should DENY cross-tenant operations where Rayba operario requests Tenant B product', async () => {
    const operarioDb = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
    
    // Operario Rayba intenta leer producto de Tenant B (Debería fallar por reglas)
    const bProdRef = doc(operarioDb, "companies", "tenantB", "products", "prodB");
    await assertFails(getDoc(bProdRef));

    // Operario Rayba intenta crear solicitud en subcolección de Tenant B
    const bReqRef = doc(operarioDb, "companies", "tenantB", "materialRequests", "reqB");
    await assertFails(setDoc(bReqRef, {
      userId: "raybaOperario",
      productId: "prodB",
      quantity: 2,
      status: "pending"
    }));
  });
});
