import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveWorkday } from '../../services/workdayService';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunity } from '../../services/communityService';
import { getActiveCheckIn } from '../../services/checkInService';
import { getDistance } from '../../utils/geolocation';
import { createSystemNotification } from '../../services/notificationService';
import { persistEntryDetection, persistExitDetection } from '../../services/geoDetectionService';
import { registerForPushNotifications } from '../../services/fcmService';
import { format } from 'date-fns';

// ==================== CONSTANTES ====================
const CHECK_INTERVAL = 30 * 1000;          // 30s polling de respaldo
const PROXIMITY_RADIUS_ENTRY = 50;          // 50m para detectar llegada (antes 20m)
const PROXIMITY_RADIUS_EXIT = 100;          // 100m para detectar salida (antes 40m)
const RE_NOTIFY_INTERVAL_MS = 3 * 60 * 1000; // Re-notificar cada 3 min
const EXIT_CONFIRM_DELAY_MS = 5 * 60 * 1000; // 5 min para confirmar salida
const COMMUNITY_CACHE_TTL = 10 * 60 * 1000;  // Caché de comunidades: 10 min
const MIN_ACCURACY_FOR_ENTRY = 80;          // No detectar entrada si precisión GPS > 80m
const MAX_ACCURACY_FOR_EXIT = 150;          // No detectar salida si precisión GPS > 150m

// ==================== UTILIDADES DE CACHE LOCAL ====================

function getCompletedTodaySet() {
  try {
    const todayStr = new Date().toDateString();
    const raw = localStorage.getItem('completed_services_today');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === todayStr) {
        return new Set(parsed.ids || []);
      }
    }
  } catch (e) { /* ignore */ }
  return new Set();
}

