const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
// Asegúrate de que tienes la variable de entorno GOOGLE_APPLICATION_CREDENTIALS 
// o usa el emulador. Para usar el emulador local:
// export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
// export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"

if (process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.GCLOUD_PROJECT = "demo-project";
}

initializeApp({ projectId: "demo-project" });
const db = getFirestore();

// ============================================================================
// CONSTANTES
// ============================================================================
const ANCHOR_TENANT = "rayba";
const IS_DRY_RUN = !process.argv.includes("--execute");

if (IS_DRY_RUN) {
  console.log("==================================================");
  console.log("🚀 MODO DRY-RUN ACTIVO");
  console.log("No se escribirán cambios en la base de datos.");
  console.log("Usa 'node migrateToMultiTenant.js --execute' para migrar.");
  console.log("==================================================\n");
} else {
  console.log("==================================================");
  console.log("⚠️ EJECUCIÓN REAL ACTIVA");
  console.log("Escribiendo cambios en la base de datos...");
  console.log("==================================================\n");
}

// ============================================================================
// DEFINICIÓN DE COLECCIONES
// ============================================================================
// Ordenadas de menos dependiente a más dependiente
const STANDARD_COLLECTIONS = [
  // Bloque 1
  "administrators",
  "products",
  "invoice_templates",
  "taskTemplates",
  
  // Bloque 2
  "communities",
  "publicPortals",
  "documentVault",
  "gpsSuggestions",
  "communityTasks",
  "assignments",
  
  // Bloque 3
  "scheduledServices",
  "checkIns",
  "taskExecutions",
  "evidenceReports",
  "materialRequests",
  "stockMovements",
  
  // Bloque 4
  "workdays",
  "transfers",
  "dailyMileage",
  "absences",
  "systemNotifications",
  "fcmTokens",
  "geoDetections",
  
  // Facturación base
  "invoices"
];

// ============================================================================
// UTILIDADES
// ============================================================================
async function processBatch(docs, writeCallback) {
  const batchSize = 500;
  let totalProcessed = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();

    for (const doc of chunk) {
      await writeCallback(batch, doc);
    }

    if (!IS_DRY_RUN) {
      await batch.commit();
    }
    totalProcessed += chunk.length;
  }
  return totalProcessed;
}

// ============================================================================
// RUTINAS DE MIGRACIÓN
// ============================================================================

async function migrateStandardCollection(collectionName) {
  console.log(`\n⏳ Migrando colección estándar: [${collectionName}]...`);
  const snap = await db.collection(collectionName).get();
  
  if (snap.empty) {
    console.log(`  - 0 documentos encontrados. Saltando.`);
    return;
  }

  const writtenCount = await processBatch(snap.docs, (batch, doc) => {
    const newRef = db.collection(`companies/${ANCHOR_TENANT}/${collectionName}`).doc(doc.id);
    batch.set(newRef, doc.data());
  });

  console.log(`  ✅ Leídos: ${snap.size} | Escritos: ${writtenCount} en companies/${ANCHOR_TENANT}/${collectionName}`);
  if (snap.size !== writtenCount) {
    console.error(`  ❌ ADVERTENCIA: Diferencia en el recuento de ${collectionName}`);
  }
}

async function migrateAccessCodes() {
  console.log(`\n⏳ Migrando colección especial: [accessCodes]...`);
  // EXCEPCIÓN ESTRUCTURAL DOCUMENTADA:
  // Los accessCodes actúan como punto de entrada global (como los usuarios).
  // Se requiere un documento ligero en la raíz (/accessCodeIndex/{code})
  // para resolver a qué tenant pertenece, y el doc real en el tenant.
  const snap = await db.collection("accessCodes").get();
  
  if (snap.empty) {
    console.log(`  - 0 documentos encontrados. Saltando.`);
    return;
  }

  const writtenCount = await processBatch(snap.docs, (batch, doc) => {
    // 1. Doc real en el tenant
    const newRef = db.collection(`companies/${ANCHOR_TENANT}/accessCodes`).doc(doc.id);
    batch.set(newRef, doc.data());
    
    // 2. Índice global en la raíz
    const indexRef = db.collection("accessCodeIndex").doc(doc.id);
    batch.set(indexRef, { companyId: ANCHOR_TENANT });
  });

  console.log(`  ✅ Leídos: ${snap.size} | Escritos: ${writtenCount} (doble escritura: index + tenant)`);
}

