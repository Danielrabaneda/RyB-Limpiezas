/**
 * Servicio de detecciones de geolocalización persistidas en Firestore.
 * Complementa el almacenamiento en localStorage con persistencia server-side.
 * Permite que las detecciones de entrada/salida sobrevivan a limpiezas de caché.
 */
import {
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import { startOfDay, endOfDay } from "date-fns";
import { findLatestDetection } from "../utils/geoDetection";

const COLLECTION = "geoDetections";

/**
 * Registra una detección de entrada (llegada a una comunidad).
 *
 * @param {string} userId
 * @param {string} serviceId - ID del servicio programado
 * @param {string} communityName - Nombre de la comunidad
 * @param {Date} detectedAt - Hora de detección
 * @param {number} distance - Distancia en metros al punto de la comunidad
 */
export async function persistEntryDetection(
  companyId,
  userId,
  serviceId,
  communityName,
  detectedAt,
  distance,
  source = "realtime",
  gpsTelemetry = null,
) {
  try {
    const timestampMs = detectedAt.getTime();
    const docId = `entry_${userId}_${serviceId}_${timestampMs}`;

    let latitude = null;
    let longitude = null;
    let accuracy = null;
    let speed = null;
    let originalReadingTimestamp = Timestamp.fromDate(detectedAt);
    let confidence = "low";

    if (gpsTelemetry) {
      latitude = gpsTelemetry.latitude || null;
      longitude = gpsTelemetry.longitude || null;
      accuracy = gpsTelemetry.accuracy || null;
      speed = gpsTelemetry.speed !== undefined ? gpsTelemetry.speed : null;
      if (gpsTelemetry.originalReadingTimestamp) {
        originalReadingTimestamp =
          gpsTelemetry.originalReadingTimestamp instanceof Date
            ? Timestamp.fromDate(gpsTelemetry.originalReadingTimestamp)
            : gpsTelemetry.originalReadingTimestamp;
      }

      if (accuracy !== null) {
        if (accuracy <= 15) confidence = "high";
        else if (accuracy <= 40) confidence = "medium";
      }
    }

    await setDoc(
      tenantDoc(db, companyId, COLLECTION, docId),
      {
        type: "entry",
        userId,
        serviceId,
        communityName,
        detectedAt: Timestamp.fromDate(detectedAt),
        distance: Math.round(distance),
        source,
        latitude,
        longitude,
        accuracy,
        speed,
        originalReadingTimestamp,
        confidence,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    ); // merge para no sobreescribir si ya existe
    console.log(
      `[GeoDetection] Entrada persistida: ${communityName} a ${Math.round(distance)}m (${source}), confianza: ${confidence}`,
    );
    return true;
  } catch (err) {
    console.error("[GeoDetection] Error persistiendo entrada:", err);
    return false;
  }
}

/**
 * Registra una detección de salida (abandono de una comunidad).
 *
 * @param {string} userId
 * @param {string} serviceId
 * @param {string} communityName
 * @param {Date} detectedAt
 * @param {'confirmed'|'estimated'} source - Si fue confirmada por GPS o estimada tras suspensión
 */
export async function persistExitDetection(
  companyId,
  userId,
  serviceId,
  communityName,
  detectedAt,
  source = "confirmed",
  gpsTelemetry = null,
) {
  try {
    const timestampMs = detectedAt.getTime();
    const docId = `exit_${userId}_${serviceId}_${timestampMs}`;

    let latitude = null;
    let longitude = null;
    let accuracy = null;
    let speed = null;
    let originalReadingTimestamp = Timestamp.fromDate(detectedAt);
    let confidence = "low";

    if (gpsTelemetry) {
      latitude = gpsTelemetry.latitude || null;
      longitude = gpsTelemetry.longitude || null;
      accuracy = gpsTelemetry.accuracy || null;
      speed = gpsTelemetry.speed !== undefined ? gpsTelemetry.speed : null;
      if (gpsTelemetry.originalReadingTimestamp) {
        originalReadingTimestamp =
          gpsTelemetry.originalReadingTimestamp instanceof Date
            ? Timestamp.fromDate(gpsTelemetry.originalReadingTimestamp)
            : gpsTelemetry.originalReadingTimestamp;
      }

      if (accuracy !== null) {
        if (accuracy <= 15) confidence = "high";
        else if (accuracy <= 40) confidence = "medium";
      }
    }

    await setDoc(
      tenantDoc(db, companyId, COLLECTION, docId),
      {
        type: "exit",
        userId,
        serviceId,
        communityName,
        detectedAt: Timestamp.fromDate(detectedAt),
        source,
        latitude,
        longitude,
        accuracy,
        speed,
        originalReadingTimestamp,
        confidence,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.log(
      `[GeoDetection] Salida persistida: ${communityName} (${source}), confianza: ${confidence}`,
    );
    return true;
  } catch (err) {
    console.error("[GeoDetection] Error persistiendo salida:", err);
    return false;
  }
}

/**
 * Obtiene las detecciones de hoy para un usuario.
 * Útil cuando localStorage ha sido borrado pero Firestore tiene los datos.
 *
 * @param {string} userId
 * @returns {Array} Lista de detecciones { type, serviceId, communityName, detectedAt, ... }
 */
export async function getTodayDetections(companyId, userId) {
  try {
    const today = new Date();
    const q = query(
      tenantCollection(db, companyId, COLLECTION),
      where("userId", "==", userId),
      where("detectedAt", ">=", Timestamp.fromDate(startOfDay(today))),
      where("detectedAt", "<=", Timestamp.fromDate(endOfDay(today))),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[GeoDetection] Error obteniendo detecciones:", err);
    return [];
  }
}

/**
 * Obtiene la detección de entrada para un servicio específico hoy.
 *
 * @param {string} userId
 * @param {string} serviceId
 * @returns {Object|null} La detección de entrada o null
 */
export async function getEntryDetection(companyId, userId, serviceId) {
  try {
    const detections = await getTodayDetections(companyId, userId);
    return findLatestDetection(detections, serviceId, "entry");
  } catch (err) {
    console.error("[GeoDetection] Error obteniendo detección de entrada:", err);
    return null;
  }
}

/**
 * Obtiene la detección de salida para un servicio específico hoy.
 *
 * @param {string} userId
 * @param {string} serviceId
 * @returns {Object|null}
 */
export async function getExitDetection(companyId, userId, serviceId) {
  try {
    const detections = await getTodayDetections(companyId, userId);
    return findLatestDetection(detections, serviceId, "exit");
  } catch (err) {
    console.error("[GeoDetection] Error obteniendo detección de salida:", err);
    return null;
  }
}
