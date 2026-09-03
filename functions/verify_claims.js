const admin = require("firebase-admin");

// Configurar obligatoriamente el proyecto del emulador
process.env.GCLOUD_PROJECT = "ryb-limpiezas-app";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

admin.initializeApp();

const auth = admin.auth();

async function verify() {
  console.log("\n=== VERIFICANDO CUSTOM CLAIMS EN EL EMULADOR ===");
  try {
    const adminUser = await auth.getUserByEmail("test-admin@test.com");
    console.log(`- Admin (${adminUser.email}):`, adminUser.customClaims);

    const operarioUser = await auth.getUserByEmail("test-operario@test.com");
    console.log(
      `- Operario (${operarioUser.email}):`,
      operarioUser.customClaims,
    );
  } catch (err) {
    console.error("Error al verificar claims:", err.message);
  }
}

verify();