async function migrateUsers() {
  console.log(`\n⏳ Migrando colección especial: [users]...`);
  // EXCEPCIÓN ESTRUCTURAL DOCUMENTADA:
  // Los usuarios se quedan en la raíz para permitir resolución cross-tenant y auth global.
  // Solo inyectamos el companyId para relacionarlos con su tenant.
  const snap = await db.collection("users").get();
  
  if (snap.empty) {
    console.log(`  - 0 documentos encontrados. Saltando.`);
    return;
  }

  const writtenCount = await processBatch(snap.docs, (batch, doc) => {
    const userRef = db.collection("users").doc(doc.id);
    // Usamos update para no sobreescribir inadvertidamente otras actualizaciones en vuelo
    batch.update(userRef, { companyId: ANCHOR_TENANT });
  });

  console.log(`  ✅ Leídos: ${snap.size} | Actualizados en raíz: ${writtenCount} (inyectado companyId: ${ANCHOR_TENANT})`);
}

async function migrateBillingSettings() {
  console.log(`\n⏳ Migrando documento quirúrgico: [settings/billing]...`);
  const billingDocRef = db.collection("settings").doc("billing");
  const billingSnap = await billingDocRef.get();

  if (!billingSnap.exists) {
    console.log(`  - No existe documento settings/billing original. Saltando.`);
    return;
  }

  const data = billingSnap.data();

  // VALIDACIÓN EXTREMA: Comprobar existencia exacta de campos críticos de Verifactu
  if (data.nextInvoiceSeq === undefined || data.lastInvoiceHash === undefined) {
    throw new Error("ERROR FATAL: El documento settings/billing original no contiene nextInvoiceSeq o lastInvoiceHash válidos. Abortando migración para evitar rotura legal.");
  }

  console.log(`  - Comprobación pre-migración OK: nextInvoiceSeq=${data.nextInvoiceSeq}, lastInvoiceHash=${data.lastInvoiceHash.substring(0, 15)}...`);

  const newRef = db.collection(`companies/${ANCHOR_TENANT}/settings`).doc("billing");
  
  if (!IS_DRY_RUN) {
    await newRef.set(data);
    
    // ASSERT POST-ESCRITURA
    const verifySnap = await newRef.get();
    const verifyData = verifySnap.data();
    
    if (verifyData.nextInvoiceSeq !== data.nextInvoiceSeq || verifyData.lastInvoiceHash !== data.lastInvoiceHash) {
      throw new Error("ERROR FATAL DE ESCRITURA: La copia destino de settings/billing no coincide byte a byte con el origen. Secuencia de facturación comprometida.");
    }
    console.log(`  ✅ Assert post-escritura verificado con éxito.`);
  } else {
    console.log(`  - [DRY RUN] Se escribiría exactamente en companies/${ANCHOR_TENANT}/settings/billing.`);
  }
}

async function createCompanyDocument() {
  console.log(`\n⏳ Creando documento base del Tenant: [companies/${ANCHOR_TENANT}]...`);
  
  const companyData = {
    name: "Rayba Limpiezas",
    status: "active",
    plan: "tier_3", // Puedes ajustar este valor inicial
    trialEndsAt: null,
    stripeCustomerId: null,
    createdAt: FieldValue.serverTimestamp()
  };

  if (!IS_DRY_RUN) {
    await db.collection("companies").doc(ANCHOR_TENANT).set(companyData);
    console.log(`  ✅ Tenant creado exitosamente.`);
  } else {
    console.log(`  - [DRY RUN] Se crearía el documento:`, companyData);
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function runMigration() {
  try {
    // 0. Crear el documento base de la empresa
    await createCompanyDocument();
    
    // 1. Cirugía de Facturación (lo más crítico, primero)
    await migrateBillingSettings();

    // 2. Casos especiales
    await migrateAccessCodes();
    await migrateUsers();

    // 3. Colecciones estándar en orden
    for (const collection of STANDARD_COLLECTIONS) {
      await migrateStandardCollection(collection);
    }

    console.log("\n==================================================");
    if (IS_DRY_RUN) {
      console.log("🏁 DRY-RUN FINALIZADO EXITOSAMENTE.");
    } else {
      console.log("🏁 MIGRACIÓN REAL FINALIZADA EXITOSAMENTE.");
    }
    console.log("Nota: Ningún documento original de la raíz ha sido eliminado.");
    console.log("Revisa las nuevas subcolecciones bajo companies/rayba/");
    console.log("==================================================\n");

  } catch (err) {
    console.error("\n❌❌❌ ERROR FATAL DURANTE LA MIGRACIÓN ❌❌❌");
    console.error(err);
    process.exit(1);
  }
}

runMigration();
