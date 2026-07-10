import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveWorkday } from '../../services/workdayService';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunity } from '../../services/communityService';
import { getActiveCheckIn, completeCheckOut } from '../../services/checkInService';
import { getDistance, sendNotification } from '../../utils/geolocation';
import { createSystemNotification } from '../../services/notificationService';
import { persistEntryDetection, persistExitDetection } from '../../services/geoDetectionService';
import { registerForPushNotifications } from '../../services/fcmService';
import { format } from 'date-fns';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

// ==================== CONSTANTES ====================
const CHECK_INTERVAL = 30 * 1000;          // 30s polling de respaldo
const PROXIMITY_RADIUS_ENTRY = 60;          // 60m para detectar llegada
const PROXIMITY_RADIUS_EXIT = 50;           // 50m para detectar salida
const RE_NOTIFY_INTERVAL_MS = 3 * 60 * 1000; // Re-notificar cada 3 min
const ENTRY_CONFIRM_DELAY_MS = 20 * 1000;   // 20s de permanencia mínima para confirmar llegada
const EXIT_CONFIRM_DELAY_MS = 5 * 60 * 1000; // 5 min para confirmar salida
const COMMUNITY_CACHE_TTL = 10 * 60 * 1000;  // Caché de comunidades: 10 min
const MIN_ACCURACY_FOR_ENTRY = 40;          // No detectar entrada si precisión GPS > 40m
const MAX_ACCURACY_FOR_EXIT = 80;           // No detectar salida si precisión GPS > 80m
const LAST_POSITION_KEY = 'tracker_last_position'; // Persistir última posición para recovery
const MAX_SUSPENSION_FOR_ESTIMATE = 60 * 60 * 1000; // No estimar si suspensión > 1 hora

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
  const firstSeenInsideRef = useRef({});     // { serviceId: timestamp } para controlar permanencia mínima
  const watchIdRef = useRef(null);
  const communityCacheRef = useRef({});     // { communityId: { data, cachedAt } }
  const servicesRef = useRef([]);           // Caché de servicios del día
  const servicesCachedAtRef = useRef(0);    // Timestamp de último fetch de servicios
  const wakeLockRef = useRef(null);         // Wake Lock para mantener la pantalla activa
  const fcmRegisteredRef = useRef(false);   // Evitar re-registro de FCM

  // Refs para optimización y mejoras de geolocalización
  const activeWorkdayRef = useRef(null);
  const activeCheckInRef = useRef(null);
  const lastWatchPositionTimeRef = useRef(Date.now());
  const kalmanRef = useRef({
    lat: null,
    lng: null,
    variance: 1.0,
  });

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

    // --- SUSCRIPCIONES EN TIEMPO REAL PARA JORNADA Y CHECK-IN (Reducción de queries) ---
    const qWorkday = query(
      collection(db, 'workdays'),
      where('userId', '==', userProfile.uid)
    );
    const unsubscribeWorkday = onSnapshot(qWorkday, (snap) => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(wd => wd.status === 'active');
      
      setActiveWorkday(active || null);
      activeWorkdayRef.current = active || null;
      console.log('[Tracker] Estado de jornada actualizado:', active ? 'Activo' : 'Inactivo');
    }, (err) => {
      console.error("[Tracker] Error en suscripción a jornada:", err);
    });

    const qCheckIn = query(
      collection(db, 'checkIns'),
      where('userId', '==', userProfile.uid)
    );
    const unsubscribeCheckIn = onSnapshot(qCheckIn, (snap) => {
      const open = snap.docs
        .map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
        .filter(c => c.checkOutTime === null);
      
      if (open.length === 0) {
        activeCheckInRef.current = null;
      } else {
        const sorted = open.sort((a, b) => {
          const aTime = a.checkInTime ? (a.checkInTime.toDate ? a.checkInTime.toDate() : new Date(a.checkInTime)) : new Date();
          const bTime = b.checkInTime ? (b.checkInTime.toDate ? b.checkInTime.toDate() : new Date(b.checkInTime)) : new Date();
          return bTime - aTime;
        });
        activeCheckInRef.current = sorted[0];
      }
      console.log('[Tracker] Estado de check-in actualizado:', activeCheckInRef.current ? 'Activo' : 'Inactivo');
    }, (err) => {
      console.error("[Tracker] Error en suscripción a check-in:", err);
    });

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

        const { latitude: rawLat, longitude: rawLng, accuracy, speed, heading } = position.coords;
        lastWatchPositionTimeRef.current = Date.now();

        // 1D Kalman Filter to smooth out GPS noise
        let latitude = rawLat;
        let longitude = rawLng;

        let shouldResetKalman = kalmanRef.current.lat === null || wasAppSuspended;
        if (!shouldResetKalman && kalmanRef.current.lat !== null) {
          const rawDistanceMoved = getDistance(rawLat, rawLng, kalmanRef.current.lat, kalmanRef.current.lng);
          if (rawDistanceMoved > 200) {
            console.log(`[Kalman] Salto de posición de ${Math.round(rawDistanceMoved)}m detectado. Reseteando filtro.`);
            shouldResetKalman = true;
          }
        }

        if (shouldResetKalman) {
          kalmanRef.current = {
            lat: rawLat,
            lng: rawLng,
            variance: (accuracy * 0.000009) * (accuracy * 0.000009),
          };
        } else {
          // Process noise scales with speed to avoid lag when moving quickly
          const speedMps = (speed !== null && speed !== undefined && !isNaN(speed)) ? speed : 1.5;
          const processNoiseMeters = Math.max(1, speedMps * 2);
          const processNoiseDegrees = processNoiseMeters * 0.000009;
          const qNoise = processNoiseDegrees * processNoiseDegrees;
          
          kalmanRef.current.variance += qNoise;

          // Measurement noise based on reported accuracy
          const measurementNoiseDegrees = accuracy * 0.000009;
          const rNoise = measurementNoiseDegrees * measurementNoiseDegrees;

          // Kalman Gain
          const kGain = kalmanRef.current.variance / (kalmanRef.current.variance + rNoise);

          // Update position estimate
          kalmanRef.current.lat = kalmanRef.current.lat + kGain * (rawLat - kalmanRef.current.lat);
          kalmanRef.current.lng = kalmanRef.current.lng + kGain * (rawLng - kalmanRef.current.lng);
          kalmanRef.current.variance = (1 - kGain) * kalmanRef.current.variance;

          latitude = kalmanRef.current.lat;
          longitude = kalmanRef.current.lng;
        }

        // Leer posición anterior ANTES de guardar la nueva (para recovery inteligente)
        let prevPosition = null;
        try {
          const prevPosRaw = localStorage.getItem(LAST_POSITION_KEY);
          if (prevPosRaw) prevPosition = JSON.parse(prevPosRaw);
        } catch (e) { /* ignore */ }

        // Calcular velocidad
        let currentSpeed = speed; // m/s
        if (currentSpeed === null || currentSpeed === undefined || isNaN(currentSpeed)) {
          if (prevPosition && prevPosition.timestamp) {
            const timeSec = (Date.now() - prevPosition.timestamp) / 1000;
            if (timeSec > 0) {
              const distMeters = getDistance(rawLat, rawLng, prevPosition.lat, prevPosition.lng);
              currentSpeed = distMeters / timeSec;
            }
          }
        }
        const isSpeedTooHigh = currentSpeed !== null && currentSpeed > 8.33; // 8.33 m/s = 30 km/h

        // Persistir posición filtrada actual para futuros recoveries tras suspensión del SO
        localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({
          lat: latitude, lng: longitude, accuracy, timestamp: Date.now()
        }));

        console.log(`[GPS] Precisión: ${Math.round(accuracy)}m | Lat: ${latitude.toFixed(6)} | Lng: ${longitude.toFixed(6)}${wasAppSuspended ? ` | ⚠️ APP SUSPENDIDA ${Math.round(timeSinceLastProcess/1000)}s` : ''}${currentSpeed !== null ? ` | Vel: ${Math.round(currentSpeed * 3.6)} km/h` : ''}`);

        // 1. Verificar jornada activa
        const workday = activeWorkdayRef.current;

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
        const checkIn = activeCheckInRef.current;
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
                communityLat: commLat,
                communityLng: commLng,
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

                      // Auto-cerrar el fichaje en Firestore
                      try {
                        console.log(`[Tracker] Auto-cerrando fichaje ${checkIn.id} por salida detectada`);
                        await completeCheckOut(checkIn.id, latitude, longitude, new Date(pending.exitTime));
                        
                        sendNotification(
                          `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                          {
                            body: `Se ha completado el servicio automáticamente a las ${format(new Date(pending.exitTime), 'HH:mm')} tras detectar que saliste de la ubicación.`,
                            icon: '/icons/icon-192.png',
                            badge: '/icons/icon-192.png',
                            tag: `exit-${activeSvc.id}`,
                            urgent: true,
                            serviceId: activeSvc.id,
                          }
                        );
                        // Backup: FCM push desde servidor (despierta el teléfono en suspensión)
                        createSystemNotification(
                          userProfile.uid,
                          `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                          `Se ha completado el servicio automáticamente a las ${format(new Date(pending.exitTime), 'HH:mm')} tras detectar que saliste de la ubicación.`,
                          'warning',
                          activeSvc.id,
                          null,
                          'push_only'
                        );
                      } catch (checkoutErr) {
                        console.error('[Tracker] Error al auto-cerrar fichaje por salida:', checkoutErr);
                      }
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

                  // Auto-cerrar el fichaje en Firestore
                  try {
                    console.log(`[Tracker] Auto-cerrando fichaje ${checkIn.id} por salida inmediata tras suspensión`);
                    await completeCheckOut(checkIn.id, latitude, longitude, new Date(lastProcessedAt));
                    
                    sendNotification(
                      `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                      {
                        body: `Se cerró el servicio automáticamente con la hora de última actividad tras la inactividad detectada.`,
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                        tag: `exit-suspend-${activeSvc.id}`,
                        urgent: true,
                        serviceId: activeSvc.id,
                      }
                    );
                    // Backup: FCM push desde servidor (despierta el teléfono en suspensión)
                    createSystemNotification(
                      userProfile.uid,
                      `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                      `Se cerró el servicio automáticamente con la hora de última actividad tras la inactividad detectada.`,
                      'warning',
                      activeSvc.id,
                      null,
                      'push_only'
                    );
                  } catch (checkoutErr) {
                    console.error('[Tracker] Error al auto-cerrar fichaje por salida tras suspensión:', checkoutErr);
                  }
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

                      // Auto-cerrar el fichaje en Firestore
                      try {
                        console.log(`[Tracker] Auto-cerrando fichaje ${checkIn.id} tras 5 minutos fuera`);
                        await completeCheckOut(checkIn.id, latitude, longitude, new Date(pending.exitTime));
                        
                        sendNotification(
                          `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                          {
                            body: `Servicio completado automáticamente tras 5 minutos fuera de la ubicación.`,
                            icon: '/icons/icon-192.png',
                            badge: '/icons/icon-192.png',
                            tag: `exit-5min-${activeSvc.id}`,
                            urgent: true,
                            serviceId: activeSvc.id,
                          }
                        );
                        // Backup: FCM push desde servidor (despierta el teléfono en suspensión)
                        createSystemNotification(
                          userProfile.uid,
                          `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                          `Servicio completado automáticamente tras 5 minutos fuera de la ubicación.`,
                          'warning',
                          activeSvc.id,
                          null,
                          'push_only'
                        );
                      } catch (checkoutErr) {
                        console.error('[Tracker] Error al auto-cerrar fichaje tras 5 minutos fuera:', checkoutErr);
                      }
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

          // Filtrar: solo servicios pendientes, dentro del radio, con GPS suficientemente preciso y velocidad adecuada
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
              // Filtro de velocidad: ignorar entrada si el usuario viaja a más de 30 km/h (8.33 m/s)
              if (isSpeedTooHigh) {
                console.log(`[Tracker] ${s.communityName}: Velocidad demasiado alta (${Math.round(currentSpeed * 3.6)} km/h) para detectar entrada`);
                return false;
              }
              return true;
            })
            .sort((a, b) => a.distance - b.distance);

          // Limpiar temporizadores de entrada de servicios que no son el candidato más cercano en rango
          const closestId = nearby.length > 0 ? nearby[0].id : null;
          services.forEach(s => {
            if (s.id !== closestId) {
              if (firstSeenInsideRef.current[s.id]) {
                console.log(`[Tracker] Limpiando temporizador de entrada para ${s.communityName || s.id} (ya no es el más cercano)`);
                delete firstSeenInsideRef.current[s.id];
              }
            }
          });

          if (nearby.length > 0) {
            const closest = nearby[0];
            const previousState = lastStateRef.current[closest.id] || 'OUTSIDE';
            const lastNotifyTime = lastNotifyTimeRef.current[closest.id] || 0;
            const timeSinceLastNotify = now - lastNotifyTime;

            const isFirstEntry = previousState === 'OUTSIDE';

            // Solución A: Filtro de permanencia mínima de 90 segundos
            if (isFirstEntry) {
              if (!firstSeenInsideRef.current[closest.id]) {
                firstSeenInsideRef.current[closest.id] = now;
                console.log(`[Tracker] ${closest.communityName} en rango (${Math.round(closest.distance)}m). Iniciando temporizador de permanencia de 90s...`);
                return; // Esperar al siguiente ping GPS para verificar si permanece
              }

              const elapsed = now - firstSeenInsideRef.current[closest.id];
              if (elapsed < ENTRY_CONFIRM_DELAY_MS) {
                console.log(`[Tracker] ${closest.communityName} en rango. Tiempo restante para confirmar entrada: ${Math.round((ENTRY_CONFIRM_DELAY_MS - elapsed) / 1000)}s`);
                return; // Todavía no cumple los 90 segundos
              }

              console.log(`[Tracker] Temporizador de permanencia completado para ${closest.communityName} (${Math.round(elapsed / 1000)}s)`);
            }

            // Solución E: Priorización y exclusión mutua de notificaciones para comunidades adyacentes
            const activeInsideService = services.find(s => lastStateRef.current[s.id] === 'INSIDE');
            if (activeInsideService && activeInsideService.id !== closest.id) {
              console.log(`[Tracker] Silenciando entrada de ${closest.communityName} porque el usuario ya está marcado dentro de ${activeInsideService.communityName}`);
              return;
            }

            const shouldReNotify = previousState === 'INSIDE' && timeSinceLastNotify >= RE_NOTIFY_INTERVAL_MS;

            if (isFirstEntry || shouldReNotify) {
              const isRepeat = !isFirstEntry;
              console.log(`[Tracker] ${isRepeat ? 'RE-NOTIFICACIÓN' : 'ENTRADA DETECTADA'} - ${closest.communityName} (${Math.round(closest.distance)}m, GPS±${Math.round(accuracy)}m)`);

              lastStateRef.current[closest.id] = 'INSIDE';
              lastNotifyTimeRef.current[closest.id] = now;

              let detectedEntryTime = new Date();
              let entrySource = 'realtime';

              if (isFirstEntry) {
                // Si la app estuvo suspendida, estimar la hora real de llegada
                if (wasAppSuspended && prevPosition && lastProcessedAt > 0 && timeSinceLastProcess < MAX_SUSPENSION_FOR_ESTIMATE) {
                  const prevDist = getDistance(prevPosition.lat, prevPosition.lng, closest.communityLat, closest.communityLng);
                  if (prevDist <= closest.effectiveEntryRadius) {
                    // Ya estaba cerca antes de la suspensión → usar timestamp de la posición anterior
                    detectedEntryTime = new Date(prevPosition.timestamp);
                    entrySource = 'estimated';
                    console.log(`[Tracker] ⏱️ Llegada estimada (ya estaba cerca): ${detectedEntryTime.toLocaleTimeString()}`);
                  } else {
                    // No estaba cerca → llegó durante la suspensión → usar hora de última actividad
                    detectedEntryTime = new Date(lastProcessedAt);
                    entrySource = 'estimated';
                    console.log(`[Tracker] ⏱️ Llegada estimada (durante suspensión): ${detectedEntryTime.toLocaleTimeString()}`);
                  }
                }
              }

              localStorage.setItem(`detected_entry_${closest.id}`, detectedEntryTime.toISOString());
              localStorage.setItem(`detected_entry_source_${closest.id}`, entrySource);
              
              // Persistir en Firestore como backup
              persistEntryDetection(userProfile.uid, closest.id, closest.communityName, detectedEntryTime, closest.distance, entrySource);

              const title = isRepeat
                ? `🔔 Recuerdo: Estás en ${closest.communityName}`
                : `📍 Has llegado a ${closest.communityName}`;
              const body = isRepeat
                ? `Llevas un rato aquí. ¿Inicias el servicio?`
                : entrySource === 'estimated'
                  ? `Llegada estimada: ${detectedEntryTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. ¿Inicias el servicio?`
                  : `¿Quieres iniciar el servicio? Estás a ${Math.round(closest.distance)}m.`;

              sendNotification(title, {
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: `entry-${closest.id}`,
                urgent: false,
                serviceId: closest.id,
              });
              // Backup: FCM push desde servidor (despierta el teléfono en suspensión)
              createSystemNotification(
                userProfile.uid,
                title,
                body,
                'success',
                closest.id,
                null,
                'push_only'
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
              delete firstSeenInsideRef.current[s.id]; // Limpiar temporizador de permanencia
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
        console.log('[Tracker] App volvió a primer plano — doble disparo GPS (rápido + fresco)');
        // Re-adquirir Wake Lock (se pierde al ir a background)
        requestWakeLock();
        // Invalidar caché de servicios para obtener datos frescos
        servicesCachedAtRef.current = 0;
        // 1. Disparo RÁPIDO con posición cacheada (resultado casi instantáneo en iOS/Android)
        navigator.geolocation.getCurrentPosition(
          processPosition,
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
        // 2. Disparo FRESCO para confirmar posición actual (puede tardar 5-15s en interiores)
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            processPosition,
            (err) => console.warn('[Tracker] GPS fresh recovery error:', err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        }, 1000);
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
    // Solo dispara getCurrentPosition si watchPosition no ha respondido en 60s
    const fallbackInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastWatchPositionTimeRef.current;
      if (timeSinceLastUpdate > 60000) {
        console.warn(`[Tracker] watchPosition no ha respondido en ${Math.round(timeSinceLastUpdate/1000)}s. Ejecutando fallback getCurrentPosition.`);
        navigator.geolocation.getCurrentPosition(
          processPosition, 
          (err) => console.warn('[Tracker] Fallback GPS error:', err), 
          { enableHighAccuracy: true, timeout: 15000 }
        );
      }
    }, CHECK_INTERVAL);

    // ==================== CLEANUP ====================
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      clearInterval(fallbackInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
      unsubscribeWorkday();
      unsubscribeCheckIn();
    };
  }, [userProfile, isOperario, getCommunityWithCache, requestWakeLock, releaseWakeLock]);

  return null; // Componente invisible
}
