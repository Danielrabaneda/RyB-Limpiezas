import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';

/**
 * Crea una notificación de sistema para un usuario específico.
 * Se utiliza para activar el "punto rojo" (Badge) en la app.
 */
export const createSystemNotification = async (userId, title, body, type = 'info', serviceId = null) => {
  try {
    await addDoc(collection(db, 'systemNotifications'), {
      userId,
      title,
      body,
      type,
      serviceId,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log(`[NotificationService] Alerta creada para ${userId}: ${title}`);
  } catch (error) {
    console.error('[NotificationService] Error creando notificación:', error);
  }
};

/**
 * Marca todas las notificaciones de un usuario como leídas.
 */
export const markAllNotificationsAsRead = async (userId) => {
  if (!userId) return;
  try {
    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    
    await batch.commit();
    console.log(`[NotificationService] Marcadas como leídas todas las notificaciones (${snapshot.size}) para ${userId}`);
  } catch (error) {
    console.error('[NotificationService] Error marcando notificaciones como leídas:', error);
  }
};
