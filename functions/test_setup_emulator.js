const admin = require("firebase-admin");

// Configurar obligatoriamente el proyecto del emulador
process.env.GCLOUD_PROJECT = "ryb-limpiezas-app";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp();

const auth = admin.auth();
const db = admin.firestore();

async function setup() {
  console.log("=== CONFIGURANDO USUARIOS DE PRUEBA EN EL EMULADOR ===");

  try {
    // 1. Crear usuarios en Auth del emulador
    console.log("Creando usuario admin en Auth...");
    const adminUser = await auth.createUser({
      email: "test-admin@test.com",
      password: "password123",
      displayName: "Test Admin",
    });

    console.log("Creando usuario operario en Auth...");
    const operarioUser = await auth.createUser({
      email: "test-operario@test.com",
      password: "password123",
      displayName: "Test Operario",
    });

    // 2. Crear perfiles en Firestore del emulador
    console.log("Creando perfiles en Firestore...");
    await db.collection("users").doc(adminUser.uid).set({
      name: "Test Admin",
      email: "test-admin@test.com",
      role: "admin",
      active: true,
    });

    await db.collection("users").doc(operarioUser.uid).set({
      name: "Test Operario",
      email: "test-operario@test.com",
      role: "operario",
      active: true,
    });

    // 3. Crear un usuario huérfano en Firestore (perfil Firestore pero sin Auth correspondiente)
    console.log(
      "Creando perfil de usuario huérfano (sin Auth) en Firestore...",
    );
    const huerfanoUid = "uid-huerfano-inexistente-en-auth";
    await db.collection("users").doc(huerfanoUid).set({
      name: "Usuario Huérfano",
      email: "huerfano@test.com",
      role: "operario",
      active: true,
    });

    // 4. Simular usuarios preexistentes sin claims:
    // La Cloud Function onUserDocumentWritten se habrá disparado al hacer set() en Firestore.
    // Para asegurar que la Cloud Function termine de ejecutarse antes de borrar los claims,
    // esperamos 3 segundos.
    console.log(
      "\nEsperando 3 segundos para que los triggers de Cloud Functions terminen...",
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log(
      "\nSimulando estado preexistente: Borrando claims de las cuentas de Auth...",
    );
    await auth.setCustomUserClaims(adminUser.uid, null);
    await auth.setCustomUserClaims(operarioUser.uid, null);

    // Confirmamos que los claims son null/undefined
    const adminCheck = await auth.getUser(adminUser.uid);
    const operarioCheck = await auth.getUser(operarioUser.uid);
    console.log(
      `- Claims de Admin tras borrar (debe ser undefined):`,
      adminCheck.customClaims,
    );
    console.log(
      `- Claims de Operario tras borrar (debe ser undefined):`,
      operarioCheck.customClaims,
    );

    console.log("\nUsuarios de prueba creados y configurados:");
    console.log(`- Admin UID (Sin Claims): ${adminUser.uid}`);
    console.log(`- Operario UID (Sin Claims): ${operarioUser.uid}`);
    console.log(`- Huérfano UID (Solo en Firestore): ${huerfanoUid}`);
    console.log(
      "\nTodo listo para probar el comportamiento robusto del script de backfill.",
    );
    process.exit(0);
  } catch (err) {
    console.error("Error al configurar usuarios de prueba:", err);
    process.exit(1);
  }
}

setup();
