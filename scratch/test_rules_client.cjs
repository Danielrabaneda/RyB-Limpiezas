const { initializeApp } = require("firebase/app");
const {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  connectAuthEmulator,
} = require("firebase/auth");
const {
  getFirestore,
  collection,
  getDocs,
  connectFirestoreEmulator,
} = require("firebase/firestore");

// Configuración de Firebase para el emulador (valores ficticios válidos)
const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "ryb-limpiezas-app.firebaseapp.com",
  projectId: "ryb-limpiezas-app",
  storageBucket: "ryb-limpiezas-app.appspot.com",
  messagingSenderId: "12345",
  appId: "1:12345:web:fake",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Conectar a los emuladores
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

async function runTests() {
  console.log(
    "=== INICIANDO PRUEBAS DE REGLAS DE SEGURIDAD EN EL EMULADOR ===",
  );

  try {
    // Caso 1: Probar acceso con el Admin de pruebas (que YA tiene claims asignados por el backfill)
    console.log("\nIniciando sesión como test-admin@test.com...");
    const adminCred = await signInWithEmailAndPassword(
      auth,
      "test-admin@test.com",
      "password123",
    );
    console.log(`Usuario autenticado con UID: ${adminCred.user.uid}`);

    // Comprobar token ID para asegurar que tiene claims
    const tokenResult = await adminCred.user.getIdTokenResult();
    console.log(
      `Claims detectados en el token del Admin: role = '${tokenResult.claims.role}', active = ${tokenResult.claims.active}`,
    );

    console.log("Intentando leer de /gpsSuggestions (migrada a claims)...");
    try {
      const snap = await getDocs(collection(db, "gpsSuggestions"));
      console.log(
        `✅ ÉXITO: Lectura permitida. Documentos encontrados: ${snap.size}`,
      );
    } catch (err) {
      console.error(
        `❌ ERROR: Lectura denegada en /gpsSuggestions:`,
        err.message,
      );
    }

    // Caso 2: Crear un usuario nuevo (signup) que NO tiene claims en Firestore en este momento
    const tempEmail = `temp-${Date.now()}@test.com`;
    console.log(`\nRegistrando usuario nuevo sin claims: ${tempEmail}...`);
    const tempCred = await createUserWithEmailAndPassword(
      auth,
      tempEmail,
      "password123",
    );
    console.log(`Usuario temporal creado con UID: ${tempCred.user.uid}`);

    console.log(
      "Intentando leer de /gpsSuggestions con el usuario temporal (debería denegarse)...",
    );
    try {
      await getDocs(collection(db, "gpsSuggestions"));
      console.log(
        `❌ ERROR: ¡Lectura permitida! Esto no debería ocurrir, el usuario no tiene claims asignados.`,
      );
    } catch (err) {
      console.log(
        `✅ ÉXITO: Lectura denegada correctamente. Mensaje: ${err.code} - ${err.message}`,
      );
    }

    // Caso 3: Probar acceso a una colección no migrada (que usa get() en Firestore)
    // p.ej., /settings
    console.log(
      "\nIntentando leer de /settings (no migrada a claims, usa get() en Firestore)...",
    );
    try {
      await getDocs(collection(db, "settings"));
      console.log(
        `❌ ERROR: Lectura permitida. (Debería denegarse para este usuario temporal porque no está en la colección de usuarios de Firestore)`,
      );
    } catch (err) {
      console.log(
        `✅ ÉXITO: Lectura denegada correctamente por get() en Firestore. Mensaje: ${err.code} - ${err.message}`,
      );
    }

    console.log("\n=== PRUEBAS CONCLUIDAS CON ÉXITO ===");
    process.exit(0);
  } catch (error) {
    console.error("Fallo general durante la ejecución de las pruebas:", error);
    process.exit(1);
  }
}

runTests();
