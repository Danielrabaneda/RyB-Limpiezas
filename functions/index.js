/**
 * Cloud Functions para RyB Limpiezas App
 *
 * Funciones:
 * - checkWorkdayReminders: Cada 10 minutos, revisa jornadas activas y envía recordatorios push.
 * - cleanupStaleFcmTokens: Diariamente a las 3:00 AM (Europe/Madrid), limpia tokens FCM antiguos.
 * - onGpsNotificationCreated: Trigger Firestore que envía FCM push real para notificaciones GPS (entrada/salida de comunidades).
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { shouldSendPushNotification } = require("./notificationPolicy");
const {
  clampAutoCloseEndTime,
  getMadridDateKey,
} = require("./lib/workdayAutoClose");
const {
  buildFiscalRecord,
  calculateInvoiceFiscalTotals,
  computeCancellationHash,
  computeInvoiceHash,
  formatInvoiceNumber,
  formatIssueDateForHash,
  getIssueDate,
  getMadridIsoTimestamp,
  resolveInvoiceSeries,
  resolveInvoiceType,
} = require("./lib/invoiceEmission");
const {
  buildTrialLifecycle,
  isTrialReadyForDeletion,
} = require("./lib/trialLifecycle");
const {
  AEAT_JOB_STATUSES,
  MAX_SUBMISSION_ATTEMPTS,
  buildAeatSubmissionDraftXml,
  buildAeatOfficialSoapEnvelope,
  buildSubmissionManifest,
  getInitialSubmissionStatus,
  getNextRetryDate,
  normalizeAeatConnectionProfile,
} = require("./lib/aeatSubmission");
const {
  onCall,
  HttpsError,
  onRequest,
} = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
  GeoPoint,
} = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const { getAuth } = require("firebase-admin/auth");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const { createHash, randomBytes } = require("node:crypto");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const {
  MAX_PFX_BYTES,
  buildTenantSecretId,
  parseAndValidatePfx,
} = require("./lib/aeatCertificate");
const {
  parseAeatSoapResponse,
  postSoapWithPfx,
} = require("./lib/aeatCloudSender");

const AEAT_TEST_ENDPOINT = "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();
const messaging = getMessaging();
const auth = getAuth();
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const secretManager = new SecretManagerServiceClient();

function getGoogleCloudProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

async function ensureTenantCertificateSecret(companyId) {
  const projectId = getGoogleCloudProjectId();
  if (!projectId) throw new Error("No se pudo identificar el proyecto de Google Cloud.");
  const secretId = buildTenantSecretId(companyId);
  const name = `projects/${projectId}/secrets/${secretId}`;
  try {
    await secretManager.getSecret({ name });
  } catch (error) {
    if (Number(error.code) !== 5) throw error;
    await secretManager.createSecret({
      parent: `projects/${projectId}`,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  }
  return name;
}

function hashConnectorCredential(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function createPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function parseConnectorBody(request) {
  if (!request.is("application/json") || !request.body || typeof request.body !== "object") {
    return null;
  }
  return request.body;
}

async function authenticateLocalConnector(request, body) {
  const companyId = String(body?.companyId || "").trim();
  const token = String(request.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(companyId) || !token) return null;
  const ref = db.doc(`companies/${companyId}/verifactuConfig/localConnector`);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data.connectorTokenHash || data.connectorTokenHash !== hashConnectorCredential(token)) {
    return null;
  }
  return { companyId, ref, data };
}

// ============================================================================
// CONSTANTES
// ============================================================================

/** Umbral en minutos para recordar que no ha fichado en ningún servicio */
const NO_CHECKIN_THRESHOLD_MIN = 30;

/** Umbral en horas para avisar de un check-in muy largo */
const LONG_CHECKIN_THRESHOLD_HOURS = 5;

/** Umbral en horas para avisar de una jornada muy larga */
const LONG_WORKDAY_THRESHOLD_HOURS = 10;

/** Umbral en horas para autocierre automático de jornada */
const AUTO_CLOSE_WORKDAY_THRESHOLD_HOURS = 12;

/** Tiempo mínimo entre recordatorios del mismo tipo (en minutos) */
const REMINDER_COOLDOWN_MIN = 30;

/** Días máximos sin actualizar un token FCM antes de borrarlo */
const FCM_TOKEN_MAX_AGE_DAYS = 60;

const PLATFORM_ADMIN_EMAIL =
  process.env.PLATFORM_ADMIN_EMAIL || "admin@ryblimpiezas.com";
const PLATFORM_TENANT_ID =
  process.env.PLATFORM_TENANT_ID || "rayba";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const PLAN_LIMITS = {
  autonomo: {
    operarios: 5,
    communities: 50,
    admins: null,
    storageGb: 2,
    monthlyPrice: 19,
  },
  starter: {
    operarios: 10,
    communities: 100,
    admins: null,
    storageGb: 5,
    monthlyPrice: 39,
  },
  professional: {
    operarios: 30,
    communities: 300,
    admins: null,
    storageGb: 25,
    monthlyPrice: 79,
  },
  business: {
    operarios: 100,
    communities: 1000,
    admins: null,
    storageGb: 100,
    monthlyPrice: 149,
  },
  enterprise: {
    operarios: null,
    communities: null,
    admins: null,
    storageGb: null,
    monthlyPrice: 0,
  },
};

function normalizePlan(plan) {
  const key = String(plan || "starter").trim().toLowerCase();
  const aliases = {
    tier_1: "starter",
    tier_2: "professional",
    tier_3: "business",
    "autónomo": "autonomo",
    profesional: "professional",
    pyme: "starter",
    empresa: "business",
  };
  const normalized = aliases[key] || key;
  return PLAN_LIMITS[normalized] ? normalized : "starter";
}

function getPlanLimits(plan) {
  const normalizedPlan = normalizePlan(plan);
  return { plan: normalizedPlan, ...PLAN_LIMITS[normalizedPlan] };
}

async function assertPlanCapacity(companyId, resource) {
  const company = await assertTenantEnabled(companyId);
  // Platform tenant (Rayba) has unlimited capacity — skip all plan limits
  if (companyId === PLATFORM_TENANT_ID) {
    return { plan: "enterprise", operarios: null, communities: null, admins: null, storageGb: null, monthlyPrice: 0 };
  }
  const limits = getPlanLimits(company.plan);
  const maximum = limits[resource];
  if (maximum === null) return limits;

  let countQuery;
  if (resource === "operarios") {
    countQuery = db
      .collection("users")
      .where("companyId", "==", companyId)
      .where("role", "==", "operario")
      .where("active", "==", true);
  } else {
    countQuery = db.collection(`companies/${companyId}/communities`);
  }
  const count = (await countQuery.count().get()).data().count;
  if (count >= maximum) {
    throw new HttpsError(
      "resource-exhausted",
      `El plan ${limits.plan} permite un máximo de ${maximum} ${resource}.`,
      { resource, current: count, maximum, plan: limits.plan },
    );
  }
  return limits;
}

function isPlatformAdmin(authContext) {
  const email = String(authContext?.token?.email || "").trim().toLowerCase();
  const companyId = String(authContext?.token?.companyId || "").trim();
  return Boolean(
    companyId === PLATFORM_TENANT_ID &&
      (authContext?.token?.platformAdmin === true ||
        email === PLATFORM_ADMIN_EMAIL.toLowerCase()),
  );
}

function requirePlatformAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (!isPlatformAdmin(request.auth)) {
    throw new HttpsError(
      "permission-denied",
      "Esta operación requiere permisos de administración de plataforma.",
    );
  }
}

async function assertTenantEnabled(companyId) {
  if (!companyId) {
    throw new HttpsError(
      "failed-precondition",
      "La cuenta no tiene una empresa asociada.",
    );
  }
  const companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "La empresa no existe.");
  }
  const company = companySnap.data();

  // Platform tenant (Rayba) always has full unrestricted access
  if (companyId === PLATFORM_TENANT_ID) {
    return company;
  }

  const subscriptionStatus = company.subscriptionStatus || "legacy";
  const trialEndsAt = company.trialEndsAt?.toMillis
    ? company.trialEndsAt.toMillis()
    : null;
  const trialExpired =
    subscriptionStatus === "trialing" &&
    trialEndsAt !== null &&
    trialEndsAt <= Date.now();
  if (
    company.status !== "active" ||
    trialExpired ||
    (subscriptionStatus !== "legacy" &&
      !ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus))
  ) {
    throw new HttpsError(
      "permission-denied",
      "La empresa está suspendida o no tiene una suscripción activa.",
    );
  }
  return company;
}

async function requireTenantAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const companyId = String(request.auth.token.companyId || "").trim();
  if (!companyId) {
    throw new HttpsError(
      "permission-denied",
      "El usuario no tiene una empresa asociada.",
    );
  }
  await assertTenantEnabled(companyId);
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const user = userSnap.data();
  if (
    !userSnap.exists ||
    user.role !== "admin" ||
    user.active !== true ||
    user.companyId !== companyId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Esta operación requiere permisos de administración.",
    );
  }
  return companyId;
}

async function requireActiveTenantEmployee(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const companyId = String(request.auth.token.companyId || "").trim();
  if (!companyId) {
    throw new HttpsError(
      "permission-denied",
      "El usuario no tiene una empresa asociada.",
    );
  }

  await assertTenantEnabled(companyId);
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const user = userSnap.data();
  if (
    !userSnap.exists ||
    user.active !== true ||
    user.companyId !== companyId ||
    !["admin", "operario"].includes(user.role)
  ) {
    throw new HttpsError(
      "permission-denied",
      "La cuenta está inactiva o ya no pertenece a esta empresa.",
    );
  }

  return { companyId, user };
}

function buildAeatSubmissionDocument({
  companyId,
  fiscalRecordId,
  fiscalRecord,
  settings,
  profile,
  createdBy,
  createdAt,
}) {
  const status = getInitialSubmissionStatus(profile.channel);
  if (!status) return null;
  return {
    companyId,
    fiscalRecordId,
    invoiceId: fiscalRecord.invoiceId,
    invoiceNumber: fiscalRecord.invoiceNumber,
    recordType: fiscalRecord.recordType || "alta",
    issuerNif: fiscalRecord.issuerNif,
    fiscalHash: fiscalRecord.chain?.hash || "",
    channel: profile.channel,
    environment: profile.environment,
    status,
    productionEnabled: false,
    credentialsStored: false,
    schemaValidationStatus: profile.schemaValidationStatus,
    sender:
      profile.channel === "delegated"
        ? {
            type: "delegated",
            name: profile.adviserName,
            taxId: profile.adviserTaxId,
            email: profile.adviserEmail,
          }
        : {
            type: "local_connector",
            connectorName: profile.connectorName,
          },
    transportXml: buildAeatSubmissionDraftXml(fiscalRecord, settings),
    manifest: buildSubmissionManifest({
      companyId,
      fiscalRecordId,
      fiscalRecord,
      profile,
    }),
    attempts: 0,
    maxAttempts: MAX_SUBMISSION_ATTEMPTS,
    nextAttemptAt: createdAt,
    lastError: null,
    aeatResponse: null,
    createdBy,
    createdAt,
  };
}

function appendVerifactuEvent(transaction, companyId, event) {
  const ref = db.collection(`companies/${companyId}/verifactuEvents`).doc();
  transaction.create(ref, {
    companyId,
    type: String(event.type || "unknown").slice(0, 80),
    actorId: event.actorId || "system",
    invoiceId: event.invoiceId || null,
    invoiceNumber: event.invoiceNumber || null,
    fiscalRecordId: event.fiscalRecordId || null,
    submissionId: event.submissionId || null,
    channel: event.channel || null,
    environment: "test",
    productionEnabled: false,
    details: event.details || {},
    createdAt: event.createdAt || Timestamp.now(),
  });
  return ref.id;
}

async function recordVerifactuEvent(companyId, event) {
  const ref = db.collection(`companies/${companyId}/verifactuEvents`).doc();
  await ref.create({
    companyId,
    type: String(event.type || "unknown").slice(0, 80),
    actorId: event.actorId || "system",
    invoiceId: event.invoiceId || null,
    invoiceNumber: event.invoiceNumber || null,
    fiscalRecordId: event.fiscalRecordId || null,
    submissionId: event.submissionId || null,
    channel: event.channel || null,
    environment: "test",
    productionEnabled: false,
    details: event.details || {},
    createdAt: event.createdAt || Timestamp.now(),
  });
  return ref.id;
}

function normalizeCompanyId(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (normalized.length < 3) {
    throw new HttpsError(
      "invalid-argument",
      "El identificador de empresa debe tener al menos 3 caracteres.",
    );
  }
  return normalized;
}

function normalizeAccessCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
  if (code.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "El código de invitación debe tener al menos 6 caracteres.",
    );
  }
  return code;
}

function getStripeClient() {
  const key = stripeSecretKey.value().trim();
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe todavía no está configurado.",
    );
  }
  return new Stripe(key);
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Escapa caracteres especiales de HTML para prevenir vulnerabilidades XSS.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Obtiene el inicio y fin del día actual en Europe/Madrid como Timestamps de Firestore.
 * @returns {{ startOfDay: Timestamp, endOfDay: Timestamp }}
 */
function getTodayBoundsMadrid() {
  const now = new Date();

  // Obtener los componentes de fecha en Europe/Madrid
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(now); // formato YYYY-MM-DD

  // Crear inicio y fin del día en UTC basados en la fecha de Madrid
  // Parseamos la fecha de Madrid y calculamos los offsets
  const [year, month, day] = dateStr.split("-").map(Number);

  // Inicio del día en Madrid (00:00:00) — aproximamos con UTC
  // Para ser precisos, usamos el offset actual de Madrid
  const madridOffset = getMadridOffsetMs(now);
  const startOfDayUTC = new Date(Date.UTC(year, month - 1, day) - madridOffset);
  const endOfDayUTC = new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999) - madridOffset,
  );

  return {
    startOfDay: Timestamp.fromDate(startOfDayUTC),
    endOfDay: Timestamp.fromDate(endOfDayUTC),
  };
}

/**
 * Calcula el offset de Europe/Madrid respecto a UTC en milisegundos de forma robusta.
 * @param {Date} date - Fecha de referencia
 * @returns {number} Offset en milisegundos (positivo = Madrid adelantado)
 */
function getMadridOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const map = new Map(parts.map((p) => [p.type, p.value]));

  const year = parseInt(map.get("year"), 10);
  const month = parseInt(map.get("month"), 10) - 1;
  const day = parseInt(map.get("day"), 10);
  let hour = parseInt(map.get("hour"), 10);
  const minute = parseInt(map.get("minute"), 10);
  const second = parseInt(map.get("second"), 10);

  if (hour === 24) hour = 0;

  const madridUtc = Date.UTC(year, month, day, hour, minute, second);
  const localUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );

  return madridUtc - localUtc;
}

/**
 * Calcula las horas transcurridas desde un Timestamp de Firestore.
 * @param {Timestamp} timestamp
 * @returns {number} Horas transcurridas (con decimales)
 */
function hoursElapsed(timestamp) {
  const now = Date.now();
  const then = timestamp.toMillis();
  return (now - then) / (1000 * 60 * 60);
}

/**
 * Calcula los minutos transcurridos desde un Timestamp de Firestore.
 * @param {Timestamp} timestamp
 * @returns {number} Minutos transcurridos (con decimales)
 */
function minutesElapsed(timestamp) {
  const now = Date.now();
  const then = timestamp.toMillis();
  return (now - then) / (1000 * 60);
}

/**
 * Comprueba si ya se envió un recordatorio del mismo tipo al usuario en los últimos N minutos.
 * @param {string} userId - ID del usuario
 * @param {string} type - Tipo de recordatorio
 * @param {string} workdayId - ID de la jornada
 * @returns {Promise<boolean>} true si ya se envió recientemente
 */
async function wasReminderSentRecently(userId, type, workdayId) {
  const cutoff = Timestamp.fromDate(
    new Date(Date.now() - REMINDER_COOLDOWN_MIN * 60 * 1000),
  );

  const snap = await db
    .collection("sentPushReminders")
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("workdayId", "==", workdayId)
    .where("sentAt", ">=", cutoff)
    .limit(1)
    .get();

  return !snap.empty;
}

/**
 * Registra que se envió un recordatorio.
 * @param {string} userId
 * @param {string} type
 * @param {string} workdayId
 */
async function recordReminderSent(userId, type, workdayId) {
  await db.collection("sentPushReminders").add({
    userId,
    type,
    workdayId,
    sentAt: FieldValue.serverTimestamp(),
  });
}

/**
/**
 * Obtiene el companyId de un usuario a partir de su documento en users/{userId}.
 * @param {string} userId
 * @returns {Promise<string|null>} companyId o null si no se encuentra
 */
async function getCompanyIdForUser(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      return userDoc.data().companyId || null;
    }
  } catch (e) {
    logger.error(`Error al obtener companyId para usuario ${userId}:`, e);
  }
  return null;
}

/**
 * Obtiene todos los tokens FCM de un usuario (puede tener múltiples dispositivos) de forma transversal a los tenants.
 * @param {string} userId
 * @returns {Promise<string[]>} Array de tokens FCM
 */
async function getUserFcmTokens(userId, companyId = null) {
  const tokenCollection = companyId
    ? db.collection(`companies/${companyId}/fcmTokens`)
    : db.collectionGroup("fcmTokens");
  const snap = await tokenCollection.where("userId", "==", userId).get();

  return snap.docs.map((doc) => doc.data().token).filter(Boolean);
}

/**
 * Envía una notificación push a todos los dispositivos del usuario y crea una
 * notificación de respaldo en systemNotifications.
 *
 * @param {string} userId - ID del usuario destinatario
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {string} type - Tipo de notificación
 * @param {string|null} serviceId - ID del servicio relacionado (opcional)
 */
async function sendPushNotification(
  userId,
  title,
  body,
  type,
  serviceId = null,
) {
  const tokens = await getUserFcmTokens(userId);

  // Crear notificación de respaldo en Firestore siempre bajo el tenant correspondiente
  const systemNotifData = {
    userId,
    title,
    body,
    type,
    serviceId: serviceId || null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };

  const companyId = await getCompanyIdForUser(userId);
  if (companyId) {
    await db.collection(`companies/${companyId}/systemNotifications`).add(systemNotifData);
    logger.info(
      `[Notificación] systemNotification creada para usuario ${userId} en tenant ${companyId}, tipo: ${type}`,
    );
  } else {
    logger.warn(
      `[Notificación] No se pudo crear systemNotification para ${userId} porque no se encontró su companyId.`,
    );
  }

  if (tokens.length === 0) {
    logger.warn(
      `[Notificación] Usuario ${userId} no tiene tokens FCM registrados. Solo se creó systemNotification (si companyId era válido).`,
    );
    return;
  }

  // Enviar a todos los dispositivos del usuario
  const invalidTokens = [];

  const sendPromises = tokens.map(async (token) => {
    try {
      const message = {
        token,
        notification: { title, body },
        data: { type, userId, serviceId: serviceId || "" },
        android: {
          priority: "high",
          notification: {
            channelId: "ryb_reminders",
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: "default",
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/badge-72x72.png",
          },
        },
      };

      await messaging.send(message);
      logger.info(
        `[Push] Enviado a token ${token.substring(0, 20)}... para usuario ${userId}`,
      );
    } catch (error) {
      // Si el token es inválido o ha expirado, lo marcamos para eliminar
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-argument"
      ) {
        logger.warn(
          `[Push] Token inválido detectado para usuario ${userId}: ${token.substring(0, 20)}...`,
        );
        invalidTokens.push(token);
      } else {
        logger.error(
          `[Push] Error enviando a token ${token.substring(0, 20)}... para usuario ${userId}:`,
          error,
        );
      }
    }
  });

  await Promise.all(sendPromises);

  // Limpiar tokens inválidos detectados durante el envío
  if (invalidTokens.length > 0) {
    logger.info(
      `[Push] Limpiando ${invalidTokens.length} token(s) inválido(s) para usuario ${userId}`,
    );
    const deletePromises = invalidTokens.map(async (token) => {
      const tokenSnap = await db
        .collectionGroup("fcmTokens")
        .where("token", "==", token)
        .get();
      const batch = db.batch();
      tokenSnap.docs.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    });
    await Promise.all(deletePromises);
  }
}

/**
 * Obtiene el nombre de una comunidad por su ID.
 * @param {string} companyId
 * @param {string} communityId
 * @returns {Promise<string>} Nombre de la comunidad o "la comunidad"
 */
async function getCommunityName(companyId, communityId) {
  try {
    const doc = await db
      .collection(`companies/${companyId}/communities`)
      .doc(communityId)
      .get();
    if (doc.exists) {
      return doc.data().name || "la comunidad";
    }
  } catch (e) {
    logger.warn(
      `[getCommunityName] Error obteniendo comunidad ${communityId} en tenant ${companyId}:`,
      e,
    );
  }
  return "la comunidad";
}

/**
 * Formatea una fecha a HH:mm
 * @param {Date} d
 * @returns {string}
 */
function formatTimeHHMM(d) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Obtiene el promedio de minutos de jornadas completadas por un usuario en las 2 semanas anteriores para el mismo día de la semana.
 * @param {string} companyId - ID del tenant
 * @param {string} userId - ID del operario
 * @param {Date} workdayDate - Fecha de la jornada actual
 * @returns {Promise<{ avgMinutes: number, count: number }>}
 */
async function getAverageWorkdayMinutesSameWeekday(companyId, userId, workdayDate) {
  try {
    const oneWeekAgo = new Date(workdayDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(workdayDate.getTime() - 14 * 24 * 60 * 60 * 1000);

    const targetDates = [
      getMadridDateKey(oneWeekAgo),
      getMadridDateKey(twoWeeksAgo),
    ];

    const snap = await db
      .collection(`companies/${companyId}/workdays`)
      .where("userId", "==", userId)
      .where("status", "==", "completed")
      .where("startTime", ">=", Timestamp.fromDate(twoWeeksAgo))
      .where("startTime", "<", Timestamp.fromDate(workdayDate))
      .get();

    if (snap.empty) {
      return { avgMinutes: 480, count: 0 };
    }

    const matchingMinutes = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.totalMinutes || Number(data.totalMinutes) <= 0) return;

      let docDateStr = null;
      if (data.date) {
        const d = data.date.toDate ? data.date.toDate() : new Date(data.date);
        docDateStr = getMadridDateKey(d);
      } else if (data.startTime) {
        const d = data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime);
        docDateStr = getMadridDateKey(d);
      }

      if (docDateStr && targetDates.includes(docDateStr)) {
        matchingMinutes.push(Number(data.totalMinutes));
      }
    });

    if (matchingMinutes.length > 0) {
      const sum = matchingMinutes.reduce((acc, val) => acc + val, 0);
      const avg = Math.round(sum / matchingMinutes.length);
      return { avgMinutes: avg, count: matchingMinutes.length };
    }
  } catch (e) {
    logger.error(
      `[getAverageWorkdayMinutesSameWeekday] Error en usuario ${userId}:`,
      e,
    );
  }

  return { avgMinutes: 480, count: 0 };
}

