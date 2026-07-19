/**
 * Servicio de Firebase Cloud Messaging (FCM) para notificaciones push.
 * Gestiona el registro del token FCM y la suscripción a mensajes en foreground.
 */
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import app from "../config/firebase";
import { tenantDoc } from "../utils/tenantFirestore";

let messagingInstance = null;

/**
 * Obtiene la instancia de Firebase Messaging (singleton).
 * Puede fallar en navegadores que no soporten la API.
 */
function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  try {
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn(
      "[FCM] Firebase Messaging no disponible en este navegador:",
      err.message,
    );
    return null;
  }
}

/**
 * Registra al usuario para recibir notificaciones push vía FCM.
 * Obtiene un token único del dispositivo y lo guarda en Firestore.
 *
 * @param {string} userId - UID del usuario
 * @returns {string|null} El token FCM o null si no se pudo registrar
 */
export async function registerForPushNotifications(companyId, userId) {
  if (!userId) return null;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn(
      "[FCM] No hay VAPID key configurada. Push notifications desactivadas.",
    );
    console.warn("[FCM] Añade VITE_FIREBASE_VAPID_KEY en el archivo .env");
    return null;
  }

  // Verificar soporte del navegador
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[FCM] Este navegador no soporta Push Notifications");
    return null;
  }

  // Verificar permiso de notificaciones
  if (Notification.permission !== "granted") {
    console.warn("[FCM] Permiso de notificaciones no concedido");
    return null;
  }

  try {
    const messaging = getMessagingInstance();
    if (!messaging) return null;

    // Esperar a que el Service Worker esté listo
    const swRegistration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      console.log("[FCM] Token obtenido correctamente");

      // Guardar token en Firestore (un doc por dispositivo)
      const tokenDocId = `${userId}_${hashToken(token)}`;
      await setDoc(tenantDoc(db, companyId, "fcmTokens", tokenDocId), {
        token,
        userId,
        platform: "web",
        userAgent: navigator.userAgent.substring(0, 200),
        updatedAt: serverTimestamp(),
      });

      console.log("[FCM] Token guardado en Firestore");
      return token;
    } else {
      console.warn("[FCM] No se pudo obtener token FCM");
      return null;
    }
  } catch (err) {
    console.error("[FCM] Error al registrar push notifications:", err);
    return null;
  }
}

/**
 * Escucha mensajes FCM en primer plano.
 * Cuando la app está abierta, los mensajes push llegan como eventos JS
 * en vez de como notificaciones del sistema.
 *
 * @param {Function} callback - Función a ejecutar con el payload del mensaje
 * @returns {Function|null} Función para cancelar la suscripción
 */
export function onForegroundMessage(callback) {
  try {
    const messaging = getMessagingInstance();
    if (!messaging) return null;
    return onMessage(messaging, callback);
  } catch (err) {
    console.warn("[FCM] Error configurando listener de foreground:", err);
    return null;
  }
}

/**
 * Genera un hash corto del token para usarlo como parte del ID del documento.
 * Permite que un usuario tenga múltiples tokens (múltiples dispositivos).
 */
function hashToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convertir a 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
