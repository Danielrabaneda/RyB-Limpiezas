/**
 * Reconciles legacy community tasks and assignments with a tenant.
 *
 * Safe by default:
 *   node scripts/reconcileCommunityData.cjs --project ryb-limpiezas-app
 *
 * Execute after reviewing the dry-run:
 *   node scripts/reconcileCommunityData.cjs --project ryb-limpiezas-app --execute
 *
 * The script never deletes documents and never overwrites documents that
 * already exist below /companies/{companyId}.
 */

const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Falta el valor de ${name}`);
  }
  return value;
}

const projectId = readArg("--project", process.env.GCLOUD_PROJECT);
const companyId = readArg("--company", "rayba");
const execute = args.includes("--execute");
const collections = ["communityTasks", "assignments"];

if (!projectId) {
  throw new Error(
    "Indica el proyecto con --project <projectId> o define GCLOUD_PROJECT."
  );
}

const credential = applicationDefault();

initializeApp({
  credential,
  projectId,
});

const db = getFirestore();

async function inspectCollection(collectionName) {
  const sourceRef = db.collection(collectionName);
  const destinationRef = db.collection(
    `companies/${companyId}/${collectionName}`
  );

  // Keep these reads sequential so authentication/configuration failures are
  // reported once and cleanly by the main error handler.
  const sourceSnapshot = await sourceRef.get();
  const destinationSnapshot = await destinationRef.get();

  const destinationIds = new Set(
    destinationSnapshot.docs.map((document) => document.id)
  );
  const missingDocuments = sourceSnapshot.docs.filter(
    (document) => !destinationIds.has(document.id)
  );

  const sourceCommunities = new Set(
    sourceSnapshot.docs
      .map((document) => document.get("communityId"))
      .filter(Boolean)
  );
  const destinationCommunities = new Set(
    destinationSnapshot.docs
      .map((document) => document.get("communityId"))
      .filter(Boolean)
  );

  return {
    collectionName,
    destinationRef,
    sourceCount: sourceSnapshot.size,
    destinationCount: destinationSnapshot.size,
    missingDocuments,
    sourceCommunityCount: sourceCommunities.size,
    destinationCommunityCount: destinationCommunities.size,
  };
}

async function writeMissingDocuments(report) {
  const batchLimit = 450;
  let written = 0;

  for (let offset = 0; offset < report.missingDocuments.length; offset += batchLimit) {
    const batch = db.batch();
    const chunk = report.missingDocuments.slice(offset, offset + batchLimit);

    for (const sourceDocument of chunk) {
      batch.create(
        report.destinationRef.doc(sourceDocument.id),
        sourceDocument.data()
      );
    }

    await batch.commit();
    written += chunk.length;
  }

  return written;
}

async function verifyCollection(report, written) {
  const destinationSnapshot = await report.destinationRef.get();
  const expectedMinimum =
    report.destinationCount + (execute ? report.missingDocuments.length : 0);

  if (destinationSnapshot.size < expectedMinimum) {
    throw new Error(
      `${report.collectionName}: verificación fallida. ` +
        `Esperados al menos ${expectedMinimum}, encontrados ${destinationSnapshot.size}.`
    );
  }

  console.log(
    `  Verificación: destino=${destinationSnapshot.size}, escritos=${written}`
  );
}

async function main() {
  // Resolve credentials before Firestore opens a transport so a missing
  // service account produces a controlled, actionable error.
  await credential.getAccessToken();

  console.log("============================================================");
  console.log(
    execute
      ? "RECONCILIACIÓN REAL (sin borrar ni sobrescribir)"
      : "DRY-RUN (sin escrituras)"
  );
  console.log(`Proyecto: ${projectId}`);
  console.log(`Empresa: ${companyId}`);
  console.log("============================================================");

  const reports = [];

  for (const collectionName of collections) {
    const report = await inspectCollection(collectionName);
    reports.push(report);

    console.log(`\n${collectionName}`);
    console.log(`  Raíz legacy: ${report.sourceCount}`);
    console.log(`  Destino tenant: ${report.destinationCount}`);
    console.log(`  Ausentes en tenant: ${report.missingDocuments.length}`);
    console.log(
      `  Comunidades en raíz/destino: ` +
        `${report.sourceCommunityCount}/${report.destinationCommunityCount}`
    );
  }

  const totalMissing = reports.reduce(
    (total, report) => total + report.missingDocuments.length,
    0
  );

  if (!execute) {
    console.log("\nDRY-RUN finalizado.");
    console.log(`Se copiarían ${totalMissing} documentos.`);
    console.log("Para ejecutar, añade --execute al mismo comando.");
    return;
  }

  let totalWritten = 0;
  for (const report of reports) {
    const written = await writeMissingDocuments(report);
    totalWritten += written;
    await verifyCollection(report, written);
  }

  console.log("\nReconciliación finalizada correctamente.");
  console.log(`Documentos copiados: ${totalWritten}`);
  console.log("Documentos eliminados: 0");
  console.log("Documentos sobrescritos: 0");
}

main().catch((error) => {
  if (
    error.message?.includes("default credentials") ||
    error.message?.includes("Could not load")
  ) {
    console.error(
      "\nERROR FATAL: no hay credenciales administrativas disponibles. " +
        "Define GOOGLE_APPLICATION_CREDENTIALS con una cuenta de servicio " +
        "del proyecto antes de ejecutar este script."
    );
  } else {
    console.error("\nERROR FATAL:", error.message);
  }
  process.exitCode = 1;
});