// ============================================================================
// FUNCIÓN 1: checkWorkdayReminders
// Ejecuta cada 10 minutos, revisa jornadas activas y envía recordatorios push.
// ============================================================================

exports.checkWorkdayReminders = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "Europe/Madrid",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    logger.info("=== checkWorkdayReminders: Inicio de ejecución ===");

    try {
      // 1. Obtener todas las jornadas activas
      const activeWorkdaysSnap = await db
        .collectionGroup("workdays")
        .where("status", "==", "active")
        .get();

      if (activeWorkdaysSnap.empty) {
        logger.info("No hay jornadas activas. Finalizando.");
        return;
      }

      logger.info(
        `Encontradas ${activeWorkdaysSnap.size} jornada(s) activa(s).`,
      );

      // 2. Obtener los límites del día de hoy (Europe/Madrid)
      const { startOfDay, endOfDay } = getTodayBoundsMadrid();

      // 3. Procesar cada jornada activa
      const processingPromises = activeWorkdaysSnap.docs.map(
        async (workdayDoc) => {
          const workday = workdayDoc.data();
          const workdayId = workdayDoc.id;
          const userId = workday.userId;
          const companyId = workdayDoc.ref.parent.parent.id;

          try {
            logger.info(
              `[Jornada ${workdayId}] Procesando usuario ${userId} en tenant ${companyId}...`,
            );

            // Calcular tiempo activo de la jornada
            const workdayStartTime = workday.startTime;
            if (!workdayStartTime) {
              logger.warn(
                `[Jornada ${workdayId}] No tiene startTime, saltando.`,
              );
              return;
            }

            const workdayMinutes = minutesElapsed(workdayStartTime);
            const workdayHours = hoursElapsed(workdayStartTime);

            // -----------------------------------------------------------
            // CHECK 0: Autocierre automático si la jornada supera las 12h
            // -----------------------------------------------------------
            if (workdayHours >= AUTO_CLOSE_WORKDAY_THRESHOLD_HOURS) {
              logger.info(
                `[Jornada ${workdayId}] Supera las ${AUTO_CLOSE_WORKDAY_THRESHOLD_HOURS}h activas. Ejecutando autocierre...`,
              );

              const startTimestamp = workdayStartTime.toDate
                ? workdayStartTime.toDate()
                : new Date(workdayStartTime);

              const autoCloseCutoff = new Date(
                Math.min(
                  Date.now(),
                  startTimestamp.getTime() +
                    AUTO_CLOSE_WORKDAY_THRESHOLD_HOURS * 60 * 60 * 1000,
                ),
              );

              // Limitar los fichajes a esta jornada evita cerrar servicios
              // actuales cuando existe una jornada antigua atascada.
              const workdayCheckInsSnap = await db
                .collection(`companies/${companyId}/checkIns`)
                .where("userId", "==", userId)
                .where("checkInTime", ">=", Timestamp.fromDate(startTimestamp))
                .where("checkInTime", "<=", Timestamp.fromDate(autoCloseCutoff))
                .get();

              let lastCheckOutTime = null;
              let lastCheckInTime = null;
              workdayCheckInsSnap.docs.forEach((ciDoc) => {
                const ciData = ciDoc.data();
                if (ciData.checkInTime) {
                  const checkInDate = ciData.checkInTime.toDate
                    ? ciData.checkInTime.toDate()
                    : new Date(ciData.checkInTime);
                  if (
                    checkInDate <= autoCloseCutoff &&
                    (!lastCheckInTime || checkInDate > lastCheckInTime)
                  ) {
                    lastCheckInTime = checkInDate;
                  }
                }
                if (ciData.checkOutTime) {
                  const checkOutDate = ciData.checkOutTime.toDate
                    ? ciData.checkOutTime.toDate()
                    : new Date(ciData.checkOutTime);
                  if (
                    checkOutDate >= startTimestamp &&
                    checkOutDate <= autoCloseCutoff
                  ) {
                    if (!lastCheckOutTime || checkOutDate > lastCheckOutTime) {
                      lastCheckOutTime = checkOutDate;
                    }
                  }
                }
              });

              let finalEndTime = null;
              let autoCloseReason = "";
              let autoCloseNote = "";

              if (lastCheckOutTime) {
                finalEndTime = lastCheckOutTime;
                autoCloseReason =
                  "Autocierre (>12h). Hora de fin fijada a la salida del último servicio realizado.";
                autoCloseNote = `Jornada cerrada automáticamente tras 12h. Hora de fin fijada según la última tarea realizada (${formatTimeHHMM(finalEndTime)}).`;
              } else {
                // Si NO hay tareas/fichajes completados hoy: calcular promedio de las 2 semanas anteriores
                const { avgMinutes, count } =
                  await getAverageWorkdayMinutesSameWeekday(
                    companyId,
                    userId,
                    startTimestamp,
                  );

                finalEndTime = new Date(
                  startTimestamp.getTime() + avgMinutes * 60 * 1000,
                );
                const hrs = Math.floor(avgMinutes / 60);
                const mins = avgMinutes % 60;

                if (count > 0) {
                  autoCloseReason = `Autocierre (>12h). Sin tareas registradas hoy; horas calculadas por promedio de los mismos días de las últimas 2 semanas (${hrs}h ${mins}m).`;
                  autoCloseNote = `Jornada no cerrada manualmente. Hora de fin calculada automáticamente según la media de las 2 semanas anteriores para este mismo día de la semana (${hrs}h ${mins}m).`;
                } else {
                  autoCloseReason =
                    "Autocierre (>12h). Sin tareas registradas hoy ni histórico previo en este día (calculado por defecto 8h).";
                  autoCloseNote =
                    "Jornada no cerrada manualmente. Hora de fin estimada por defecto en 8 horas por falta de histórico.";
                }
              }

              // No terminar antes del último servicio registrado ni después
              // del umbral de seguridad.
              finalEndTime = clampAutoCloseEndTime(
                finalEndTime,
                lastCheckInTime,
                autoCloseCutoff,
              );

              const durationMinutes = Math.max(
                0,
                Math.round(
                  (finalEndTime.getTime() - startTimestamp.getTime()) /
                    (60 * 1000),
                ),
              );

              const batch = db.batch();
              for (const ciDoc of workdayCheckInsSnap.docs) {
                const ciData = ciDoc.data();
                if (ciData.checkOutTime) continue;
                const checkInDate = ciData.checkInTime?.toDate
                  ? ciData.checkInTime.toDate()
                  : new Date(ciData.checkInTime);
                const checkOutDate =
                  checkInDate > finalEndTime ? checkInDate : finalEndTime;
                batch.update(ciDoc.ref, {
                  checkOutTime: Timestamp.fromDate(checkOutDate),
                  durationMinutes: Math.max(
                    0,
                    Math.round(
                      (checkOutDate.getTime() - checkInDate.getTime()) / 60000,
                    ),
                  ),
                  autoClosed: true,
                  autoCloseReason:
                    "Autocierre automático por fin de jornada (>12h)",
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }

              batch.update(workdayDoc.ref, {
                status: "completed",
                endTime: Timestamp.fromDate(finalEndTime),
                totalMinutes: durationMinutes,
                autoClosed: true,
                autoCloseReason: autoCloseReason,
                autoCloseNote: autoCloseNote,
                retroactiveClosed: true,
                updatedAt: FieldValue.serverTimestamp(),
              });
              await batch.commit();

              await sendPushNotification(
                userId,
                "Jornada auto-cerrada",
                `Tu jornada se ha cerrado automáticamente. ${autoCloseNote}`,
                "auto_close_12h",
              );

              logger.info(
                `[Jornada ${workdayId}] Autocierre completado con éxito. Duración: ${durationMinutes}m. Nota: ${autoCloseNote}`,
              );

              // Finalizamos el procesamiento de esta jornada ya cerrada
              return;
            }

            // -----------------------------------------------------------
            // CHECK 1: Jornada > 10 horas activa
            // -----------------------------------------------------------
            if (workdayHours >= LONG_WORKDAY_THRESHOLD_HOURS) {
              const alreadySent = await wasReminderSentRecently(
                userId,
                "long_workday_10h",
                workdayId,
              );
              if (!alreadySent) {
                const roundedHours = Math.floor(workdayHours);
                await sendPushNotification(
                  userId,
                  "Jornada muy larga",
                  `Tu jornada lleva ${roundedHours}h activa. ¿Has terminado de trabajar?`,
                  "long_workday_10h",
                );
                await recordReminderSent(userId, "long_workday_10h", workdayId);
                logger.info(
                  `[Jornada ${workdayId}] Enviado recordatorio long_workday_10h (${roundedHours}h)`,
                );
              } else {
                logger.info(
                  `[Jornada ${workdayId}] Recordatorio long_workday_10h ya enviado recientemente.`,
                );
              }
            }

            // -----------------------------------------------------------
            // CHECK 2: Check-ins activos de más de 5 horas
            // -----------------------------------------------------------
            const activeCheckInsSnap = await db
              .collection(`companies/${companyId}/checkIns`)
              .where("userId", "==", userId)
              .where("checkOutTime", "==", null)
              .get();

            const activeCheckIns = activeCheckInsSnap.docs;

            for (const checkInDoc of activeCheckIns) {
              const checkIn = checkInDoc.data();
              const checkInHours = hoursElapsed(checkIn.checkInTime);

              if (checkInHours >= LONG_CHECKIN_THRESHOLD_HOURS) {
                const alreadySent = await wasReminderSentRecently(
                  userId,
                  "long_checkin_5h",
                  workdayId,
                );
                if (!alreadySent) {
                  const communityName = await getCommunityName(
                    companyId,
                    checkIn.communityId,
                  );
                  const roundedHours = Math.floor(checkInHours);
                  await sendPushNotification(
                    userId,
                    "Check-in muy largo",
                    `Llevas ${roundedHours}h fichado en ${communityName}. ¿Has terminado?`,
                    "long_checkin_5h",
                    checkIn.scheduledServiceId || null,
                  );
                  await recordReminderSent(
                    userId,
                    "long_checkin_5h",
                    workdayId,
                  );
                  logger.info(
                    `[Jornada ${workdayId}] Enviado recordatorio long_checkin_5h (${roundedHours}h en ${communityName})`,
                  );
                }
                break; // Solo enviamos un recordatorio de check-in largo por usuario
              }
            }

            // -----------------------------------------------------------
            // CHECK 3: Jornada > 30 min sin ningún check-in activo y con servicios pendientes
            // -----------------------------------------------------------
            if (
              workdayMinutes >= NO_CHECKIN_THRESHOLD_MIN &&
              activeCheckIns.length === 0
            ) {
              // Verificar si tiene servicios pendientes hoy
              const pendingServicesSnap = await db
                .collection(`companies/${companyId}/scheduledServices`)
                .where("assignedUserId", "==", userId)
                .where("status", "==", "pending")
                .where("scheduledDate", ">=", startOfDay)
                .where("scheduledDate", "<=", endOfDay)
                .get();

              if (!pendingServicesSnap.empty) {
                const alreadySent = await wasReminderSentRecently(
                  userId,
                  "no_checkin_30min",
                  workdayId,
                );
                if (!alreadySent) {
                  await sendPushNotification(
                    userId,
                    "Recuerda fichar",
                    "Llevas 30 min con la jornada activa. Abre la app cerca de tu próximo servicio para que registre tu llegada.",
                    "no_checkin_30min",
                  );
                  await recordReminderSent(
                    userId,
                    "no_checkin_30min",
                    workdayId,
                  );
                  logger.info(
                    `[Jornada ${workdayId}] Enviado recordatorio no_checkin_30min (${pendingServicesSnap.size} servicios pendientes)`,
                  );
                } else {
                  logger.info(
                    `[Jornada ${workdayId}] Recordatorio no_checkin_30min ya enviado recientemente.`,
                  );
                }
              } else {
                logger.info(
                  `[Jornada ${workdayId}] Sin check-ins activos pero sin servicios pendientes hoy.`,
                );
              }
            }
          } catch (userError) {
            // No dejamos que un error de un usuario rompa el procesamiento de los demás
            logger.error(
              `[Jornada ${workdayId}] Error procesando usuario ${userId}:`,
              userError,
            );
          }
        },
      );

      await Promise.all(processingPromises);
      logger.info("=== checkWorkdayReminders: Ejecución completada ===");
    } catch (error) {
      logger.error("Error fatal en checkWorkdayReminders:", error);
      throw error;
    }
  },
);

// ============================================================================
// FUNCIÓN 2: cleanupStaleFcmTokens
// Ejecuta diariamente a las 3:00 AM (Europe/Madrid). Elimina tokens FCM
// que no se han actualizado en más de 60 días.
// ============================================================================

exports.cleanupStaleFcmTokens = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Europe/Madrid",
    region: "europe-west1",
    memory: "128MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    logger.info("=== cleanupStaleFcmTokens: Inicio de ejecución ===");

    try {
      const cutoffDate = new Date(
        Date.now() - FCM_TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      );
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      logger.info(
        `Eliminando tokens FCM no actualizados desde: ${cutoffDate.toISOString()}`,
      );

      const staleTokensSnap = await db
        .collection("fcmTokens")
        .where("updatedAt", "<", cutoffTimestamp)
        .get();

      if (staleTokensSnap.empty) {
        logger.info("No se encontraron tokens FCM obsoletos.");
        return;
      }

      logger.info(
        `Encontrados ${staleTokensSnap.size} token(s) FCM obsoleto(s). Eliminando...`,
      );

      // Eliminar en lotes de 500 (límite de Firestore batch)
      const batchSize = 500;
      const docs = staleTokensSnap.docs;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger.info(
          `Eliminados ${chunk.length} tokens (lote ${Math.floor(i / batchSize) + 1})`,
        );
      }

      // También limpiar recordatorios de push antiguos (más de 7 días)
      const reminderCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const reminderCutoffTimestamp = Timestamp.fromDate(reminderCutoff);

      const oldRemindersSnap = await db
        .collection("sentPushReminders")
        .where("sentAt", "<", reminderCutoffTimestamp)
        .get();

      if (!oldRemindersSnap.empty) {
        logger.info(
          `Limpiando ${oldRemindersSnap.size} recordatorio(s) de push antiguos...`,
        );
        const reminderDocs = oldRemindersSnap.docs;
        for (let i = 0; i < reminderDocs.length; i += batchSize) {
          const batch = db.batch();
          const chunk = reminderDocs.slice(i, i + batchSize);
          chunk.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      }

      logger.info("=== cleanupStaleFcmTokens: Ejecución completada ===");
    } catch (error) {
      logger.error("Error fatal en cleanupStaleFcmTokens:", error);
      throw error;
    }
  },
);

// ============================================================================
// FUNCIÓN 3: onGpsNotificationCreated
// Trigger Firestore: envía FCM para avisos GPS y avisos administrativos
// inmediatos. Los avisos de inicio/fin de jornada esperan su evento.
// ============================================================================

exports.onGpsNotificationCreated = onDocumentCreated(
  {
    document: "companies/{companyId}/systemNotifications/{notifId}",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const triggerEvent = data.triggerEvent || "immediate";
    if (!shouldSendPushNotification(triggerEvent)) return;

    const { userId, title, body, type, serviceId } = data;
    if (!userId || !title) return;

    logger.info(
      `[Notification Push] Aviso ${triggerEvent} detectado para ${userId}: ${title}`,
    );

    try {
      const tokens = await getUserFcmTokens(userId, event.params.companyId);

      if (tokens.length === 0) {
        logger.warn(
          `[GPS Push] Usuario ${userId} no tiene tokens FCM. No se puede enviar push.`,
        );
        return;
      }

      const invalidTokens = [];

      const sendPromises = tokens.map(async (token) => {
        try {
          const message = {
            token,
            notification: { title, body: body || "" },
            data: {
              type: type || "info",
              userId,
              serviceId: serviceId || "",
              triggerEvent,
              targetUrl: data.targetUrl || "",
            },
            android: {
              priority: "high",
              notification: {
                channelId: "ryb_gps_alerts",
                sound: "default",
                priority: "high",
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
                "apns-push-type": "alert",
              },
              payload: {
                aps: {
                  alert: { title, body: body || "" },
                  sound: "default",
                  badge: 1,
                  "content-available": 1,
                },
              },
            },
            webpush: {
              headers: {
                Urgency: "high",
              },
              notification: {
                title,
                body: body || "",
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                vibrate: [200, 100, 200, 100, 200],
                requireInteraction: true,
                tag: `${triggerEvent}-${serviceId || event.params.notifId}`,
              },
            },
          };

          await messaging.send(message);
          logger.info(
            `[GPS Push] Enviado a token ${token.substring(0, 20)}... para ${userId}`,
          );
        } catch (error) {
          if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered" ||
            error.code === "messaging/invalid-argument"
          ) {
            logger.warn(
              `[GPS Push] Token inválido: ${token.substring(0, 20)}...`,
            );
            invalidTokens.push(token);
          } else {
            logger.error(
              `[GPS Push] Error enviando a ${token.substring(0, 20)}...:`,
              error,
            );
          }
        }
      });

      await Promise.all(sendPromises);

      // Limpiar tokens inválidos
      if (invalidTokens.length > 0) {
        const deletePromises = invalidTokens.map(async (token) => {
          const tokenSnap = await db
            .collectionGroup("fcmTokens")
            .where("token", "==", token)
            .get();
          const batch = db.batch();
          tokenSnap.docs.forEach((doc) => batch.delete(doc.ref));
          return batch.commit();
        });
        await Promise.all(deletePromises);
      }

      logger.info(
        `[GPS Push] Completado para ${userId}: ${tokens.length} dispositivo(s)`,
      );
    } catch (error) {
      logger.error(
        `[GPS Push] Error procesando notificación GPS para ${userId}:`,
        error,
      );
    }
  },
);

/**
 * Convierte cada llegada/salida persistida por un operario en una notificación
 * para los administradores activos del mismo tenant. Los IDs deterministas
 * evitan duplicados si Firestore reintenta el evento.
 */
