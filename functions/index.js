/**
 * Cloud Functions para RyB Limpiezas App
 *
 * Funciones:
 * - checkWorkdayReminders: Cada 10 minutos, revisa jornadas activas y envía recordatorios push.
 * - cleanupStaleFcmTokens: Diariamente a las 3:00 AM (Europe/Madrid), limpia tokens FCM antiguos.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();
const messaging = getMessaging();

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
 * Obtiene la fecha actual en zona horaria Europe/Madrid como objeto Date
 * @returns {Date} Fecha actual en Madrid
 */
function getNowInMadrid() {
  // Usamos Intl para obtener la hora local de Madrid
  const now = new Date();
  return now;
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
  const endOfDayUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - madridOffset);

  return {
    startOfDay: Timestamp.fromDate(startOfDayUTC),
    endOfDay: Timestamp.fromDate(endOfDayUTC),
  };
}

/**
 * Calcula el offset de Europe/Madrid respecto a UTC en milisegundos.
 * @param {Date} date - Fecha de referencia
 * @returns {number} Offset en milisegundos (positivo = Madrid adelantado)
 */
function getMadridOffsetMs(date) {
  // Obtener la representación en Madrid
  const madridStr = date.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const madridDate = new Date(madridStr);
  const utcDate = new Date(utcStr);
  return madridDate.getTime() - utcDate.getTime();
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
    new Date(Date.now() - REMINDER_COOLDOWN_MIN * 60 * 1000)
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
async function sendPushNotification(userId, title, body, type, serviceId = null) {
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
  logger.info(`[Notificación] systemNotification creada para usuario ${userId}, tipo: ${type}`);

  if (tokens.length === 0) {
    logger.warn(`[Notificación] Usuario ${userId} no tiene tokens FCM registrados. Solo se creó systemNotification.`);
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
      logger.info(`[Push] Enviado a token ${token.substring(0, 20)}... para usuario ${userId}`);
    } catch (error) {
      // Si el token es inválido o ha expirado, lo marcamos para eliminar
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-argument"
      ) {
        logger.warn(`[Push] Token inválido detectado para usuario ${userId}: ${token.substring(0, 20)}...`);
        invalidTokens.push(token);
      } else {
        logger.error(`[Push] Error enviando a token ${token.substring(0, 20)}... para usuario ${userId}:`, error);
      }
    }
  });

  await Promise.all(sendPromises);

  // Limpiar tokens inválidos detectados durante el envío
  if (invalidTokens.length > 0) {
    logger.info(`[Push] Limpiando ${invalidTokens.length} token(s) inválido(s) para usuario ${userId}`);
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
    logger.warn(`[getCommunityName] Error obteniendo comunidad ${communityId}:`, e);
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

      logger.info(`Encontradas ${activeWorkdaysSnap.size} jornada(s) activa(s).`);

      // 2. Obtener los límites del día de hoy (Europe/Madrid)
      const { startOfDay, endOfDay } = getTodayBoundsMadrid();

      // 3. Procesar cada jornada activa
      const processingPromises = activeWorkdaysSnap.docs.map(async (workdayDoc) => {
        const workday = workdayDoc.data();
        const workdayId = workdayDoc.id;
        const userId = workday.userId;

        try {
          logger.info(`[Jornada ${workdayId}] Procesando usuario ${userId}...`);

          // Calcular tiempo activo de la jornada
          const workdayStartTime = workday.startTime;
          if (!workdayStartTime) {
            logger.warn(`[Jornada ${workdayId}] No tiene startTime, saltando.`);
            return;
          }

          const workdayMinutes = minutesElapsed(workdayStartTime);
          const workdayHours = hoursElapsed(workdayStartTime);

          // -----------------------------------------------------------
          // CHECK 1: Jornada > 10 horas activa
          // -----------------------------------------------------------
          if (workdayHours >= LONG_WORKDAY_THRESHOLD_HOURS) {
            const alreadySent = await wasReminderSentRecently(userId, "long_workday_10h", workdayId);
            if (!alreadySent) {
              const roundedHours = Math.floor(workdayHours);
              await sendPushNotification(
                userId,
                "Jornada muy larga",
                `Tu jornada lleva ${roundedHours}h activa. ¿Has terminado de trabajar?`,
                "long_workday_10h"
              );
              await recordReminderSent(userId, "long_workday_10h", workdayId);
              logger.info(`[Jornada ${workdayId}] Enviado recordatorio long_workday_10h (${roundedHours}h)`);
            } else {
              logger.info(`[Jornada ${workdayId}] Recordatorio long_workday_10h ya enviado recientemente.`);
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
              const alreadySent = await wasReminderSentRecently(userId, "long_checkin_5h", workdayId);
              if (!alreadySent) {
                const communityName = await getCommunityName(checkIn.communityId);
                const roundedHours = Math.floor(checkInHours);
                await sendPushNotification(
                  userId,
                  "Check-in muy largo",
                  `Llevas ${roundedHours}h fichado en ${communityName}. ¿Has terminado?`,
                  "long_checkin_5h",
                  checkIn.scheduledServiceId || null
                );
                await recordReminderSent(userId, "long_checkin_5h", workdayId);
                logger.info(`[Jornada ${workdayId}] Enviado recordatorio long_checkin_5h (${roundedHours}h en ${communityName})`);
              }
              break; // Solo enviamos un recordatorio de check-in largo por usuario
            }
          }

          // -----------------------------------------------------------
          // CHECK 3: Jornada > 30 min sin ningún check-in activo y con servicios pendientes
          // -----------------------------------------------------------
          if (workdayMinutes >= NO_CHECKIN_THRESHOLD_MIN && activeCheckIns.length === 0) {
            // Verificar si tiene servicios pendientes hoy
            const pendingServicesSnap = await db
              .collection("scheduledServices")
              .where("assignedUserId", "==", userId)
              .where("status", "==", "pending")
              .where("scheduledDate", ">=", startOfDay)
              .where("scheduledDate", "<=", endOfDay)
              .get();

            if (!pendingServicesSnap.empty) {
              const alreadySent = await wasReminderSentRecently(userId, "no_checkin_30min", workdayId);
              if (!alreadySent) {
                await sendPushNotification(
                  userId,
                  "Recuerda fichar",
                  "Llevas 30 min con la jornada activa. Abre la app cerca de tu próximo servicio para que registre tu llegada.",
                  "no_checkin_30min"
                );
                await recordReminderSent(userId, "no_checkin_30min", workdayId);
                logger.info(
                  `[Jornada ${workdayId}] Enviado recordatorio no_checkin_30min (${pendingServicesSnap.size} servicios pendientes)`
                );
              } else {
                logger.info(`[Jornada ${workdayId}] Recordatorio no_checkin_30min ya enviado recientemente.`);
              }
            } else {
              logger.info(`[Jornada ${workdayId}] Sin check-ins activos pero sin servicios pendientes hoy.`);
            }
          }
        } catch (userError) {
          // No dejamos que un error de un usuario rompa el procesamiento de los demás
          logger.error(`[Jornada ${workdayId}] Error procesando usuario ${userId}:`, userError);
        }
      });

      await Promise.all(processingPromises);
      logger.info("=== checkWorkdayReminders: Ejecución completada ===");
    } catch (error) {
      logger.error("Error fatal en checkWorkdayReminders:", error);
      throw error;
    }
  }
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
      const cutoffDate = new Date(Date.now() - FCM_TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      logger.info(`Eliminando tokens FCM no actualizados desde: ${cutoffDate.toISOString()}`);

      const staleTokensSnap = await db
        .collection("fcmTokens")
        .where("updatedAt", "<", cutoffTimestamp)
        .get();

      if (staleTokensSnap.empty) {
        logger.info("No se encontraron tokens FCM obsoletos.");
        return;
      }

      logger.info(`Encontrados ${staleTokensSnap.size} token(s) FCM obsoleto(s). Eliminando...`);

      // Eliminar en lotes de 500 (límite de Firestore batch)
      const batchSize = 500;
      const docs = staleTokensSnap.docs;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        logger.info(`Eliminados ${chunk.length} tokens (lote ${Math.floor(i / batchSize) + 1})`);
      }

      // También limpiar recordatorios de push antiguos (más de 7 días)
      const reminderCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const reminderCutoffTimestamp = Timestamp.fromDate(reminderCutoff);

      const oldRemindersSnap = await db
        .collection("sentPushReminders")
        .where("sentAt", "<", reminderCutoffTimestamp)
        .get();

      if (!oldRemindersSnap.empty) {
        logger.info(`Limpiando ${oldRemindersSnap.size} recordatorio(s) de push antiguos...`);
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
  }
);
