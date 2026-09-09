/**
 * Removes only a stale pending Correos garage card after verifying that it
 * predates the next cadence and has no related activity.
 * Uses the Firebase REST API so it can be run without an Admin SDK key.
 */

const fs = require("node:fs");
const path = require("node:path");

const execute = process.argv.includes("--execute");
const companyId = "rayba";

function readEnvFile() {
  const contents = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function fieldValue(document, name) {
  const value = document.fields?.[name];
  if (!value) return null;
  return (
    value.stringValue ??
    value.timestampValue ??
    value.booleanValue ??
    value.integerValue ??
    null
  );
}

function documentId(document) {
  return document.name.split("/").pop();
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addCalendarMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function frequencyMonths(type) {
  return {
    monthly: 1,
    bimonthly: 2,
    trimonthly: 3,
    quadrimonthly: 4,
    semiannual: 6,
    eightmonthly: 8,
    annual: 12,
  }[type] || null;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function queryBody(collectionId, field, value) {
  return {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
    },
  };
}

async function main() {
  const fileEnv = readEnvFile();
  const email = process.env.RYB_ADMIN_EMAIL;
  const password = process.env.RYB_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan RYB_ADMIN_EMAIL y RYB_ADMIN_PASSWORD.");
  }

  const projectId = fileEnv.VITE_FIREBASE_PROJECT_ID;
  const authResult = await request(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(fileEnv.VITE_FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const headers = {
    Authorization: `Bearer ${authResult.idToken}`,
    "Content-Type": "application/json",
  };
  const documentsRoot = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const tenantRoot = `${documentsRoot}/companies/${companyId}`;
  const runQueryUrl = `${tenantRoot}:runQuery`;

  const communityRows = await request(runQueryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(queryBody("communities", "name", "Correos")),
  });
  const communities = communityRows.flatMap((row) =>
    row.document ? [row.document] : [],
  );
  if (communities.length !== 1) {
    throw new Error(
      `Se esperaba una comunidad Correos y se encontraron ${communities.length}.`,
    );
  }
  const communityId = documentId(communities[0]);

  const serviceRows = await request(runQueryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(
      queryBody("scheduledServices", "communityId", communityId),
    ),
  });
  const allCommunityServices = serviceRows.flatMap((row) =>
    row.document ? [row.document] : [],
  );
  const services = allCommunityServices
    .filter(
      (document) =>
        fieldValue(document, "status") === "pending" &&
        String(fieldValue(document, "taskName") || "")
          .toLowerCase()
          .includes("garaje"),
    );

  const candidates = [];
  for (const service of services) {
    const taskId = fieldValue(service, "communityTaskId");
    if (!taskId) continue;
    const task = await request(`${tenantRoot}/communityTasks/${taskId}`, {
      headers,
    });
    const anchorValue = fieldValue(task, "garageCadenceAnchorDate");
    const months = frequencyMonths(fieldValue(task, "frequencyType"));
    if (!anchorValue || !months) continue;
    const anchor = new Date(`${anchorValue}T00:00:00`);
    const nextDueDate = addCalendarMonths(anchor, months);
    const scheduledDate = new Date(fieldValue(service, "scheduledDate"));
    if (scheduledDate.getTime() >= nextDueDate.getTime()) continue;

    let referenceCount = 0;
    for (const collectionId of [
      "checkIns",
      "taskExecutions",
      "evidenceReports",
    ]) {
      const rows = await request(runQueryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(
          queryBody(collectionId, "scheduledServiceId", documentId(service)),
        ),
      });
      referenceCount += rows.filter((row) => row.document).length;
    }
    if (referenceCount !== 0) {
      throw new Error(
        `La ficha ${documentId(service)} tiene ${referenceCount} referencias asociadas.`,
      );
    }
    candidates.push({ service, scheduledDate, nextDueDate });
  }

  console.log(`Fichas erróneas encontradas: ${candidates.length}`);
  if (candidates.length === 0) {
    const pendingGarages = allCommunityServices.filter(
      (document) =>
        fieldValue(document, "status") === "pending" &&
        String(fieldValue(document, "taskName") || "")
          .toLowerCase()
          .includes("garaje"),
    );
    console.log("Garajes pendientes actuales de Correos:");
    pendingGarages.forEach((document) => {
      console.log(
        `- ${documentId(document)} | ${fieldValue(document, "scheduledDate")} | task ${fieldValue(document, "communityTaskId")}`,
      );
    });
  }
  candidates.forEach(({ service, scheduledDate, nextDueDate }) => {
    console.log(
      `- ${documentId(service)}: ${formatDate(scheduledDate)}; próxima cadencia ${formatDate(nextDueDate)}`,
    );
  });
  if (candidates.length !== 1) {
    throw new Error("No se encontró exactamente una ficha segura para eliminar.");
  }
  if (!execute) {
    console.log("Dry-run finalizado; no se ha modificado ningún dato.");
    return;
  }

  const candidate = candidates[0].service;
  await request(`${documentsRoot}/${candidate.name.split("/documents/")[1]}`, {
    method: "DELETE",
    headers,
  });
  const verification = await fetch(
    `${documentsRoot}/${candidate.name.split("/documents/")[1]}`,
    { headers, signal: AbortSignal.timeout(20000) },
  );
  if (verification.status !== 404) {
    throw new Error("La ficha sigue existiendo después de intentar eliminarla.");
  }
  console.log(`Ficha eliminada y verificada: ${documentId(candidate)}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