exports.onGeoDetectionCreated = onDocumentCreated(
  {
    document: "companies/{companyId}/geoDetections/{detectionId}",
    region: "europe-west1",
  },
  async (event) => {
    const detection = event.data?.data();
    if (!detection || !["entry", "exit"].includes(detection.type)) return;

    const { companyId, detectionId } = event.params;
    const [userSnap, adminsSnap] = await Promise.all([
      db.doc(`users/${detection.userId}`).get(),
      db
        .collection("users")
        .where("companyId", "==", companyId)
        .where("role", "==", "admin")
        .where("active", "==", true)
        .get(),
    ]);

    if (adminsSnap.empty) {
      logger.warn("Detección GPS sin administradores activos", {
        companyId,
        detectionId,
      });
      return;
    }

    const user = userSnap.data() || {};
    const userName = user.name || user.email || detection.userId;
    const isEntry = detection.type === "entry";
    const title = `${isEntry ? "Llegada" : "Salida"} detectada: ${detection.communityName || "Comunidad"}`;
    const detectedAt = detection.detectedAt?.toDate?.() || new Date();
    const time = detectedAt.toLocaleTimeString("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      minute: "2-digit",
    });
    const distance =
      isEntry && Number.isFinite(detection.distance)
        ? ` (${Math.round(detection.distance)}m)`
        : "";
    const body = `${userName} ${isEntry ? "llegó a" : "salió de"} ${detection.communityName || "la comunidad"} a las ${time}${distance}.`;

    const batch = db.batch();
    adminsSnap.docs.forEach((adminDoc) => {
      const notificationRef = db.doc(
        `companies/${companyId}/systemNotifications/geo_${detectionId}_${adminDoc.id}`,
      );
      batch.set(notificationRef, {
        userId: adminDoc.id,
        title,
        body,
        type: isEntry ? "success" : "warning",
        serviceId: detection.serviceId || null,
        targetUrl: "/admin",
        triggerEvent: "push_only",
        source: "geo_detection",
        detectionId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    logger.info("Notificaciones GPS creadas para administradores", {
      companyId,
      detectionId,
      adminCount: adminsSnap.size,
      type: detection.type,
    });
  },
);

/**
 * Emite una o varias facturas exclusivamente desde el backend.
 *
 * - Modo tradicional: numera y bloquea la factura sin crear registro fiscal.
 * - Modo VERI*FACTU de pruebas: crea además un registro fiscal inmutable,
 *   calcula la huella y encadena el registro con el anterior.
 *
 * Esta fase no remite todavía registros a la AEAT.
 */
exports.emitInvoices = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para emitir facturas.",
      );
    }

    const invoiceIds = request.data?.invoiceIds;
    if (
      !Array.isArray(invoiceIds) ||
      invoiceIds.length === 0 ||
      invoiceIds.length > 100
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Debes indicar entre 1 y 100 facturas.",
      );
    }

    const uniqueInvoiceIds = [...new Set(invoiceIds)];
    if (
      uniqueInvoiceIds.length !== invoiceIds.length ||
      uniqueInvoiceIds.some(
        (id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "La lista contiene identificadores de factura no válidos o repetidos.",
      );
    }

    const companyId = String(request.auth.token.companyId || "").trim();
    if (!companyId) {
      throw new HttpsError(
        "permission-denied",
        "El usuario no tiene una empresa asociada.",
      );
    }
    await assertTenantEnabled(companyId);

    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userData = userSnap.data();
    if (
      !userSnap.exists ||
      userData.role !== "admin" ||
      userData.active !== true ||
      userData.companyId !== companyId
    ) {
      throw new HttpsError(
        "permission-denied",
        "No tienes permisos para emitir facturas de esta empresa.",
      );
    }

    const settingsRef = db
      .collection(`companies/${companyId}/settings`)
      .doc("billing");
    const invoiceRefs = uniqueInvoiceIds.map((id) =>
      db.collection(`companies/${companyId}/invoices`).doc(id),
    );
    const fiscalRecordRefs = uniqueInvoiceIds.map((id) =>
      db.collection(`companies/${companyId}/fiscalRecords`).doc(`alta_${id}`),
    );
    const submissionRefs = uniqueInvoiceIds.map((id) =>
      db.collection(`companies/${companyId}/aeatSubmissions`).doc(`alta_${id}`),
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const settingsSnap = await transaction.get(settingsRef);
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const verifactuEnabled = settings.verifactuEnabled === true;
        const aeatProfile = normalizeAeatConnectionProfile(
          settings.aeatConnection || {},
        );

        const [invoiceSnaps, fiscalRecordSnaps] = await Promise.all([
          Promise.all(invoiceRefs.map((ref) => transaction.get(ref))),
          verifactuEnabled
            ? Promise.all(fiscalRecordRefs.map((ref) => transaction.get(ref)))
            : Promise.resolve([]),
        ]);

        const entries = invoiceSnaps.map((snap, index) => ({
          snap,
          ref: invoiceRefs[index],
          fiscalRef: fiscalRecordRefs[index],
          submissionRef: submissionRefs[index],
          fiscalSnap: fiscalRecordSnaps[index] || null,
        }));

        entries.forEach(({ snap, fiscalSnap }) => {
          if (!snap.exists) {
            throw new HttpsError("not-found", "Una de las facturas no existe.");
          }
          const invoice = snap.data();
          if (invoice.status !== "draft") {
            throw new HttpsError(
              "failed-precondition",
              "Solo se pueden emitir facturas que estén en borrador.",
            );
          }
          if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
            throw new HttpsError(
              "failed-precondition",
              "Una factura no contiene conceptos facturables.",
            );
          }
          if (fiscalSnap?.exists) {
            throw new HttpsError(
              "already-exists",
              "La factura ya tiene un registro fiscal asociado.",
            );
          }
        });

        entries.sort((a, b) => {
          const aMillis = a.snap.data().createdAt?.toMillis?.() || 0;
          const bMillis = b.snap.data().createdAt?.toMillis?.() || 0;
          return aMillis - bMillis || a.snap.id.localeCompare(b.snap.id);
        });

        const legacyNextSequence = Math.max(
          1,
          Number.parseInt(settings.nextInvoiceSeq, 10) || 1,
        );
        const seriesCounters = { ...(settings.seriesCounters || {}) };
        let previousFiscalRecordId = settings.lastFiscalRecordId || null;
        // Las huellas antiguas creadas en navegador no tienen un registro fiscal
        // inmutable asociado. La nueva cadena solo continúa si existe ese registro.
        let previousHash = previousFiscalRecordId
          ? settings.lastInvoiceHash || ""
          : "";
        const issuerNif = String(settings.nif || "").trim();
        const now = new Date();
        const issueDate = getIssueDate(settings, now);
        if (Number.isNaN(issueDate.getTime())) {
          throw new HttpsError(
            "failed-precondition",
            "La fecha de emisión configurada no es válida.",
          );
        }
        const issueDateTimestamp = Timestamp.fromDate(issueDate);
        const dueDateTimestamp = Timestamp.fromDate(
          new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        );
        const emitted = [];

        if (verifactuEnabled && !issuerNif) {
          throw new HttpsError(
            "failed-precondition",
            "Configura el NIF de la empresa antes de activar VeriFactu.",
          );
        }

        entries.forEach(({ snap, ref, fiscalRef, submissionRef }, index) => {
          const invoice = snap.data();
          const invoiceType = resolveInvoiceType(invoice);
          const series = resolveInvoiceSeries(settings, invoice);
          const seriesKey = series || "__default";
          const nextSequence = Math.max(
            1,
            Number.parseInt(
              seriesCounters[seriesKey],
              10,
            ) || (series ? 1 : legacyNextSequence),
          );
          const fiscalTotals = calculateInvoiceFiscalTotals(
            invoice.items,
            invoice.taxRate ?? 21,
          );
          if (
            fiscalTotals.items.some(
              (item) =>
                !item.description ||
                !Number.isFinite(item.quantity) ||
                !Number.isFinite(item.price),
            ) ||
            !Number.isFinite(fiscalTotals.totalAmount)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Una factura contiene conceptos o importes fiscales no válidos.",
            );
          }
          if (invoiceType.startsWith("R")) {
            const method = String(invoice.rectification?.method || "");
            if (!["I", "S"].includes(method) || !invoice.rectification?.reason) {
              throw new HttpsError(
                "failed-precondition",
                "La factura rectificativa debe indicar motivo y método.",
              );
            }
            if (
              method === "S" &&
              (!Number.isFinite(
                Number(invoice.rectification?.rectifiedBase),
              ) ||
                !Number.isFinite(
                  Number(invoice.rectification?.rectifiedTax),
                ))
            ) {
              throw new HttpsError(
                "failed-precondition",
                "La rectificación por sustitución requiere base y cuota rectificadas.",
              );
            }
          }
          const normalizedInvoice = {
            ...invoice,
            ...fiscalTotals,
            invoiceType,
            series,
          };
          const invoiceNumber = formatInvoiceNumber(
            settings,
            normalizedInvoice,
            nextSequence,
            series,
          );
          const generationDate = new Date(now.getTime() + index * 1000);
          const generationTimestamp = getMadridIsoTimestamp(generationDate);
          const commonInvoiceUpdate = {
            status: "pending",
            invoiceStatus: "issued",
            paymentStatus: "pending",
            invoiceNumber,
            invoiceSeq: nextSequence,
            invoiceType,
            series,
            issueDate: issueDateTimestamp,
            dueDate: dueDateTimestamp,
            emittedAt: Timestamp.fromDate(generationDate),
            emittedBy: request.auth.uid,
            emissionMode: verifactuEnabled ? "verifactu_test" : "legacy",
            verifactuEnabledAtEmission: verifactuEnabled,
            items: fiscalTotals.items,
            taxBreakdown: fiscalTotals.taxBreakdown,
            subtotal: fiscalTotals.subtotal,
            taxAmount: fiscalTotals.taxAmount,
            surchargeAmount: fiscalTotals.surchargeAmount,
            totalAmount: fiscalTotals.totalAmount,
          };

          if (verifactuEnabled) {
            const hash = computeInvoiceHash({
              idEmisorFactura: issuerNif,
              numSerieFactura: invoiceNumber,
              fechaExpedicionFactura: formatIssueDateForHash(issueDate),
              tipoFactura: invoiceType,
              cuotaTotal: Number(fiscalTotals.taxAmount || 0).toFixed(2),
              importeTotal: Number(fiscalTotals.totalAmount || 0).toFixed(2),
              huellaAnterior: previousHash,
              fechaHoraHusoGenRegistro: generationTimestamp,
            });
            const fiscalRecord = buildFiscalRecord({
              companyId,
              invoiceId: snap.id,
              invoice: normalizedInvoice,
              invoiceNumber,
              invoiceSequence: nextSequence,
              issuerNif,
              previousHash,
              previousFiscalRecordId,
              generationTimestamp,
              hash,
              issueDate: issueDateTimestamp,
              createdBy: request.auth.uid,
            });

            transaction.create(fiscalRef, {
              ...fiscalRecord,
              createdAt: Timestamp.fromDate(generationDate),
            });
            const submissionDocument = buildAeatSubmissionDocument({
              companyId,
              fiscalRecordId: fiscalRef.id,
              fiscalRecord,
              settings,
              profile: aeatProfile,
              createdBy: request.auth.uid,
              createdAt: Timestamp.fromDate(generationDate),
            });
            if (submissionDocument) {
              transaction.create(submissionRef, submissionDocument);
            }
            transaction.update(ref, {
              ...commonInvoiceUpdate,
              fiscalRecordId: fiscalRef.id,
              fiscalStatus: "generated",
              aeatStatus: submissionDocument
                ? "queued"
                : "not_connected",
              aeatSubmissionId: submissionDocument
                ? submissionRef.id
                : null,
              aeatEnvironment: "test",
              aeatProductionAccepted: false,
              tipoFactura: invoiceType,
              hash,
              previousHash,
              fechaHoraHusoGenRegistro: generationTimestamp,
            });
            previousHash = hash;
            previousFiscalRecordId = fiscalRef.id;
          } else {
            transaction.update(ref, {
              ...commonInvoiceUpdate,
              fiscalRecordId: null,
              fiscalStatus: "not_applicable",
              aeatStatus: "not_applicable",
              tipoFactura: invoiceType,
            });
          }

          emitted.push({
            id: snap.id,
            invoiceNumber,
            emissionMode: commonInvoiceUpdate.emissionMode,
          });
          seriesCounters[seriesKey] = nextSequence + 1;
        });

        const settingsUpdate = {
          nextInvoiceSeq:
            seriesCounters.__default || legacyNextSequence,
          seriesCounters,
          lastEmissionMode: verifactuEnabled ? "verifactu_test" : "legacy",
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (verifactuEnabled) {
          settingsUpdate.lastInvoiceHash = previousHash;
          settingsUpdate.lastFiscalRecordId = previousFiscalRecordId;
          appendVerifactuEvent(transaction, companyId, {
            type: "invoice_records_emitted",
            actorId: request.auth.uid,
            details: {
              count: emitted.length,
              invoiceIds: emitted.map((item) => item.id),
              lastFiscalRecordId: previousFiscalRecordId,
            },
            createdAt: Timestamp.fromDate(now),
          });
        }
        transaction.set(settingsRef, settingsUpdate, { merge: true });

        return {
          emitted,
          emissionMode: verifactuEnabled ? "verifactu_test" : "legacy",
          aeatSubmissionEnabled: false,
          aeatQueuePrepared: aeatProfile.channel !== "disabled",
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Error emitiendo facturas desde el backend", {
        companyId,
        invoiceIds: uniqueInvoiceIds,
        error: error.message,
      });
      throw new HttpsError(
        "internal",
        "No se pudieron emitir las facturas. No se ha aplicado ningún cambio.",
      );
    }
  },
);

exports.configureAeatConnection = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    let profile = normalizeAeatConnectionProfile(request.data?.profile || {});
    const verifactuEnabled = request.data?.verifactuEnabled === true;
    if (
      profile.channel === "delegated" &&
      (!profile.adviserName || !profile.adviserTaxId)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Indica el nombre y NIF del asesor o tercero autorizado.",
      );
    }
    if (
      profile.channel === "local_connector" &&
      !profile.connectorName
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Indica un nombre para identificar el conector local.",
      );
    }
    if (profile.channel === "cloud_certificate") {
      const certificateSnap = await db.doc(`companies/${companyId}/verifactuConfig/certificate`).get();
      if (!certificateSnap.exists || certificateSnap.data()?.connected !== true) {
        throw new HttpsError(
          "failed-precondition",
          "Conecta primero el certificado digital de la empresa.",
        );
      }
      profile = {
        ...profile,
        credentialsStored: true,
        schemaValidationStatus: "official_test_xsd_ready",
      };
    }

    const settingsRef = db
      .collection(`companies/${companyId}/settings`)
      .doc("billing");
    await settingsRef.set(
      {
        aeatConnection: profile,
        verifactuEnabled,
        verifactuMode: verifactuEnabled ? "test" : "disabled",
        verifactuModeUpdatedAt: FieldValue.serverTimestamp(),
        aeatConnectionUpdatedAt: FieldValue.serverTimestamp(),
        aeatConnectionUpdatedBy: request.auth.uid,
      },
      { merge: true },
    );
    await recordVerifactuEvent(companyId, {
      type: "aeat_connection_configured",
      actorId: request.auth.uid,
      channel: profile.channel,
      details: {
        verifactuEnabled,
        schemaValidationStatus: profile.schemaValidationStatus,
        credentialsStored: false,
      },
    });
    return { profile };
  },
);

exports.getAeatCertificateStatus = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const snap = await db.doc(`companies/${companyId}/verifactuConfig/certificate`).get();
    if (!snap.exists || snap.data()?.connected !== true) return { connected: false };
    const data = snap.data();
    return {
      connected: true,
      commonName: data.commonName || "",
      taxId: data.taxId || "",
      issuer: data.issuer || "",
      fingerprintSha256: data.fingerprintSha256 || "",
      validFrom: data.validFrom || "",
      validTo: data.validTo || "",
      daysRemaining: data.daysRemaining || 0,
      environment: data.environment || "test",
    };
  },
);

exports.connectAeatCertificate = onCall(
  { region: "europe-west1", memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const pfxBase64 = request.data?.pfxBase64;
    const password = request.data?.password;
    if (typeof pfxBase64 !== "string" || pfxBase64.length > Math.ceil(MAX_PFX_BYTES * 4 / 3) + 16) {
      throw new HttpsError("invalid-argument", "El certificado supera el límite permitido.");
    }

    const settingsSnap = await db.doc(`companies/${companyId}/settings/billing`).get();
    const expectedTaxId = settingsSnap.data()?.nif;
    let parsed;
    try {
      parsed = parseAndValidatePfx({ pfxBase64, password, expectedTaxId });
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }

    try {
      const secretName = await ensureTenantCertificateSecret(companyId);
      const secretPayload = Buffer.from(JSON.stringify({
        pfxBase64: parsed.pfxBuffer.toString("base64"),
        password,
      }), "utf8");
      const [version] = await secretManager.addSecretVersion({
        parent: secretName,
        payload: { data: secretPayload },
      });
      const metadata = {
        ...parsed.metadata,
        connected: true,
        environment: "test",
        secretVersion: version.name,
        connectedAt: FieldValue.serverTimestamp(),
        connectedBy: request.auth.uid,
      };
      await db.doc(`companies/${companyId}/verifactuConfig/certificate`).set(metadata);
      await db.doc(`companies/${companyId}/settings/billing`).set({
        aeatConnection: {
          channel: "cloud_certificate",
          environment: "test",
          credentialsStored: true,
          schemaValidationStatus: "official_test_xsd_ready",
          productionEnabled: false,
        },
        aeatConnectionUpdatedAt: FieldValue.serverTimestamp(),
        aeatConnectionUpdatedBy: request.auth.uid,
      }, { merge: true });
      await recordVerifactuEvent(companyId, {
        type: "aeat_certificate_connected",
        actorId: request.auth.uid,
        details: {
          taxId: parsed.metadata.taxId,
          fingerprintSha256: parsed.metadata.fingerprintSha256,
          validTo: parsed.metadata.validTo,
        },
      });
      return { connected: true, ...parsed.metadata, environment: "test" };
    } catch (error) {
      logger.error("No se pudo custodiar el certificado AEAT", { companyId, error: error.message });
      throw new HttpsError("internal", "El certificado es válido, pero no se pudo guardar de forma segura.");
    }
  },
);

exports.disconnectAeatCertificate = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const projectId = getGoogleCloudProjectId();
    const secretName = projectId
      ? `projects/${projectId}/secrets/${buildTenantSecretId(companyId)}`
      : null;
    if (secretName) {
      try {
        await secretManager.deleteSecret({ name: secretName });
      } catch (error) {
        if (Number(error.code) !== 5) throw error;
      }
    }
    await db.doc(`companies/${companyId}/verifactuConfig/certificate`).delete();
    await db.doc(`companies/${companyId}/settings/billing`).set({
      aeatConnection: {
        channel: "disabled",
        environment: "test",
        credentialsStored: false,
        productionEnabled: false,
      },
      verifactuEnabled: false,
      verifactuMode: "disabled",
      aeatConnectionUpdatedAt: FieldValue.serverTimestamp(),
      aeatConnectionUpdatedBy: request.auth.uid,
    }, { merge: true });
    await recordVerifactuEvent(companyId, {
      type: "aeat_certificate_disconnected",
      actorId: request.auth.uid,
    });
    return { connected: false };
  },
);

exports.sendAeatCloudTestSubmission = onCall(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const submissionId = String(request.data?.submissionId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) {
      throw new HttpsError("invalid-argument", "El registro de prueba no es válido.");
    }
    if (request.data?.confirmTestSend !== true) {
      throw new HttpsError("failed-precondition", "Confirma expresamente el envío al entorno de pruebas de la AEAT.");
    }

    const settingsRef = db.doc(`companies/${companyId}/settings/billing`);
    const certificateRef = db.doc(`companies/${companyId}/verifactuConfig/certificate`);
    const submissionRef = db.doc(`companies/${companyId}/aeatSubmissions/${submissionId}`);
    const [settingsSnap, certificateSnap, submissionSnap] = await Promise.all([
      settingsRef.get(),
      certificateRef.get(),
      submissionRef.get(),
    ]);
    if (!settingsSnap.exists || !submissionSnap.exists) {
      throw new HttpsError("not-found", "No se encuentra la configuración o el registro de prueba.");
    }
    const settings = settingsSnap.data() || {};
    const certificate = certificateSnap.data() || {};
    const submission = submissionSnap.data() || {};
    if (
      settings.verifactuEnabled !== true ||
      settings.verifactuMode !== "test" ||
      settings.aeatConnection?.channel !== "cloud_certificate"
    ) {
      throw new HttpsError("failed-precondition", "Guarda VeriFactu en modo de pruebas con el certificado PFX/P12.");
    }
    if (!certificateSnap.exists || certificate.connected !== true || !certificate.secretVersion) {
      throw new HttpsError("failed-precondition", "El certificado PFX/P12 no está conectado.");
    }
    if (submission.environment !== "test" || submission.productionEnabled === true) {
      throw new HttpsError("failed-precondition", "La producción permanece bloqueada.");
    }
    const sendableStatuses = new Set([
      "awaiting_sender",
      "awaiting_local_connector",
      "awaiting_cloud_sender",
      "retry_pending",
    ]);
    if (!sendableStatuses.has(submission.status)) {
      throw new HttpsError("failed-precondition", "Este registro no está pendiente de envío.");
    }
    if (Number(submission.attempts || 0) >= MAX_SUBMISSION_ATTEMPTS) {
      throw new HttpsError("failed-precondition", "El registro ha agotado los intentos permitidos.");
    }
    if (submission.recordType === "anulacion") {
      const altaSnap = await db.doc(`companies/${companyId}/aeatSubmissions/alta_${submission.invoiceId}`).get();
      const altaStatus = altaSnap.data()?.status;
      if (!altaSnap.exists || !["accepted", "accepted_with_errors"].includes(altaStatus)) {
        throw new HttpsError("failed-precondition", "Primero debe aceptarse el alta de esta factura en el entorno de pruebas.");
      }
    }

    const claimed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(submissionRef);
      if (!fresh.exists) return null;
      const data = fresh.data();
      if (
        data.environment !== "test" ||
        data.productionEnabled === true ||
        !sendableStatuses.has(data.status) ||
        Number(data.attempts || 0) >= MAX_SUBMISSION_ATTEMPTS
      ) {
        return null;
      }
      const attemptNumber = Number(data.attempts || 0) + 1;
      transaction.update(submissionRef, {
        status: "processing",
        attempts: attemptNumber,
        leaseUntil: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000),
        claimedAt: FieldValue.serverTimestamp(),
        claimedBy: request.auth.uid,
      });
      return { ...data, attemptNumber };
    });
    if (!claimed) {
      throw new HttpsError("aborted", "El registro ya no está disponible para enviarlo.");
    }

    let aeatResult;
    try {
      const fiscalSnap = await db.doc(`companies/${companyId}/fiscalRecords/${claimed.fiscalRecordId}`).get();
      if (!fiscalSnap.exists) throw new Error("No se encuentra el registro fiscal inmutable.");
      const fiscalRecord = fiscalSnap.data();
      let previousFiscalRecord = null;
      if (fiscalRecord.chain?.previousFiscalRecordId) {
        const previousSnap = await db.doc(`companies/${companyId}/fiscalRecords/${fiscalRecord.chain.previousFiscalRecordId}`).get();
        previousFiscalRecord = previousSnap.exists ? previousSnap.data() : null;
      }
      const soapXml = buildAeatOfficialSoapEnvelope(
        fiscalRecord,
        { ...settings, companyId },
        previousFiscalRecord,
      );
      const [secretVersion] = await secretManager.accessSecretVersion({
        name: certificate.secretVersion,
      });
      const secretText = secretVersion.payload?.data?.toString("utf8") || "";
      const secretPayload = JSON.parse(secretText);
      if (!secretPayload.pfxBase64 || !secretPayload.password) {
        throw new Error("El certificado custodiado no está completo.");
      }
      const httpResponse = await postSoapWithPfx({
        endpoint: AEAT_TEST_ENDPOINT,
        soapXml,
        pfx: Buffer.from(secretPayload.pfxBase64, "base64"),
        passphrase: secretPayload.password,
      });
      aeatResult = parseAeatSoapResponse(httpResponse);
    } catch (error) {
      logger.error("Fallo en el envío VeriFactu de pruebas", {
        companyId,
        submissionId,
        error: error.message,
      });
      const rawMessage = String(error.message || "No se pudo conectar con la AEAT.");
      const safeMessage = /PERMISSION_DENIED|secretmanager\.versions\.access|secretmanager\.secrets\.setIamPolicy/i.test(rawMessage)
        ? "No se pudo abrir temporalmente el certificado seguro. Vuelve a intentarlo en unos segundos."
        : rawMessage;
      aeatResult = {
        transportOk: false,
        httpStatus: 0,
        message: safeMessage.slice(0, 1500),
      };
    }

    const recordState = String(aeatResult.recordState || "").slice(0, 50);
    let status = !aeatResult.transportOk
      ? (aeatResult.permanentFailure ? "rejected" : "retry_pending")
      : recordState === "Correcto"
        ? "accepted"
        : recordState === "AceptadoConErrores"
          ? "accepted_with_errors"
          : "rejected";
    const nextAttemptAt = status === "retry_pending" && claimed.attemptNumber < MAX_SUBMISSION_ATTEMPTS
      ? Timestamp.fromDate(getNextRetryDate(claimed.attemptNumber))
      : null;
    if (status === "retry_pending" && !nextAttemptAt) status = "rejected";
    const sanitizedResponse = {
      csv: String(aeatResult.csv || "").slice(0, 100),
      code: String(aeatResult.code || "").slice(0, 100),
      message: String(aeatResult.message || "").slice(0, 1500),
      shipmentState: String(aeatResult.shipmentState || "").slice(0, 50),
      recordState,
      waitSeconds: Math.max(0, Math.min(3600, Number(aeatResult.waitSeconds) || 0)),
      httpStatus: Math.max(0, Math.min(999, Number(aeatResult.httpStatus) || 0)),
    };
    await db.runTransaction(async (transaction) => {
      transaction.update(submissionRef, {
        status,
        channel: "cloud_certificate",
        nextAttemptAt,
        leaseUntil: null,
        aeatResponse: sanitizedResponse,
        lastError: ["rejected", "retry_pending"].includes(status) ? sanitizedResponse.message : null,
        processedAt: FieldValue.serverTimestamp(),
        processedBy: "cloud_certificate",
      });
      transaction.update(db.doc(`companies/${companyId}/invoices/${claimed.invoiceId}`), {
        aeatStatus: status,
        aeatEnvironment: "test",
        aeatProductionAccepted: false,
        aeatResponseCode: sanitizedResponse.code,
        aeatCsv: sanitizedResponse.csv,
        aeatProcessedAt: FieldValue.serverTimestamp(),
      });
    });
    await recordVerifactuEvent(companyId, {
      type: "aeat_cloud_test_result_recorded",
      actorId: request.auth.uid,
      invoiceId: claimed.invoiceId,
      invoiceNumber: claimed.invoiceNumber,
      fiscalRecordId: claimed.fiscalRecordId,
      submissionId,
      channel: "cloud_certificate",
      details: { status, httpStatus: sanitizedResponse.httpStatus },
    });
    return {
      submissionId,
      status,
      environment: "test",
      productionEnabled: false,
      response: sanitizedResponse,
    };
  },
);

