/**
 * Removes the two confirmed, pending and unlabelled garage services for
 * 2026-07-24, preserving their rescheduled counterparts.
 *
 * Dry-run:
 *   node scripts/removeUnlabelledGarageDuplicates.cjs --project ryb-limpiezas-app
 *
 * Execute:
 *   node scripts/removeUnlabelledGarageDuplicates.cjs --project ryb-limpiezas-app --execute
 *
 * This script intentionally stops unless it finds exactly one rescheduled and
 * one normal pending service for each target community, and the normal service
 * has no check-ins, executions or evidence attached.
 */

const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

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
const targetCommunityNames = ["Garaje Calle Cadiz", "Albarda"];

if (!projectId) {
  throw new Error(
    "Indica el proyecto con --project <projectId> o define GCLOUD_PROJECT."
  );
}

const credential = applicationDefault();
initializeApp({ credential, projectId });
const db = getFirestore();

const tenantCollection = (name) =>
  db.collection(`companies/${companyId}/${name}`);

function isRescheduled(service) {
  if (service.isRescheduled === true) return true;
  if (!service.originalDate || !service.scheduledDate) return false;

  const original = service.originalDate.toDate
    ? service.originalDate.toDate()
    : new Date(service.originalDate);
  const scheduled = service.scheduledDate.toDate
    ? service.scheduledDate.toDate()
    : new Date(service.scheduledDate);

  return original.getTime() !== scheduled.getTime();
}

async function countReferences(collectionName, serviceId) {
  const snapshot = await tenantCollection(collectionName)
    .where("scheduledServiceId", "==", serviceId)
    .get();
  return snapshot.size;
}

async function main() {
  await credential.getAccessToken();

  // Madrid is UTC+2 on 24 July 2026.
  const dayStart = Timestamp.fromDate(new Date("2026-07-24T00:00:00+02:00"));
  const dayEnd = Timestamp.fromDate(new Date("2026-07-24T23:59:59.999+02:00"));

  console.log("============================================================");
  console.log(
    execute
      ? "LIMPIEZA REAL DE DUPLICADOS CONFIRMADOS"
      : "DRY-RUN (sin escrituras)"
  );
  console.log(`Proyecto: ${projectId}`);
  console.log(`Empresa: ${companyId}`);
  console.log("Fecha: 24/07/2026");
  console.log("============================================================");

  const communitiesSnapshot = await tenantCollection("communities").get();
  const communitiesByName = new Map(
    communitiesSnapshot.docs.map((document) => [
      document.get("name"),
      { id: document.id, ...document.data() },
    ])
  );

  const servicesSnapshot = await tenantCollection("scheduledServices")
    .where("scheduledDate", ">=", dayStart)
    .where("scheduledDate", "<=", dayEnd)
    .get();

  const services = servicesSnapshot.docs.map((document) => ({
    id: document.id,
    ref: document.ref,
    ...document.data(),
  }));

  const candidatesToDelete = [];

  for (const communityName of targetCommunityNames) {
    const community = communitiesByName.get(communityName);
    if (!community) {
      throw new Error(`No se encontró la comunidad "${communityName}".`);
    }

    const matching = services.filter(
      (service) =>
        service.communityId === community.id &&
        service.status === "pending" &&
        service.taskName === "Limpieza de Garaje"
    );
    const moved = matching.filter(isRescheduled);
    const normal = matching.filter((service) => !isRescheduled(service));

    console.log(`\n${communityName}`);
    console.log(`  Pendientes coincidentes: ${matching.length}`);
    console.log(`  Trasladados (se conservan): ${moved.length}`);
    console.log(`  Normales sin etiqueta: ${normal.length}`);

    if (moved.length !== 1 || normal.length !== 1) {
      throw new Error(
        `${communityName}: se esperaba exactamente 1 trasladado y 1 normal. ` +
          "No se ha eliminado nada."
      );
    }

    const candidate = normal[0];
    const [checkIns, taskExecutions, evidenceReports] = await Promise.all([
      countReferences("checkIns", candidate.id),
      countReferences("taskExecutions", candidate.id),
      countReferences("evidenceReports", candidate.id),
    ]);

    console.log(`  Servicio que se eliminaría: ${candidate.id}`);
    console.log(
      `  Referencias checkIns/taskExecutions/evidenceReports: ` +
        `${checkIns}/${taskExecutions}/${evidenceReports}`
    );

    if (checkIns + taskExecutions + evidenceReports !== 0) {
      throw new Error(
        `${communityName}: el servicio normal tiene actividad asociada. ` +
          "No se ha eliminado nada."
      );
    }

    candidatesToDelete.push(candidate);
  }

  if (!execute) {
    console.log("\nDRY-RUN finalizado.");
    console.log(
      `Se eliminarían ${candidatesToDelete.length} servicios pendientes sin etiqueta.`
    );
    return;
  }

  const batch = db.batch();
  for (const candidate of candidatesToDelete) {
    batch.delete(candidate.ref);
  }
  await batch.commit();

  for (const candidate of candidatesToDelete) {
    const verification = await candidate.ref.get();
    if (verification.exists) {
      throw new Error(
        `Verificación fallida: el servicio ${candidate.id} todavía existe.`
      );
    }
  }

  console.log("\nLimpieza finalizada correctamente.");
  console.log(`Servicios eliminados: ${candidatesToDelete.length}`);
  console.log("Servicios trasladados conservados: 2");
}

main().catch((error) => {
  if (
    error.message?.includes("default credentials") ||
    error.message?.includes("Could not load")
  ) {
    console.error(
      "\nERROR FATAL: no hay credenciales administrativas disponibles."
    );
  } else {
    console.error("\nERROR FATAL:", error.message);
  }
  process.exitCode = 1;
});
