import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Crea una notificación de sistema para un usuario específico.
 * Se utiliza para activar el "punto rojo" (Badge) en la app.
 */
export const createSystemNotification = async (userId, message, type = 'info', serviceId = null) => {
  try {
    await addDoc(collection(db, 'systemNotifications'), {
      userId,
      message,
      type,
      serviceId,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log(`[NotificationService] Alerta creada para ${userId}: ${message}`);
  } catch (error) {
    console.error('[NotificationService] Error creando notificación:', error);
  }
};