exports.startLocalConnectorPairing = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const settingsSnap = await db.doc(`companies/${companyId}/settings/billing`).get();
    const taxId = String(settingsSnap.data()?.nif || "").trim().toUpperCase();
    if (!taxId) {
      throw new HttpsError("failed-precondition", "Configura primero el NIF de facturación.");
    }
    const pairingCode = createPairingCode();
    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
    await db.doc(`companies/${companyId}/verifactuConfig/localConnector`).set({
      pairingCodeHash: hashConnectorCredential(pairingCode),
      pairingExpiresAt: expiresAt,
      pairingUsed: false,
      expectedTaxId: taxId,
      status: "awaiting_pairing",
      requestedAt: FieldValue.serverTimestamp(),
      requestedBy: request.auth.uid,
    }, { merge: true });
    await recordVerifactuEvent(companyId, {
      type: "local_connector_pairing_started",
      actorId: request.auth.uid,
    });
    return { companyId, pairingCode, expiresAt: expiresAt.toDate().toISOString() };
  },
);

exports.getLocalConnectorStatus = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const snap = await db.doc(`companies/${companyId}/verifactuConfig/localConnector`).get();
    if (!snap.exists) return { status: "not_connected" };
    const data = snap.data();
    const lastSeenAt = data.lastSeenAt?.toDate?.();
    const online = lastSeenAt && Date.now() - lastSeenAt.getTime() < 3 * 60 * 1000;
    return {
      status: online ? "connected" : data.status || "not_connected",
      online: Boolean(online),
      connectorName: data.connectorName || "",
      certificateSubject: data.certificateSubject || "",
      certificateThumbprint: data.certificateThumbprint || "",
      certificateValidTo: data.certificateValidTo || "",
      daysRemaining: data.daysRemaining || 0,
      aeatTestReachable: data.aeatTestReachable === true,
      lastSeenAt: lastSeenAt?.toISOString?.() || "",
    };
  },
);

exports.disconnectLocalConnector = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    await db.doc(`companies/${companyId}/verifactuConfig/localConnector`).set({
      connectorTokenHash: FieldValue.delete(),
      pairingCodeHash: FieldValue.delete(),
      pairingUsed: true,
      status: "disconnected",
      disconnectedAt: FieldValue.serverTimestamp(),
      disconnectedBy: request.auth.uid,
    }, { merge: true });
    await db.doc(`companies/${companyId}/settings/billing`).set({
      aeatConnection: {
        channel: "disabled",
        environment: "test",
        credentialsStored: false,
        productionEnabled: false,
      },
      verifactuEnabled: false,
      verifactuMode: "disabled",
      aeatConnectionUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await recordVerifactuEvent(companyId, {
      type: "local_connector_disconnected",
      actorId: request.auth.uid,
    });
    return { status: "disconnected" };
  },
);

exports.localConnectorPair = onRequest(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30, cors: false },
  async (request, response) => {
    if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
    const body = parseConnectorBody(request);
    const companyId = String(body?.companyId || "").trim();
    const pairingCode = String(body?.pairingCode || "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(companyId) || !/^[A-Z2-9]{10}$/.test(pairingCode)) {
      return response.status(400).json({ error: "invalid_pairing" });
    }
    const ref = db.doc(`companies/${companyId}/verifactuConfig/localConnector`);
    try {
      const connectorToken = randomBytes(32).toString("base64url");
      let expectedTaxId = "";
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.data();
        if (!snap.exists || data.pairingUsed === true || !data.pairingExpiresAt ||
            data.pairingExpiresAt.toMillis() < Date.now() ||
            data.pairingCodeHash !== hashConnectorCredential(pairingCode)) {
          throw new Error("invalid_pairing");
        }
        expectedTaxId = data.expectedTaxId;
        transaction.set(ref, {
          pairingUsed: true,
          pairingCodeHash: FieldValue.delete(),
          connectorTokenHash: hashConnectorCredential(connectorToken),
          status: "paired",
          pairedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      return response.status(200).json({
        connectorToken,
        companyId,
        expectedTaxId,
        environment: "test",
        heartbeatUrl: "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorHeartbeat",
        claimUrl: "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorClaim",
        resultUrl: "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorResult",
      });
    } catch {
      return response.status(401).json({ error: "invalid_or_expired_pairing" });
    }
  },
);

exports.localConnectorHeartbeat = onRequest(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30, cors: false },
  async (request, response) => {
    if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
    const body = parseConnectorBody(request);
    const authenticated = await authenticateLocalConnector(request, body);
    if (!authenticated) {
      return response.status(401).json({ error: "unauthorized" });
    }
    const { companyId, ref, data } = authenticated;
    const certificateTaxId = String(body.certificateTaxId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const expectedTaxId = String(data.expectedTaxId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (certificateTaxId !== expectedTaxId) {
      return response.status(409).json({ error: "certificate_tax_id_mismatch" });
    }
    const safeUpdate = {
      status: "connected",
      connectorName: String(body.connectorName || "Este ordenador").slice(0, 100),
      certificateSubject: String(body.certificateSubject || "").slice(0, 500),
      certificateThumbprint: String(body.certificateThumbprint || "").replace(/[^a-fA-F0-9]/g, "").slice(0, 64).toUpperCase(),
      certificateValidTo: String(body.certificateValidTo || "").slice(0, 40),
      daysRemaining: Math.max(0, Math.min(5000, Number(body.daysRemaining) || 0)),
      aeatTestReachable: body.aeatTestReachable === true,
      lastSeenAt: FieldValue.serverTimestamp(),
    };
    await ref.set(safeUpdate, { merge: true });
    await db.doc(`companies/${companyId}/settings/billing`).set({
      aeatConnection: {
        channel: "local_connector",
        environment: "test",
        connectorName: safeUpdate.connectorName,
        credentialsStored: false,
        productionEnabled: false,
        schemaValidationStatus: "official_test_xsd_ready",
      },
      aeatConnectionUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return response.status(200).json({
      ok: true,
      environment: "test",
      claimUrl: "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorClaim",
      resultUrl: "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorResult",
    });
  },
);

exports.localConnectorClaim = onRequest(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30, cors: false },
  async (request, response) => {
    if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
    const body = parseConnectorBody(request);
    const authenticated = await authenticateLocalConnector(request, body);
    if (!authenticated) return response.status(401).json({ error: "unauthorized" });
    const { companyId } = authenticated;
    const channelSettingsSnap = await db.doc(`companies/${companyId}/settings/billing`).get();
    if (channelSettingsSnap.data()?.aeatConnection?.channel !== "local_connector") {
      return response.status(409).json({
        error: "local_connector_disabled",
        job: null,
      });
    }
    const submissionsRef = db.collection(`companies/${companyId}/aeatSubmissions`);
    const candidateSnaps = [];
    for (const status of ["awaiting_local_connector", "retry_pending", "processing"]) {
      const snap = await submissionsRef.where("status", "==", status).limit(10).get();
      candidateSnaps.push(...snap.docs);
    }
    const now = Date.now();
    const candidate = candidateSnaps
      .filter((entry) => {
        const data = entry.data();
        if (data.status === "processing") {
          return data.leaseUntil?.toMillis?.() < now;
        }
        return !data.nextAttemptAt || data.nextAttemptAt.toMillis() <= now;
      })
      .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0))[0];
    if (!candidate) return response.status(200).json({ job: null, retryAfterSeconds: 30 });
    const claimed = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(candidate.ref);
      const data = fresh.data();
      if (!fresh.exists || !["awaiting_local_connector", "retry_pending", "processing"].includes(data.status)) return null;
      if (data.status === "processing" && (!data.leaseUntil || data.leaseUntil.toMillis() >= Date.now())) return null;
      if (data.nextAttemptAt && data.nextAttemptAt.toMillis() > Date.now()) return null;
      transaction.update(candidate.ref, {
        status: "processing",
        attempts: FieldValue.increment(1),
        leaseUntil: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000),
        claimedAt: FieldValue.serverTimestamp(),
      });
      return data;
    });
    if (!claimed) return response.status(200).json({ job: null, retryAfterSeconds: 10 });
    const [fiscalSnap, settingsSnap] = await Promise.all([
      db.doc(`companies/${companyId}/fiscalRecords/${claimed.fiscalRecordId}`).get(),
      db.doc(`companies/${companyId}/settings/billing`).get(),
    ]);
    if (!fiscalSnap.exists) {
      await candidate.ref.update({ status: "rejected", lastError: "Registro fiscal no encontrado", processedAt: FieldValue.serverTimestamp() });
      return response.status(500).json({ error: "missing_fiscal_record" });
    }
    const fiscalRecord = fiscalSnap.data();
    let previousFiscalRecord = null;
    if (fiscalRecord.chain?.previousFiscalRecordId) {
      const previousSnap = await db.doc(`companies/${companyId}/fiscalRecords/${fiscalRecord.chain.previousFiscalRecordId}`).get();
      previousFiscalRecord = previousSnap.exists ? previousSnap.data() : null;
    }
    const soapXml = buildAeatOfficialSoapEnvelope(
      fiscalRecord,
      { ...(settingsSnap.data() || {}), companyId },
      previousFiscalRecord,
    );
    return response.status(200).json({
      job: {
        submissionId: candidate.id,
        environment: "test",
        endpoint: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
        soapAction: "",
        soapXml,
      },
    });
  },
);

exports.localConnectorResult = onRequest(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30, cors: false },
  async (request, response) => {
    if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });
    const body = parseConnectorBody(request);
    const authenticated = await authenticateLocalConnector(request, body);
    if (!authenticated) return response.status(401).json({ error: "unauthorized" });
    const { companyId } = authenticated;
    const submissionId = String(body?.submissionId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) return response.status(400).json({ error: "invalid_submission" });
    const ref = db.doc(`companies/${companyId}/aeatSubmissions/${submissionId}`);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return null;
      const submission = snap.data();
      if (submission.environment !== "test" || submission.productionEnabled === true) throw new Error("production_blocked");
      const transportOk = body.transportOk === true;
      const permanentFailure = body.permanentFailure === true;
      const recordState = String(body.recordState || "").slice(0, 50);
      const status = !transportOk
        ? (permanentFailure ? "rejected" : "retry_pending")
        : recordState === "Correcto"
          ? "accepted"
          : recordState === "AceptadoConErrores"
            ? "accepted_with_errors"
            : "rejected";
      const nextAttemptAt = status === "retry_pending" && Number(submission.attempts || 0) < MAX_SUBMISSION_ATTEMPTS
        ? Timestamp.fromDate(getNextRetryDate(Number(submission.attempts || 0)))
        : null;
      const finalStatus = status === "retry_pending" && !nextAttemptAt ? "rejected" : status;
      const aeatResponse = {
        csv: String(body.csv || "").slice(0, 100),
        code: String(body.code || "").slice(0, 100),
        message: String(body.message || "").slice(0, 1500),
        shipmentState: String(body.shipmentState || "").slice(0, 50),
        recordState,
        waitSeconds: Math.max(0, Math.min(3600, Number(body.waitSeconds) || 0)),
        httpStatus: Math.max(0, Math.min(999, Number(body.httpStatus) || 0)),
      };
      transaction.update(ref, {
        status: finalStatus,
        nextAttemptAt,
        leaseUntil: null,
        aeatResponse,
        lastError: ["rejected", "retry_pending"].includes(finalStatus) ? aeatResponse.message : null,
        processedAt: FieldValue.serverTimestamp(),
        processedBy: "local_connector",
      });
      transaction.update(db.doc(`companies/${companyId}/invoices/${submission.invoiceId}`), {
        aeatStatus: finalStatus,
        aeatEnvironment: "test",
        aeatProductionAccepted: false,
        aeatResponseCode: aeatResponse.code,
        aeatCsv: aeatResponse.csv,
        aeatProcessedAt: FieldValue.serverTimestamp(),
      });
      return { status: finalStatus };
    });
    if (!result) return response.status(404).json({ error: "not_found" });
    await recordVerifactuEvent(companyId, {
      type: "aeat_connector_result_recorded",
      actorId: "local_connector",
      submissionId,
      details: { status: result.status },
    });
    return response.status(200).json({ ok: true, ...result });
  },
);

exports.prepareAeatSubmissions = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const invoiceIds = request.data?.invoiceIds;
    if (
      !Array.isArray(invoiceIds) ||
      invoiceIds.length === 0 ||
      invoiceIds.length > 50 ||
      invoiceIds.some(
        (id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Indica entre 1 y 50 facturas válidas.",
      );
    }
    const uniqueInvoiceIds = [...new Set(invoiceIds)];
    const settingsSnap = await db
      .collection(`companies/${companyId}/settings`)
      .doc("billing")
      .get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const profile = normalizeAeatConnectionProfile(
      settings.aeatConnection || {},
    );
    if (profile.channel === "disabled") {
      throw new HttpsError(
        "failed-precondition",
        "Configura primero el canal de envío a la AEAT.",
      );
    }

    const prepared = [];
    for (const invoiceId of uniqueInvoiceIds) {
      const result = await db.runTransaction(async (transaction) => {
        const invoiceRef = db
          .collection(`companies/${companyId}/invoices`)
          .doc(invoiceId);
        const invoiceSnap = await transaction.get(invoiceRef);
        if (!invoiceSnap.exists) {
          throw new HttpsError("not-found", "Una factura no existe.");
        }
        const invoice = invoiceSnap.data();
        const fiscalRecordId =
          invoice.cancellationFiscalRecordId ||
          invoice.lastSubsanationFiscalRecordId ||
          invoice.fiscalRecordId;
        if (!fiscalRecordId) {
          throw new HttpsError(
            "failed-precondition",
            `La factura ${invoice.invoiceNumber || invoiceId} no tiene registro fiscal.`,
          );
        }
        const fiscalRef = db
          .collection(`companies/${companyId}/fiscalRecords`)
          .doc(fiscalRecordId);
        const submissionRef = db
          .collection(`companies/${companyId}/aeatSubmissions`)
          .doc(fiscalRecordId);
        const [fiscalSnap, submissionSnap] = await Promise.all([
          transaction.get(fiscalRef),
          transaction.get(submissionRef),
        ]);
        if (!fiscalSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "No se encuentra el registro fiscal inmutable.",
          );
        }
        if (submissionSnap.exists) {
          return {
            id: submissionRef.id,
            invoiceId,
            status: submissionSnap.data().status,
            existing: true,
          };
        }
        const fiscalRecord = fiscalSnap.data();
        const createdAt = Timestamp.now();
        const submissionDocument = buildAeatSubmissionDocument({
          companyId,
          fiscalRecordId,
          fiscalRecord,
          settings,
          profile,
          createdBy: request.auth.uid,
          createdAt,
        });
        transaction.create(submissionRef, submissionDocument);
        appendVerifactuEvent(transaction, companyId, {
          type: "aeat_submission_prepared",
          actorId: request.auth.uid,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          fiscalRecordId,
          submissionId: submissionRef.id,
          channel: profile.channel,
        });
        transaction.update(invoiceRef, {
          aeatSubmissionId: submissionRef.id,
          aeatStatus: "queued",
          aeatEnvironment: "test",
          aeatProductionAccepted: false,
        });
        return {
          id: submissionRef.id,
          invoiceId,
          status: submissionDocument.status,
          existing: false,
        };
      });
      prepared.push(result);
    }
    return {
      prepared,
      environment: "test",
      productionEnabled: false,
    };
  },
);

exports.getAeatSubmissionPackage = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const submissionId = String(request.data?.submissionId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) {
      throw new HttpsError("invalid-argument", "Envío no válido.");
    }
    const snap = await db
      .collection(`companies/${companyId}/aeatSubmissions`)
      .doc(submissionId)
      .get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "El envío no existe.");
    }
    const submission = snap.data();
    return {
      submissionId,
      status: submission.status,
      environment: submission.environment,
      productionEnabled: false,
      schemaValidationStatus: submission.schemaValidationStatus,
      transportXml: submission.transportXml,
      manifest: submission.manifest,
      fileName: `AEAT_PRUEBAS_${String(submission.invoiceNumber || submissionId).replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`,
    };
  },
);

exports.recordAeatTestResult = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const submissionId = String(request.data?.submissionId || "").trim();
    const status = String(request.data?.status || "").trim();
    const allowedResults = new Set([
      "accepted",
      "accepted_with_errors",
      "rejected",
      "retry_pending",
    ]);
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId) ||
      !allowedResults.has(status)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Resultado de pruebas no válido.",
      );
    }
    const response = request.data?.response || {};
    const submissionRef = db
      .collection(`companies/${companyId}/aeatSubmissions`)
      .doc(submissionId);
    return db.runTransaction(async (transaction) => {
      const submissionSnap = await transaction.get(submissionRef);
      if (!submissionSnap.exists) {
        throw new HttpsError("not-found", "El envío no existe.");
      }
      const submission = submissionSnap.data();
      if (submission.environment !== "test" || submission.productionEnabled) {
        throw new HttpsError(
          "failed-precondition",
          "Esta función solo admite resultados del entorno de pruebas.",
        );
      }
      if (!AEAT_JOB_STATUSES.has(status)) {
        throw new HttpsError("invalid-argument", "Estado no permitido.");
      }
      const now = Timestamp.now();
      const sanitizedResponse = {
        csv: String(response.csv || "").slice(0, 100),
        code: String(response.code || "").slice(0, 100),
        message: String(response.message || "").slice(0, 1000),
        presentedByTaxId: String(
          response.presentedByTaxId || "",
        )
          .toUpperCase()
          .slice(0, 20),
      };
      transaction.update(submissionRef, {
        status,
        attempts: FieldValue.increment(1),
        nextAttemptAt:
          status === "retry_pending"
            ? Timestamp.fromDate(
                getNextRetryDate(Number(submission.attempts || 0) + 1),
              )
            : null,
        aeatResponse: sanitizedResponse,
        lastError:
          status === "rejected" || status === "retry_pending"
            ? sanitizedResponse.message
            : null,
        processedAt: now,
        processedBy: request.auth.uid,
      });
      const invoiceRef = db
        .collection(`companies/${companyId}/invoices`)
        .doc(submission.invoiceId);
      transaction.update(invoiceRef, {
        aeatStatus: status,
        aeatEnvironment: "test",
        aeatProductionAccepted: false,
        aeatSubmissionId: submissionId,
        aeatResponseCode: sanitizedResponse.code,
        aeatCsv: sanitizedResponse.csv,
        aeatProcessedAt: now,
      });
      appendVerifactuEvent(transaction, companyId, {
        type: "aeat_test_result_recorded",
        actorId: request.auth.uid,
        invoiceId: submission.invoiceId,
        invoiceNumber: submission.invoiceNumber,
        fiscalRecordId: submission.fiscalRecordId,
        submissionId,
        channel: submission.channel,
        details: { status, responseCode: sanitizedResponse.code },
        createdAt: now,
      });
      return { submissionId, status };
    });
  },
);

exports.cancelInvoiceFiscalRecord = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const invoiceId = String(request.data?.invoiceId || "").trim();
    const reason = String(request.data?.reason || "").trim().slice(0, 500);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(invoiceId) || !reason) {
      throw new HttpsError(
        "invalid-argument",
        "Indica una factura y el motivo de la anulación.",
      );
    }

    const invoiceRef = db
      .collection(`companies/${companyId}/invoices`)
      .doc(invoiceId);
    const settingsRef = db
      .collection(`companies/${companyId}/settings`)
      .doc("billing");
    const cancellationRef = db
      .collection(`companies/${companyId}/fiscalRecords`)
      .doc(`anulacion_${invoiceId}`);
    const cancellationSubmissionRef = db
      .collection(`companies/${companyId}/aeatSubmissions`)
      .doc(`anulacion_${invoiceId}`);

    return db.runTransaction(async (transaction) => {
      const [invoiceSnap, settingsSnap, cancellationSnap] = await Promise.all([
        transaction.get(invoiceRef),
        transaction.get(settingsRef),
        transaction.get(cancellationRef),
      ]);
      if (!invoiceSnap.exists) {
        throw new HttpsError("not-found", "La factura no existe.");
      }
      const invoice = invoiceSnap.data();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (
        invoice.emissionMode !== "verifactu_test" ||
        !invoice.fiscalRecordId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Solo se pueden anular registros creados en modo VeriFactu de pruebas.",
        );
      }
      if (invoice.invoiceStatus === "cancelled" || cancellationSnap.exists) {
        throw new HttpsError(
          "already-exists",
          "La factura ya tiene un registro de anulación.",
        );
      }

      const generationDate = new Date();
      const generationTimestamp = getMadridIsoTimestamp(generationDate);
      const previousFiscalRecordId = settings.lastFiscalRecordId || null;
      const previousHash = previousFiscalRecordId
        ? settings.lastInvoiceHash || ""
        : "";
      const issueDate = invoice.issueDate?.toDate
        ? invoice.issueDate.toDate()
        : new Date(invoice.issueDate);
      const issuerNif = String(settings.nif || "").trim();
      const hash = computeCancellationHash({
        issuerNif,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: formatIssueDateForHash(issueDate),
        previousHash,
        generationTimestamp,
      });

      const cancellationRecord = {
        schemaVersion: "verifactu-pre-aeat-v1",
        system: {
          name: "RyB App",
          version: "0.1.0-phase4",
          producer: "Limpiezas Rayba S.L",
        },
        companyId,
        invoiceId,
        originalFiscalRecordId: invoice.fiscalRecordId,
        recordType: "anulacion",
        issuerNif,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        fechaExpedicionFactura: formatIssueDateForHash(issueDate),
        fechaHoraHusoGenRegistro: generationTimestamp,
        reason,
        chain: {
          previousFiscalRecordId,
          previousHash,
          hash,
          algorithm: "SHA-256",
        },
        fiscalStatus: "generated",
        aeatStatus: "not_connected",
        aeatSubmissionEnabled: false,
        environment: "test",
        createdBy: request.auth.uid,
        createdAt: Timestamp.fromDate(generationDate),
      };
      transaction.create(cancellationRef, cancellationRecord);
      appendVerifactuEvent(transaction, companyId, {
        type: "invoice_record_cancelled",
        actorId: request.auth.uid,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        fiscalRecordId: cancellationRef.id,
        details: { reason },
        createdAt: Timestamp.fromDate(generationDate),
      });
      const aeatProfile = normalizeAeatConnectionProfile(
        settings.aeatConnection || {},
      );
      const submissionDocument = buildAeatSubmissionDocument({
        companyId,
        fiscalRecordId: cancellationRef.id,
        fiscalRecord: cancellationRecord,
        settings,
        profile: aeatProfile,
        createdBy: request.auth.uid,
        createdAt: Timestamp.fromDate(generationDate),
      });
      if (submissionDocument) {
        transaction.create(cancellationSubmissionRef, submissionDocument);
      }
      transaction.update(invoiceRef, {
        invoiceStatus: "cancelled",
        fiscalStatus: "cancelled",
        cancellationFiscalRecordId: cancellationRef.id,
        cancellationReason: reason,
        cancelledAt: Timestamp.fromDate(generationDate),
        cancelledBy: request.auth.uid,
        aeatSubmissionId: submissionDocument
          ? cancellationSubmissionRef.id
          : invoice.aeatSubmissionId || null,
        aeatStatus: submissionDocument
          ? "queued"
          : invoice.aeatStatus || null,
      });
      transaction.set(
        settingsRef,
        {
          lastInvoiceHash: hash,
          lastFiscalRecordId: cancellationRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return {
        invoiceId,
        cancellationFiscalRecordId: cancellationRef.id,
        hash,
      };
    });
  },
);

