const admin = require("firebase-admin");
const {
  getFirestore,
  GeoPoint,
  Timestamp,
} = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { initializeApp } = require("firebase/app");
const {
  getAuth: getClientAuth,
  signInWithEmailAndPassword,
  connectAuthEmulator,
} = require("firebase/auth");
const {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} = require("firebase/functions");

// 1. Configurar Firebase Admin conectado al Emulador
process.env.GCLOUD_PROJECT = "ryb-limpiezas-app";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

admin.initializeApp();
const dbAdmin = getFirestore();
const authAdmin = getAuth();

// 2. Configurar Firebase Client conectado al Emulador
const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "ryb-limpiezas-app.firebaseapp.com",
  projectId: "ryb-limpiezas-app",
};

const clientApp = initializeApp(firebaseConfig);
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", {
  disableWarnings: true,
});

const clientFunctions = getFunctions(clientApp, "europe-west1");
connectFunctionsEmulator(clientFunctions, "127.0.0.1", 5001);

const secureCheckIn = httpsCallable(clientFunctions, "secureCheckIn");
const secureCheckOut = httpsCallable(clientFunctions, "secureCheckOut");
let failures = 0;
const fail = (...args) => {
  failures += 1;
  console.error(...args);
};

async function runTests() {
  console.log("\n==================================================");
  console.log("INICIANDO PRUEBAS DE EMULADOR PARA FICHAJES SEGUROS");
  console.log("==================================================");

  try {
    // 3. Crear usuarios de prueba si no existen o configurar claims
    console.log("\n[SETUP] Preparando usuarios y claims en emulador...");
    let operarioUser;
    try {
      operarioUser = await authAdmin.getUserByEmail(
        "test-operario-fichaje@test.com",
      );
    } catch (e) {
      operarioUser = await authAdmin.createUser({
        email: "test-operario-fichaje@test.com",
        password: "password123",
        displayName: "Operario Pruebas",
      });
    }

    // Configurar claims de operario (no admin)
    await authAdmin.setCustomUserClaims(operarioUser.uid, { role: "operario" });

    // Crear perfil en Firestore
    await dbAdmin.collection("users").doc(operarioUser.uid).set({
      name: "Operario Pruebas",
      email: "test-operario-fichaje@test.com",
      role: "operario",
      active: true,
    });

    // Iniciar sesión en cliente Firebase
    const cred = await signInWithEmailAndPassword(
      clientAuth,
      "test-operario-fichaje@test.com",
      "password123",
    );
    console.log(
      `[SETUP] Operario autenticado en cliente con UID: ${cred.user.uid}`,
    );

    // Configurar comunidad de prueba
    const communityId = "test-comm-fichajes";
    await dbAdmin
      .collection("communities")
      .doc(communityId)
      .set({
        name: "Comunidad de Pruebas",
        location: new GeoPoint(40.416775, -3.70379), // Madrid Centro
        geofenceRadiusMeters: 60,
      });

    // Configurar fecha hoy en Madrid
    const formatter = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find((p) => p.type === "day").value;
    const month = parts.find((p) => p.type === "month").value;
    const year = parts.find((p) => p.type === "year").value;
    const todayMadridDate = new Date(`${year}-${month}-${day}T12:00:00Z`);

    // --------------------------------------------------------------------
    // TEST 1: force: true enviado por operario y rechazado
    // --------------------------------------------------------------------
    console.log(
      "\n--- TEST 1: force: true enviado por operario y rechazado ---",
    );
    const serviceId1 = "test-service-1";
    await dbAdmin
      .collection("scheduledServices")
      .doc(serviceId1)
      .set({
        assignedUserId: operarioUser.uid,
        communityId: communityId,
        status: "pending",
        scheduledDate: Timestamp.fromDate(todayMadridDate),
      });

    try {
      await secureCheckIn({
        userId: operarioUser.uid,
        scheduledServiceId: serviceId1,
        lat: 40.5, // Lejos del centro
        lng: -3.8,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
        force: true,
      });
      fail("  ❌ ERROR: El check-in con force:true debió ser rechazado.");
    } catch (err) {
      if (err.code === "functions/permission-denied") {
        console.log(
          "  ✅ ÉXITO: Fichaje force:true de operario rechazado con permission-denied.",
        );
      } else {
        fail(
          "  ❌ ERROR: El error debió ser permission-denied, se obtuvo:",
          err.code,
          err.message,
        );
      }
    }

    // --------------------------------------------------------------------
    // TEST 2: communityId manipulado es ignorado y corregido
    // --------------------------------------------------------------------
    console.log(
      "\n--- TEST 2: communityId manipulado es ignorado/corregido ---",
    );
    const serviceId2 = "test-service-2";
    await dbAdmin
      .collection("scheduledServices")
      .doc(serviceId2)
      .set({
        assignedUserId: operarioUser.uid,
        communityId: communityId,
        status: "pending",
        scheduledDate: Timestamp.fromDate(todayMadridDate),
      });

    // Intentamos pasar un communityId falso ("fake-comm")
    const checkInRes = await secureCheckIn({
      userId: operarioUser.uid,
      scheduledServiceId: serviceId2,
      lat: 40.416775, // Justo en la geovalla de la real
      lng: -3.70379,
      accuracy: 10,
      speed: 0,
      timestamp: Date.now(),
      communityId: "fake-comm-manipulada",
    });

    const checkInDoc = await dbAdmin
      .collection("checkIns")
      .doc(checkInRes.data.checkInId)
      .get();
    const checkInData = checkInDoc.data();
    if (checkInData.communityId === communityId) {
      console.log(
        "  ✅ ÉXITO: communityId manipulado fue ignorado. Se usó el real:",
        checkInData.communityId,
      );
    } else {
      fail(
        "  ❌ ERROR: Se guardó el communityId falso:",
        checkInData.communityId,
      );
    }

    // --------------------------------------------------------------------
    // TEST 3: Precisión real y timestamp persistidos
    // --------------------------------------------------------------------
    console.log(
      "\n--- TEST 3: Precisión real y timestamp de hardware persistidos ---",
    );
    const testTimestamp = Date.now() - 5000;
    const serviceId3 = "test-service-3";
    await dbAdmin
      .collection("scheduledServices")
      .doc(serviceId3)
      .set({
        assignedUserId: operarioUser.uid,
        communityId: communityId,
        status: "pending",
        scheduledDate: Timestamp.fromDate(todayMadridDate),
      });

    const checkInRes3 = await secureCheckIn({
      userId: operarioUser.uid,
      scheduledServiceId: serviceId3,
      lat: 40.416775,
      lng: -3.70379,
      accuracy: 12.8,
      speed: 1.5,
      timestamp: testTimestamp,
    });

    const checkInDoc3 = await dbAdmin
      .collection("checkIns")
      .doc(checkInRes3.data.checkInId)
      .get();
    const data3 = checkInDoc3.data();

    if (
      data3.gpsAccuracy === 12.8 &&
      data3.gpsSpeed === 1.5 &&
      data3.originalReadingTimestamp.toMillis() === testTimestamp
    ) {
      console.log(
        "  ✅ ÉXITO: Telemetría GPS guardada con precisión, velocidad y timestamp exactos.",
      );
    } else {
      fail("  ❌ ERROR: Telemetría incorrecta:", {
        accuracy: data3.gpsAccuracy,
        speed: data3.gpsSpeed,
        timestamp: data3.originalReadingTimestamp.toMillis(),
      });
    }

    // --------------------------------------------------------------------
    // TEST 4: Segundo checkout sobre el mismo fichaje rechazado
    // --------------------------------------------------------------------
    console.log(
      "\n--- TEST 4: Segundo checkout sobre el mismo fichaje rechazado ---",
    );
    // Primer checkout
    await secureCheckOut({
      checkInId: checkInRes3.data.checkInId,
      lat: 40.416775,
      lng: -3.70379,
      accuracy: 10,
      speed: 0,
      timestamp: Date.now(),
    });
    console.log("  [LOG] Primer checkout exitoso.");

    // Segundo checkout
    try {
      await secureCheckOut({
        checkInId: checkInRes3.data.checkInId,
        lat: 40.416775,
        lng: -3.70379,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
      });
      fail("  ❌ ERROR: El segundo checkout debió fallar por inmutabilidad.");
    } catch (err) {
      if (err.code === "functions/failed-precondition") {
        console.log(
          "  ✅ ÉXITO: Segundo checkout rechazado con failed-precondition.",
        );
      } else {
        fail(
          "  ❌ ERROR: Tipo de error incorrecto para inmutabilidad:",
          err.code,
          err.message,
        );
      }
    }

    // --------------------------------------------------------------------
    // TEST 5: Dos check-ins simultáneos y un único documento creado (Transacción)
    // --------------------------------------------------------------------
    console.log("\n--- TEST 5: Check-ins simultáneos (Transaction Safety) ---");
    const serviceId5 = "test-service-5";
    await dbAdmin
      .collection("scheduledServices")
      .doc(serviceId5)
      .set({
        assignedUserId: operarioUser.uid,
        communityId: communityId,
        status: "pending",
        scheduledDate: Timestamp.fromDate(todayMadridDate),
      });

    console.log("  Disparando 2 llamadas concurrentes a secureCheckIn...");
    const payload = {
      userId: operarioUser.uid,
      scheduledServiceId: serviceId5,
      lat: 40.416775,
      lng: -3.70379,
      accuracy: 10,
      speed: 0,
      timestamp: Date.now(),
    };

    const results = await Promise.all([
      secureCheckIn(payload),
      secureCheckIn(payload),
    ]);

    const idA = results[0].data.checkInId;
    const idB = results[1].data.checkInId;

    if (idA === idB) {
      console.log(
        "  ✅ ÉXITO: Ambas llamadas retornaron el mismo checkInId:",
        idA,
      );

      const checkInsSnap = await dbAdmin
        .collection("checkIns")
        .where("scheduledServiceId", "==", serviceId5)
        .get();
      if (checkInsSnap.size === 1) {
        console.log(
          "  ✅ ÉXITO: Solo existe exactamente 1 documento de checkIn creado.",
        );
      } else {
        fail(
          "  ❌ ERROR: Se crearon múltiples documentos en la BD:",
          checkInsSnap.size,
        );
      }
    } else {
      fail(
        "  ❌ ERROR: Se generaron IDs diferentes, transacción falló en evitar duplicidad:",
        idA,
        idB,
      );
    }

    // --------------------------------------------------------------------
    // TEST 6: Cambio de día en España cerca de medianoche
    // --------------------------------------------------------------------
    console.log("\n--- TEST 6: Cambio de día en España (Europe/Madrid) ---");
    // Creamos un servicio para ayer y mañana en términos de Madrid
    const yesterdayMadrid = new Date(
      todayMadridDate.getTime() - 24 * 60 * 60 * 1000,
    );
    const serviceIdYesterday = "test-service-yesterday";
    await dbAdmin
      .collection("scheduledServices")
      .doc(serviceIdYesterday)
      .set({
        assignedUserId: operarioUser.uid,
        communityId: communityId,
        status: "pending",
        scheduledDate: Timestamp.fromDate(yesterdayMadrid),
      });

    try {
      await secureCheckIn({
        userId: operarioUser.uid,
        scheduledServiceId: serviceIdYesterday,
        lat: 40.416775,
        lng: -3.70379,
        accuracy: 10,
        speed: 0,
        timestamp: Date.now(),
      });
      fail(
        "  ❌ ERROR: Servicio de ayer sin semana flexible debió ser rechazado.",
      );
    } catch (err) {
      if (err.code === "functions/failed-precondition") {
        console.log(
          "  ✅ ÉXITO: Servicio de ayer rechazado por fecha fuera de rango en Madrid.",
        );
      } else {
        fail("  ❌ ERROR: Error incorrecto en validación de fecha:", err.code);
      }
    }

    if (failures > 0) {
      throw new Error(`${failures} prueba(s) fallaron.`);
    }
    console.log("\n==================================================");
    console.log("¡TODAS LAS PRUEBAS DE EMULADOR HAN PASADO CON ÉXITO!");
    console.log("==================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ ERROR CRÍTICO EJECUTANDO PRUEBAS:", err);
    process.exit(1);
  }
}

runTests();
