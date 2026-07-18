/**
 * Cloud Functions para RyB Limpiezas App
 *
 * Funciones:
 * - checkWorkdayReminders: Cada 10 minutos, revisa jornadas activas y envía recordatorios push.
 * - cleanupStaleFcmTokens: Diariamente a las 3:00 AM (Europe/Madrid), limpia tokens FCM antiguos.
 * - onGpsNotificationCreated: Trigger Firestore que envía FCM push real para notificaciones GPS (entrada/salida de comunidades).
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
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
const nodemailer = require("nodemailer");

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();
const messaging = getMessaging();
const auth = getAuth();

// ============================================================================
// CONSTANTES
// ============================================================================

/** Umbral en minutos para recordar que no ha fichado en ningún servicio */
const NO_CHECKIN_THRESHOLD_MIN = 30;

/** Umbral en horas para avisar de un check-in muy largo */
const LONG_CHECKIN_THRESHOLD_HOURS = 5;

/** Umbral en horas para avisar de una jornada muy larga */
const LONG_WORKDAY_THRESHOLD_HOURS = 10;

/** Tiempo mínimo entre recordatorios del mismo tipo (en minutos) */
const REMINDER_COOLDOWN_MIN = 30;

/** Días máximos sin actualizar un token FCM antes de borrarlo */
const FCM_TOKEN_MAX_AGE_DAYS = 60;

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
 * Obtiene todos los tokens FCM de un usuario (puede tener múltiples dispositivos).
 * @param {string} userId
 * @returns {Promise<string[]>} Array de tokens FCM
 */
async function getUserFcmTokens(userId) {
  const snap = await db
    .collection("fcmTokens")
    .where("userId", "==", userId)
    .get();

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

  // Crear notificación de respaldo en Firestore siempre
  const systemNotifData = {
    userId,
    title,
    body,
    type,
    serviceId: serviceId || null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection("systemNotifications").add(systemNotifData);
  logger.info(
    `[Notificación] systemNotification creada para usuario ${userId}, tipo: ${type}`,
  );

  if (tokens.length === 0) {
    logger.warn(
      `[Notificación] Usuario ${userId} no tiene tokens FCM registrados. Solo se creó systemNotification.`,
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
        .collection("fcmTokens")
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
 * @param {string} communityId
 * @returns {Promise<string>} Nombre de la comunidad o "la comunidad"
 */
async function getCommunityName(communityId) {
  try {
    const doc = await db.collection("communities").doc(communityId).get();
    if (doc.exists) {
      return doc.data().name || "la comunidad";
    }
  } catch (e) {
    logger.warn(
      `[getCommunityName] Error obteniendo comunidad ${communityId}:`,
      e,
    );
  }
  return "la comunidad";
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
        .collection("workdays")
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

          try {
            logger.info(
              `[Jornada ${workdayId}] Procesando usuario ${userId}...`,
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
              .collection("checkIns")
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
                .collection("scheduledServices")
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
// Trigger Firestore: cuando se crea una systemNotification con triggerEvent
// 'push_only' (notificaciones GPS de entrada/salida de comunidades),
// envía un push FCM real que puede despertar el teléfono en suspensión.
// ============================================================================

exports.onGpsNotificationCreated = onDocumentCreated(
  {
    document: "systemNotifications/{notifId}",
    region: "europe-west1",
    memory: "128MiB",
    timeoutSeconds: 30,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    // Solo procesar notificaciones GPS (push_only)
    if (data.triggerEvent !== "push_only") return;

    const { userId, title, body, type, serviceId } = data;
    if (!userId || !title) return;

    logger.info(
      `[GPS Push] Notificación GPS detectada para ${userId}: ${title}`,
    );

    try {
      const tokens = await getUserFcmTokens(userId);

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
              triggerEvent: "push_only",
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
                tag: `gps-${serviceId || Date.now()}`,
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
            .collection("fcmTokens")
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
      .collection("settings")
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
        const invoiceRef = db.collection("invoices").doc(invoiceId);
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
            .collection("invoices")
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
      .collection("settings")
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
      const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
      if (invoiceDoc.exists) {
        invoices.push({ id: invoiceDoc.id, ...invoiceDoc.data() });
      }
    }

    if (invoices.length === 0) {
      return { results: [], message: "No se encontraron facturas válidas." };
    }

    // Load all active administrators to resolve association names and emails
    const adminsSnap = await db
      .collection("administrators")
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
          await db.collection("invoices").doc(inv.id).update({
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

    // 1. Validar el token en publicPortals
    const portalSnap = await db.collection("publicPortals").doc(token).get();
    if (!portalSnap.exists || !portalSnap.data().isActive) {
      throw new HttpsError(
        "not-found",
        "El portal de cliente solicitado no existe o no está activo.",
      );
    }

    const { communityId } = portalSnap.data();

    // 2. Obtener datos de la comunidad
    const communitySnap = await db
      .collection("communities")
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
      .collection("checkIns")
      .where("communityId", "==", communityId)
      .orderBy("checkInTime", "desc")
      .limit(15)
      .get();

    // 4. Obtener evidencias de los últimos 30 días (limitado a 15 recientes)
    const evidenceSnap = await db
      .collection("evidenceReports")
      .where("communityId", "==", communityId)
      .orderBy("createdAt", "desc")
      .limit(15)
      .get();

    // 5. Obtener tareas de la comunidad
    const tasksSnap = await db
      .collection("communityTasks")
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

      // Evitamos llamadas innecesarias si los claims ya son los mismos que antes
      if (
        beforeData &&
        beforeData.role === role &&
        beforeData.active === active &&
        beforeData.companyId === companyId
      ) {
        logger.log(
          `No hay cambios en los claims relevantes (role: ${role}, active: ${active}, companyId: ${companyId}) para uid: ${uid}. Omitiendo actualización.`,
        );
        return null;
      }

      const claims = { role, active };
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
// SISTEMA DE GEOLOCALIZACIÓN Y FICHAJES SEGUROS
// ============================================================================

/**
 * Calcula la distancia entre dos coordenadas usando la fórmula de Haversine.
 */
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
    const { auth } = request;
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "El usuario debe estar autenticado.",
      );
    }

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
        .collection("scheduledServices")
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
          .collection("workdays")
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
          .collection("workdays")
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
      const communityRef = db.collection("communities").doc(communityId);
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
        .collection("checkIns")
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
      const checkInRef = db.collection("checkIns").doc();
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
    const { auth } = request;
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "El usuario debe estar autenticado.",
      );
    }

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
      const checkInRef = db.collection("checkIns").doc(checkInId);
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
          .collection("scheduledServices")
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
        .collection("communities")
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
    const { auth } = request;
    const { checkInId } = request.data || {};
    if (!auth)
      throw new HttpsError(
        "unauthenticated",
        "El usuario debe estar autenticado.",
      );
    if (!checkInId || typeof checkInId !== "string") {
      throw new HttpsError("invalid-argument", "checkInId es obligatorio.");
    }

    await db.runTransaction(async (transaction) => {
      const checkInRef = db.collection("checkIns").doc(checkInId);
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
          db.collection("scheduledServices").doc(checkIn.scheduledServiceId),
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
        .collection("checkIns")
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