exports.subsanateInvoiceFiscalRecord = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const companyId = await requireTenantAdmin(request);
    const invoiceId = String(request.data?.invoiceId || "").trim();
    const reason = String(request.data?.reason || "").trim().slice(0, 500);
    const corrections = request.data?.corrections || {};
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(invoiceId) || !reason) {
      throw new HttpsError(
        "invalid-argument",
        "Indica una factura y el motivo de la subsanación.",
      );
    }

    const invoiceRef = db
      .collection(`companies/${companyId}/invoices`)
      .doc(invoiceId);
    const settingsRef = db
      .collection(`companies/${companyId}/settings`)
      .doc("billing");
    const subsanationRef = db
      .collection(`companies/${companyId}/fiscalRecords`)
      .doc();
    const subsanationSubmissionRef = db
      .collection(`companies/${companyId}/aeatSubmissions`)
      .doc(subsanationRef.id);

    return db.runTransaction(async (transaction) => {
      const [invoiceSnap, settingsSnap] = await Promise.all([
        transaction.get(invoiceRef),
        transaction.get(settingsRef),
      ]);
      if (!invoiceSnap.exists) {
        throw new HttpsError("not-found", "La factura no existe.");
      }
      const invoice = invoiceSnap.data();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (
        invoice.emissionMode !== "verifactu_test" ||
        !invoice.fiscalRecordId ||
        invoice.invoiceStatus === "cancelled"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "La factura no admite una subsanación fiscal.",
        );
      }

      const correctedInvoice = {
        ...invoice,
        invoiceType: corrections.invoiceType || invoice.invoiceType,
        operationDate: corrections.operationDate || invoice.operationDate || null,
        client: {
          ...(invoice.client || {}),
          name: String(
            corrections.clientName || invoice.client?.name || "",
          ).slice(0, 200),
          cif: String(
            corrections.clientTaxId || invoice.client?.cif || "",
          ).slice(0, 30),
          idType: String(
            corrections.clientIdType || invoice.client?.idType || "NIF",
          ).slice(0, 20),
          countryCode: String(
            corrections.countryCode || invoice.client?.countryCode || "ES",
          )
            .toUpperCase()
            .slice(0, 2),
        },
      };
      const totals = calculateInvoiceFiscalTotals(
        correctedInvoice.items || [],
        correctedInvoice.taxRate ?? 21,
      );
      Object.assign(correctedInvoice, totals);

      const generationDate = new Date();
      const generationTimestamp = getMadridIsoTimestamp(generationDate);
      const previousFiscalRecordId = settings.lastFiscalRecordId || null;
      const previousHash = previousFiscalRecordId
        ? settings.lastInvoiceHash || ""
        : "";
      const issueDate = invoice.issueDate?.toDate
        ? invoice.issueDate.toDate()
        : new Date(invoice.issueDate);
      const issuerNif = String(settings.nif || "").trim();
      const invoiceType = resolveInvoiceType(correctedInvoice);
      const hash = computeInvoiceHash({
        idEmisorFactura: issuerNif,
        numSerieFactura: invoice.invoiceNumber,
        fechaExpedicionFactura: formatIssueDateForHash(issueDate),
        tipoFactura: invoiceType,
        cuotaTotal: Number(totals.taxAmount || 0).toFixed(2),
        importeTotal: Number(totals.totalAmount || 0).toFixed(2),
        huellaAnterior: previousHash,
        fechaHoraHusoGenRegistro: generationTimestamp,
      });
      const record = buildFiscalRecord({
        companyId,
        invoiceId,
        invoice: correctedInvoice,
        invoiceNumber: invoice.invoiceNumber,
        invoiceSequence: invoice.invoiceSeq,
        issuerNif,
        previousHash,
        previousFiscalRecordId,
        generationTimestamp,
        hash,
        issueDate: invoice.issueDate,
        createdBy: request.auth.uid,
      });

      const subsanationRecord = {
        ...record,
        recordType: "alta_subsanacion",
        subsanacion: true,
        correctionReason: reason,
        originalFiscalRecordId:
          invoice.lastSubsanationFiscalRecordId || invoice.fiscalRecordId,
        createdAt: Timestamp.fromDate(generationDate),
      };
      transaction.create(subsanationRef, subsanationRecord);
      appendVerifactuEvent(transaction, companyId, {
        type: "invoice_record_subsanated",
        actorId: request.auth.uid,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        fiscalRecordId: subsanationRef.id,
        details: { reason },
        createdAt: Timestamp.fromDate(generationDate),
      });
      const aeatProfile = normalizeAeatConnectionProfile(
        settings.aeatConnection || {},
      );
      const submissionDocument = buildAeatSubmissionDocument({
        companyId,
        fiscalRecordId: subsanationRef.id,
        fiscalRecord: subsanationRecord,
        settings,
        profile: aeatProfile,
        createdBy: request.auth.uid,
        createdAt: Timestamp.fromDate(generationDate),
      });
      if (submissionDocument) {
        transaction.create(
          subsanationSubmissionRef,
          submissionDocument,
        );
      }
      transaction.update(invoiceRef, {
        fiscalStatus: "subsanated",
        lastSubsanationFiscalRecordId: subsanationRef.id,
        correctedFiscalData: {
          invoiceType,
          operationDate: correctedInvoice.operationDate,
          client: correctedInvoice.client,
        },
        lastSubsanationReason: reason,
        lastSubsanationAt: Timestamp.fromDate(generationDate),
        aeatSubmissionId: submissionDocument
          ? subsanationSubmissionRef.id
          : invoice.aeatSubmissionId || null,
        aeatStatus: submissionDocument
          ? "queued"
          : invoice.aeatStatus || null,
      });
      transaction.set(
        settingsRef,
        {
          lastInvoiceHash: hash,
          lastFiscalRecordId: subsanationRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return {
        invoiceId,
        subsanationFiscalRecordId: subsanationRef.id,
        hash,
      };
    });
  },
);

exports.sendInvoiceEmails = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    // 1. Authenticate user
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para realizar esta acción.",
      );
    }

    const { invoiceIds } = request.data;
    if (!invoiceIds || !Array.isArray(invoiceIds)) {
      throw new HttpsError(
        "invalid-argument",
        "El argumento 'invoiceIds' debe ser una lista.",
      );
    }

    if (invoiceIds.length > 50) {
      throw new HttpsError(
        "invalid-argument",
        "No se pueden enviar más de 50 facturas por llamada.",
      );
    }

    for (const id of invoiceIds) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new HttpsError("invalid-argument", "ID de factura no válido.");
      }
    }

    logger.info(
      `[sendInvoiceEmails] Iniciando proceso de envío de correos para ${invoiceIds.length} facturas. Solicitado por: ${request.auth.uid}`,
    );

    const companyId = request.auth.token.companyId;
    if (!companyId) {
      throw new HttpsError(
        "permission-denied",
        "El usuario debe pertenecer a una organización (companyId faltante).",
      );
    }
    await assertTenantEnabled(companyId);

    // Verify user role is admin
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "No tienes permisos de administrador para realizar esta acción.",
      );
    }

    // Load billing settings for SMTP configuration
    const billingSettingsSnap = await db
      .collection(`companies/${companyId}/settings`)
      .doc("billing")
      .get();
    if (!billingSettingsSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "La configuración de facturación no existe.",
      );
    }
    const billingSettings = billingSettingsSnap.data();

    if (
      !billingSettings.smtpHost ||
      !billingSettings.smtpEmail ||
      !billingSettings.smtpPassword
    ) {
      throw new HttpsError(
        "failed-precondition",
        "La configuración SMTP está incompleta. Por favor configúrala en Ajustes.",
      );
    }

    // Configure Nodemailer Transport
    const transporter = nodemailer.createTransport({
      host: billingSettings.smtpHost,
      port: parseInt(billingSettings.smtpPort) || 587,
      secure: billingSettings.smtpSecure || false, // true for port 465, false for 587/others
      auth: {
        user: billingSettings.smtpEmail,
        pass: billingSettings.smtpPassword,
      },
    });

    const results = [];

    // Process each invoice
    for (const invoiceId of invoiceIds) {
      try {
        const invoiceRef = db.collection(`companies/${companyId}/invoices`).doc(invoiceId);
        const invoiceDoc = await invoiceRef.get();
        if (!invoiceDoc.exists) {
          results.push({
            id: invoiceId,
            status: "error",
            error: "La factura no existe",
          });
          continue;
        }

        const inv = invoiceDoc.data();
        if (!inv.pdfStoragePath) {
          results.push({
            id: invoiceId,
            status: "error",
            error:
              "La factura no tiene PDF generado y subido a almacenamiento.",
          });
          continue;
        }

        const rawEmails = inv.client?.email || inv.clientEmail || "";
        const emailList = rawEmails
          .split(/[,;]/)
          .map((e) => e.trim())
          .filter(Boolean);
        if (emailList.length === 0) {
          results.push({
            id: invoiceId,
            status: "error",
            error: "No hay correos destinatarios definidos para esta factura.",
          });
          continue;
        }

        // Download PDF from storage
        const bucket = getStorage().bucket();
        const file = bucket.file(inv.pdfStoragePath);

        logger.info(
          `[sendInvoiceEmails] Descargando PDF desde Storage: ${inv.pdfStoragePath}`,
        );
        const [pdfBuffer] = await file.download();

        // Prepare email variables
        const numFact = inv.invoiceNumber || "Borrador";
        const communityName = inv.client?.name || "Comunidad";
        const pdfMonthNames = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Septiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];
        const mesName = pdfMonthNames[inv.month] || "";
        const anio = String(inv.year || new Date().getFullYear());

        // Escapar variables de usuario antes de reemplazar en plantillas para evitar XSS
        const numFactEscaped = escapeHtml(numFact);
        const communityNameEscaped = escapeHtml(communityName);
        const mesNameEscaped = escapeHtml(mesName);
        const anioEscaped = escapeHtml(anio);

        const replaceTemplates = (text, isHtml = false) => {
          if (!text) return "";
          const num = isHtml ? numFactEscaped : numFact;
          const comm = isHtml ? communityNameEscaped : communityName;
          const mes = isHtml ? mesNameEscaped : mesName;
          const an = isHtml ? anioEscaped : anio;
          return text
            .replace(/{numero}/g, num)
            .replace(/{comunidad}/g, comm)
            .replace(/{mes}/g, mes)
            .replace(/{año}/g, an)
            .replace(/{a\u00f1o}/g, an);
        };

        const subject = replaceTemplates(
          billingSettings.emailSubjectTemplate ||
            "Factura {numero} - RyB Limpiezas",
          false,
        );
        const bodyHtml = replaceTemplates(
          billingSettings.emailBodyTemplate ||
            `<p>Hola,</p><p>Le adjuntamos la factura <strong>{numero}</strong> de la comunidad <strong>{comunidad}</strong>.</p>`,
          true,
        );

        // Filename format (same as browser or simple fallback)
        const filename =
          inv.pdfStoragePath.split("/").pop() || `Factura_${numFact}.pdf`;

        // Send Email
        logger.info(
          `[sendInvoiceEmails] Enviando factura ${numFact} a ${emailList.join(", ")}`,
        );
        await transporter.sendMail({
          from: `"${billingSettings.companyName || "RyB Limpiezas"}" <${billingSettings.smtpEmail}>`,
          to: emailList,
          subject: subject,
          html: bodyHtml,
          attachments: [
            {
              filename: filename,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });

        // Update invoice sent status in Firestore
        await invoiceRef.update({
          emailSent: true,
          emailSentAt: FieldValue.serverTimestamp(),
          emailSentError: null,
        });

        results.push({ id: invoiceId, status: "success" });
        logger.info(
          `[sendInvoiceEmails] Factura ${numFact} enviada correctamente.`,
        );
      } catch (err) {
        logger.error(
          `[sendInvoiceEmails] Error enviando factura ${invoiceId}:`,
          err,
        );

        // Save error status to document
        try {
          await db
            .collection(`companies/${companyId}/invoices`)
            .doc(invoiceId)
            .update({
              emailSentError: err.message || String(err),
            });
        } catch (dbErr) {
          logger.error(
            `[sendInvoiceEmails] Error actualizando error de envío en DB para ${invoiceId}:`,
            dbErr,
          );
        }

        results.push({
          id: invoiceId,
          status: "error",
          error: err.message || String(err),
        });
      }
    }

    return { results };
  },
);

