/**
 * Servicio de detecciones de geolocalización persistidas en Firestore.
 * Complementa el almacenamiento en localStorage con persistencia server-side.
 * Permite que las detecciones de entrada/salida sobrevivan a limpiezas de caché.
 */
import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, serverTimestamp, Timestamp, deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay } from 'date-fns';

const COLLECTION = 'geoDetections';

/**
 * Registra una detección de entrada (llegada a una comunidad).
 * 
 * @param {string} userId
 * @param {string} serviceId - ID del servicio programado
 * @param {string} communityName - Nombre de la comunidad
 * @param {Date} detectedAt - Hora de detección
 * @param {number} distance - Distancia en metros al punto de la comunidad
 */
export async function persistEntryDetection(userId, serviceId, communityName, detectedAt, distance) {
  try {
    const docId = `entry_${userId}_${serviceId}_${detectedAt.toISOString().slice(0, 10)}`;
    await setDoc(doc(db, COLLECTION, docId), {
      type: 'entry',
      userId,
      serviceId,
      communityName,
      detectedAt: Timestamp.fromDate(detectedAt),
      distance: Math.round(distance),
      createdAt: serverTimestamp(),
    }, { merge: true }); // merge para no sobreescribir si ya existe
    console.log(`[GeoDetection] Entrada persistida: ${communityName} a ${Math.round(distance)}m`);
  } catch (err) {
    console.error('[GeoDetection] Error persistiendo entrada:', err);
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
export async function persistExitDetection(userId, serviceId, communityName, detectedAt, source = 'confirmed') {
  try {
    const docId = `exit_${userId}_${serviceId}_${detectedAt.toISOString().slice(0, 10)}`;
    await setDoc(doc(db, COLLECTION, docId), {
      type: 'exit',
      userId,
      serviceId,
      communityName,
      detectedAt: Timestamp.fromDate(detectedAt),
      source,
      createdAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[GeoDetection] Salida persistida: ${communityName} (${source})`);
  } catch (err) {
    console.error('[GeoDetection] Error persistiendo salida:', err);
  }
}

/**
 * Obtiene las detecciones de hoy para un usuario.
 * Útil cuando localStorage ha sido borrado pero Firestore tiene los datos.
 * 
 * @param {string} userId
 * @returns {Array} Lista de detecciones { type, serviceId, communityName, detectedAt, ... }
 */
export async function getTodayDetections(userId) {
  try {
    const today = new Date();
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('detectedAt', '>=', Timestamp.fromDate(startOfDay(today))),
      where('detectedAt', '<=', Timestamp.fromDate(endOfDay(today)))
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GeoDetection] Error obteniendo detecciones:', err);
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
export async function getEntryDetection(userId, serviceId) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const docId = `entry_${userId}_${serviceId}_${todayStr}`;
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    console.error('[GeoDetection] Error obteniendo detección de entrada:', err);
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
export async function getExitDetection(userId, serviceId) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const docId = `exit_${userId}_${serviceId}_${todayStr}`;
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    console.error('[GeoDetection] Error obteniendo detección de salida:', err);
    return null;
  }
}
