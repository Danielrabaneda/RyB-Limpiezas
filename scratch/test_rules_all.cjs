const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "ryb-limpiezas-app.firebaseapp.com",
  projectId: "ryb-limpiezas-app",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Conectar explícitamente a los emuladores locales desde el cliente Firebase
const { connectAuthEmulator } = require('firebase/auth');
const { connectFirestoreEmulator } = require('firebase/firestore');
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

async function runTests() {
  console.log("\n=== INICIANDO PRUEBAS DE COBERTURA DE REGLAS DE SEGURIDAD ===");

  try {
    // 1. Obtener UID de Operario dinámicamente iniciando sesión temporalmente
    console.log("\n[SETUP] Autenticando temporalmente como Operario para obtener su UID...");
    const tempOperarioCred = await signInWithEmailAndPassword(auth, "test-operario@test.com", "password123");
    const operarioUid = tempOperarioCred.user.uid;
    console.log(`[SETUP] UID del Operario obtenido: ${operarioUid}`);

    // Iniciar sesión como Admin de prueba para preparar datos
    console.log("\n[SETUP] Autenticando como Admin para configurar datos de prueba...");
    const adminCred = await signInWithEmailAndPassword(auth, "test-admin@test.com", "password123");
    const adminUid = adminCred.user.uid;
    console.log(`[SETUP] Admin autenticado con UID: ${adminUid}`);

    // Crear un servicio programado de prueba con el Admin asignado y el Operario como acompañante
    const serviceId = "test-service-123";
    console.log(`[SETUP] Configurando scheduledServices/${serviceId} con titular: Admin y acompañante: Operario...`);
    await setDoc(doc(db, "scheduledServices", serviceId), {
      assignedUserId: adminUid,
      companionIds: [operarioUid],
      status: "pending"
    });
    console.log("[SETUP] Servicio configurado correctamente.");

    // ---------------------------------------------------------
    // PRUEBAS DE INVOICES (FACTURAS) - RESTRICCIÓN ADMIN
    // ---------------------------------------------------------
    console.log("\n=== PRUEBAS DE FACTURACIÓN (invoices) ===");
    
    // Admin crea factura borrador (Permitido)
    console.log("Admin intentando crear factura borrador...");
    try {
      await setDoc(doc(db, "invoices", "inv-draft"), {
        status: "draft",
        amount: 100,
        createdAt: new Date().toISOString()
      });
      console.log("  ✅ ÉXITO: Admin pudo crear factura borrador.");
    } catch (err) {
      console.error("  ❌ ERROR: Admin no pudo crear factura borrador:", err.message);
    }

    // Admin edita factura borrador (Permitido)
    console.log("Admin intentando editar factura borrador...");
    try {
      await updateDoc(doc(db, "invoices", "inv-draft"), { amount: 150 });
      console.log("  ✅ ÉXITO: Admin pudo editar factura borrador.");
    } catch (err) {
      console.error("  ❌ ERROR: Admin no pudo editar factura borrador:", err.message);
    }

    // Admin crea factura emitida (Permitido)
    console.log("Admin intentando crear factura emitida...");
    try {
      await setDoc(doc(db, "invoices", "inv-sent"), {
        status: "sent",
        amount: 200,
        createdAt: new Date().toISOString()
      });
      console.log("  ✅ ÉXITO: Admin pudo crear factura emitida.");
    } catch (err) {
      console.error("  ❌ ERROR: Admin no pudo crear factura emitida:", err.message);
    }

    // Admin edita factura emitida (Denegado excepto status/updatedAt)
    console.log("Admin intentando editar campo bloqueado de factura emitida...");
    try {
      await updateDoc(doc(db, "invoices", "inv-sent"), { amount: 250 });
      console.log("  ❌ ERROR: ¡Admin pudo editar campo bloqueado de factura emitida!");
    } catch (err) {
      console.log("  ✅ ÉXITO: Admin no pudo editar campo bloqueado de factura emitida:", err.message);
    }

    // Admin cambia status de factura emitida (Permitido)
    console.log("Admin intentando cambiar status de factura emitida...");
    try {
      await updateDoc(doc(db, "invoices", "inv-sent"), { status: "paid" });
      console.log("  ✅ ÉXITO: Admin pudo cambiar status de factura emitida.");
    } catch (err) {
      console.error("  ❌ ERROR: Admin no pudo cambiar status de factura emitida:", err.message);
    }

    // 2. Iniciar sesión como Operario para probar accesos
    console.log("\n[SETUP] Cambiando de usuario: Autenticando como Operario...");
    const operarioCred = await signInWithEmailAndPassword(auth, "test-operario@test.com", "password123");
    console.log(`[SETUP] Operario autenticado con UID: ${operarioCred.user.uid}`);

    // Operario lee invoices (Denegado)
    console.log("Operario intentando leer facturas...");
    try {
      await getDoc(doc(db, "invoices", "inv-sent"));
      console.log("  ❌ ERROR: ¡Operario pudo leer facturas!");
    } catch (err) {
      console.log("  ✅ ÉXITO: Operario no pudo leer facturas:", err.message);
    }

    // ---------------------------------------------------------
    // PRUEBAS DE MATERIAL REQUESTS (PEDIDOS DE MATERIAL)
    // ---------------------------------------------------------
    console.log("\n=== PRUEBAS DE PEDIDOS DE MATERIAL (materialRequests) ===");

    // Operario crea pedido propio (Permitido)
    const reqId = `req-${operarioUid}`;
    console.log(`Operario creando pedido propio (userId = ${operarioUid})...`);
    try {
      await setDoc(doc(db, "materialRequests", reqId), {
        userId: operarioUid,
        items: ["Fregona"],
        createdAt: new Date().toISOString()
      });
      console.log("  ✅ ÉXITO: Operario pudo crear pedido propio.");
    } catch (err) {
      console.error("  ❌ ERROR: Operario no pudo crear pedido propio:", err.message);
    }

    // Operario crea pedido para otro usuario (Denegado)
    console.log("Operario intentando crear pedido para el Admin...");
    try {
      await setDoc(doc(db, "materialRequests", `req-${adminUid}`), {
        userId: adminUid,
        items: ["Fregona"],
        createdAt: new Date().toISOString()
      });
      console.log("  ❌ ERROR: ¡Operario pudo crear pedido para el Admin!");
    } catch (err) {
      console.log("  ✅ ÉXITO: Operario no pudo crear pedido ajeno:", err.message);
    }

    // ---------------------------------------------------------
    // PRUEBAS DE FICHAGES (checkIns)
    // ---------------------------------------------------------
    console.log("\n=== PRUEBAS DE FICHAGES (checkIns) ===");

    // Operario (LeB59VIIbrQSXnQA6q70L7d8RlC7) crea checkIn para SÍ MISMO en serviceId (Permitido por isOwner)
    console.log("Acompañante intentando fichar para SÍ MISMO...");
    try {
      await setDoc(doc(db, "checkIns", `check-${operarioUid}`), {
        userId: operarioUid,
        scheduledServiceId: serviceId,
        checkInTime: new Date().toISOString()
      });
      console.log("  ✅ ÉXITO: Acompañante pudo crear su propio fichaje.");
    } catch (err) {
      console.error("  ❌ ERROR: Acompañante no pudo crear su propio fichaje:", err.message);
    }

    // Operario (LeB59VIIbrQSXnQA6q70L7d8RlC7) crea checkIn para el TITULAR (Admin) en serviceId
    // (Permitido por estar el Operario logueado en companionIds del servicio)
    console.log("Acompañante intentando fichar para el TITULAR (Admin)...");
    try {
      await setDoc(doc(db, "checkIns", `check-${adminUid}`), {
        userId: adminUid,
        scheduledServiceId: serviceId,
        checkInTime: new Date().toISOString()
      });
      console.log("  ✅ ÉXITO: Acompañante pudo fichar para el titular.");
    } catch (err) {
      console.error("  ❌ ERROR: Acompañante no pudo fichar para el titular:", err.message);
    }

    // Operario intentando crear fichaje para un tercero ajeno en el servicio
    console.log("Acompañante intentando fichar para un usuario ajeno al servicio...");
    try {
      await setDoc(doc(db, "checkIns", `check-ajeno`), {
        userId: "uid-usuario-ajeno",
        scheduledServiceId: serviceId,
        checkInTime: new Date().toISOString()
      });
      console.log("  ❌ ERROR: ¡Operario pudo fichar para un usuario ajeno!");
    } catch (err) {
      console.log("  ✅ ÉXITO: Operario no pudo fichar para un usuario ajeno:", err.message);
    }

    console.log("\n=== PRUEBAS DE COBERTURA COMPLETADAS ===");
    process.exit(0);
  } catch (error) {
    console.error("Fallo general durante la ejecución de las pruebas:", error);
    process.exit(1);
  }
}

runTests();