function markServiceCompletedToday(serviceId) {
  try {
    const todayStr = new Date().toDateString();
    const existing = getCompletedTodaySet();
    existing.add(serviceId);
    localStorage.setItem('completed_services_today', JSON.stringify({
      date: todayStr,
      ids: Array.from(existing)
    }));
  } catch (e) { /* ignore */ }
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function GeolocationTracker() {
  const { userProfile, isOperario } = useAuth();
  const [activeWorkday, setActiveWorkday] = useState(null);

  // Refs para mantener estado entre actualizaciones del GPS sin re-renders
  const lastStateRef = useRef({});          // { serviceId: 'INSIDE' | 'OUTSIDE' }
  const lastNotifyTimeRef = useRef({});     // { serviceId: timestamp }
  const watchIdRef = useRef(null);
  const communityCacheRef = useRef({});     // { communityId: { data, cachedAt } }
  const servicesRef = useRef([]);           // Caché de servicios del día
  const servicesCachedAtRef = useRef(0);    // Timestamp de último fetch de servicios
  const wakeLockRef = useRef(null);         // Wake Lock para mantener la pantalla activa
  const fcmRegisteredRef = useRef(false);   // Evitar re-registro de FCM

  // ==================== REGISTRO FCM ====================
  useEffect(() => {
    if (!isOperario || !userProfile?.uid || fcmRegisteredRef.current) return;
    fcmRegisteredRef.current = true;
    
    // Registrar FCM token de forma asíncrona (no bloquea)
    registerForPushNotifications(userProfile.uid).catch(err => {
      console.warn('[Tracker] FCM registration failed (non-blocking):', err);
    });
  }, [isOperario, userProfile]);

  // ==================== OBTENER COMUNIDAD CON CACHÉ ====================
  const getCommunityWithCache = useCallback(async (communityId) => {
    const cached = communityCacheRef.current[communityId];
    if (cached && (Date.now() - cached.cachedAt) < COMMUNITY_CACHE_TTL) {
      return cached.data;
    }
    
    const community = await getCommunity(communityId);
    if (community) {
      communityCacheRef.current[communityId] = {
        data: community,
        cachedAt: Date.now()
      };
    }
    return community;
  }, []);

  // ==================== WAKE LOCK ====================
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
        console.log('[Tracker] Wake Lock activado para tracking GPS');
      }
    } catch (err) {
      console.warn('[Tracker] Wake Lock no disponible:', err.message);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) { /* ignore */ }
  }, []);

  // ==================== EFECTO PRINCIPAL DE TRACKING ====================
  useEffect(() => {
    if (!isOperario || !userProfile?.uid) return;

    // --- LIMPIEZA DIARIA DE DATOS LOCALES ---
    const lastClean = localStorage.getItem('last_geo_cleanup');
    const todayStr = new Date().toDateString();

    if (lastClean !== todayStr) {
      console.log("[Tracker] Realizando limpieza diaria de logs locales...");
      localStorage.removeItem('tracker_debug_logs');
      localStorage.removeItem('completed_services_today');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('detected_entry_') || key.startsWith('detected_exit_') || key.startsWith('detected_exit_pending_')) {
          localStorage.removeItem(key);
        }
      });
      localStorage.setItem('last_geo_cleanup', todayStr);
    }

    // ==================== PROCESAR POSICIÓN GPS ====================
    const processPosition = async (position) => {
      try {
        // --- Detectar suspensión de la app ---
        const lastProcessedAtStr = localStorage.getItem('tracker_last_processed_at');
        const lastProcessedAt = lastProcessedAtStr ? parseInt(lastProcessedAtStr) : 0;
        const timeSinceLastProcess = lastProcessedAt > 0 ? (Date.now() - lastProcessedAt) : 0;
        const wasAppSuspended = timeSinceLastProcess >= EXIT_CONFIRM_DELAY_MS;
        localStorage.setItem('tracker_last_processed_at', Date.now().toString());

        const { latitude, longitude, accuracy } = position.coords;
        console.log(`[GPS] Precisión: ${Math.round(accuracy)}m | Lat: ${latitude.toFixed(6)} | Lng: ${longitude.toFixed(6)}${wasAppSuspended ? ` | ⚠️ APP SUSPENDIDA ${Math.round(timeSinceLastProcess/1000)}s` : ''}`);

        // 1. Verificar jornada activa
        const workday = await getActiveWorkday(userProfile.uid);
        setActiveWorkday(workday);

        if (!workday) {
          // Sin jornada activa → liberar Wake Lock si lo teníamos
          await releaseWakeLock();
          return;
        }

        // Con jornada activa → solicitar Wake Lock para mantener GPS vivo
        await requestWakeLock();

        // 2. Obtener servicios (con caché de 2 minutos para reducir queries)
        const servicesCacheAge = Date.now() - servicesCachedAtRef.current;
        if (servicesCacheAge > 2 * 60 * 1000 || servicesRef.current.length === 0) {
          const freshServices = await getScheduledServicesForDate(userProfile.uid, new Date());
          servicesRef.current = Array.isArray(freshServices) ? freshServices : [];
          servicesCachedAtRef.current = Date.now();
        }
        const services = servicesRef.current;
        if (services.length === 0) return;

        // 3. Obtener check-in activo
        const checkIn = await getActiveCheckIn(userProfile.uid);
        const completedTodaySet = getCompletedTodaySet();

        // 4. Calcular distancias (usando caché de comunidades)
        const servicesWithDistance = [];
        const trackerLogs = JSON.parse(localStorage.getItem('tracker_debug_logs') || '[]');

        for (const svc of services) {
          const community = await getCommunityWithCache(svc.communityId);
          if (community?.location) {
            const commLat = community.location._lat || community.location.latitude;
            const commLng = community.location._long || community.location.longitude;

            if (commLat !== undefined && commLng !== undefined) {
              const dist = getDistance(latitude, longitude, commLat, commLng);
              
              // Radio efectivo: ajustar según precisión GPS
              // Si el GPS es impreciso, ampliamos el radio proporcionalmente
              const accuracyBonus = Math.max(0, accuracy - 20); // Bonus si precisión > 20m
              const effectiveEntryRadius = PROXIMITY_RADIUS_ENTRY + (accuracyBonus * 0.5);
              const effectiveExitRadius = PROXIMITY_RADIUS_EXIT + (accuracyBonus * 0.3);
              
              const logEntry = `[${new Date().toLocaleTimeString()}] ${community.name}: ${Math.round(dist)}m (GPS±${Math.round(accuracy)}m, R_in:${Math.round(effectiveEntryRadius)}m, R_out:${Math.round(effectiveExitRadius)}m) [${svc.status}]`;
              console.log(logEntry);

              trackerLogs.unshift(logEntry);
              if (trackerLogs.length > 15) trackerLogs.pop();

              servicesWithDistance.push({
                ...svc,
                distance: dist,
                communityName: community.name,
                effectiveEntryRadius,
                effectiveExitRadius,
                gpsAccuracy: accuracy
              });
            }
          }
        }
        localStorage.setItem('tracker_debug_logs', JSON.stringify(trackerLogs));

        // ==================== LÓGICA DE DETECCIÓN ====================

        // CASO A: Trabajando en un servicio → detectar SALIDA
        if (checkIn) {
          const activeSvc = servicesWithDistance.find(s => s.id === checkIn.scheduledServiceId);
          if (activeSvc) {
            // No evaluar salida si GPS es demasiado impreciso
            if (accuracy > MAX_ACCURACY_FOR_EXIT) {
              console.log(`[Tracker] GPS demasiado impreciso (${Math.round(accuracy)}m) para evaluar salida, ignorando`);
              return;
            }

            const isInside = activeSvc.distance <= activeSvc.effectiveExitRadius;
            const previousState = lastStateRef.current[activeSvc.id] || 'INSIDE';
            const pendingKey = `detected_exit_pending_${activeSvc.id}`;
            const confirmedKey = `detected_exit_${activeSvc.id}`;

            if (!isInside) {
              if (previousState === 'INSIDE') {
                lastStateRef.current[activeSvc.id] = 'OUTSIDE';

                const existingPendingRaw = localStorage.getItem(pendingKey);
                const alreadyConfirmed = localStorage.getItem(confirmedKey);

                if (alreadyConfirmed) {
                  console.log("[Tracker] Ya hay salida confirmada, no se sobreescribe");
                } else if (existingPendingRaw) {
                  // Pending previo: verificar si ya pasaron 5 min
                  try {
                    const pending = JSON.parse(existingPendingRaw);
                    const elapsed = Date.now() - pending.firstDetectedAt;

                    if (elapsed >= EXIT_CONFIRM_DELAY_MS) {
                      console.log(`[Tracker] SALIDA CONFIRMADA (pending recuperado, ${Math.round(elapsed/1000)}s)`);
                      localStorage.setItem(confirmedKey, pending.exitTime);
                      localStorage.removeItem(pendingKey);

                      // Persistir en Firestore
                      persistExitDetection(userProfile.uid, activeSvc.id, activeSvc.communityName, new Date(pending.exitTime), 'confirmed');

                      createSystemNotification(
                        userProfile.uid,
                        `🏃 Salida confirmada de ${activeSvc.communityName}`,
                        `Se detectó tu salida y llevas tiempo fuera. Puedes finalizar con la hora detectada.`,
                        'warning',
                        activeSvc.id
                      );
                    }
                  } catch (e) {
                    localStorage.removeItem(pendingKey);
                  }
                } else if (wasAppSuspended) {
                  // App suspendida >= 5 min, usuario fuera → salida inmediata
                  const estimatedExitTime = new Date(lastProcessedAt).toISOString();
                  console.log(`[Tracker] SALIDA CONFIRMADA INMEDIATA (app suspendida ${Math.round(timeSinceLastProcess/60000)} min)`);
                  localStorage.setItem(confirmedKey, estimatedExitTime);

                  persistExitDetection(userProfile.uid, activeSvc.id, activeSvc.communityName, new Date(lastProcessedAt), 'estimated');

                  createSystemNotification(
                    userProfile.uid,
                    `🏃 Salida detectada de ${activeSvc.communityName}`,
                    `Se detectó que ya no estás en la comunidad. Puedes finalizar con la hora estimada de salida.`,
                    'warning',
                    activeSvc.id
                  );
                } else {
                  // Primera detección de salida → esperar 5 min
                  console.log("[Tracker] SALIDA DETECTADA - Iniciando espera de 5 minutos");
                  const now = new Date().toISOString();
                  localStorage.setItem(pendingKey, JSON.stringify({
                    exitTime: now,
                    firstDetectedAt: Date.now()
                  }));
                }
              } else {
                // Ya estaba OUTSIDE → comprobar si han pasado 5 min
                const pendingRaw = localStorage.getItem(pendingKey);
                if (pendingRaw && !localStorage.getItem(confirmedKey)) {
                  try {
                    const pending = JSON.parse(pendingRaw);
                    const elapsed = Date.now() - pending.firstDetectedAt;

                    if (elapsed >= EXIT_CONFIRM_DELAY_MS) {
                      console.log("[Tracker] SALIDA CONFIRMADA tras 5 minutos fuera");
                      localStorage.setItem(confirmedKey, pending.exitTime);
                      localStorage.removeItem(pendingKey);

                      persistExitDetection(userProfile.uid, activeSvc.id, activeSvc.communityName, new Date(pending.exitTime), 'confirmed');

                      createSystemNotification(
                        userProfile.uid,
                        `🏃 Salida confirmada de ${activeSvc.communityName}`,
                        `Llevas 5 min fuera. Puedes finalizar el servicio con la hora de salida detectada.`,
                        'warning',
                        activeSvc.id
                      );
                    }
                  } catch (e) {
                    localStorage.removeItem(pendingKey);
                  }
                }
              }
            } else {
              // Ha vuelto a entrar → cancelar pending
              if (previousState === 'OUTSIDE') {
                console.log("[Tracker] Ha vuelto a entrar - Cancelando salida pendiente");
                localStorage.removeItem(pendingKey);
              }
              lastStateRef.current[activeSvc.id] = 'INSIDE';
            }
          }
        }

        // CASO B: En ruta → detectar ENTRADA
        else {
          const now = Date.now();

          // Filtrar: solo servicios pendientes, dentro del radio, con GPS suficientemente preciso
          const nearby = servicesWithDistance
            .filter(s => {
              if (s.distance > s.effectiveEntryRadius) return false;
              if (s.status !== 'pending') return false;
              if (completedTodaySet.has(s.id)) return false;
              if (['completed', 'in_progress', 'missed'].includes(s.status)) return false;
              // No detectar entrada con GPS impreciso
              if (s.gpsAccuracy > MIN_ACCURACY_FOR_ENTRY) {
                console.log(`[Tracker] ${s.communityName}: GPS demasiado impreciso (${Math.round(s.gpsAccuracy)}m) para detectar entrada`);
                return false;
              }
              return true;
            })
            .sort((a, b) => a.distance - b.distance);

          if (nearby.length > 0) {
            const closest = nearby[0];
            const previousState = lastStateRef.current[closest.id] || 'OUTSIDE';
            const lastNotifyTime = lastNotifyTimeRef.current[closest.id] || 0;
            const timeSinceLastNotify = now - lastNotifyTime;

            const isFirstEntry = previousState === 'OUTSIDE';
            const shouldReNotify = previousState === 'INSIDE' && timeSinceLastNotify >= RE_NOTIFY_INTERVAL_MS;

            if (isFirstEntry || shouldReNotify) {
              const isRepeat = !isFirstEntry;
              console.log(`[Tracker] ${isRepeat ? 'RE-NOTIFICACIÓN' : 'ENTRADA DETECTADA'} - ${closest.communityName} (${Math.round(closest.distance)}m, GPS±${Math.round(accuracy)}m)`);

              lastStateRef.current[closest.id] = 'INSIDE';
              lastNotifyTimeRef.current[closest.id] = now;

              if (isFirstEntry) {
                const detectedTime = new Date();
                localStorage.setItem(`detected_entry_${closest.id}`, detectedTime.toISOString());
                
                // Persistir en Firestore como backup
                persistEntryDetection(userProfile.uid, closest.id, closest.communityName, detectedTime, closest.distance);
              }

              const title = isRepeat
                ? `🔔 Recuerdo: Estás en ${closest.communityName}`
                : `📍 Has llegado a ${closest.communityName}`;
              const body = isRepeat
                ? `Llevas un rato aquí. ¿Inicias el servicio?`
                : `¿Quieres iniciar el servicio? Estás a ${Math.round(closest.distance)}m.`;

              createSystemNotification(
                userProfile.uid,
                title,
                body,
                'success',
                closest.id
              );
            }
          }

          // Resetear estados de comunidades lejanas
          servicesWithDistance.forEach(s => {
            if (s.distance > s.effectiveExitRadius * 2) {
              if (lastStateRef.current[s.id] === 'INSIDE') {
                console.log(`[Tracker] Salida sin fichaje: ${s.communityName}`);
                const exitTime = new Date();
                localStorage.setItem(`detected_exit_${s.id}`, exitTime.toISOString());
                persistExitDetection(userProfile.uid, s.id, s.communityName, exitTime, 'confirmed');
              }
              lastStateRef.current[s.id] = 'OUTSIDE';
              delete lastNotifyTimeRef.current[s.id];
            }
          });

          // Actualizar cache de servicios completados
          servicesWithDistance.forEach(s => {
            if (s.status === 'completed' && !completedTodaySet.has(s.id)) {
              markServiceCompletedToday(s.id);
            }
          });
        }
      } catch (err) {
        console.error("[Tracker] Error procesando posición:", err);
      }
    };

    // ==================== MANEJAR VISIBILIDAD (RECOVERY) ====================
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Tracker] App volvió a primer plano — solicitando GPS inmediato');
        // Re-adquirir Wake Lock (se pierde al ir a background)
        requestWakeLock();
        // Forzar una comprobación GPS inmediata al volver
        navigator.geolocation.getCurrentPosition(
          processPosition,
          (err) => console.warn('[Tracker] GPS recovery error:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        // Invalidar caché de servicios para obtener datos frescos
        servicesCachedAtRef.current = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ==================== INICIAR TRACKING GPS ====================
    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => console.error("Error GPS watchPosition:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000
      }
    );

    // Fallback: comprobación manual cada 30s por si watchPosition se detiene
    const fallbackInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(processPosition, null, { enableHighAccuracy: true, timeout: 15000 });
    }, CHECK_INTERVAL);

    // ==================== CLEANUP ====================
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      clearInterval(fallbackInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [userProfile, isOperario, getCommunityWithCache, requestWakeLock, releaseWakeLock]);

  return null; // Componente invisible
}
