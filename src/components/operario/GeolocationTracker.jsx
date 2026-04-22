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

export default function GeolocationTracker() {
  const { userProfile, isOperario } = useAuth();
  const [activeWorkday, setActiveWorkday] = useState(null);
  
  // Refs para mantener estado entre actualizaciones del GPS sin re-renders
  const lastStateRef = useRef({}); // { serviceId: 'INSIDE' | 'OUTSIDE' }
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!isOperario || !userProfile?.uid) return;

    // --- LIMPIEZA DIARIA DE DATOS LOCALES ---
    const lastClean = localStorage.getItem('last_geo_cleanup');
    const todayStr = new Date().toDateString();

    if (lastClean !== todayStr) {
      console.log("[Tracker] Realizando limpieza diaria de logs locales...");
      localStorage.removeItem('tracker_debug_logs');
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
              const logEntry = `[${new Date().toLocaleTimeString()}] ${community.name}: ${Math.round(dist)}m (Prec: ${Math.round(accuracy)}m)`;
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
              
              sendNotification(`🏃 Has salido de ${activeSvc.communityName}`, {
                body: `Se ha detectado tu salida. ¿Quieres finalizar el servicio?`,
                tag: `exit-${activeSvc.id}`
              });

              createSystemNotification(
                userProfile.uid,
                `Has salido del área de ${activeSvc.communityName}. No olvides finalizar el servicio.`,
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
          const nearby = servicesWithDistance
            .filter(s => s.distance <= PROXIMITY_RADIUS_ENTRY && s.status === 'pending')
            .sort((a, b) => a.distance - b.distance);

          if (nearby.length > 0) {
            const closest = nearby[0];
            const previousState = lastStateRef.current[closest.id] || 'OUTSIDE';

            if (previousState === 'OUTSIDE') {
              console.log("[Tracker] ENTRADA DETECTADA");
              lastStateRef.current[closest.id] = 'INSIDE';
              const now = new Date().toISOString();

              localStorage.setItem(`detected_entry_${closest.id}`, now);

              sendNotification(`📍 Has llegado a ${closest.communityName}`, {
                body: `¿Quieres iniciar el servicio? Estás en la ubicación.`,
                tag: `entry-${closest.id}`
              });

              createSystemNotification(
                userProfile.uid,
                `📍 Estás en ${closest.communityName}. Pulsa para iniciar el servicio.`,
                'success',
                closest.id
              );
            }
          }

          // Resetear estados de comunidades lejanas
          servicesWithDistance.forEach(s => {
            if (s.distance > PROXIMITY_RADIUS_EXIT * 2) {
              lastStateRef.current[s.id] = 'OUTSIDE';
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
