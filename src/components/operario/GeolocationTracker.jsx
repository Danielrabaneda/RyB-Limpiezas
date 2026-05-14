import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveWorkday } from '../../services/workdayService';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunity } from '../../services/communityService';
import { getActiveCheckIn } from '../../services/checkInService';
import { getDistance, requestNotificationPermission, sendNotification } from '../../utils/geolocation';
import { createSystemNotification } from '../../services/notificationService';
import { format } from 'date-fns';

const CHECK_INTERVAL = 30 * 1000; // 30s para ahorrar batería, pero reactivo
const PROXIMITY_RADIUS_ENTRY = 20; // Reducido a 20m por petición del usuario
const PROXIMITY_RADIUS_EXIT = 40; // Reducido a 40m (doble del radio de entrada)
const RE_NOTIFY_INTERVAL_MS = 3 * 60 * 1000; // Re-notificar cada 3 minutos si sigue cerca

/**
 * Obtiene la lista de serviceIds completados hoy desde localStorage.
 */
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

/**
 * Marca un serviceId como completado hoy en localStorage.
 */
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

export default function GeolocationTracker() {
  const { userProfile, isOperario } = useAuth();
  const [activeWorkday, setActiveWorkday] = useState(null);
  
  // Refs para mantener estado entre actualizaciones del GPS sin re-renders
  const lastStateRef = useRef({}); // { serviceId: 'INSIDE' | 'OUTSIDE' }
  const lastNotifyTimeRef = useRef({}); // { serviceId: timestamp } - cuándo se notificó por última vez
  const watchIdRef = useRef(null);

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
        if (key.startsWith('detected_entry_') || key.startsWith('detected_exit_')) {
          localStorage.removeItem(key);
        }
      });
      localStorage.setItem('last_geo_cleanup', todayStr);
    }
    // ----------------------------------------

    requestNotificationPermission();

    const processPosition = async (position) => {
      try {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`[GPS] Precisión: ${Math.round(accuracy)}m. Lat: ${latitude}, Lng: ${longitude}`);

        // 1. Verificar si hay jornada activa
        const workday = await getActiveWorkday(userProfile.uid);
        setActiveWorkday(workday);
        if (!workday) return;

        // 2. Obtener servicios y check-in actual
        const [servicesResult, checkIn] = await Promise.all([
          getScheduledServicesForDate(userProfile.uid, new Date()),
          getActiveCheckIn(userProfile.uid)
        ]);
        
        const services = Array.isArray(servicesResult) ? servicesResult : [];
        if (services.length === 0) return;

        // Obtener lista de servicios ya completados hoy (cache local)
        const completedTodaySet = getCompletedTodaySet();

        // 3. Calcular distancias
        const servicesWithDistance = [];
        const trackerLogs = JSON.parse(localStorage.getItem('tracker_debug_logs') || '[]');
        
        for (const svc of services) {
          const community = await getCommunity(svc.communityId);
          if (community?.location) {
            const commLat = community.location._lat || community.location.latitude;
            const commLng = community.location._long || community.location.longitude;
            
            if (commLat !== undefined && commLng !== undefined) {
              const dist = getDistance(latitude, longitude, commLat, commLng);
              const logEntry = `[${new Date().toLocaleTimeString()}] ${community.name}: ${Math.round(dist)}m (Prec: ${Math.round(accuracy)}m) [${svc.status}]`;
              console.log(logEntry);
              
              // Guardar últimos 10 logs para depuración en UI
              trackerLogs.unshift(logEntry);
              if (trackerLogs.length > 10) trackerLogs.pop();
              
              servicesWithDistance.push({ ...svc, distance: dist, communityName: community.name });
            }
          }
        }
        localStorage.setItem('tracker_debug_logs', JSON.stringify(trackerLogs));

        // 4. Si no hay jornada, no enviamos notificaciones pero ya hemos logueado la distancia
        if (!workday) {
          console.log("[Tracker] Sin jornada activa - no se envían notificaciones");
          return;
        }

        // --- LÓGICA DE DETECCIÓN ---

        // CASO A: Trabajando en un servicio (Detectar SALIDA)
        if (checkIn) {
          const activeSvc = servicesWithDistance.find(s => s.id === checkIn.scheduledServiceId);
          if (activeSvc) {
            const isInside = activeSvc.distance <= PROXIMITY_RADIUS_EXIT;
            const previousState = lastStateRef.current[activeSvc.id] || 'INSIDE';

            if (!isInside && previousState === 'INSIDE') {
              console.log("[Tracker] SALIDA DETECTADA");
              lastStateRef.current[activeSvc.id] = 'OUTSIDE';
              const now = new Date().toISOString();
              
              localStorage.setItem(`detected_exit_${activeSvc.id}`, now);
              
              const title = `🏃 Has salido de ${activeSvc.communityName}`;
              const body = `Se ha detectado tu salida. ¿Quieres finalizar el servicio?`;

              createSystemNotification(
                userProfile.uid,
                title,
                body,
                'warning',
                activeSvc.id
              );
            } else if (isInside) {
              lastStateRef.current[activeSvc.id] = 'INSIDE';
            }
          }
        } 
        // CASO B: En ruta (Detectar ENTRADA)
        else {
          const now = Date.now();

          const nearby = servicesWithDistance
            .filter(s => {
              // Filtro principal: solo servicios pendientes y dentro del radio
              if (s.distance > PROXIMITY_RADIUS_ENTRY) return false;
              if (s.status !== 'pending') return false;

              // Filtro extra: verificar que no esté completado en cache local
              if (completedTodaySet.has(s.id)) {
                console.log(`[Tracker] Servicio ${s.communityName} ignorado: ya completado hoy (cache local)`);
                return false;
              }

              // Filtro extra: servicios con estado completado, in_progress o missed
              if (['completed', 'in_progress', 'missed'].includes(s.status)) {
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

            // Notificar si: primera vez que se detecta entrada O ha pasado el intervalo de re-notificación
            const isFirstEntry = previousState === 'OUTSIDE';
            const shouldReNotify = previousState === 'INSIDE' && timeSinceLastNotify >= RE_NOTIFY_INTERVAL_MS;

            if (isFirstEntry || shouldReNotify) {
              const isRepeat = !isFirstEntry;
              console.log(`[Tracker] ${isRepeat ? 'RE-NOTIFICACIÓN' : 'ENTRADA DETECTADA'} - ${closest.communityName}`);
              
              lastStateRef.current[closest.id] = 'INSIDE';
              lastNotifyTimeRef.current[closest.id] = now;

              if (isFirstEntry) {
                localStorage.setItem(`detected_entry_${closest.id}`, new Date().toISOString());
              }

              const title = isRepeat 
                ? `🔔 Recuerdo: Estás en ${closest.communityName}`
                : `📍 Has llegado a ${closest.communityName}`;
              const body = isRepeat
                ? `Llevas un rato aquí. ¿Inicias el servicio?`
                : `¿Quieres iniciar el servicio? Estás en la ubicación.`;

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
            if (s.distance > PROXIMITY_RADIUS_EXIT * 2) {
              lastStateRef.current[s.id] = 'OUTSIDE';
              // También limpiar el tiempo de última notificación
              delete lastNotifyTimeRef.current[s.id];
            }
          });

          // Actualizar cache local con servicios completados detectados
          servicesWithDistance.forEach(s => {
            if (s.status === 'completed' && !completedTodaySet.has(s.id)) {
              markServiceCompletedToday(s.id);
            }
          });
        }
      } catch (err) {
        console.error("Error en tracker:", err);
      }
    };

    // Iniciar seguimiento en tiempo real
    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => console.error("Error GPS watchPosition:", err),
      { 
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000
      }
    );

    // Fallback: una comprobación manual cada minuto por si watchPosition se detiene en segundo plano
    const fallbackInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(processPosition, null, { enableHighAccuracy: true });
    }, CHECK_INTERVAL);

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      clearInterval(fallbackInterval);
    };
  }, [userProfile, isOperario]);

  return null; // Componente invisible
}
