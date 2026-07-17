const admin = require('firebase-admin');

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
      displayName: "Test Admin"
    });

    console.log("Creando usuario operario en Auth...");
    const operarioUser = await auth.createUser({
      email: "test-operario@test.com",
      password: "password123",
      displayName: "Test Operario"
    });

    // 2. Crear perfiles en Firestore del emulador
    console.log("Creando perfiles en Firestore...");
    await db.collection("users").doc(adminUser.uid).set({
      name: "Test Admin",
      email: "test-admin@test.com",
      role: "admin",
      active: true
    });

    await db.collection("users").doc(operarioUser.uid).set({
      name: "Test Operario",
      email: "test-operario@test.com",
      role: "operario",
      active: true
    });

    console.log("\nUsuarios de prueba creados con éxito:");
    console.log(`- Admin UID: ${adminUser.uid}`);
    console.log(`- Operario UID: ${operarioUser.uid}`);
    console.log("\nNota: Inicialmente estos usuarios se crean SIN Custom Claims en Firebase Auth.");
    process.exit(0);
  } catch (err) {
    console.error("Error al configurar usuarios de prueba:", err);
    process.exit(1);
  }
}

setup();
