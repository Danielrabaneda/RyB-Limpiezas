import { db } from "../config/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
  doc,
  updateDoc,
} from "firebase/firestore";

const BATCH_LIMIT = 500;

/**
 * Ejecuta un batch de escritura en bloques de 500 (límite de Firestore).
 */
async function commitInChunks(refs, operation) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + BATCH_LIMIT);
    chunk.forEach((ref) => operation(batch, ref));
    await batch.commit();
  }
}

/**
 * Crea una notificación de sistema para un usuario específico.
 * Se utiliza para activar el "punto rojo" (Badge) en la app.
 */
export const createSystemNotification = async (
  userId,
  title,
  body,
  type = "info",
  serviceId = null,
  targetUrl = null,
  triggerEvent = "immediate",
) => {
  try {
    await addDoc(collection(db, "systemNotifications"), {
      userId,
      title,
      body,
      type,
      serviceId,
      targetUrl,
      triggerEvent,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log(
      `[NotificationService] Alerta creada para ${userId}: ${title} (Trigger: ${triggerEvent})`,
    );
  } catch (error) {
    console.error("[NotificationService] Error creando notificación:", error);
  }
};

/**
 * Marca una única notificación específica como leída.
 */
export const markNotificationAsRead = async (notificationId) => {
  if (!notificationId) return;
  try {
    const ref = doc(db, "systemNotifications", notificationId);
    await updateDoc(ref, { read: true });
    console.log(`[NotificationService] Marcada como leída: ${notificationId}`);
  } catch (error) {
    console.error(
      "[NotificationService] Error marcando notificación como leída:",
      error,
    );
  }
};

/**
 * Marca todas las notificaciones de un usuario como leídas.
 * Soporta más de 500 notificaciones mediante chunking de batches.
 */
export const markAllNotificationsAsRead = async (userId) => {
  if (!userId) return;
  try {
    const q = query(
      collection(db, "systemNotifications"),
      where("userId", "==", userId),
      where("read", "==", false),
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    await commitInChunks(
      snapshot.docs.map((d) => d.ref),
      (batch, ref) => batch.update(ref, { read: true }),
    );
    console.log(
      `[NotificationService] Marcadas como leídas: ${snapshot.size} para ${userId}`,
    );
  } catch (error) {
    console.error(
      "[NotificationService] Error marcando notificaciones como leídas:",
      error,
    );
  }
};

/**
 * Elimina notificaciones antiguas para evitar acumulación infinita en Firestore.
 * - Leídas con más de 7 días → se eliminan
 * - No leídas con más de 30 días → se eliminan
 * Se ejecuta una vez por sesión de forma silenciosa.
 */
export const deleteOldNotifications = async (userId) => {
  if (!userId) return;
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Notificaciones leídas antiguas (>7 días)
    const readQ = query(
      collection(db, "systemNotifications"),
      where("userId", "==", userId),
      where("read", "==", true),
      where("createdAt", "<", Timestamp.fromDate(sevenDaysAgo)),
    );

    // Notificaciones no leídas muy antiguas (>30 días)
    const unreadQ = query(
      collection(db, "systemNotifications"),
      where("userId", "==", userId),
      where("read", "==", false),
      where("createdAt", "<", Timestamp.fromDate(thirtyDaysAgo)),
    );

    const [readSnap, unreadSnap] = await Promise.all([
      getDocs(readQ),
      getDocs(unreadQ),
    ]);
    const allRefs = [...readSnap.docs, ...unreadSnap.docs].map((d) => d.ref);

    if (allRefs.length === 0) return;

    await commitInChunks(allRefs, (batch, ref) => batch.delete(ref));
    console.log(
      `[NotificationService] Limpieza: eliminadas ${allRefs.length} notificaciones antiguas para ${userId}`,
    );
  } catch (error) {
    // Silencioso: la limpieza es best-effort, no debe interrumpir la UX
    console.warn(
      "[NotificationService] Error en limpieza de notificaciones antiguas:",
      error.message,
    );
  }
};
