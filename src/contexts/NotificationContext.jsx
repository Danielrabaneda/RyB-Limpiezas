import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { markAllNotificationsAsRead, deleteOldNotifications } from '../services/notificationService';

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  dismissAll: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

// Actualizar el número en el icono de la PWA (Badge)
const updateIconBadge = (count) => {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
};

/**
 * Provider consolidado de notificaciones.
 * Reemplaza los antiguos NotificationManager + BadgeManager + listener de TodayPage.
 * Un único onSnapshot para toda la app.
 */
export function NotificationProvider({ children }) {
  const { currentUser, isOperario } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Re-alert tracking
  const repeatTrackersRef = useRef({});
  const MAX_REPEATS = 10;
  const REPEAT_INTERVAL_MS = 20 * 1000; // 20 segundos entre repeticiones

  const cleanupTracker = useCallback((docId) => {
    const trackers = repeatTrackersRef.current;
    if (trackers[docId]) {
      clearInterval(trackers[docId].intervalId);
      delete trackers[docId];
    }
  }, []);

  // Listener consolidado
  useEffect(() => {
    // Si no hay usuario, limpiar notificaciones
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      updateIconBadge(0);
      return;
    }

    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', currentUser.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(notifs);
      const count = snapshot.size;
      setUnreadCount(count);

      // Actualizar badge del icono PWA
      updateIconBadge(count);

      // --- Sonido + Notificación nativa (lógica del antiguo NotificationManager) ---
      const trackers = repeatTrackersRef.current;

      // Limpiar trackers de notificaciones ya leídas
      const activeDocIds = new Set(snapshot.docs.map(d => d.id));
      Object.keys(trackers).forEach(docId => {
        if (!activeDocIds.has(docId)) {
          cleanupTracker(docId);
        }
      });

      // Procesar notificaciones nuevas
      for (const docSnap of snapshot.docs) {
        if (trackers[docSnap.id]) continue; // Ya tiene tracker

        const data = docSnap.data();
        const { sendNotification, playNotificationSound } = await import('../utils/geolocation');

        const title = data.title || 'RyB Limpiezas';
        const body = data.body || data.message || '';

        // Notificación inicial con sonido
        sendNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: docSnap.id,
          urgent: data.type === 'warning',
          serviceId: data.serviceId || null,
          targetUrl: data.targetUrl || null,
        });

        // Re-alertas periódicas CON awareness de visibilidad
        let repeatCount = 0;
        const intervalId = setInterval(() => {
          repeatCount++;
          if (repeatCount >= MAX_REPEATS) {
            cleanupTracker(docSnap.id);
            return;
          }

          // Solo reproducir re-alerta si la app NO está visible (el usuario no la está mirando)
          if (document.visibilityState !== 'visible') {
            console.log(`[Notifications] Re-alerta #${repeatCount} para: ${title}`);
            playNotificationSound(true);
          }
        }, REPEAT_INTERVAL_MS);

        trackers[docSnap.id] = { count: 0, intervalId };
      }
    }, (err) => {
      console.error('[NotificationContext] Error in snapshot:', err);
    });

    // Limpieza periódica de notificaciones antiguas (una vez por sesión)
    deleteOldNotifications(currentUser.uid).catch(() => {});

    return () => {
      unsubscribe();
      Object.keys(repeatTrackersRef.current).forEach(cleanupTracker);
    };
  }, [currentUser, cleanupTracker]);

  const dismissAll = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      await markAllNotificationsAsRead(currentUser.uid);
    } catch (err) {
      console.error('[NotificationContext] Error dismissing:', err);
    }
  }, [currentUser]);

  const value = {
    notifications,
    unreadCount,
    dismissAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