exports.sendGroupedInvoiceEmails = onCall(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 240,
  },
  async (request) => {
    // 1. Authenticate user
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para realizar esta acción.",
      );
    }

    const { invoiceIds } = request.data;
    if (!invoiceIds || !Array.isArray(invoiceIds)) {
      throw new HttpsError(
        "invalid-argument",
        "El argumento 'invoiceIds' debe ser una lista.",
      );
    }

    if (invoiceIds.length > 50) {
      throw new HttpsError(
        "invalid-argument",
        "No se pueden enviar más de 50 facturas por llamada.",
      );
    }

    for (const id of invoiceIds) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new HttpsError("invalid-argument", "ID de factura no válido.");
      }
    }

    logger.info(
      `[sendGroupedInvoiceEmails] Iniciando proceso agrupado para ${invoiceIds.length} facturas. Solicitado por: ${request.auth.uid}`,
    );

    const companyId = request.auth.token.companyId;
    if (!companyId) {
      throw new HttpsError(
        "permission-denied",
        "El usuario debe pertenecer a una organización (companyId faltante).",
      );
    }
    await assertTenantEnabled(companyId);

    // Verify user role is admin
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "No tienes permisos de administrador para realizar esta acción.",
      );
    }

    // Load billing settings for SMTP configuration
    const billingSettingsSnap = await db
      .collection(`companies/${companyId}/settings`)
      .doc("billing")
      .get();
    if (!billingSettingsSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "La configuración de facturación no existe.",
      );
    }
    const billingSettings = billingSettingsSnap.data();

    if (
      !billingSettings.smtpHost ||
      !billingSettings.smtpEmail ||
      !billingSettings.smtpPassword
    ) {
      throw new HttpsError(
        "failed-precondition",
        "La configuración SMTP está incompleta. Por favor configúrala en Ajustes.",
      );
    }

    // Configure Nodemailer Transport
    const transporter = nodemailer.createTransport({
      host: billingSettings.smtpHost,
      port: parseInt(billingSettings.smtpPort) || 587,
      secure: billingSettings.smtpSecure || false,
      auth: {
        user: billingSettings.smtpEmail,
        pass: billingSettings.smtpPassword,
      },
    });

    const invoices = [];
    // Load all invoice details from database
    for (const invoiceId of invoiceIds) {
      const invoiceDoc = await db.collection(`companies/${companyId}/invoices`).doc(invoiceId).get();
      if (invoiceDoc.exists) {
        invoices.push({ id: invoiceDoc.id, ...invoiceDoc.data() });
      }
    }

    if (invoices.length === 0) {
      return { results: [], message: "No se encontraron facturas válidas." };
    }

    // Load all active administrators to resolve association names and emails
    const adminsSnap = await db
      .collection(`companies/${companyId}/administrators`)
      .where("active", "==", true)
      .get();
    const administrators = {};
    adminsSnap.forEach((doc) => {
      administrators[doc.id] = doc.data();
    });

    // Group invoices by target email destination
    const emailGroups = {};

    for (const inv of invoices) {
      if (!inv.pdfStoragePath) {
        logger.warn(
          `[sendGroupedInvoiceEmails] Factura ${inv.id} saltada por no tener PDF.`,
        );
        continue;
      }

      let targetEmails = "";
      let groupName = "";
      let isAdministrator = false;

      // Check if client has administratorId
      const adminId = inv.client?.administratorId || "";
      if (adminId && administrators[adminId]) {
        const admin = administrators[adminId];
        targetEmails = admin.email || "";
        groupName = admin.name || "Administrador";
        isAdministrator = true;
      }

      // Fallback: If no administrator or administrator has no email, use community email
      if (!targetEmails) {
        targetEmails = inv.client?.email || inv.clientEmail || "";
        groupName = inv.client?.name || "Comunidad";
        isAdministrator = false;
      }

      if (!targetEmails) {
        logger.warn(
          `[sendGroupedInvoiceEmails] Factura ${inv.id} saltada por no tener email de destino.`,
        );
        continue;
      }

      // Group by normalized email list
      const normalizedEmailKey = targetEmails
        .split(/[,;]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(",");

      if (!normalizedEmailKey) continue;

      if (!emailGroups[normalizedEmailKey]) {
        emailGroups[normalizedEmailKey] = {
          rawEmailsString: targetEmails,
          name: groupName,
          isAdministrator,
          invoices: [],
        };
      }
      emailGroups[normalizedEmailKey].invoices.push(inv);
    }

    const results = [];
    const bucket = getStorage().bucket();

    // Process each grouped destination
    for (const emailKey of Object.keys(emailGroups)) {
      const group = emailGroups[emailKey];
      const emailList = group.rawEmailsString
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean);

      try {
        const attachments = [];
        let summaryRowsHtml = "";

        // Download all PDFs for this group
        for (const inv of group.invoices) {
          logger.info(
            `[sendGroupedInvoiceEmails] Descargando PDF: ${inv.pdfStoragePath}`,
          );
          const file = bucket.file(inv.pdfStoragePath);
          const [pdfBuffer] = await file.download();
          const filename =
            inv.pdfStoragePath.split("/").pop() ||
            `Factura_${inv.invoiceNumber || "SN"}.pdf`;

          attachments.push({
            filename: filename,
            content: pdfBuffer,
            contentType: "application/pdf",
          });

          const amountFormatted =
            Number(inv.totalAmount || 0).toLocaleString("es-ES", {
              minimumFractionDigits: 2,
            }) + " €";
          summaryRowsHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 12px; font-weight: bold; color: #1e293b;">${escapeHtml(inv.client?.name || "Comunidad")}</td>
              <td style="padding: 10px 12px; text-align: center; color: #475569;">${escapeHtml(inv.invoiceNumber || "SN")}</td>
              <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #0f172a;">${escapeHtml(amountFormatted)}</td>
            </tr>
          `;
        }

        // Prepare email subject and body
        let subject = "";
        let bodyHtml = "";

        const pdfMonthNames = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Septiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];
        const firstInv = group.invoices[0];
        const mesName = pdfMonthNames[firstInv.month] || "";
        const anio = String(firstInv.year || new Date().getFullYear());

        if (group.invoices.length === 1) {
          // If only 1 invoice, use standard single-invoice subject and body
          const inv = group.invoices[0];
          const numFact = inv.invoiceNumber || "Borrador";
          const communityName = inv.client?.name || "Comunidad";

          const numFactEscaped = escapeHtml(numFact);
          const communityNameEscaped = escapeHtml(communityName);
          const mesNameEscaped = escapeHtml(mesName);
          const anioEscaped = escapeHtml(anio);

          const replaceTemplates = (text, isHtml = false) => {
            if (!text) return "";
            const num = isHtml ? numFactEscaped : numFact;
            const comm = isHtml ? communityNameEscaped : communityName;
            const mes = isHtml ? mesNameEscaped : mesName;
            const an = isHtml ? anioEscaped : anio;
            return text
              .replace(/{numero}/g, num)
              .replace(/{comunidad}/g, comm)
              .replace(/{mes}/g, mes)
              .replace(/{año}/g, an)
              .replace(/{a\u00f1o}/g, an);
          };

          subject = replaceTemplates(
            billingSettings.emailSubjectTemplate ||
              "Factura {numero} - RyB Limpiezas",
            false,
          );
          bodyHtml = replaceTemplates(
            billingSettings.emailBodyTemplate ||
              `<p>Hola,</p><p>Le adjuntamos la factura <strong>{numero}</strong> correspondiente al servicio de la comunidad <strong>{comunidad}</strong>.</p>`,
            true,
          );
        } else {
          // Grouped email layout
          subject = `Facturas Consolidadas de RyB Limpiezas - Periodo ${escapeHtml(mesName)} de ${escapeHtml(anio)}`;

          bodyHtml = `
            <div style="font-family: Arial, sans-serif; color: #334155; line-height: 1.5; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #2563eb; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">RyB Limpiezas</h2>
              <p>Estimado/a <strong>${escapeHtml(group.name)}</strong>,</p>
              <p>Le adjuntamos en este correo las facturas correspondientes a los servicios de limpieza prestados en el periodo de <strong>${escapeHtml(mesName)} de ${escapeHtml(anio)}</strong> para las comunidades bajo su administración:</p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 10px 12px; text-align: left; font-weight: bold; color: #475569;">Comunidad</th>
                    <th style="padding: 10px 12px; text-align: center; font-weight: bold; color: #475569;">Nº Factura</th>
                    <th style="padding: 10px 12px; text-align: right; font-weight: bold; color: #475569;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${summaryRowsHtml}
                </tbody>
                <tfoot>
                  <tr style="background-color: #f8fafc; border-top: 2px solid #94a3b8; font-weight: bold;">
                    <td colspan="2" style="padding: 12px; color: #1e293b;">TOTAL CONSOLIDADO</td>
                    <td style="padding: 12px; text-align: right; color: #2563eb; font-size: 16px;">
                      ${group.invoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
                    </td>
                  </tr>
                </tfoot>
              </table>
              
              <p>Quedamos a su disposición para cualquier aclaración o consulta que pueda surgir. Agradecemos su confianza en nuestros servicios.</p>
              <br/>
              <p>Atentamente,</p>
              <p><strong>RyB Limpiezas</strong><br/>
              Contacto: ${escapeHtml(billingSettings.contactPerson || "Daniel Rabaneda")}<br/>
              Teléfono: ${escapeHtml(billingSettings.phone || "687983162")}</p>
            </div>
          `;
        }

        // Send Email
        logger.info(
          `[sendGroupedInvoiceEmails] Enviando correo consolidado a: ${emailList.join(", ")} con ${attachments.length} archivos.`,
        );
        await transporter.sendMail({
          from: `"${billingSettings.companyName || "RyB Limpiezas"}" <${billingSettings.smtpEmail}>`,
          to: emailList,
          subject: subject,
          html: bodyHtml,
          attachments: attachments,
        });

        // Update sent status in Firestore for all invoices in the group
        for (const inv of group.invoices) {
          await db.collection(`companies/${companyId}/invoices`).doc(inv.id).update({
            emailSent: true,
            emailSentAt: FieldValue.serverTimestamp(),
            emailSentError: null,
          });
          results.push({ id: inv.id, status: "success" });
        }
      } catch (err) {
        logger.error(
          `[sendGroupedInvoiceEmails] Error enviando grupo de facturas a ${emailKey}:`,
          err,
        );
        for (const inv of group.invoices) {
          try {
            await db
              .collection("invoices")
              .doc(inv.id)
              .update({
                emailSentError: err.message || String(err),
              });
          } catch (dbErr) {
            logger.error(
              `[sendGroupedInvoiceEmails] Error actualizando error de envío en DB para ${inv.id}:`,
              dbErr,
            );
          }
          results.push({
            id: inv.id,
            status: "error",
            error: err.message || String(err),
          });
        }
      }
    }

    return { results };
  },
);

exports.getClientPortalData = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const { token } = request.data;
    if (
      !token ||
      typeof token !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(token)
    ) {
      throw new HttpsError("invalid-argument", "Token no válido.");
    }

    logger.info(
      `[getClientPortalData] Solicitando datos para token: ${token.substring(0, 5)}...`,
    );

    // 1. Validar el token en publicPortals usando collectionGroup
    const portalQuerySnap = await db
      .collectionGroup("publicPortals")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (portalQuerySnap.empty) {
      throw new HttpsError(
        "not-found",
        "El portal de cliente solicitado no existe o no está activo.",
      );
    }

    const portalDoc = portalQuerySnap.docs[0];
    const portalData = portalDoc.data();
    if (!portalData.isActive) {
      throw new HttpsError(
        "not-found",
        "El portal de cliente solicitado no existe o no está activo.",
      );
    }

    const { companyId, communityId } = portalData;
    await assertTenantEnabled(companyId);

    // 2. Obtener datos de la comunidad
    const communitySnap = await db
      .collection(`companies/${companyId}/communities`)
      .doc(communityId)
      .get();
    if (!communitySnap.exists || !communitySnap.data().active) {
      throw new HttpsError(
        "not-found",
        "La comunidad no existe o está inactiva.",
      );
    }

    const communityData = {
      id: communitySnap.id,
      ...communitySnap.data(),
    };

    // 3. Obtener fichajes (checkIns) de los últimos 30 días (limitado a 15 recientes)
    const checkInsSnap = await db
      .collection(`companies/${companyId}/checkIns`)
      .where("communityId", "==", communityId)
      .orderBy("checkInTime", "desc")
      .limit(15)
      .get();

    // 4. Obtener evidencias de los últimos 30 días (limitado a 15 recientes)
    const evidenceSnap = await db
      .collection(`companies/${companyId}/evidenceReports`)
      .where("communityId", "==", communityId)
      .orderBy("createdAt", "desc")
      .limit(15)
      .get();

    // 5. Obtener tareas de la comunidad
    const tasksSnap = await db
      .collection(`companies/${companyId}/communityTasks`)
      .where("communityId", "==", communityId)
      .get();

    const tasks = tasksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Filtrar fichajes y evidencias de los últimos 30 días en memoria
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const limitTime = thirtyDaysAgo.getTime();

    const rawReports = checkInsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const reports = rawReports.filter((r) => {
      const timestamp = r.checkInTime || r.createdAt;
      const time = timestamp?.toMillis
        ? timestamp.toMillis()
        : new Date(timestamp).getTime();
      return time >= limitTime;
    });

    const rawEvidence = evidenceSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const evidence = rawEvidence.filter((e) => {
      const timestamp = e.createdAt;
      const time = timestamp?.toMillis
        ? timestamp.toMillis()
        : new Date(timestamp).getTime();
      return time >= limitTime;
    });

    // 6. Obtener nombres de operarios involucrados para evitar exponer toda la plantilla de usuarios
    const operarioUids = new Set();
    reports.forEach((r) => {
      if (r.userId) operarioUids.add(r.userId);
    });
    evidence.forEach((e) => {
      if (e.userId) operarioUids.add(e.userId);
    });

    const operariosMap = {};
    if (operarioUids.size > 0) {
      const uidsArray = Array.from(operarioUids).slice(0, 30);
      const usersSnap = await db
        .collection("users")
        .where("uid", "in", uidsArray)
        .get();

      usersSnap.forEach((doc) => {
        const userData = doc.data();
        operariosMap[userData.uid] = userData.name || "Operario RyB";
      });
    }

    return {
      community: communityData,
      reports: reports,
      evidence: evidence,
      tasks: tasks,
      operariosMap: operariosMap,
    };
  },
);

/**
 * Trigger de Firestore para mantener actualizados los Custom Claims (role, active, companyId) de Firebase Auth.
 * Se ejecuta al crear, actualizar o borrar un documento en users/{uid}.
 */
exports.onUserDocumentWritten = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const uid = event.params.uid;
    const beforeData = event.data.before.exists
      ? event.data.before.data()
      : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;

    logger.log(`onUserDocumentWritten disparada para uid: ${uid}`);

    try {
      const authAdmin = getAuth();

      // Caso 1: El documento de usuario ha sido eliminado
      if (!afterData) {
        logger.log(
          `El usuario ${uid} ha sido eliminado de Firestore. Limpiando custom claims...`,
        );
        await authAdmin.setCustomUserClaims(uid, null);
        logger.log(`Custom claims limpiados exitosamente para uid: ${uid}`);
        return null;
      }

      // Caso 2: El documento de usuario ha sido creado o actualizado
      const role = afterData.role || "";
      const active = afterData.active !== false; // por defecto true si no se especifica
      const companyId = afterData.companyId || null;
      const platformAdmin =
        companyId === PLATFORM_TENANT_ID &&
        (afterData.platformAdmin === true ||
          String(afterData.email || "").trim().toLowerCase() ===
            PLATFORM_ADMIN_EMAIL.toLowerCase());
      const previousPlatformAdmin =
        beforeData?.companyId === PLATFORM_TENANT_ID &&
        (beforeData?.platformAdmin === true ||
          String(beforeData?.email || "").trim().toLowerCase() ===
            PLATFORM_ADMIN_EMAIL.toLowerCase());

      // Evitamos llamadas innecesarias si los claims ya son los mismos que antes
      if (
        beforeData &&
        beforeData.role === role &&
        beforeData.active === active &&
        beforeData.companyId === companyId &&
        previousPlatformAdmin === platformAdmin
      ) {
        logger.log(
          `No hay cambios en los claims relevantes (role: ${role}, active: ${active}, companyId: ${companyId}) para uid: ${uid}. Omitiendo actualización.`,
        );
        return null;
      }

      const claims = { role, active, platformAdmin };
      if (companyId) {
        claims.companyId = companyId;
      }

      logger.log(
        `Estableciendo custom claims para uid: ${uid} -> role: ${role}, active: ${active}, companyId: ${companyId}`,
      );
      await authAdmin.setCustomUserClaims(uid, claims);
      logger.log(`Custom claims establecidos exitosamente para uid: ${uid}`);
    } catch (error) {
      logger.error(`Error al establecer custom claims para uid ${uid}:`, error);
    }
    return null;
  },
);

// ============================================================================
// GESTION SEGURA DE USUARIOS Y CODIGOS DE ACCESO MULTI-TENANT
// ============================================================================

exports.createOperarioUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    const caller = request.auth;
    const companyId = caller?.token?.companyId;
    if (!caller || caller.token.role !== "admin" || caller.token.active !== true || !companyId) {
      throw new HttpsError("permission-denied", "Solo un administrador activo con tenant puede crear operarios.");
    }
    await assertPlanCapacity(companyId, "operarios");

    const { email, password, name, phone = "", allowDirectTransfers = false } = request.data || {};
    if (!email || !password || !name) {
      throw new HttpsError("invalid-argument", "Email, contraseña y nombre son obligatorios.");
    }

    let createdUser = null;
    try {
      createdUser = await auth.createUser({ email: String(email).trim(), password, displayName: String(name).trim() });
      const profile = {
        uid: createdUser.uid,
        name: String(name).trim(),
        email: String(email).trim(),
        phone: String(phone || "").trim(),
        role: "operario",
        active: true,
        companyId,
        allowDirectTransfers: !!allowDirectTransfers,
        createdAt: FieldValue.serverTimestamp(),
      };
      await db.collection("users").doc(createdUser.uid).set(profile);
      await auth.setCustomUserClaims(createdUser.uid, { role: "operario", active: true, companyId });
      return { uid: createdUser.uid, ...profile, createdAt: null };
    } catch (error) {
      if (createdUser) {
        await auth.deleteUser(createdUser.uid).catch((rollbackError) =>
          logger.error("No se pudo revertir el usuario tras fallar su perfil", rollbackError),
        );
      }
      logger.error("createOperarioUser failed", error);
      throw new HttpsError("internal", error.message || "No se pudo crear el operario.");
    }
  },
);

exports.completeTenantRegistration = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes autenticarte antes de completar el registro.");
    }
    const accessCode = String(request.data?.accessCode || "").trim().toUpperCase();
    const name = String(request.data?.name || "").trim();
    if (!accessCode || !name) {
      throw new HttpsError("invalid-argument", "Nombre y código de invitación son obligatorios.");
    }

    const indexSnap = await db.collection("accessCodeIndex").doc(accessCode).get();
    if (!indexSnap.exists || !indexSnap.data().companyId) {
      throw new HttpsError("permission-denied", "Código de invitación no válido.");
    }
    const companyId = indexSnap.data().companyId;
    await assertTenantEnabled(companyId);
    const codeSnap = await db.collection(`companies/${companyId}/accessCodes`).doc(accessCode).get();
    if (!codeSnap.exists || codeSnap.data().active === false) {
      throw new HttpsError("permission-denied", "Código de invitación inactivo o caducado.");
    }

    const uid = request.auth.uid;
    const existingProfile = await db.collection("users").doc(uid).get();
    if (existingProfile.exists) {
      throw new HttpsError("failed-precondition", "El usuario ya tiene un perfil asociado y no puede cambiar de tenant mediante registro.");
    }
    await assertPlanCapacity(companyId, "operarios");
    const userRecord = await auth.getUser(uid);
    const profile = {
      uid,
      name,
      email: userRecord.email || "",
      role: "operario",
      active: true,
      companyId,
      allowDirectTransfers: false,
      createdAt: FieldValue.serverTimestamp(),
    };
    await db.collection("users").doc(uid).set(profile, { merge: false });
    await auth.setCustomUserClaims(uid, { role: "operario", active: true, companyId });
    return { companyId };
  },
);

async function callerCanManageServiceCompanion({
  companyId,
  serviceData,
  callerUid,
  companionId,
  callerRole,
  operation,
}) {
  if (callerRole === "admin" || serviceData.assignedUserId === callerUid) {
    return true;
  }

  if (operation === "remove" && companionId === callerUid) {
    return true;
  }

  if (operation !== "add" || companionId !== callerUid) {
    return false;
  }

  if (
    (serviceData.companionIds || []).includes(callerUid) ||
    (serviceData.participantIds || []).includes(callerUid)
  ) {
    return true;
  }

  const activeWorkdays = await db
    .collection(`companies/${companyId}/workdays`)
    .where("userId", "==", serviceData.assignedUserId)
    .where("status", "==", "active")
    .limit(5)
    .get();
  return activeWorkdays.docs.some(
    (workday) => workday.data().currentCompanionId === callerUid,
  );
}

exports.addServiceCompanion = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    const { companyId, user } = await requireActiveTenantEmployee(request);
    const serviceId = String(request.data?.serviceId || "").trim();
    const companionId = String(request.data?.companionId || "").trim();
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(serviceId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(companionId)
    ) {
      throw new HttpsError("invalid-argument", "Servicio o acompañante no válido.");
    }

    const [serviceSnap, companionSnap] = await Promise.all([
      db.collection(`companies/${companyId}/scheduledServices`).doc(serviceId).get(),
      db.collection("users").doc(companionId).get(),
    ]);
    if (!serviceSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado.");
    }
    const companion = companionSnap.data();
    if (
      !companionSnap.exists ||
      companion.companyId !== companyId ||
      companion.active !== true ||
      !["admin", "operario"].includes(companion.role)
    ) {
      throw new HttpsError("invalid-argument", "El acompañante no está activo en esta empresa.");
    }

    const serviceData = serviceSnap.data();
    const authorized = await callerCanManageServiceCompanion({
      companyId,
      serviceData,
      callerUid: request.auth.uid,
      companionId,
      callerRole: user.role,
      operation: "add",
    });
    if (!authorized) {
      throw new HttpsError("permission-denied", "No puedes modificar los acompañantes de este servicio.");
    }

    const companionIds = [...new Set([...(serviceData.companionIds || []), companionId])];
    const participantIds = [...new Set([...(serviceData.participantIds || []), companionId])];
    const companionLogs = [...(serviceData.companionLogs || [])];
    if (!companionLogs.some((log) => log.userId === companionId && !log.leftAt)) {
      companionLogs.push({ userId: companionId, joinedAt: new Date().toISOString() });
    }
    await serviceSnap.ref.update({
      companionIds,
      participantIds,
      companionLogs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  },
);

exports.removeServiceCompanion = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    const { companyId, user } = await requireActiveTenantEmployee(request);
    const serviceId = String(request.data?.serviceId || "").trim();
    const companionId = String(request.data?.companionId || "").trim();
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(serviceId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(companionId)
    ) {
      throw new HttpsError("invalid-argument", "Servicio o acompañante no válido.");
    }

    const serviceRef = db.collection(`companies/${companyId}/scheduledServices`).doc(serviceId);
    const serviceSnap = await serviceRef.get();
    if (!serviceSnap.exists) {
      throw new HttpsError("not-found", "Servicio no encontrado.");
    }
    const serviceData = serviceSnap.data();
    const authorized = await callerCanManageServiceCompanion({
      companyId,
      serviceData,
      callerUid: request.auth.uid,
      companionId,
      callerRole: user.role,
      operation: "remove",
    });
    if (!authorized) {
      throw new HttpsError("permission-denied", "No puedes modificar los acompañantes de este servicio.");
    }

    const companionIds = (serviceData.companionIds || []).filter((id) => id !== companionId);
    const participantIds = [...(serviceData.participantIds || [])];
    if (serviceData.status === "completed" && !participantIds.includes(companionId)) {
      participantIds.push(companionId);
    }
    const companionLogs = (serviceData.companionLogs || []).map((log) =>
      log.userId === companionId && !log.leftAt
        ? { ...log, leftAt: new Date().toISOString() }
        : log,
    );
    await serviceRef.update({
      companionIds,
      participantIds,
      companionLogs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  },
);

exports.onTenantAccessCodeWritten = onDocumentWritten(
  "companies/{companyId}/accessCodes/{code}",
  async (event) => {
    const { companyId, code } = event.params;
    const indexRef = db.collection("accessCodeIndex").doc(code);
    if (event.data.after.exists && event.data.after.data().active !== false) {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(indexRef);
        if (current.exists && current.data().companyId !== companyId) {
          throw new Error(`El código ${code} ya pertenece a otro tenant.`);
        }
        transaction.set(indexRef, { companyId, active: true }, { merge: false });
      });
      return;
    }
    const current = await indexRef.get();
    if (current.exists && current.data().companyId === companyId) {
      await indexRef.delete();
    }
  },
);

// ============================================================================
// SISTEMA DE GEOLOCALIZACIÓN Y FICHAJES SEGUROS
// ============================================================================

/**
 * Calcula la distancia entre dos coordenadas usando la fórmula de Haversine.
 */
exports.createTenantCommunity = onCall(
  { region: "europe-west1" },
  async (request) => {
    const caller = request.auth;
    const companyId = caller?.token?.companyId;
    if (
      !caller ||
      caller.token.role !== "admin" ||
      caller.token.active !== true ||
      !companyId
    ) {
      throw new HttpsError(
        "permission-denied",
        "Solo un administrador puede crear comunidades.",
      );
    }
    if (companyId === PLATFORM_TENANT_ID) {
      const companyRef = db.collection("companies").doc(companyId);
      await db.runTransaction(async (transaction) => {
        const companySnap = await transaction.get(companyRef);
        if (!companySnap.exists) {
          transaction.create(companyRef, {
            name: "Limpiezas Rayba",
            status: "active",
            plan: "enterprise",
            subscriptionStatus: "legacy",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    }
    await assertPlanCapacity(companyId, "communities");
    const data = request.data?.community;
    if (!data || typeof data !== "object") {
      throw new HttpsError("invalid-argument", "Los datos de la comunidad son obligatorios.");
    }
    const name = String(data.name || "").trim();
    if (!name || name.length > 200) {
      throw new HttpsError("invalid-argument", "El nombre de la comunidad no es válido.");
    }
    const allowedFields = [
      "name", "address", "type", "contactPerson", "contactPhone",
      "preferredTime", "individualTimeTracking", "billingCif",
      "billingAddress", "basePrice", "paymentMethod", "billingEmail",
      "billingIban", "billingMandateRef", "billingMandateDate",
      "administratorId", "geofenceRadiusMeters",
      "exitGeofenceRadiusMeters", "entryConfirmDelaySeconds",
      "exitConfirmDelaySeconds", "autoCloseOnExit", "active",
    ];
    const cleanData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) cleanData[field] = data[field];
    }
    cleanData.name = name;
    cleanData.active = data.active !== false;
    cleanData.location = new GeoPoint(
      Number(data.lat) || 0,
      Number(data.lng) || 0,
    );
    cleanData.createdAt = FieldValue.serverTimestamp();
    cleanData.createdBy = caller.uid;
    const ref = await db.collection(`companies/${companyId}/communities`).add(cleanData);
    return { id: ref.id };
  },
);

const COMPANY_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const COMPANY_REQUEST_MAX_PER_WINDOW = 3;
const COMPANY_TRIAL_WINDOW_MS = 60 * 60 * 1000;
const COMPANY_TRIAL_MAX_PER_WINDOW = 5;

function normalizeCompanyRequestText(value, maximumLength) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

async function findAvailableCompanyId(companyName) {
  const base = normalizeCompanyId(companyName);
  const candidates = [base];
  for (let index = 0; index < 5; index += 1) {
    candidates.push(
      `${base.slice(0, 39)}-${randomBytes(4).toString("hex")}`,
    );
  }
  for (const candidate of candidates) {
    const snapshot = await db.collection("companies").doc(candidate).get();
    if (!snapshot.exists) return candidate;
  }
  throw new HttpsError(
    "resource-exhausted",
    "No se pudo reservar un identificador para la empresa. Inténtalo de nuevo.",
  );
}

exports.registerCompanyTrial = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    if (request.auth) {
      throw new HttpsError(
        "failed-precondition",
        "Cierra la sesión actual antes de crear una empresa nueva.",
      );
    }

    const companyName = normalizeCompanyRequestText(request.data?.companyName, 120);
    const contactName = normalizeCompanyRequestText(request.data?.contactName, 120);
    const email = normalizeCompanyRequestText(request.data?.email, 199).toLowerCase();
    const phone = normalizeCompanyRequestText(request.data?.phone, 49);
    const operariosCount = normalizeCompanyRequestText(request.data?.operariosCount, 30);
    const message = normalizeCompanyRequestText(request.data?.message, 1000);
    const website = normalizeCompanyRequestText(request.data?.website, 200);
    const password = String(request.data?.password || "");
    const privacyAccepted = request.data?.privacyAccepted === true;
    const plan = normalizePlan(request.data?.plan || "starter");

    if (website) return { accepted: false };
    if (!companyName || !contactName || !email || !password || !privacyAccepted) {
      throw new HttpsError(
        "invalid-argument",
        "Completa los campos obligatorios y acepta la política de privacidad.",
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "El correo electrónico no es válido.");
    }
    if (phone && !/^[+0-9() .-]{6,49}$/.test(phone)) {
      throw new HttpsError("invalid-argument", "El teléfono no es válido.");
    }
    if (password.length < 10 || password.length > 128) {
      throw new HttpsError(
        "invalid-argument",
        "La contraseña debe tener entre 10 y 128 caracteres.",
      );
    }
    if (plan === "enterprise") {
      throw new HttpsError(
        "invalid-argument",
        "El plan Enterprise requiere una configuración personalizada.",
      );
    }

    const rawAddress =
      request.rawRequest?.headers?.["x-forwarded-for"] ||
      request.rawRequest?.ip ||
      "unknown";
    const address = String(rawAddress).split(",")[0].trim();
    const rateLimitKey = createHash("sha256").update(address).digest("hex");
    const rateLimitRef = db.collection("companyTrialRateLimits").doc(rateLimitKey);
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const rateLimitSnap = await transaction.get(rateLimitRef);
      const rateLimit = rateLimitSnap.exists ? rateLimitSnap.data() : null;
      const windowStartedAt = rateLimit?.windowStartedAt?.toMillis?.() || 0;
      const sameWindow = now.toMillis() - windowStartedAt < COMPANY_TRIAL_WINDOW_MS;
      const count = sameWindow ? Number(rateLimit?.count || 0) : 0;
      if (count >= COMPANY_TRIAL_MAX_PER_WINDOW) {
        throw new HttpsError(
          "resource-exhausted",
          "Se han creado varias cuentas desde esta conexión. Espera una hora para volver a intentarlo.",
        );
      }
      transaction.set(rateLimitRef, {
        count: count + 1,
        windowStartedAt: sameWindow ? rateLimit.windowStartedAt : now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + COMPANY_TRIAL_WINDOW_MS * 2),
      });
    });

    const companyId = await findAvailableCompanyId(companyName);
    const invitationCode = normalizeAccessCode(
      `LG-${randomBytes(6).toString("hex")}`,
    );
    const lifecycle = buildTrialLifecycle(now.toMillis());
    const trialEndsAt = Timestamp.fromMillis(lifecycle.trialEndsAtMs);
    const dataDeletionAt = Timestamp.fromMillis(lifecycle.dataDeletionAtMs);
    const registrationRef = db.collection("companyRequests").doc();
    let createdUser = null;
    let provisioningCommitted = false;

    try {
      createdUser = await auth.createUser({
        email,
        password,
        displayName: contactName,
      });
      await db.runTransaction(async (transaction) => {
        const companyRef = db.collection("companies").doc(companyId);
        const codeIndexRef = db.collection("accessCodeIndex").doc(invitationCode);
        const [companySnap, codeSnap] = await Promise.all([
          transaction.get(companyRef),
          transaction.get(codeIndexRef),
        ]);
        if (companySnap.exists || codeSnap.exists) {
          throw new HttpsError(
            "already-exists",
            "El identificador de empresa ya está ocupado.",
          );
        }

        transaction.create(companyRef, {
          name: companyName,
          status: "active",
          subscriptionStatus: "trialing",
          plan,
          trialEndsAt,
          dataDeletionAt,
          stripeCustomerId: null,
          ownerUid: createdUser.uid,
          onboardingVersion: 1,
          onboardingCompleted: false,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: createdUser.uid,
        });
        transaction.create(db.collection("users").doc(createdUser.uid), {
          uid: createdUser.uid,
          name: contactName,
          email,
          phone,
          role: "admin",
          active: true,
          companyId,
          isOwner: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`companies/${companyId}/settings/global`), {
          companyName,
          invitationCode,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`companies/${companyId}/accessCodes/${invitationCode}`), {
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: createdUser.uid,
        });
        transaction.create(codeIndexRef, { companyId, active: true });
        transaction.create(registrationRef, {
          companyName,
          contactName,
          email,
          phone,
          operariosCount,
          plan,
          message,
          status: "active",
          source: "self_service_trial",
          provisionedCompanyId: companyId,
          provisionedAdminUid: createdUser.uid,
          privacyAcceptedAt: now,
          privacyVersion: "2026-08",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      provisioningCommitted = true;
      await auth
        .setCustomUserClaims(createdUser.uid, {
          role: "admin",
          active: true,
          companyId,
          platformAdmin: false,
        })
        .catch((claimsError) =>
          logger.error(
            "Los claims del propietario se sincronizarán mediante el trigger",
            claimsError,
          ),
        );
      return {
        companyId,
        email,
        trialEndsAt: new Date(lifecycle.trialEndsAtMs).toISOString(),
        dataDeletionAt: new Date(lifecycle.dataDeletionAtMs).toISOString(),
      };
    } catch (error) {
      if (createdUser && !provisioningCommitted) {
        await auth.deleteUser(createdUser.uid).catch(() => {});
      }
      if (error instanceof HttpsError) throw error;
      if (error?.code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "Ya existe una cuenta con este correo. Inicia sesión o utiliza otro correo.",
        );
      }
      if (error?.code === "auth/invalid-password") {
        throw new HttpsError("invalid-argument", "La contraseña no es válida.");
      }
      logger.error("registerCompanyTrial failed", error);
      throw new HttpsError(
        "internal",
        "No se pudo crear la empresa. Inténtalo de nuevo en unos minutos.",
      );
    }
  },
);

exports.submitCompanyRequest = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request) => {
    if (request.auth) {
      throw new HttpsError(
        "failed-precondition",
        "Las solicitudes públicas deben enviarse sin una sesión iniciada.",
      );
    }

    const companyName = normalizeCompanyRequestText(request.data?.companyName, 199);
    const contactName = normalizeCompanyRequestText(request.data?.contactName, 199);
    const email = normalizeCompanyRequestText(request.data?.email, 199).toLowerCase();
    const phone = normalizeCompanyRequestText(request.data?.phone, 49);
    const operariosCount = normalizeCompanyRequestText(request.data?.operariosCount, 30);
    const plan = normalizeCompanyRequestText(request.data?.plan, 30);
    const message = normalizeCompanyRequestText(request.data?.message, 1500);
    const website = normalizeCompanyRequestText(request.data?.website, 200);

    // Campo invisible para bots. Los navegadores legítimos siempre lo envían vacío.
    if (website) {
      return { accepted: true };
    }
    if (!companyName || !contactName || !email || !phone) {
      throw new HttpsError("invalid-argument", "Completa los campos obligatorios.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "El correo electrónico no es válido.");
    }
    if (!/^[+0-9() .-]{6,49}$/.test(phone)) {
      throw new HttpsError("invalid-argument", "El teléfono no es válido.");
    }
    if (plan && !["autonomo", "starter", "professional", "business", "enterprise"].includes(plan)) {
      throw new HttpsError("invalid-argument", "El plan seleccionado no es válido.");
    }

    const rawAddress =
      request.rawRequest?.headers?.["x-forwarded-for"] ||
      request.rawRequest?.ip ||
      "unknown";
    const address = String(rawAddress).split(",")[0].trim();
    const rateLimitKey = createHash("sha256")
      .update(address)
      .digest("hex");
    const rateLimitRef = db.collection("companyRequestRateLimits").doc(rateLimitKey);
    const requestRef = db.collection("companyRequests").doc();
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const rateLimitSnap = await transaction.get(rateLimitRef);
      const rateLimit = rateLimitSnap.exists ? rateLimitSnap.data() : null;
      const windowStartedAt = rateLimit?.windowStartedAt?.toMillis?.() || 0;
      const sameWindow = now.toMillis() - windowStartedAt < COMPANY_REQUEST_WINDOW_MS;
      const count = sameWindow ? Number(rateLimit?.count || 0) : 0;
      if (count >= COMPANY_REQUEST_MAX_PER_WINDOW) {
        throw new HttpsError(
          "resource-exhausted",
          "Has enviado varias solicitudes. Espera unos minutos antes de intentarlo de nuevo.",
        );
      }

      transaction.set(rateLimitRef, {
        count: count + 1,
        windowStartedAt: sameWindow ? rateLimit.windowStartedAt : now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + COMPANY_REQUEST_WINDOW_MS * 2),
      });
      transaction.create(requestRef, {
        companyName,
        contactName,
        email,
        phone,
        operariosCount,
        plan,
        message,
        status: "pending",
        source: "landing",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { accepted: true };
  },
);

exports.getPlatformDashboard = onCall(
  { region: "europe-west1", timeoutSeconds: 60 },
  async (request) => {
    requirePlatformAdmin(request);
    const companiesSnap = await db.collection("companies")
      .limit(250).get();
    const companies = (await Promise.all(
      companiesSnap.docs.map(async (companyDoc) => {
        const company = companyDoc.data();
        const [operariosSnap, adminsSnap, communitiesSnap, ownerSnap] =
          await Promise.all([
            db.collection("users")
              .where("companyId", "==", companyDoc.id)
              .where("role", "==", "operario")
              .where("active", "==", true).count().get(),
            db.collection("users")
              .where("companyId", "==", companyDoc.id)
              .where("role", "==", "admin")
              .where("active", "==", true).count().get(),
            db.collection(`companies/${companyDoc.id}/communities`).count().get(),
            company.ownerUid
              ? db.collection("users").doc(company.ownerUid).get()
              : Promise.resolve(null),
          ]);
        const limits = getPlanLimits(company.plan);
        return {
          id: companyDoc.id,
          name: company.name || companyDoc.id,
          status: company.status || "unknown",
          subscriptionStatus: company.subscriptionStatus || "legacy",
          plan: limits.plan,
          limits,
          usage: {
            operarios: operariosSnap.data().count,
            admins: adminsSnap.data().count,
            communities: communitiesSnap.data().count,
          },
          owner: ownerSnap?.exists
            ? {
                uid: ownerSnap.id,
                name: ownerSnap.data().name || "",
                email: ownerSnap.data().email || "",
              }
            : null,
          trialEndsAt: company.trialEndsAt?.toDate?.().toISOString() || null,
          currentPeriodEndsAt:
            company.currentPeriodEndsAt?.toDate?.().toISOString() || null,
          stripeCustomerId: company.stripeCustomerId || null,
          createdAt: company.createdAt?.toDate?.().toISOString() || null,
        };
      }),
    )).sort((left, right) =>
      String(right.createdAt || "").localeCompare(String(left.createdAt || "")),
    );
    const planCounts = {};
    for (const company of companies) {
      planCounts[company.plan] = (planCounts[company.plan] || 0) + 1;
    }
    return {
      companies,
      summary: {
        total: companies.length,
        active: companies.filter((item) => item.status === "active").length,
        trials: companies.filter((item) => item.subscriptionStatus === "trialing").length,
        attention: companies.filter((item) =>
          ["past_due", "unpaid", "canceled"].includes(item.subscriptionStatus) ||
          item.status === "suspended"
        ).length,
        estimatedMrr: companies.reduce(
          (sum, item) =>
            item.subscriptionStatus === "active"
              ? sum + (item.limits.monthlyPrice || 0)
              : sum,
          0,
        ),
        planCounts,
      },
      planCatalog: PLAN_LIMITS,
    };
  },
);

exports.updateCompanyCommercialState = onCall(
  { region: "europe-west1" },
  async (request) => {
    requirePlatformAdmin(request);
    const companyId = String(request.data?.companyId || "").trim();
    const patch = request.data?.patch || {};
    if (!companyId) {
      throw new HttpsError("invalid-argument", "La empresa es obligatoria.");
    }
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (patch.plan !== undefined) update.plan = normalizePlan(patch.plan);
    if (patch.status !== undefined) {
      if (!["active", "suspended"].includes(patch.status)) {
        throw new HttpsError("invalid-argument", "Estado de empresa no válido.");
      }
      update.status = patch.status;
    }
    if (patch.subscriptionStatus !== undefined) {
      if (!["active", "trialing", "past_due", "unpaid", "canceled", "legacy"].includes(patch.subscriptionStatus)) {
        throw new HttpsError("invalid-argument", "Estado de suscripción no válido.");
      }
      update.subscriptionStatus = patch.subscriptionStatus;
    }
    await db.collection("companies").doc(companyId).update(update);
    return { ok: true };
  },
);

exports.listCompanyRequests = onCall(
  { region: "europe-west1" },
  async (request) => {
    requirePlatformAdmin(request);
    const snapshot = await db.collection("companyRequests")
      .orderBy("createdAt", "desc").limit(250).get();
    return {
      requests: snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
        createdAt: item.data().createdAt?.toDate?.().toISOString() || null,
        updatedAt: item.data().updatedAt?.toDate?.().toISOString() || null,
      })),
    };
  },
);

exports.updateCompanyRequest = onCall(
  { region: "europe-west1" },
  async (request) => {
    requirePlatformAdmin(request);
    const id = String(request.data?.id || "").trim();
    const status = String(request.data?.status || "").trim();
    if (!id || !["pending", "contacted", "active", "discarded"].includes(status)) {
      throw new HttpsError("invalid-argument", "Solicitud o estado no válido.");
    }
    await db.collection("companyRequests").doc(id).update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });
    return { ok: true };
  },
);

exports.deleteCompanyRequest = onCall(
  { region: "europe-west1" },
  async (request) => {
    requirePlatformAdmin(request);
    const id = String(request.data?.id || "").trim();
    if (!id) throw new HttpsError("invalid-argument", "La solicitud es obligatoria.");
    await db.collection("companyRequests").doc(id).delete();
    return { ok: true };
  },
);

exports.provisionCompanyFromRequest = onCall(
  { region: "europe-west1", timeoutSeconds: 60 },
  async (request) => {
    requirePlatformAdmin(request);
    const requestId = String(request.data?.requestId || "").trim();
    const temporaryPassword = String(request.data?.temporaryPassword || "");
    if (!requestId || temporaryPassword.length < 10) {
      throw new HttpsError(
        "invalid-argument",
        "La solicitud y una contraseña temporal de al menos 10 caracteres son obligatorias.",
      );
    }
    const requestRef = db.collection("companyRequests").doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) throw new HttpsError("not-found", "La solicitud no existe.");
    const lead = requestSnap.data();
    if (lead.provisionedCompanyId) {
      throw new HttpsError("already-exists", "Esta solicitud ya tiene una empresa creada.");
    }

    const companyId = normalizeCompanyId(request.data?.companyId || lead.companyName);
    const invitationCode = normalizeAccessCode(
      request.data?.invitationCode ||
        `${companyId.replace(/-/g, "").slice(0, 12)}2026`,
    );
    const email = String(lead.email || "").trim().toLowerCase();
    const contactName = String(lead.contactName || "").trim();
    const plan = String(request.data?.plan || lead.plan || "starter").trim();
    if (!email || !contactName || !lead.companyName) {
      throw new HttpsError("failed-precondition", "La solicitud está incompleta.");
    }
    const [companySnap, codeSnap] = await Promise.all([
      db.collection("companies").doc(companyId).get(),
      db.collection("accessCodeIndex").doc(invitationCode).get(),
    ]);
    if (companySnap.exists || codeSnap.exists) {
      throw new HttpsError(
        "already-exists",
        "El identificador de empresa o el código de invitación ya existe.",
      );
    }

    let createdUser;
    let provisioningCommitted = false;
    try {
      createdUser = await auth.createUser({
        email,
        password: temporaryPassword,
        displayName: contactName,
      });
      const lifecycle = buildTrialLifecycle();
      const trialEndsAt = Timestamp.fromMillis(lifecycle.trialEndsAtMs);
      const dataDeletionAt = Timestamp.fromMillis(lifecycle.dataDeletionAtMs);
      await db.runTransaction(async (transaction) => {
        const companyRef = db.collection("companies").doc(companyId);
        const codeIndexRef = db.collection("accessCodeIndex").doc(invitationCode);
        const [freshCompany, freshCode] = await Promise.all([
          transaction.get(companyRef),
          transaction.get(codeIndexRef),
        ]);
        if (freshCompany.exists || freshCode.exists) {
          throw new HttpsError("already-exists", "El identificador o código ya está ocupado.");
        }
        transaction.create(companyRef, {
          name: String(lead.companyName).trim(),
          status: "active",
          subscriptionStatus: "trialing",
          plan,
          trialEndsAt,
          dataDeletionAt,
          stripeCustomerId: null,
          ownerUid: createdUser.uid,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: request.auth.uid,
        });
        transaction.create(db.collection("users").doc(createdUser.uid), {
          uid: createdUser.uid,
          name: contactName,
          email,
          phone: String(lead.phone || "").trim(),
          role: "admin",
          active: true,
          companyId,
          isOwner: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`companies/${companyId}/settings/global`), {
          companyName: String(lead.companyName).trim(),
          invitationCode,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(db.doc(`companies/${companyId}/accessCodes/${invitationCode}`), {
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: request.auth.uid,
        });
        transaction.create(codeIndexRef, { companyId, active: true });
        transaction.update(requestRef, {
          status: "active",
          provisionedCompanyId: companyId,
          provisionedAdminUid: createdUser.uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: request.auth.uid,
        });
      });
      provisioningCommitted = true;
      await auth
        .setCustomUserClaims(createdUser.uid, {
          role: "admin",
          active: true,
          companyId,
          platformAdmin: false,
        })
        .catch((claimsError) =>
          logger.error("Los claims se sincronizarán mediante el trigger", claimsError),
        );
      return {
        companyId,
        adminUid: createdUser.uid,
        email,
        invitationCode,
        trialEndsAt: new Date(lifecycle.trialEndsAtMs).toISOString(),
        dataDeletionAt: new Date(lifecycle.dataDeletionAtMs).toISOString(),
      };
    } catch (error) {
      if (createdUser && !provisioningCommitted) {
        await auth.deleteUser(createdUser.uid).catch(() => {});
      }
      if (error instanceof HttpsError) throw error;
      logger.error("provisionCompanyFromRequest failed", error);
      throw new HttpsError("internal", error.message || "No se pudo crear la empresa.");
    }
  },
);

exports.createSubscriptionCheckout = onCall(
  { region: "europe-west1", secrets: [stripeSecretKey] },
  async (request) => {
    const caller = request.auth;
    const companyId = caller?.token?.companyId;
    if (!caller || caller.token.role !== "admin" || caller.token.active !== true || !companyId) {
      throw new HttpsError("permission-denied", "Solo un administrador puede gestionar la suscripción.");
    }
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      throw new HttpsError("not-found", "La empresa no existe.");
    }
    const company = companySnap.data();
    const plan = normalizePlan(request.data?.plan || company.plan);
    const price = {
      autonomo: process.env.STRIPE_PRICE_AUTONOMO,
      starter: process.env.STRIPE_PRICE_STARTER,
      professional: process.env.STRIPE_PRICE_PROFESSIONAL,
      business: process.env.STRIPE_PRICE_BUSINESS,
    }[plan];
    if (!price) {
      throw new HttpsError("failed-precondition", `No hay precio Stripe para el plan ${plan}.`);
    }
    const returnUrl = String(request.data?.returnUrl || "");
    if (!/^https?:\/\/[^ ]+$/.test(returnUrl)) {
      throw new HttpsError("invalid-argument", "La URL de retorno no es válida.");
    }
    const stripe = getStripeClient();
    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const user = await auth.getUser(caller.uid);
      const customer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { companyId },
      });
      customerId = customer.id;
      await db.collection("companies").doc(companyId).update({
        stripeCustomerId: customerId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${returnUrl}?subscription=success`,
      cancel_url: `${returnUrl}?subscription=cancelled`,
      client_reference_id: companyId,
      subscription_data: { metadata: { companyId, plan } },
      metadata: { companyId, plan },
    });
    return { url: session.url };
  },
);

