/**
 * Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}

/**
 * Solicita permiso de notificación
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

/**
 * Envía una notificación local
 */
export function sendNotification(title, options) {
  if (Notification.permission === 'granted') {
    const notificationOptions = {
      vibrate: [200, 100, 200, 100, 200], // Patrón de vibración: vibra, para, vibra...
      ...options
    };

    // Intentar actualizar el Badge del icono (el punto rojo)
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(1).catch(() => {});
    }

    // Si tenemos Service Worker, usarlo (mejor para cuando la app está minimizada)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, notificationOptions);
      });
    } else {
      new Notification(title, notificationOptions);
    }
  }
}
