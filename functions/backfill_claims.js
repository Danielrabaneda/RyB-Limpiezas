const admin = require("firebase-admin");

// Si se detectan variables de emulación en el entorno, inicializamos descriptivamente
if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.FIRESTORE_EMULATOR_HOST
) {
  console.log("Iniciando en modo EMULADOR local:");
  console.log("- Auth Emulator:", process.env.FIREBASE_AUTH_EMULATOR_HOST);
  console.log("- Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}

// Configurar project ID por defecto si no está definido en el entorno
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "ryb-limpiezas-app";
}

// Inicializar Firebase Admin SDK heredando credenciales del entorno
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

async function backfillClaims() {
  try {
    console.log("Consultando colección 'users' de Firestore...");
    const snap = await db.collection("users").get();
    console.log(`Se encontraron ${snap.size} documentos de usuario.`);

    let successCount = 0;
    let failedUsers = [];

    for (const doc of snap.docs) {
      const userData = doc.data();
      const uid = doc.id;

      // Determinar los claims correctos basándose en el perfil actual
      const role = userData.role || "operario";
      const active = userData.active !== false;

      try {
        console.log(
          `Actualizando claims de ${userData.email || uid} -> { role: '${role}', active: ${active} }`,
        );
        await auth.setCustomUserClaims(uid, { role, active });
        successCount++;
      } catch (err) {
        console.error(
          `❌ Fallo al asignar claims a ${userData.email || uid}:`,
          err.message,
        );
        failedUsers.push({ uid, email: userData.email, error: err.message });
      }
    }

    console.log(
      `\nSincronización finalizada: ${successCount}/${snap.size} correctos.`,
    );
    if (failedUsers.length > 0) {
      console.log(`⚠️ ${failedUsers.length} usuarios fallaron:`, failedUsers);
    }
    process.exit(0);
  } catch (error) {
    console.error("Fallo crítico durante el proceso de backfill:", error);
    process.exit(1);
  }
}

backfillClaims();