exports.createSubscriptionPortal = onCall(
  { region: "europe-west1", secrets: [stripeSecretKey] },
  async (request) => {
    const caller = request.auth;
    const companyId = caller?.token?.companyId;
    if (!caller || caller.token.role !== "admin" || caller.token.active !== true || !companyId) {
      throw new HttpsError("permission-denied", "Solo un administrador puede gestionar la suscripción.");
    }
    const companySnap = await db.collection("companies").doc(companyId).get();
    const customerId = companySnap.data()?.stripeCustomerId;
    if (!customerId) {
      throw new HttpsError("failed-precondition", "No hay un cliente de facturación configurado.");
    }
    const returnUrl = String(request.data?.returnUrl || "");
    if (!/^https?:\/\/[^ ]+$/.test(returnUrl)) {
      throw new HttpsError("invalid-argument", "La URL de retorno no es válida.");
    }
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },
);

exports.stripeWebhook = onRequest(
  { region: "europe-west1", secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }
    let event;
    try {
      event = getStripeClient().webhooks.constructEvent(
        request.rawBody,
        request.headers["stripe-signature"],
        stripeWebhookSecret.value().trim(),
      );
    } catch (error) {
      logger.warn("Firma de webhook Stripe no válida", error.message);
      response.status(400).send("Invalid signature");
      return;
    }
    const supported = new Set([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
      "invoice.paid",
    ]);
    if (!supported.has(event.type)) {
      response.status(200).json({ received: true });
      return;
    }
    const object = event.data.object;
    let companyId =
      object.metadata?.companyId ||
      object.client_reference_id ||
      object.subscription_details?.metadata?.companyId;
    if (!companyId && object.customer) {
      const querySnap = await db.collection("companies")
        .where("stripeCustomerId", "==", object.customer).limit(1).get();
      companyId = querySnap.docs[0]?.id;
    }
    if (!companyId) {
      logger.error("Webhook Stripe sin companyId", event.id);
      response.status(200).json({ received: true });
      return;
    }
    let subscription = object;
    if (object.subscription && (event.type === "checkout.session.completed" || event.type.startsWith("invoice."))) {
      subscription = await getStripeClient().subscriptions.retrieve(object.subscription);
    }
    const subscriptionStatus =
      event.type === "invoice.payment_failed"
        ? "past_due"
        : subscription.status || (event.type === "invoice.paid" ? "active" : null);
    const update = {
      stripeCustomerId: object.customer || subscription.customer || null,
      stripeSubscriptionId: subscription.id?.startsWith("sub_") ? subscription.id : null,
      subscriptionStatus,
      status: ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus) ? "active" : "suspended",
      updatedAt: FieldValue.serverTimestamp(),
      lastStripeEventId: event.id,
    };
    if (subscription.metadata?.plan) update.plan = subscription.metadata.plan;
    if (ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      update.dataDeletionAt = FieldValue.delete();
    }
    if (subscription.current_period_end) {
      update.currentPeriodEndsAt = Timestamp.fromMillis(subscription.current_period_end * 1000);
    }
    const eventRef = db.collection("stripeEvents").doc(event.id);
    await db.runTransaction(async (transaction) => {
      const processed = await transaction.get(eventRef);
      if (processed.exists) return;
      transaction.set(
        db.collection("companies").doc(companyId),
        update,
        { merge: true },
      );
      transaction.create(eventRef, {
        type: event.type,
        companyId,
        processedAt: FieldValue.serverTimestamp(),
      });
    });
    response.status(200).json({ received: true });
  },
);

async function deleteReferencesInBatches(references) {
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = db.batch();
    for (const reference of references.slice(offset, offset + 400)) {
      batch.delete(reference);
    }
    await batch.commit();
  }
}

async function purgeExpiredTrialCompany(companyDocument) {
  const companyId = companyDocument.id;
  const freshSnapshot = await companyDocument.ref.get();
  if (!freshSnapshot.exists || !isTrialReadyForDeletion(freshSnapshot.data())) {
    return false;
  }

  const [usersSnapshot, accessCodesSnapshot, registrationsSnapshot] =
    await Promise.all([
      db.collection("users").where("companyId", "==", companyId).get(),
      db.collection("accessCodeIndex").where("companyId", "==", companyId).get(),
      db.collection("companyRequests")
        .where("provisionedCompanyId", "==", companyId)
        .get(),
    ]);

  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `companies/${companyId}/` })
    .catch((error) =>
      logger.warn(`No se pudo limpiar todo el almacenamiento de ${companyId}`, error),
    );

  await deleteReferencesInBatches([
    ...usersSnapshot.docs.map((item) => item.ref),
    ...accessCodesSnapshot.docs.map((item) => item.ref),
    ...registrationsSnapshot.docs.map((item) => item.ref),
  ]);

  const userIds = usersSnapshot.docs.map((item) => item.id);
  for (let offset = 0; offset < userIds.length; offset += 1000) {
    const result = await auth.deleteUsers(userIds.slice(offset, offset + 1000));
    if (result.failureCount > 0) {
      logger.warn(
        `No se pudieron eliminar ${result.failureCount} usuarios de ${companyId}`,
        result.errors,
      );
    }
  }

  await db.recursiveDelete(companyDocument.ref);
  logger.info(`Prueba caducada eliminada: ${companyId}`);
  return true;
}

exports.cleanupExpiredCompanyTrials = onSchedule(
  {
    schedule: "30 4 * * *",
    timeZone: "Europe/Madrid",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540,
    maxInstances: 1,
  },
  async () => {
    const expiredSnapshot = await db
      .collection("companies")
      .where("subscriptionStatus", "==", "trialing")
      .where("dataDeletionAt", "<=", Timestamp.now())
      .limit(25)
      .get();
    let deleted = 0;
    for (const companyDocument of expiredSnapshot.docs) {
      try {
        if (await purgeExpiredTrialCompany(companyDocument)) deleted += 1;
      } catch (error) {
        logger.error(
          `No se pudo eliminar la prueba caducada ${companyDocument.id}`,
          error,
        );
      }
    }
    logger.info(`Limpieza de pruebas finalizada. Empresas eliminadas: ${deleted}`);
  },
);

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // en metros
}

