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
 * Reproduce un sonido de alerta usando la Web Audio API.
 * Genera un patrón de chime ascendente que se repite para llamar la atención.
 * @param {boolean} urgent - Si es true, reproduce el sonido 3 veces en lugar de 2
 */
export function playNotificationSound(urgent = false) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const playTone = (frequency, startTime, duration, volume = 0.45) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime + startTime);

      // Envolvente: subida rápida, caída suave
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + startTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + startTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);

      oscillator.start(audioCtx.currentTime + startTime);
      oscillator.stop(audioCtx.currentTime + startTime + duration);
    };

    // Patrón 1: tríada ascendente (C5 → E5 → G5)
    playTone(523.25, 0, 0.25, 0.5);
    playTone(659.25, 0.13, 0.25, 0.5);
    playTone(783.99, 0.26, 0.35, 0.6);

    // Patrón 2: repetición tras pausa corta
    playTone(523.25, 0.75, 0.25, 0.5);
    playTone(659.25, 0.88, 0.25, 0.5);
    playTone(783.99, 1.01, 0.35, 0.6);

    if (urgent) {
      // Patrón 3: tercera repetición más aguda para urgencia
      playTone(659.25, 1.5, 0.2, 0.55);
      playTone(783.99, 1.63, 0.2, 0.55);
      playTone(1046.50, 1.76, 0.4, 0.65); // C6
    }

    // Cerrar el AudioContext después de que terminen todos los tonos
    const totalDuration = urgent ? 2.5 : 1.6;
    setTimeout(() => audioCtx.close().catch(() => {}), totalDuration * 1000);
  } catch (e) {
    console.warn('[Sound] No se pudo reproducir sonido de notificación:', e);
  }
}

/**
 * Envía una notificación local con sonido y vibración
 */
export function sendNotification(title, options) {
  if (Notification.permission === 'granted') {
    const notificationOptions = {
      vibrate: [200, 100, 200, 100, 200], // Patrón de vibración: vibra, para, vibra...
      requireInteraction: true, // Mantener visible hasta que el usuario interactúe
      ...options
    };

    // 🔊 Reproducir sonido de alerta
    playNotificationSound(options?.urgent || false);

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
