import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";
import { tenantCollection } from "../../utils/tenantFirestore";
import { getActiveWorkday } from "../../services/workdayService";
import { getScheduledServicesForDate } from "../../services/scheduleService";
import { getCommunity } from "../../services/communityService";
import {
  getActiveCheckIn,
  completeCheckOut,
} from "../../services/checkInService";
import { getDistance, sendNotification } from "../../utils/geolocation";
import { createSystemNotification } from "../../services/notificationService";
import {
  persistEntryDetection,
  persistExitDetection,
} from "../../services/geoDetectionService";
import { registerForPushNotifications } from "../../services/fcmService";
import { format } from "date-fns";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { GPS_CONFIG } from "../../config/gpsConfig";

// ==================== CONSTANTES LOCALES ====================
const COMMUNITY_CACHE_TTL = 10 * 60 * 1000; // Caché de comunidades: 10 min
const LAST_POSITION_KEY = "tracker_last_position"; // Persistir última posición para recovery

// Helper para normalizar fecha/hora programada en Europe/Madrid
function getScheduledDateTimeInMadrid(scheduledDate, timeStr) {
  if (!scheduledDate) return null;
  const dateObj = scheduledDate.toDate
    ? scheduledDate.toDate()
    : new Date(scheduledDate);

  const dateParts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(dateObj)
    .split("/");

  const day = dateParts[0];
  const month = dateParts[1];
  const year = dateParts[2];

  const [hours, minutes] = (timeStr || "08:00").split(":").map(Number);
  const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return targetDate;
}

// ==================== UTILIDADES DE CACHE LOCAL ====================
function getCompletedTodaySet() {
  try {
    const todayStr = new Date().toDateString();
    const raw = localStorage.getItem("completed_services_today");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === todayStr) {
        return new Set(parsed.ids || []);
      }
    }
  } catch (e) {
    /* ignore */
  }
  return new Set();
}

function markServiceCompletedToday(serviceId) {
  try {
    const todayStr = new Date().toDateString();
    const existing = getCompletedTodaySet();
    existing.add(serviceId);
    localStorage.setItem(
      "completed_services_today",
      JSON.stringify({
        date: todayStr,
        ids: Array.from(existing),
      }),
    );
  } catch (e) {
    /* ignore */
  }
}

