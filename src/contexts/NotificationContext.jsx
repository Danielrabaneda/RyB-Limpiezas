import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { markAllNotificationsAsRead, deleteOldNotifications, markNotificationAsRead } from '../services/notificationService';

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  dismissAll: () => {},
  triggerWorkdayStartPopups: () => {},
  triggerWorkdayEndPopups: () => {},
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
  const [activePopupNotif, setActivePopupNotif] = useState(null);
  const shownPopupIdsRef = useRef(new Set());

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
      setActivePopupNotif(null);
      shownPopupIdsRef.current.clear();
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

        // Las notificaciones 'push_only' (GPS/ubicación) se gestionan por FCM del servidor
        // y el tracker ya envió la push local. No reproducir sonido ni re-alertas aquí.
        if (data.triggerEvent === 'push_only') {
          trackers[docSnap.id] = { count: 0, intervalId: null }; // Marcar como procesada
          continue;
        }

        const { sendNotification, playNotificationSound } = await import('../utils/geolocation');

        const title = data.title || 'RyB Limpiezas';
        const body = data.body || data.message || '';

        // Notificación inicial con sonido (solo si la app está en segundo plano)
        if (document.visibilityState !== 'visible') {
          sendNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: docSnap.id,
            urgent: data.type === 'warning',
            serviceId: data.serviceId || null,
            targetUrl: data.targetUrl || null,
          });
        } else {
          // Si está activa en primer plano, solo reproducir sonido
          playNotificationSound(true);
        }

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

  // Auto-trigger popups for new notifications (immediate only)
  useEffect(() => {
    if (!currentUser) return;
    
    // 1. Check for immediate popups
    const unseenImmediate = notifications.find(n => {
      const trigger = n.triggerEvent || 'immediate';
      return trigger === 'immediate' && !shownPopupIdsRef.current.has(n.id);
    });

    if (unseenImmediate) {
      shownPopupIdsRef.current.add(unseenImmediate.id);
      setActivePopupNotif(unseenImmediate);
      return;
    }
  }, [notifications, currentUser]);

  const triggerWorkdayStartPopups = useCallback(() => {
    const workdayStartNotif = notifications.find(n => {
      return (n.triggerEvent === 'workday_start' || n.triggerEvent === 'app_start') && !shownPopupIdsRef.current.has(n.id);
    });
    if (workdayStartNotif) {
      shownPopupIdsRef.current.add(workdayStartNotif.id);
      setActivePopupNotif(workdayStartNotif);
    }
  }, [notifications]);

  const triggerWorkdayEndPopups = useCallback(() => {
    const workdayEndNotif = notifications.find(n => {
      return n.triggerEvent === 'workday_end' && !shownPopupIdsRef.current.has(n.id);
    });
    if (workdayEndNotif) {
      shownPopupIdsRef.current.add(workdayEndNotif.id);
      setActivePopupNotif(workdayEndNotif);
    }
  }, [notifications]);

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
    triggerWorkdayStartPopups,
    triggerWorkdayEndPopups,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {activePopupNotif && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div 
            className="animate-scaleUp"
            style={{
              background: 'white',
              borderRadius: '28px',
              width: '90%',
              maxWidth: '380px',
              padding: '32px 24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              textAlign: 'center',
              border: activePopupNotif.type === 'danger' ? '4px solid #ef4444' : 
                      activePopupNotif.type === 'warning' ? '4px solid #eab308' : 
                      activePopupNotif.type === 'success' ? '4px solid #22c55e' : '4px solid #3b82f6'
            }}
          >
            <div style={{
              fontSize: '3rem',
              marginBottom: '20px',
              display: 'inline-block'
            }}>
              {activePopupNotif.type === 'danger' ? '🚨' : 
               activePopupNotif.type === 'warning' ? '⚠️' : 
               activePopupNotif.type === 'success' ? '✅' : '📢'}
            </div>
            
            <h3 style={{
              fontSize: '1.4rem',
              fontWeight: 900,
              color: '#0f172a',
              margin: '0 0 16px 0',
              lineHeight: 1.25
            }}>
              {activePopupNotif.title}
            </h3>
            
            <p style={{
              fontSize: '0.95rem',
              color: '#334155',
              margin: '0 0 28px 0',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap'
            }}>
              {activePopupNotif.body}
            </p>
            
            <button
              onClick={async () => {
                const notifId = activePopupNotif.id;
                setActivePopupNotif(null);
                try {
                  await markNotificationAsRead(notifId);
                } catch (err) {
                  console.error('Error marking notification as read:', err);
                }
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '16px',
                border: 'none',
                background: activePopupNotif.type === 'danger' ? '#ef4444' : 
                            activePopupNotif.type === 'warning' ? '#eab308' : 
                            activePopupNotif.type === 'success' ? '#22c55e' : '#3b82f6',
                color: 'white',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                transition: 'transform 0.1s ease',
                outline: 'none'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