/**
 * Fichaje de entrada seguro verificado por servidor.
 */
exports.secureCheckIn = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const { companyId } = await requireActiveTenantEmployee(request);
    const { auth } = request;

    const {
      userId,
      scheduledServiceId,
      lat,
      lng,
      accuracy,
      speed,
      timestamp,
      manualTime,
      exceptionReason,
      force,
    } = request.data;
    if (!userId || !scheduledServiceId) {
      throw new HttpsError(
        "invalid-argument",
        "Parámetros obligatorios faltantes.",
      );
    }

    const serverTime = new Date();
    const isManual = !!manualTime;

    // Validate GPS telemetry values before any database operations
    const validateTelemetry = (
      latitude,
      longitude,
      acc,
      sp,
      ts,
      isManualCheckin,
    ) => {
      if (!isManualCheckin) {
        if (
          latitude === undefined ||
          latitude === null ||
          longitude === undefined ||
          longitude === null ||
          acc === undefined ||
          acc === null ||
          ts === undefined ||
          ts === null
        ) {
          throw new HttpsError(
            "invalid-argument",
            "Los datos de telemetría GPS (lat, lng, accuracy, timestamp) son obligatorios para fichajes en tiempo real.",
          );
        }
      }
      if (latitude !== undefined && latitude !== null) {
        if (
          typeof latitude !== "number" ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90
        ) {
          throw new HttpsError(
            "invalid-argument",
            "La latitud proporcionada no es válida.",
          );
        }
      }
      if (longitude !== undefined && longitude !== null) {
        if (
          typeof longitude !== "number" ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new HttpsError(
            "invalid-argument",
            "La longitud proporcionada no es válida.",
          );
        }
      }
      if (acc !== undefined && acc !== null) {
        if (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0) {
          throw new HttpsError(
            "invalid-argument",
            "La precisión proporcionada no es válida.",
          );
        }
      }
      if (sp !== undefined && sp !== null) {
        if (typeof sp !== "number" || !Number.isFinite(sp) || sp < 0) {
          throw new HttpsError(
            "invalid-argument",
            "La velocidad proporcionada no es válida.",
          );
        }
      }
      if (ts !== undefined && ts !== null) {
        if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
          throw new HttpsError(
            "invalid-argument",
            "El timestamp proporcionado no es válido.",
          );
        }
      }
    };

    validateTelemetry(lat, lng, accuracy, speed, timestamp, isManual);

    if (!isManual && timestamp) {
      if (Math.abs(serverTime.getTime() - timestamp) > 20 * 60 * 1000) {
        throw new HttpsError(
          "failed-precondition",
          "La hora del dispositivo está demasiado desfasada de la del servidor (máximo 20 minutos).",
        );
      }
    }

    // Timezone helper functions
    function getMadridDateParts(date) {
      const formatter = new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const getPart = (type) => parts.find((p) => p.type === type).value;

      return {
        year: parseInt(getPart("year")),
        month: parseInt(getPart("month")),
        day: parseInt(getPart("day")),
        hour: parseInt(getPart("hour")),
        minute: parseInt(getPart("minute")),
        second: parseInt(getPart("second")),
      };
    }

    function getMadridStartOfDay(date) {
      const parts = getMadridDateParts(date);
      return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
    }

    function getMadridWeekRange(date) {
      const parts = getMadridDateParts(date);

      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        weekday: "short",
      });
      const weekday = formatter.format(date);
      const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const currentDayOfWeek = dayMap[weekday];

      const diffToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

      const mondayMadrid = new Date(
        parts.year,
        parts.month - 1,
        parts.day + diffToMonday,
        0,
        0,
        0,
        0,
      );
      const sundayMadrid = new Date(
        parts.year,
        parts.month - 1,
        parts.day + diffToMonday + 6,
        23,
        59,
        59,
        999,
      );

      return { mondayMadrid, sundayMadrid };
    }

    // Ejecutar todo el flujo dentro de una transacción de Firestore
    const checkInId = await db.runTransaction(async (transaction) => {
      // 1. Obtener servicio programado
      const serviceRef = db
        .collection(`companies/${companyId}/scheduledServices`)
        .doc(scheduledServiceId);
      const serviceSnap = await transaction.get(serviceRef);
      if (!serviceSnap.exists) {
        throw new HttpsError(
          "not-found",
          "El servicio programado especificado no existe.",
        );
      }
      const serviceData = serviceSnap.data();

      // Cargar communityId de forma segura desde el documento del servicio en servidor
      const communityId = serviceData.communityId;
      if (!communityId) {
        throw new HttpsError(
          "failed-precondition",
          "El servicio programado no tiene una comunidad asociada.",
        );
      }

      // 2. Verificar si es administrador utilizando custom claims
      const isAdmin = auth.token && auth.token.role === "admin";

      // Verificar autorización (debe ser titular, acompañante o apoyo)
      let isAuthorized =
        isAdmin ||
        serviceData.assignedUserId === auth.uid ||
        (serviceData.companionIds &&
          serviceData.companionIds.includes(auth.uid));

      if (!isAuthorized) {
        // Comprobar jornada activa del titular hoy
        const titularWorkdayQuery = db
          .collection(`companies/${companyId}/workdays`)
          .where("userId", "==", serviceData.assignedUserId)
          .where("status", "==", "active");
        const titularWorkdaySnap = await transaction.get(titularWorkdayQuery);
        if (!titularWorkdaySnap.empty) {
          const titularWorkday = titularWorkdaySnap.docs[0].data();
          if (titularWorkday.currentCompanionId === auth.uid) {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        throw new HttpsError(
          "permission-denied",
          "No tienes permisos para interactuar con este servicio.",
        );
      }

      // 3. Verificar operario destino
      let isTargetValid =
        isAdmin ||
        serviceData.assignedUserId === userId ||
        (serviceData.companionIds && serviceData.companionIds.includes(userId));
      if (!isTargetValid) {
        const titularWorkdayQuery = db
          .collection(`companies/${companyId}/workdays`)
          .where("userId", "==", serviceData.assignedUserId)
          .where("status", "==", "active");
        const titularWorkdaySnap = await transaction.get(titularWorkdayQuery);
        if (!titularWorkdaySnap.empty) {
          const titularWorkday = titularWorkdaySnap.docs[0].data();
          if (titularWorkday.currentCompanionId === userId) {
            isTargetValid = true;
          }
        }
      }

      if (!isTargetValid) {
        throw new HttpsError(
          "invalid-argument",
          "El operario especificado no pertenece a este servicio.",
        );
      }

      // 4. Obtener coordenadas de la comunidad
      const communityRef = db.collection(`companies/${companyId}/communities`).doc(communityId);
      const communitySnap = await transaction.get(communityRef);
      if (!communitySnap.exists) {
        throw new HttpsError(
          "not-found",
          "La comunidad especificada no existe.",
        );
      }
      const communityData = communitySnap.data();

      // 5. Verificar si ya tiene un fichaje abierto para este servicio
      const existingQuery = db
        .collection(`companies/${companyId}/checkIns`)
        .where("userId", "==", userId)
        .where("scheduledServiceId", "==", scheduledServiceId)
        .where("checkOutTime", "==", null);
      const existingSnap = await transaction.get(existingQuery);

      if (!existingSnap.empty) {
        return existingSnap.docs[0].id;
      }

      // 6. Eliminar bypass libre de force: true para operarios
      if (force && !isAdmin) {
        throw new HttpsError(
          "permission-denied",
          "El parámetro 'force' solo está disponible para administradores.",
        );
      }

      let distance = null;
      let isOutOfBounds = false;

      if (communityData.location && lat !== null && lng !== null) {
        const commLat =
          communityData.location._lat || communityData.location.latitude;
        const commLng =
          communityData.location._long || communityData.location.longitude;

        if (commLat !== undefined && commLng !== undefined) {
          distance = calculateHaversineDistance(lat, lng, commLat, commLng);
          const geofenceRadius = communityData.geofenceRadiusMeters || 50;
          const allowedRadius = geofenceRadius + Math.max(100, accuracy || 0);

          if (distance > allowedRadius) {
            isOutOfBounds = true;
          }
        }
      }

      // Validar requerimiento de exceptionReason para fuera de rango o manual
      let locationValidation = "gps_verified";
      let requiresReview = false;

      if (isOutOfBounds || isManual) {
        if (!exceptionReason || !exceptionReason.trim()) {
          throw new HttpsError(
            "failed-precondition",
            isOutOfBounds
              ? `Ubicación fuera de rango (${Math.round(distance)}m). Debe proporcionar un motivo de excepción para fichar fuera de la geovalla.`
              : "Debe proporcionar un motivo de excepción para realizar un fichaje manual o retroactivo.",
          );
        }
        locationValidation = "manual_exception";
        requiresReview = !isAdmin; // Omitir revisión para administradores
      }

      // 7. Validar fecha razonable usando la zona horaria Europe/Madrid
      const scheduledDateRaw = serviceData.scheduledDate.toDate
        ? serviceData.scheduledDate.toDate()
        : new Date(serviceData.scheduledDate);
      const isToday =
        getMadridStartOfDay(scheduledDateRaw).getTime() ===
        getMadridStartOfDay(serverTime).getTime();

      let isThisWeek = false;
      if (serviceData.flexibleWeek) {
        const { mondayMadrid, sundayMadrid } = getMadridWeekRange(serverTime);
        const schedStartOfDay = getMadridStartOfDay(scheduledDateRaw);
        isThisWeek =
          schedStartOfDay >= mondayMadrid && schedStartOfDay <= sundayMadrid;
      }

      if (!isToday && !isThisWeek && !force) {
        throw new HttpsError(
          "failed-precondition",
          "El servicio programado no pertenece al día de hoy ni a la semana flexible en curso.",
        );
      }

      const officialCheckInTime = isManual ? new Date(manualTime) : serverTime;

      // 8. Guardar telemetría real y crear documento
      const checkInRef = db.collection(`companies/${companyId}/checkIns`).doc();
      const checkInData = {
        userId,
        communityId,
        scheduledServiceId,
        checkInTime: Timestamp.fromDate(officialCheckInTime),
        checkInLocation:
          lat !== null && lng !== null ? new GeoPoint(lat, lng) : null,
        checkOutTime: null,
        checkOutLocation: null,
        durationMinutes: 0,
        createdAt: FieldValue.serverTimestamp(),
        latitude: lat,
        longitude: lng,
        gpsAccuracy: accuracy,
        gpsSpeed: speed,
        originalReadingTimestamp: timestamp
          ? Timestamp.fromMillis(timestamp)
          : Timestamp.fromDate(serverTime),
        calculatedDistance: distance !== null ? Math.round(distance) : null,
        locationValidation,
        requiresReview,
        isManual,
        exceptionReason: exceptionReason || null,
        requestedByUserId: auth.uid,
      };

      transaction.set(checkInRef, checkInData);

      // 9. Actualizar estado del servicio programado
      transaction.update(serviceRef, {
        status: "in_progress",
        updatedAt: FieldValue.serverTimestamp(),
      });

      return checkInRef.id;
    });

    logger.info(
      `[secureCheckIn] Fichaje de entrada ID ${checkInId} creado con éxito.`,
    );
    return { checkInId };
  },
);

/**
 * Fichaje de salida seguro verificado por servidor.
 */
exports.secureCheckOut = onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const { companyId } = await requireActiveTenantEmployee(request);
    const { auth } = request;

    const {
      checkInId,
      lat,
      lng,
      accuracy,
      speed,
      timestamp,
      manualTime,
      exceptionReason,
      signatureData,
    } = request.data;
    if (!checkInId) {
      throw new HttpsError(
        "invalid-argument",
        "Parámetros obligatorios faltantes (checkInId).",
      );
    }

    const serverTime = new Date();
    const isManual = !!manualTime;

    // Validate GPS telemetry values before database operations
    const validateTelemetry = (
      latitude,
      longitude,
      acc,
      sp,
      ts,
      isManualCheckout,
    ) => {
      if (!isManualCheckout) {
        if (
          latitude === undefined ||
          latitude === null ||
          longitude === undefined ||
          longitude === null ||
          acc === undefined ||
          acc === null ||
          ts === undefined ||
          ts === null
        ) {
          throw new HttpsError(
            "invalid-argument",
            "Los datos de telemetría GPS (lat, lng, accuracy, timestamp) son obligatorios para fichajes de salida en tiempo real.",
          );
        }
      }
      if (latitude !== undefined && latitude !== null) {
        if (
          typeof latitude !== "number" ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90
        ) {
          throw new HttpsError(
            "invalid-argument",
            "La latitud proporcionada no es válida.",
          );
        }
      }
      if (longitude !== undefined && longitude !== null) {
        if (
          typeof longitude !== "number" ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new HttpsError(
            "invalid-argument",
            "La longitud proporcionada no es válida.",
          );
        }
      }
      if (acc !== undefined && acc !== null) {
        if (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0) {
          throw new HttpsError(
            "invalid-argument",
            "La precisión proporcionada no es válida.",
          );
        }
      }
      if (sp !== undefined && sp !== null) {
        if (typeof sp !== "number" || !Number.isFinite(sp) || sp < 0) {
          throw new HttpsError(
            "invalid-argument",
            "La velocidad proporcionada no es válida.",
          );
        }
      }
      if (ts !== undefined && ts !== null) {
        if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
          throw new HttpsError(
            "invalid-argument",
            "El timestamp proporcionado no es válido.",
          );
        }
      }
    };

    validateTelemetry(lat, lng, accuracy, speed, timestamp, isManual);

    if (!isManual && timestamp) {
      if (Math.abs(serverTime.getTime() - timestamp) > 20 * 60 * 1000) {
        throw new HttpsError(
          "failed-precondition",
          "La hora del dispositivo está demasiado desfasada de la del servidor (máximo 20 minutos).",
        );
      }
    }

    const checkoutResult = await db.runTransaction(async (transaction) => {
      // 1. Obtener fichaje
      const checkInRef = db.collection(`companies/${companyId}/checkIns`).doc(checkInId);
      const checkInSnap = await transaction.get(checkInRef);
      if (!checkInSnap.exists) {
        throw new HttpsError("not-found", "Fichaje no encontrado.");
      }
      const checkInData = checkInSnap.data();

      // Rechazar si checkOutTime ya existe para inmutabilidad del operario
      if (checkInData.checkOutTime !== null) {
        throw new HttpsError(
          "failed-precondition",
          "Este fichaje ya ha sido cerrado y no se puede modificar.",
        );
      }

      // 2. Verificar autorización (debe ser admin, propietario del fichaje o su compañero)
      const isAdmin = auth.token && auth.token.role === "admin";
      let isAuthorized = isAdmin || checkInData.userId === auth.uid;

      if (!isAuthorized) {
        const serviceRef = db
          .collection(`companies/${companyId}/scheduledServices`)
          .doc(checkInData.scheduledServiceId);
        const serviceSnap = await transaction.get(serviceRef);
        if (serviceSnap.exists) {
          const serviceData = serviceSnap.data();
          const isRequesterCompanion =
            serviceData.assignedUserId === auth.uid ||
            (serviceData.companionIds &&
              serviceData.companionIds.includes(auth.uid));
          if (isRequesterCompanion) {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        throw new HttpsError(
          "permission-denied",
          "No tienes permisos para cerrar este fichaje.",
        );
      }

      // 3. Obtener coordenadas de la comunidad y calcular distancia
      const communityRef = db
        .collection(`companies/${companyId}/communities`)
        .doc(checkInData.communityId);
      const communitySnap = await transaction.get(communityRef);
      if (!communitySnap.exists) {
        throw new HttpsError(
          "not-found",
          "La comunidad asociada al fichaje no existe.",
        );
      }
      const communityData = communitySnap.data();

      let distance = null;
      let isOutOfBounds = false;

      if (communityData.location && lat !== null && lng !== null) {
        const commLat =
          communityData.location._lat || communityData.location.latitude;
        const commLng =
          communityData.location._long || communityData.location.longitude;

        if (commLat !== undefined && commLng !== undefined) {
          distance = calculateHaversineDistance(lat, lng, commLat, commLng);
          const geofenceRadius = communityData.geofenceRadiusMeters || 50;
          const allowedRadius = geofenceRadius + Math.max(100, accuracy || 0);

          if (distance > allowedRadius) {
            isOutOfBounds = true;
          }
        }
      }

      if (isOutOfBounds || isManual) {
        if (!exceptionReason || !exceptionReason.trim()) {
          throw new HttpsError(
            "failed-precondition",
            isOutOfBounds
              ? `Ubicación fuera de rango (${Math.round(distance)}m). Debe proporcionar un motivo de excepción para registrar salida fuera de la geovalla.`
              : "Debe proporcionar un motivo de excepción para realizar un fichaje manual o retroactivo.",
          );
        }
      }

      // 4. Calcular duración
      const officialCheckOutTime = isManual ? new Date(manualTime) : serverTime;
      const checkInTime = checkInData.checkInTime.toDate
        ? checkInData.checkInTime.toDate()
        : new Date(checkInData.checkInTime);
      const duration = Math.max(
        0,
        Math.round(
          (officialCheckOutTime.getTime() - checkInTime.getTime()) / 60000,
        ),
      );

      // 5. Guardar telemetría de salida
      const updateData = {
        checkOutTime: Timestamp.fromDate(officialCheckOutTime),
        checkOutLocation:
          lat !== null && lng !== null ? new GeoPoint(lat, lng) : null,
        durationMinutes: duration,
        checkoutLatitude: lat,
        checkoutLongitude: lng,
        checkoutGpsAccuracy: accuracy,
        checkoutGpsSpeed: speed,
        checkoutOriginalReadingTimestamp: timestamp
          ? Timestamp.fromMillis(timestamp)
          : Timestamp.fromDate(serverTime),
        checkoutDistance: distance !== null ? Math.round(distance) : null,
        checkoutLocationValidation:
          isOutOfBounds || isManual ? "manual_exception" : "gps_verified",
        checkoutExceptionReason: exceptionReason || null,
        checkoutRequestedByUserId: auth.uid,
      };

      if (signatureData) {
        updateData.signature = {
          imageUrl: signatureData.imageUrl,
          signerName: signatureData.signerName,
          signedAt: Timestamp.fromDate(
            signatureData.signedAt
              ? new Date(signatureData.signedAt)
              : new Date(),
          ),
        };
      }

      transaction.update(checkInRef, updateData);

      return { duration };
    });

    logger.info(
      `[secureCheckOut] Fichaje ID ${checkInId} cerrado. Duración: ${checkoutResult.duration}m`,
    );
    return checkoutResult;
  },
);

/**
 * Elimina un fichaje abierto de forma controlada. Se usa al sustituir a un
 * acompañante durante un servicio: los operarios nunca escriben directamente
 * en la colección checkIns.
 */
exports.secureDeleteCheckIn = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 },
  async (request) => {
    const { companyId } = await requireActiveTenantEmployee(request);
    const { auth } = request;
    const { checkInId } = request.data || {};
    if (!checkInId || typeof checkInId !== "string") {
      throw new HttpsError("invalid-argument", "checkInId es obligatorio.");
    }
    await db.runTransaction(async (transaction) => {
      const checkInRef = db.collection(`companies/${companyId}/checkIns`).doc(checkInId);
      const checkInSnap = await transaction.get(checkInRef);
      if (!checkInSnap.exists)
        throw new HttpsError("not-found", "Fichaje no encontrado.");
      const checkIn = checkInSnap.data();
      if (checkIn.checkOutTime !== null) {
        throw new HttpsError(
          "failed-precondition",
          "Solo se pueden eliminar fichajes abiertos.",
        );
      }

      const isAdmin = auth.token && auth.token.role === "admin";
      let isAuthorized = isAdmin || checkIn.userId === auth.uid;
      if (!isAuthorized && checkIn.scheduledServiceId) {
        const serviceSnap = await transaction.get(
          db.collection(`companies/${companyId}/scheduledServices`).doc(checkIn.scheduledServiceId),
        );
        if (serviceSnap.exists) {
          isAuthorized = serviceSnap.data().assignedUserId === auth.uid;
        }
      }
      if (!isAuthorized)
        throw new HttpsError(
          "permission-denied",
          "No tienes permisos para eliminar este fichaje.",
        );
      transaction.delete(checkInRef);
    });

    logger.info(
      `[secureDeleteCheckIn] Fichaje ${checkInId} eliminado por ${auth.uid}`,
    );
    return { deleted: true };
  },
);

// ============================================================================
// FUNCIÓN: cleanupDetailedGpsTelemetry
// Ejecuta diariamente a las 4:00 AM (Europe/Madrid). Elimina/anonimiza
// la telemetría GPS detallada de checkIns con más de 30 días de antigüedad
// para cumplir con la política de privacidad de datos de localización.
// ============================================================================
exports.cleanupDetailedGpsTelemetry = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "Europe/Madrid",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    logger.info("=== cleanupDetailedGpsTelemetry: Inicio de ejecución ===");
    try {
      const retentionDays = 30;
      const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      logger.info(
        `Buscando fichajes anteriores a: ${cutoffDate.toISOString()} para limpieza de telemetría...`,
      );

      const querySnap = await db
        .collectionGroup("checkIns")
        .where("checkInTime", "<", cutoffTimestamp)
        .get();

      if (querySnap.empty) {
        logger.info("No se encontraron fichajes antiguos para limpiar.");
        return;
      }

      logger.info(
        `Encontrados ${querySnap.size} fichaje(s) antiguo(s). Limpiando telemetría...`,
      );

      const batchSize = 500;
      const docs = querySnap.docs;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);

        let count = 0;
        for (const docSnap of chunk) {
          const data = docSnap.data();
          if (
            data.checkInLocation ||
            data.checkOutLocation ||
            data.latitude ||
            data.longitude ||
            data.gpsAccuracy ||
            data.gpsSpeed ||
            data.checkoutGpsAccuracy ||
            data.checkoutGpsSpeed
          ) {
            batch.update(docSnap.ref, {
              checkInLocation: null,
              checkOutLocation: null,
              latitude: null,
              longitude: null,
              gpsAccuracy: null,
              gpsSpeed: null,
              checkoutGpsAccuracy: null,
              checkoutGpsSpeed: null,
              telemetryCleanedAt: Timestamp.now(),
            });
            count++;
          }
        }

        if (count > 0) {
          await batch.commit();
          logger.info(
            `Batch de limpieza completado (${count} documentos actualizados).`,
          );
        }
      }

      logger.info("=== cleanupDetailedGpsTelemetry: Finalizado con éxito ===");
    } catch (err) {
      logger.error("Error en cleanupDetailedGpsTelemetry:", err);
    }
  },
);