// ==================== COMPONENTE PRINCIPAL ====================
export default function GeolocationTracker() {
  const { userProfile, isOperario } = useAuth();
  const { companyId } = useTenant();
  const [activeWorkday, setActiveWorkday] = useState(null);

  // Refs para mantener estado entre actualizaciones del GPS sin re-renders
  const lastStateRef = useRef({}); // { serviceId: 'INSIDE' | 'OUTSIDE' }
  const lastNotifyTimeRef = useRef({}); // { serviceId: timestamp }
  const firstSeenInsideRef = useRef({}); // { serviceId: timestamp } para controlar permanencia mínima
  const consecutiveOutsideRef = useRef({}); // { serviceId: count } para confirmar salidas consistentes
  const watchIdRef = useRef(null);
  const communityCacheRef = useRef({}); // { communityId: { data, cachedAt } }
  const servicesRef = useRef([]); // Caché de servicios del día
  const servicesCachedAtRef = useRef(0); // Timestamp de último fetch de servicios
  const wakeLockRef = useRef(null); // Wake Lock para mantener la pantalla activa
  const fcmRegisteredRef = useRef(false); // Evitar re-registro de FCM

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

    registerForPushNotifications(companyId, userProfile.uid).catch((err) => {
      console.warn("[Tracker] FCM registration failed (non-blocking):", err);
    });
  }, [isOperario, userProfile]);

  // ==================== OBTENER COMUNIDAD CON CACHÉ ====================
  const getCommunityWithCache = useCallback(async (communityId) => {
    const cached = communityCacheRef.current[communityId];
    if (cached && Date.now() - cached.cachedAt < COMMUNITY_CACHE_TTL) {
      return cached.data;
    }

    const community = await getCommunity(companyId, communityId);
    if (community) {
      communityCacheRef.current[communityId] = {
        data: community,
        cachedAt: Date.now(),
      };
    }
    return community;
  }, [companyId]);

  // ==================== WAKE LOCK ====================
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
        console.log("[Tracker] Wake Lock activado para tracking GPS");
      }
    } catch (err) {
      console.warn("[Tracker] Wake Lock no disponible:", err.message);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) {
      /* ignore */
    }
  }, []);

  // ==================== EFECTO PRINCIPAL DE TRACKING ====================
  useEffect(() => {
    if (!isOperario || !userProfile?.uid) return;

    // --- SUSCRIPCIONES EN TIEMPO REAL PARA JORNADA Y CHECK-IN ---
    const qWorkday = query(
      tenantCollection(db, companyId, "workdays"),
      where("userId", "==", userProfile.uid),
    );
    const unsubscribeWorkday = onSnapshot(
      qWorkday,
      (snap) => {
        const active = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .find((wd) => wd.status === "active");

        setActiveWorkday(active || null);
        activeWorkdayRef.current = active || null;
        console.log(
          "[Tracker] Estado de jornada actualizado:",
          active ? "Activo" : "Inactivo",
        );
      },
      (err) => {
        console.error("[Tracker] Error en suscripción a jornada:", err);
      },
    );

    const qCheckIn = query(
      tenantCollection(db, companyId, "checkIns"),
      where("userId", "==", userProfile.uid),
    );
    const unsubscribeCheckIn = onSnapshot(
      qCheckIn,
      (snap) => {
        const open = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data({ serverTimestamps: "estimate" }),
          }))
          .filter((c) => c.checkOutTime === null);

        if (open.length === 0) {
          activeCheckInRef.current = null;
        } else {
          const sorted = open.sort((a, b) => {
            const aTime = a.checkInTime
              ? a.checkInTime.toDate
                ? a.checkInTime.toDate()
                : new Date(a.checkInTime)
              : new Date();
            const bTime = b.checkInTime
              ? b.checkInTime.toDate
                ? b.checkInTime.toDate()
                : new Date(b.checkInTime)
              : new Date();
            return bTime - aTime;
          });
          activeCheckInRef.current = sorted[0];
        }
        console.log(
          "[Tracker] Estado de check-in actualizado:",
          activeCheckInRef.current ? "Activo" : "Inactivo",
        );
      },
      (err) => {
        console.error("[Tracker] Error en suscripción a check-in:", err);
      },
    );

    // --- LIMPIEZA DIARIA DE DATOS LOCALES ---
    const lastClean = localStorage.getItem("last_geo_cleanup");
    const todayStr = new Date().toDateString();

    if (lastClean !== todayStr) {
      console.log("[Tracker] Realizando limpieza diaria de logs locales...");
      localStorage.removeItem("tracker_debug_logs");
      localStorage.removeItem("completed_services_today");
      Object.keys(localStorage).forEach((key) => {
        if (
          key.startsWith("detected_entry_") ||
          key.startsWith("detected_exit_") ||
          key.startsWith("detected_exit_pending_") ||
          key.startsWith("notified_session_")
        ) {
          localStorage.removeItem(key);
        }
      });
      localStorage.setItem("last_geo_cleanup", todayStr);
    }

    // ==================== PROCESAR POSICIÓN GPS ====================
    const processPosition = async (position) => {
      try {
        // --- Detectar suspensión de la app ---
        const lastProcessedAtStr = localStorage.getItem(
          "tracker_last_processed_at",
        );
        const lastProcessedAt = lastProcessedAtStr
          ? parseInt(lastProcessedAtStr)
          : 0;
        const timeSinceLastProcess =
          lastProcessedAt > 0 ? Date.now() - lastProcessedAt : 0;
        const wasAppSuspended =
          timeSinceLastProcess >= GPS_CONFIG.EXIT_CONFIRM_DELAY_MS;
        localStorage.setItem(
          "tracker_last_processed_at",
          Date.now().toString(),
        );

        const {
          latitude: rawLat,
          longitude: rawLng,
          accuracy,
          speed,
        } = position.coords;
        const gpsTimestamp = position.timestamp
          ? new Date(position.timestamp)
          : new Date();
        lastWatchPositionTimeRef.current = Date.now();

        // 1D Kalman Filter to smooth out GPS noise
        let latitude = rawLat;
        let longitude = rawLng;

        let shouldResetKalman =
          kalmanRef.current.lat === null || wasAppSuspended;
        if (!shouldResetKalman && kalmanRef.current.lat !== null) {
          const rawDistanceMoved = getDistance(
            rawLat,
            rawLng,
            kalmanRef.current.lat,
            kalmanRef.current.lng,
          );
          if (rawDistanceMoved > 200) {
            console.log(
              `[Kalman] Salto de posición de ${Math.round(rawDistanceMoved)}m detectado. Reseteando filtro.`,
            );
            shouldResetKalman = true;
          }
        }

        if (shouldResetKalman) {
          kalmanRef.current = {
            lat: rawLat,
            lng: rawLng,
            variance: accuracy * 0.000009 * (accuracy * 0.000009),
          };
        } else {
          const speedMps =
            speed !== null && speed !== undefined && !isNaN(speed)
              ? speed
              : 1.5;
          const processNoiseMeters = Math.max(1, speedMps * 2);
          const processNoiseDegrees = processNoiseMeters * 0.000009;
          const qNoise = processNoiseDegrees * processNoiseDegrees;

          kalmanRef.current.variance += qNoise;

          const measurementNoiseDegrees = accuracy * 0.000009;
          const rNoise = measurementNoiseDegrees * measurementNoiseDegrees;

          const kGain =
            kalmanRef.current.variance / (kalmanRef.current.variance + rNoise);

          kalmanRef.current.lat =
            kalmanRef.current.lat + kGain * (rawLat - kalmanRef.current.lat);
          kalmanRef.current.lng =
            kalmanRef.current.lng + kGain * (rawLng - kalmanRef.current.lng);
          kalmanRef.current.variance = (1 - kGain) * kalmanRef.current.variance;

          latitude = kalmanRef.current.lat;
          longitude = kalmanRef.current.lng;
        }

        // Leer posición anterior para cálculo de velocidad por backup
        let prevPosition = null;
        try {
          const prevPosRaw = localStorage.getItem(LAST_POSITION_KEY);
          if (prevPosRaw) prevPosition = JSON.parse(prevPosRaw);
        } catch (e) {
          /* ignore */
        }

        // Calcular velocidad
        let currentSpeed = speed; // m/s
        if (
          currentSpeed === null ||
          currentSpeed === undefined ||
          isNaN(currentSpeed)
        ) {
          if (prevPosition && prevPosition.timestamp) {
            const timeSec = (Date.now() - prevPosition.timestamp) / 1000;
            if (timeSec > 0) {
              const distMeters = getDistance(
                rawLat,
                rawLng,
                prevPosition.lat,
                prevPosition.lng,
              );
              currentSpeed = distMeters / timeSec;
            }
          }
        }
        const isSpeedTooHigh =
          currentSpeed !== null &&
          currentSpeed > GPS_CONFIG.MAX_SPEED_FOR_ENTRY_KMH / 3.6;

        // Persistir posición actual
        localStorage.setItem(
          LAST_POSITION_KEY,
          JSON.stringify({
            lat: latitude,
            lng: longitude,
            accuracy,
            timestamp: Date.now(),
          }),
        );

        console.log(
          `[GPS] Precisión: ${Math.round(accuracy)}m | Lat: ${latitude.toFixed(6)} | Lng: ${longitude.toFixed(6)}${wasAppSuspended ? ` | ⚠️ APP SUSPENDIDA ${Math.round(timeSinceLastProcess / 1000)}s` : ""}${currentSpeed !== null ? ` | Vel: ${Math.round(currentSpeed * 3.6)} km/h` : ""}`,
        );

        // 1. Verificar jornada activa
        const workday = activeWorkdayRef.current;
        if (!workday) {
          await releaseWakeLock();
          return;
        }

        await requestWakeLock();

        // 2. Obtener servicios (con caché de 2 minutos)
        const servicesCacheAge = Date.now() - servicesCachedAtRef.current;
        if (
          servicesCacheAge > 2 * 60 * 1000 ||
          servicesRef.current.length === 0
        ) {
          const freshServices = await getScheduledServicesForDate(
            companyId,
            userProfile.uid,
            new Date(),
          );
          servicesRef.current = Array.isArray(freshServices)
            ? freshServices
            : [];
          servicesCachedAtRef.current = Date.now();
        }
        const services = servicesRef.current;
        if (services.length === 0) return;

        // 3. Obtener check-in activo
        const checkIn = activeCheckInRef.current;
        const completedTodaySet = getCompletedTodaySet();

        // 4. Calcular distancias
        const servicesWithDistance = [];
        const trackerLogs = JSON.parse(
          localStorage.getItem("tracker_debug_logs") || "[]",
        );

        for (const svc of services) {
          const community = await getCommunityWithCache(svc.communityId);
          if (community?.location) {
            const commLat =
              community.location._lat || community.location.latitude;
            const commLng =
              community.location._long || community.location.longitude;

            if (commLat !== undefined && commLng !== undefined) {
              const dist = getDistance(latitude, longitude, commLat, commLng);

              const geofenceRadius =
                community.geofenceRadiusMeters ||
                GPS_CONFIG.DEFAULT_GEOFENCE_RADIUS_METERS;
              const entryRadius = geofenceRadius;
              const exitRadius =
                geofenceRadius + GPS_CONFIG.HYSTERESIS_BUFFER_METERS;

              const logEntry = `[${new Date().toLocaleTimeString()}] ${community.name}: ${Math.round(dist)}m (GPS±${Math.round(accuracy)}m, R_in:${entryRadius}m, R_out:${exitRadius}m) [${svc.status}]`;
              console.log(logEntry);

              trackerLogs.unshift(logEntry);
              if (trackerLogs.length > 15) trackerLogs.pop();

              servicesWithDistance.push({
                ...svc,
                distance: dist,
                communityName: community.name,
                communityLat: commLat,
                communityLng: commLng,
                geofenceRadius,
                entryRadius,
                exitRadius,
                gpsAccuracy: accuracy,
              });
            }
          }
        }
        localStorage.setItem("tracker_debug_logs", JSON.stringify(trackerLogs));

        // ==================== FUNCIÓN INTERNA DE NOTIFICACIÓN COMPARTIDA ====================
        const triggerSessionNotification = (
          type,
          service,
          title,
          body,
          detectedTime,
          isUrgent = false,
        ) => {
          const sessionId = `${type}_${service.id}_${detectedTime.getTime()}`;
          const notifiedKey = `notified_session_${sessionId}`;

          if (localStorage.getItem(notifiedKey)) {
            return; // Ya se ha enviado la notificación para esta sesión
          }
          localStorage.setItem(notifiedKey, "true");

          // Comprobar silenciado temporal
          const dismissedUntil = localStorage.getItem(
            `dismissed_until_${service.id}`,
          );
          if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
            console.log(
              `[Tracker] Notificación silenciada temporalmente por descarte para ${service.communityName}`,
            );
            return;
          }

          // Notificación local (Foreground/Background a través de PWA SW)
          sendNotification(title, {
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: `${type}-${service.id}`,
            urgent: isUrgent,
            serviceId: service.id,
          });

          // Notificación Push (FCM) únicamente si la app está en segundo plano (Background)
          if (document.visibilityState !== "visible") {
            createSystemNotification(
              companyId,
              userProfile.uid,
              title,
              body,
              type === "entry" ? "success" : "warning",
              service.id,
              null,
              "push_only",
            );
          } else {
            console.log(
              "[Tracker] App en foreground. Se omite el trigger de FCM para no duplicar avisos.",
            );
          }
        };

        // ==================== LÓGICA DE TRANSICIONES ====================

        // CASO A: Trabajando en un servicio → detectar SALIDA
        if (checkIn) {
          const activeSvc = servicesWithDistance.find(
            (s) => s.id === checkIn.scheduledServiceId,
          );
          if (activeSvc) {
            if (accuracy > GPS_CONFIG.MAX_ACCURACY_FOR_EXIT_METERS) {
              console.log(
                `[Tracker] GPS demasiado impreciso (${Math.round(accuracy)}m) para evaluar salida, ignorando`,
              );
              return;
            }

            const isOutside = activeSvc.distance > activeSvc.exitRadius;
            const previousState =
              lastStateRef.current[activeSvc.id] || "INSIDE";
            const pendingKey = `detected_exit_pending_${activeSvc.id}`;
            const confirmedKey = `detected_exit_${activeSvc.id}`;

            if (isOutside) {
              consecutiveOutsideRef.current[activeSvc.id] =
                (consecutiveOutsideRef.current[activeSvc.id] || 0) + 1;
            } else {
              consecutiveOutsideRef.current[activeSvc.id] = 0;
            }

            const isExitTriggered =
              consecutiveOutsideRef.current[activeSvc.id] >= 3 ||
              wasAppSuspended;

            if (isExitTriggered) {
              if (previousState === "INSIDE") {
                lastStateRef.current[activeSvc.id] = "OUTSIDE";

                const existingPendingRaw = localStorage.getItem(pendingKey);
                const alreadyConfirmed = localStorage.getItem(confirmedKey);

                if (alreadyConfirmed) {
                  console.log(
                    "[Tracker] Ya hay salida confirmada, no se sobreescribe",
                  );
                } else if (existingPendingRaw) {
                  try {
                    const pending = JSON.parse(existingPendingRaw);
                    const elapsed = Date.now() - pending.firstDetectedAt;

                    if (elapsed >= GPS_CONFIG.EXIT_CONFIRM_DELAY_MS) {
                      const confirmedExitTime = new Date(pending.exitTime);
                      console.log(
                        `[Tracker] SALIDA CONFIRMADA tras 5 min: ${confirmedExitTime.toLocaleTimeString()}`,
                      );
                      localStorage.setItem(
                        confirmedKey,
                        confirmedExitTime.toISOString(),
                      );
                      localStorage.removeItem(pendingKey);
                      persistExitDetection(
                        companyId,
                        userProfile.uid,
                        activeSvc.id,
                        activeSvc.communityName,
                        confirmedExitTime,
                        "confirmed",
                        {
                          latitude,
                          longitude,
                          accuracy,
                          speed: currentSpeed,
                          originalReadingTimestamp: gpsTimestamp,
                        },
                      );

                      // Comprobar si hay autocierre activo en comunidad
                      const community = await getCommunityWithCache(
                        activeSvc.communityId,
                      );
                      const autoCloseEnabled = !!community?.autoCloseOnExit;

                      if (autoCloseEnabled) {
                        try {
                          console.log(
                            `[Tracker] Auto-cerrando fichaje ${checkIn.id} por salida`,
                          );
                          await completeCheckOut(
                            checkIn.id,
                            latitude,
                            longitude,
                            confirmedExitTime,
                            null,
                            {
                              accuracy,
                              speed: currentSpeed,
                              timestamp: gpsTimestamp,
                              exceptionReason:
                                "Salida detectada automáticamente por la geovalla configurada.",
                            },
                          );

                          triggerSessionNotification(
                            "exit",
                            activeSvc,
                            `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                            `Se completó el servicio automáticamente a las ${format(confirmedExitTime, "HH:mm")} tras salir de la comunidad.`,
                            confirmedExitTime,
                            true,
                          );
                        } catch (checkoutErr) {
                          console.error(
                            "[Tracker] Error al auto-cerrar fichaje por salida:",
                            checkoutErr,
                          );
                        }
                      } else {
                        // Notificación persistente sin autocierre
                        triggerSessionNotification(
                          "exit",
                          activeSvc,
                          `🏃 ¿Finalizar servicio en ${activeSvc.communityName}?`,
                          `Parece que has salido de ${activeSvc.communityName}. ¿Quieres registrar tu salida de las ${format(confirmedExitTime, "HH:mm")}?`,
                          confirmedExitTime,
                          false,
                        );
                      }
                    }
                  } catch (e) {
                    localStorage.removeItem(pendingKey);
                  }
                } else if (wasAppSuspended) {
                  // Salida inmediata tras suspensión
                  const estimatedExitTime = new Date(lastProcessedAt);
                  console.log(
                    `[Tracker] SALIDA CONFIRMADA (app suspendida ${Math.round(timeSinceLastProcess / 60000)} min)`,
                  );
                  localStorage.setItem(
                    confirmedKey,
                    estimatedExitTime.toISOString(),
                  );
                  persistExitDetection(
                    companyId,
                    userProfile.uid,
                    activeSvc.id,
                    activeSvc.communityName,
                    estimatedExitTime,
                    "estimated",
                    {
                      latitude,
                      longitude,
                      accuracy,
                      speed: currentSpeed,
                      originalReadingTimestamp: gpsTimestamp,
                    },
                  );

                  const community = await getCommunityWithCache(
                    activeSvc.communityId,
                  );
                  const autoCloseEnabled = !!community?.autoCloseOnExit;

                  if (autoCloseEnabled) {
                    try {
                      await completeCheckOut(
                        checkIn.id,
                        latitude,
                        longitude,
                        estimatedExitTime,
                        null,
                        {
                          accuracy,
                          speed: currentSpeed,
                          timestamp: gpsTimestamp,
                          exceptionReason:
                            "Salida estimada automáticamente tras la suspensión de la aplicación.",
                        },
                      );
                      triggerSessionNotification(
                        "exit",
                        activeSvc,
                        `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                        `Se completó el servicio automáticamente tras una inactividad prolongada.`,
                        estimatedExitTime,
                        true,
                      );
                    } catch (checkoutErr) {
                      console.error(
                        "[Tracker] Error al auto-cerrar tras suspensión:",
                        checkoutErr,
                      );
                    }
                  } else {
                    triggerSessionNotification(
                      "exit",
                      activeSvc,
                      `🏃 ¿Finalizar servicio en ${activeSvc.communityName}?`,
                      `Se detectó tu salida de la comunidad tras la suspensión de la app. ¿Finalizar servicio?`,
                      estimatedExitTime,
                      false,
                    );
                  }
                } else {
                  // Primera detección de salida -> guardar pendiente
                  console.log("[Tracker] SALIDA DETECTADA - Iniciando espera");
                  localStorage.setItem(
                    pendingKey,
                    JSON.stringify({
                      exitTime: new Date().toISOString(),
                      firstDetectedAt: Date.now(),
                    }),
                  );
                }
              } else {
                // Ya estaba en estado OUTSIDE
                const pendingRaw = localStorage.getItem(pendingKey);
                if (pendingRaw && !localStorage.getItem(confirmedKey)) {
                  try {
                    const pending = JSON.parse(pendingRaw);
                    const elapsed = Date.now() - pending.firstDetectedAt;

                    if (elapsed >= GPS_CONFIG.EXIT_CONFIRM_DELAY_MS) {
                      const confirmedExitTime = new Date(pending.exitTime);
                      console.log(
                        "[Tracker] SALIDA CONFIRMADA tras 5 min fuera",
                      );
                      localStorage.setItem(
                        confirmedKey,
                        confirmedExitTime.toISOString(),
                      );
                      localStorage.removeItem(pendingKey);
                      persistExitDetection(
                        companyId,
                        userProfile.uid,
                        activeSvc.id,
                        activeSvc.communityName,
                        confirmedExitTime,
                        "confirmed",
                        {
                          latitude,
                          longitude,
                          accuracy,
                          speed: currentSpeed,
                          originalReadingTimestamp: gpsTimestamp,
                        },
                      );

                      const community = await getCommunityWithCache(
                        activeSvc.communityId,
                      );
                      const autoCloseEnabled = !!community?.autoCloseOnExit;

                      if (autoCloseEnabled) {
                        try {
                          await completeCheckOut(
                            checkIn.id,
                            latitude,
                            longitude,
                            confirmedExitTime,
                            null,
                            {
                              accuracy,
                              speed: currentSpeed,
                              timestamp: gpsTimestamp,
                              exceptionReason:
                                "Salida detectada automáticamente por la geovalla configurada.",
                            },
                          );
                          triggerSessionNotification(
                            "exit",
                            activeSvc,
                            `🏃 Salida y auto-cierre en ${activeSvc.communityName}`,
                            `Servicio completado automáticamente tras 5 minutos fuera de la ubicación.`,
                            confirmedExitTime,
                            true,
                          );
                        } catch (checkoutErr) {
                          console.error(
                            "[Tracker] Error al auto-cerrar tras 5 minutos fuera:",
                            checkoutErr,
                          );
                        }
                      } else {
                        triggerSessionNotification(
                          "exit",
                          activeSvc,
                          `🏃 ¿Finalizar servicio en ${activeSvc.communityName}?`,
                          `Parece que has salido de la comunidad. ¿Quieres finalizar tu servicio a las ${format(confirmedExitTime, "HH:mm")}?`,
                          confirmedExitTime,
                          false,
                        );
                      }
                    }
                  } catch (e) {
                    localStorage.removeItem(pendingKey);
                  }
                }
              }
            } else {
              // Ha vuelto a entrar -> resetear
              if (previousState === "OUTSIDE") {
                console.log(
                  "[Tracker] Ha vuelto a entrar - Cancelando salida pendiente",
                );
                localStorage.removeItem(pendingKey);
              }
              lastStateRef.current[activeSvc.id] = "INSIDE";
            }
          }
        }

        // CASO B: En ruta → detectar ENTRADA
        else {
          const now = Date.now();

          // Filtrar servicios válidos conservadoramente y por ventana horaria
          const nearby = servicesWithDistance
            .filter((s) => {
              if (s.status !== "pending") return false;
              if (completedTodaySet.has(s.id)) return false;
              if (["completed", "in_progress", "missed"].includes(s.status))
                return false;

              // 1. Descartar por precisión > 40m
              if (accuracy > GPS_CONFIG.MAX_ACCURACY_FOR_ENTRY_METERS) {
                return false;
              }

              // 2. Descartar si se viaja en coche (> 30 km/h)
              if (isSpeedTooHigh) {
                return false;
              }

              // 3. Condición estrictamente conservadora de geovalla
              if (s.distance + accuracy > s.geofenceRadius) {
                return false;
              }

              // 4. Filtrar por ventana horaria normalizada en Madrid (excepto flexibleWeek)
              if (!s.flexibleWeek) {
                const scheduledTime = getScheduledDateTimeInMadrid(
                  s.scheduledDate,
                  s.community?.preferredTime || s.scheduledTime,
                );
                if (scheduledTime) {
                  const preLimit = new Date(
                    scheduledTime.getTime() -
                      GPS_CONFIG.ARRIVAL_WINDOW_PRE_MINUTES * 60 * 1000,
                  );
                  const postLimit = new Date(
                    scheduledTime.getTime() +
                      GPS_CONFIG.ARRIVAL_WINDOW_POST_MINUTES * 60 * 1000,
                  );
                  const nowTime = new Date();
                  if (nowTime < preLimit || nowTime > postLimit) {
                    return false;
                  }
                }
              }

              return true;
            })
            .sort((a, b) => {
              // Priorizar por hora programada
              const timeA = getScheduledDateTimeInMadrid(
                a.scheduledDate,
                a.community?.preferredTime || a.scheduledTime,
              );
              const timeB = getScheduledDateTimeInMadrid(
                b.scheduledDate,
                b.community?.preferredTime || b.scheduledTime,
              );

              if (timeA && timeB) {
                if (timeA.getTime() !== timeB.getTime()) {
                  return timeA.getTime() - timeB.getTime();
                }
              } else if (timeA) {
                return -1;
              } else if (timeB) {
                return 1;
              }
              return a.distance - b.distance;
            });

          // Limpiar temporizadores si ya no es el candidato de rango
          const closestId = nearby.length > 0 ? nearby[0].id : null;
          services.forEach((s) => {
            if (s.id !== closestId) {
              if (firstSeenInsideRef.current[s.id]) {
                delete firstSeenInsideRef.current[s.id];
              }
            }
          });

          if (nearby.length > 0) {
            const closest = nearby[0];
            const previousState = lastStateRef.current[closest.id] || "OUTSIDE";
            const lastNotifyTime = lastNotifyTimeRef.current[closest.id] || 0;
            const timeSinceLastNotify = now - lastNotifyTime;

            const isFirstEntry = previousState === "OUTSIDE";

            // Permanencia de 90 segundos
            if (isFirstEntry) {
              if (!firstSeenInsideRef.current[closest.id]) {
                firstSeenInsideRef.current[closest.id] = now;
                console.log(
                  `[Tracker] ${closest.communityName} en rango. Iniciando temporizador de permanencia de 90s...`,
                );
                return;
              }

              const elapsed = now - firstSeenInsideRef.current[closest.id];
              if (elapsed < GPS_CONFIG.ENTRY_CONFIRM_DELAY_MS) {
                console.log(
                  `[Tracker] ${closest.communityName} en rango. Tiempo restante para confirmar: ${Math.round((GPS_CONFIG.ENTRY_CONFIRM_DELAY_MS - elapsed) / 1000)}s`,
                );
                return;
              }
            }

            // Exclusión mutua de comunidades adyacentes
            const activeInsideService = services.find(
              (s) => lastStateRef.current[s.id] === "INSIDE",
            );
            if (activeInsideService && activeInsideService.id !== closest.id) {
              console.log(
                `[Tracker] Silenciando ${closest.communityName} porque ya está dentro de ${activeInsideService.communityName}`,
              );
              return;
            }

            const shouldReNotify =
              previousState === "INSIDE" &&
              timeSinceLastNotify >= GPS_CONFIG.RE_NOTIFY_INTERVAL_MS;

            if (isFirstEntry || shouldReNotify) {
              const isRepeat = !isFirstEntry;
              console.log(
                `[Tracker] ${isRepeat ? "RE-NOTIFICACIÓN" : "ENTRADA DETECTADA"} - ${closest.communityName} (${Math.round(closest.distance)}m, GPS±${Math.round(accuracy)}m)`,
              );

              lastStateRef.current[closest.id] = "INSIDE";
              lastNotifyTimeRef.current[closest.id] = now;

              let detectedEntryTime = new Date();
              let entrySource = "realtime";

              if (isFirstEntry) {
                if (
                  wasAppSuspended &&
                  prevPosition &&
                  lastProcessedAt > 0 &&
                  timeSinceLastProcess <
                    GPS_CONFIG.MAX_SUSPENSION_FOR_ESTIMATE_MS
                ) {
                  const prevDist = getDistance(
                    prevPosition.lat,
                    prevPosition.lng,
                    closest.communityLat,
                    closest.communityLng,
                  );
                  if (prevDist <= closest.entryRadius) {
                    detectedEntryTime = new Date(prevPosition.timestamp);
                    entrySource = "estimated";
                  } else {
                    detectedEntryTime = new Date(lastProcessedAt);
                    entrySource = "estimated";
                  }
                }
              }

              localStorage.setItem(
                `detected_entry_${closest.id}`,
                detectedEntryTime.toISOString(),
              );
              localStorage.setItem(
                `detected_entry_source_${closest.id}`,
                entrySource,
              );

              // Persistir detalles en localStorage para el UI Card de llegada
              localStorage.setItem(
                `detected_entry_${closest.id}_details`,
                JSON.stringify({
                  distance: closest.distance,
                  accuracy: accuracy,
                  communityName: closest.communityName,
                  detectedAt: detectedEntryTime.toISOString(),
                }),
              );
              persistEntryDetection(
                companyId,
                userProfile.uid,
                closest.id,
                closest.communityName,
                detectedEntryTime,
                closest.distance,
                entrySource,
                {
                  latitude,
                  longitude,
                  accuracy,
                  speed: currentSpeed,
                  originalReadingTimestamp: gpsTimestamp,
                },
              );

              const title = isRepeat
                ? `🔔 Recuerdo: Estás en ${closest.communityName}`
                : `📍 Has llegado a ${closest.communityName}`;
              const body = isRepeat
                ? `Llevas un rato aquí. ¿Inicias el servicio?`
                : entrySource === "estimated"
                  ? `Llegada estimada: ${detectedEntryTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}. ¿Quieres iniciar el servicio?`
                  : `¿Quieres iniciar el servicio? Estás a ${Math.round(closest.distance)}m.`;

              triggerSessionNotification(
                "entry",
                closest,
                title,
                body,
                detectedEntryTime,
                false,
              );
            }
          }

          // Resetear estados lejanos
          servicesWithDistance.forEach((s) => {
            if (s.distance > s.exitRadius * 2) {
              if (lastStateRef.current[s.id] === "INSIDE") {
                console.log(`[Tracker] Salida sin fichaje: ${s.communityName}`);
                const exitTime = new Date();
                localStorage.setItem(
                  `detected_exit_${s.id}`,
                  exitTime.toISOString(),
                );
                persistExitDetection(
                  companyId,
                  userProfile.uid,
                  s.id,
                  s.communityName,
                  exitTime,
                  "confirmed",
                  {
                    latitude,
                    longitude,
                    accuracy,
                    speed: currentSpeed,
                    originalReadingTimestamp: gpsTimestamp,
                  },
                );
              }
              lastStateRef.current[s.id] = "OUTSIDE";
              delete lastNotifyTimeRef.current[s.id];
              delete firstSeenInsideRef.current[s.id];
              consecutiveOutsideRef.current[s.id] = 0;
            }
          });

          // Marcar completados
          servicesWithDistance.forEach((s) => {
            if (s.status === "completed" && !completedTodaySet.has(s.id)) {
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
      if (document.visibilityState === "visible") {
        console.log("[Tracker] App volvió a primer plano — doble disparo GPS");
        requestWakeLock();
        servicesCachedAtRef.current = 0;

        navigator.geolocation.getCurrentPosition(processPosition, () => {}, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 60000,
        });

        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            processPosition,
            (err) => console.warn("[Tracker] GPS fresh recovery error:", err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ==================== INICIAR TRACKING GPS ====================
    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => console.error("Error GPS watchPosition:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000,
      },
    );

    const fallbackInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastWatchPositionTimeRef.current;
      if (timeSinceLastUpdate > 60000) {
        navigator.geolocation.getCurrentPosition(
          processPosition,
          (err) => console.warn("[Tracker] Fallback GPS error:", err),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      }
    }, GPS_CONFIG.CHECK_INTERVAL_MS);

    // ==================== CLEANUP ====================
    return () => {
      if (watchIdRef.current)
        navigator.geolocation.clearWatch(watchIdRef.current);
      clearInterval(fallbackInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
      unsubscribeWorkday();
      unsubscribeCheckIn();
    };
  }, [
    userProfile,
    isOperario,
    getCommunityWithCache,
    requestWakeLock,
    releaseWakeLock,
  ]);

  return null; // Componente invisible
}
