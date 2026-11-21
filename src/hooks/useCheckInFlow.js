import { useState, useEffect, useRef } from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import {
  getEntryDetection,
  getExitDetection,
} from "../services/geoDetectionService";
import { getCommunity } from "../services/communityService";
import {
  getCheckInsForDate,
  createCheckIn,
  completeCheckOut,
  isWithinRange,
} from "../services/checkInService";
import { getCommunityTasks } from "../services/taskService";
import {
  shouldScheduleOnDay,
  addCompanionToService,
  updateScheduledServiceStatus,
  passTaskToNextService,
  passEmbeddedTaskToNextHost,
} from "../services/scheduleService";
import { createGPSSuggestion } from "../services/gpsSuggestionService";
import {
  closeServiceNotifications,
  getDistance,
} from "../utils/geolocation";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  createTaskExecution,
  updateTaskExecution,
} from "../services/checkInService";
import { parseHHMM, formatTimeToHHMM } from "../utils/formatTime";
import { useTenant } from "../contexts/TenantContext";
import { tenantCollection } from "../utils/tenantFirestore";
import { getCurrentServiceGroup } from "../utils/serviceGroup";
import {
  clearCheckoutInProgress,
  markCheckoutInProgress,
} from "../utils/checkoutGuard";
import {
  getCommunityExitRadiusMeters,
  getCommunityGeofenceRadiusMeters,
} from "../config/gpsConfig";
import {
  getLatestNativeLocation,
  getNativeLocationStatus,
  isNativeLocationAvailable,
  openNativeLocationSettings,
} from "../services/nativeBackgroundLocationService";
import { shouldNeverCarryTask } from "../utils/taskRolloverPolicy";
import {
  getPendingTaskConfirmations,
  resolvePendingTaskAnswer,
} from "../utils/pendingTaskConfirmation";
import { isTaskServiceAvailableOn } from "../utils/taskAvailability";
import {
  getEmbeddedCarryFallbackStatus,
  shouldShowScheduledTaskInHost,
} from "../utils/embeddedTaskHosting";

export function useCheckInFlow(
  serviceId,
  userProfile,
  serviceData,
  {
    navigate,
    getCurrentPosition,
    clientSignature,
    setClientSignature,
    actionLoading: externalActionLoading,
    setActionLoading: externalSetActionLoading,
  },
) {
  const {
    service,
    community,
    tasks,
    taskExecutions,
    activeCheckIn,
    setActiveCheckIn,
    activeWorkday,
    groupedServices,
    loadStaticData,
  } = serviceData;

  const { companyId } = useTenant();

  const [localActionLoading, setLocalActionLoading] = useState(false);
  const [checkInPhase, setCheckInPhase] = useState(null);
  const actionLoading =
    externalActionLoading !== undefined
      ? externalActionLoading
      : localActionLoading;
  const setActionLoading =
    externalSetActionLoading !== undefined
      ? externalSetActionLoading
      : setLocalActionLoading;
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [sendingGPS, setSendingGPS] = useState(false);
  const [gpsSent, setGpsSent] = useState(false);
  const [suggestedIn, setSuggestedIn] = useState(null);
  const [entrySource, setEntrySource] = useState("realtime");
  const [suggestedOut, setSuggestedOut] = useState(null);
  const [entryDetails, setEntryDetails] = useState(null);

  const [estimatedIn, setEstimatedIn] = useState(null);
  const [estimatedOut, setEstimatedOut] = useState(null);
  const [showManualEntryForm, setShowManualEntryForm] = useState(false);
  const [showManualExitForm, setShowManualExitForm] = useState(false);
  const [showFullManualForm, setShowFullManualForm] = useState(false);
  const [manualEntryTime, setManualEntryTime] = useState("");
  const [manualExitTime, setManualExitTime] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingTaskConfirmation, setPendingTaskConfirmation] = useState(null);

  const lastEstimatedServiceId = useRef(null);

  const beginCheckoutAttempt = () => {
    markCheckoutInProgress(serviceId);
    void closeServiceNotifications(serviceId);
  };

  const getFastPosition = async ({ allowLiveRequest = true } = {}) => {
    if (isNativeLocationAvailable()) {
      const status = await getNativeLocationStatus();
      if (status?.locationServicesEnabled === false) {
        const error = new Error("La ubicación del teléfono está desactivada.");
        error.code = "LOCATION_SERVICES_DISABLED";
        throw error;
      }
    }

    const nativePosition = await getLatestNativeLocation();
    const nativeAge = nativePosition?.timestamp
      ? Date.now() - nativePosition.timestamp
      : Infinity;
    if (
      nativePosition &&
      nativeAge <= 2 * 60_000 &&
      nativePosition.accuracy <= 75
    ) {
      return nativePosition;
    }

    // Las actualizaciones visuales de distancia no deben abrir una nueva
    // búsqueda GPS. La lectura en vivo se reserva para acciones del operario.
    if (!allowLiveRequest) return null;

    return getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 5_000,
      maximumAge: 30_000,
      retryLowAccuracy: false,
    });
  };

  const getEntryAllowedRadius = (pos) =>
    getCommunityGeofenceRadiusMeters(community) +
    Math.max(100, Number(pos?.accuracy) || 0);

  const cancelPendingAction = () => {
    if (pendingAction?.type === "checkout") {
      clearCheckoutInProgress(serviceId);
    }
    setPendingAction(null);
  };

  // Cargar sugerencias de geolocalización
  useEffect(() => {
    if (!serviceId || !userProfile?.uid) return;

    const loadGeoSuggestions = async () => {
      try {
        const dismissedUntil = localStorage.getItem(
          `dismissed_until_${serviceId}`,
        );
        if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
          setSuggestedIn(null);
          setSuggestedOut(null);
          setEntryDetails(null);
          return;
        }

        const sIn = localStorage.getItem(`detected_entry_${serviceId}`);
        const sOut = localStorage.getItem(`detected_exit_${serviceId}`);
        const detailsRaw = localStorage.getItem(
          `detected_entry_${serviceId}_details`,
        );

        if (detailsRaw) {
          try {
            setEntryDetails(JSON.parse(detailsRaw));
          } catch (e) {}
        }

        if (sIn) {
          setSuggestedIn(new Date(sIn));
          setEntrySource(
            localStorage.getItem(`detected_entry_source_${serviceId}`) ||
              "realtime",
          );
        } else {
          const dbEntry = await getEntryDetection(companyId, userProfile.uid, serviceId);
          if (dbEntry && dbEntry.detectedAt) {
            setSuggestedIn(
              dbEntry.detectedAt.toDate
                ? dbEntry.detectedAt.toDate()
                : new Date(dbEntry.detectedAt),
            );
            setEntrySource(dbEntry.source || "realtime");
            setEntryDetails({
              distance: dbEntry.distance,
              accuracy: dbEntry.accuracy || dbEntry.gpsAccuracy,
              communityName: dbEntry.communityName,
              detectedAt: dbEntry.detectedAt.toDate
                ? dbEntry.detectedAt.toDate().toISOString()
                : new Date(dbEntry.detectedAt).toISOString(),
            });
          }
        }

        const applySanitizedExit = (rawDate) => {
          if (!rawDate) return;
          const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
          if (isNaN(d.getTime())) return;
          const now = Date.now();

          // Topar a la hora actual si está en el futuro
          if (d.getTime() > now) {
            setSuggestedOut(new Date(now));
            return;
          }

          // Descartar si es anterior al checkIn activo
          if (activeCheckIn?.checkInTime) {
            const checkInMs = activeCheckIn.checkInTime.toDate
              ? activeCheckIn.checkInTime.toDate().getTime()
              : new Date(activeCheckIn.checkInTime).getTime();

            if (!isNaN(checkInMs) && checkInMs > 0 && d.getTime() < checkInMs) {
              setSuggestedOut(null);
              return;
            }
          }

          setSuggestedOut(d);
        };

        if (sOut) {
          applySanitizedExit(sOut);
        } else {
          const dbExit = await getExitDetection(companyId, userProfile.uid, serviceId);
          if (dbExit && dbExit.detectedAt) {
            applySanitizedExit(
              dbExit.detectedAt.toDate
                ? dbExit.detectedAt.toDate()
                : new Date(dbExit.detectedAt),
            );
          } else {
            const pendingRaw = localStorage.getItem(
              `detected_exit_pending_${serviceId}`,
            );
            if (pendingRaw) {
              try {
                const pending = JSON.parse(pendingRaw);
                const elapsed = Date.now() - pending.firstDetectedAt;
                if (elapsed >= 5 * 60 * 1000) {
                  localStorage.setItem(
                    `detected_exit_${serviceId}`,
                    pending.exitTime,
                  );
                  localStorage.removeItem(`detected_exit_pending_${serviceId}`);
                  applySanitizedExit(pending.exitTime);
                }
              } catch (e) {
                /* ignore */
              }
            }
          }
        }
      } catch (err) {
        console.warn("[useCheckInFlow] Error loading suggestions:", err);
      }
    };
    loadGeoSuggestions();

    const exitPollInterval = setInterval(() => {
      const dismissedUntil = localStorage.getItem(
        `dismissed_until_${serviceId}`,
      );
      if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
        setSuggestedIn(null);
        setSuggestedOut(null);
        setEntryDetails(null);
        return;
      }

      const confirmedExit = localStorage.getItem(`detected_exit_${serviceId}`);
      if (confirmedExit && !suggestedOut) {
        const d = new Date(confirmedExit);
        if (!isNaN(d.getTime())) {
          if (d.getTime() > Date.now()) {
            setSuggestedOut(new Date());
          } else {
            setSuggestedOut(d);
          }
        }
      } else if (!confirmedExit && !suggestedOut) {
        const pendingRaw = localStorage.getItem(
          `detected_exit_pending_${serviceId}`,
        );
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            const elapsed = Date.now() - pending.firstDetectedAt;
            if (elapsed >= 5 * 60 * 1000) {
              localStorage.setItem(
                `detected_exit_${serviceId}`,
                pending.exitTime,
              );
              localStorage.removeItem(`detected_exit_pending_${serviceId}`);
              const d = new Date(pending.exitTime);
              if (!isNaN(d.getTime())) {
                setSuggestedOut(d.getTime() > Date.now() ? new Date() : d);
              }
            }
          } catch (e) {
            /* ignore */
          }
        }
      }
    }, 10_000);

    return () => {
      clearInterval(exitPollInterval);
    };
  }, [serviceId, userProfile?.uid, suggestedOut]);

  // Efecto para calcular estimaciones al cargar datos estáticos (ejecuta una vez por servicio)
  useEffect(() => {
    if (
      service &&
      service.id === serviceId &&
      activeWorkday &&
      lastEstimatedServiceId.current !== serviceId
    ) {
      calculateEstimates(userProfile.uid, service, activeWorkday);
      lastEstimatedServiceId.current = serviceId;
    }
  }, [service, serviceId, activeWorkday, userProfile?.uid]);

  // Efecto para actualizar la distancia en tiempo real y limpiar adecuadamente
  useEffect(() => {
    if (!community?.location) return;

    let active = true;
    let intervalId = null;

    const updateDistance = async () => {
      try {
        const pos = await getFastPosition({ allowLiveRequest: false });
        if (!pos) return;
        if (!active) return;
        const commLat =
          community.location._lat || community.location.latitude || 0;
        const commLng =
          community.location._long || community.location.longitude || 0;
        if (commLat && commLng) {
          const check = isWithinRange(
            pos.lat,
            pos.lng,
            commLat,
            commLng,
            getEntryAllowedRadius(pos),
          );
          setDistanceInfo(check);
        }
      } catch (err) {
        // Ignorar errores GPS silenciosos
      }
    };

    updateDistance();
    intervalId = setInterval(updateDistance, 10_000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [community, getCurrentPosition]);

  // Función inteligente para estimar hora de llegada y salida basadas en la jornada
  const calculateEstimates = async (userId, currentSvc, workday) => {
    try {
      const today = new Date();
      const checkIns = await getCheckInsForDate(companyId, userId, today);
      const completedCheckIns = checkIns
        .filter((c) => c.checkOutTime !== null)
        .sort((a, b) => {
          const aTime = a.checkOutTime?.toDate
            ? a.checkOutTime.toDate().getTime()
            : new Date(a.checkOutTime).getTime();
          const bTime = b.checkOutTime?.toDate
            ? b.checkOutTime.toDate().getTime()
            : new Date(b.checkOutTime).getTime();
          return bTime - aTime;
        });

      let estIn = null;
      let estOut = null;

      if (completedCheckIns.length > 0) {
        const lastCheckIn = completedCheckIns[0];
        const lastExitTime = lastCheckIn.checkOutTime?.toDate
          ? lastCheckIn.checkOutTime.toDate()
          : new Date(lastCheckIn.checkOutTime);

        let travelMinutes = 15;

        try {
          const lastComm = await getCommunity(companyId, lastCheckIn.communityId);
          if (lastComm?.location && currentSvc?.communityId) {
            const currentComm = await getCommunity(companyId, currentSvc.communityId);
            if (currentComm?.location) {
              const lat1 =
                lastComm.location._lat || lastComm.location.latitude || 0;
              const lng1 =
                lastComm.location._long || lastComm.location.longitude || 0;
              const lat2 =
                currentComm.location._lat || currentComm.location.latitude || 0;
              const lng2 =
                currentComm.location._long ||
                currentComm.location.longitude ||
                0;

              if (lat1 && lng1 && lat2 && lng2) {
                const dist = getDistance(lat1, lng1, lat2, lng2);
                travelMinutes = Math.round(dist / 666) + 2;
                if (travelMinutes < 2) travelMinutes = 2;
                if (travelMinutes > 120) travelMinutes = 15;
              }
            }
          }
        } catch (e) {
          console.warn("[Estimator] Error calculating distance:", e);
        }

        estIn = new Date(lastExitTime.getTime() + travelMinutes * 60 * 1000);
      } else if (workday?.startTime) {
        const workdayStart = workday.startTime.toDate
          ? workday.startTime.toDate()
          : new Date(workday.startTime);
        estIn = new Date(workdayStart.getTime() + 10 * 60 * 1000);
      } else {
        estIn = new Date();
      }

      if (estIn.getTime() > Date.now()) {
        estIn = new Date();
      }

      estOut = new Date(estIn.getTime() + 30 * 60 * 1000);
      if (estOut.getTime() > Date.now()) {
        estOut = new Date();
      }

      setEstimatedIn(estIn);
      setEstimatedOut(estOut);

      const formatTime = (date) => {
        const h = String(date.getHours()).padStart(2, "0");
        const m = String(date.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
      };
      setManualEntryTime(formatTime(estIn));
      setManualExitTime(formatTime(estOut));
    } catch (err) {
      console.error("[Estimator] Error calculating estimates:", err);
    }
  };

  async function handleCheckIn(manualTime = null) {
    setActionLoading(true);
    setCheckInPhase("location");
    try {
      let pos = null;
      try {
        pos = await getFastPosition();
      } catch (geoErr) {
        console.warn("[useCheckInFlow] No se pudo obtener una posición válida:", geoErr);
        if (geoErr?.code === "LOCATION_SERVICES_DISABLED") {
          alert(
            "La ubicación del teléfono está desactivada. Actívala para iniciar el servicio.",
          );
          await openNativeLocationSettings();
        } else {
          alert(
            "No se ha podido obtener una ubicación reciente. Comprueba el GPS y vuelve a intentarlo.",
          );
        }
        setActionLoading(false);
        setCheckInPhase(null);
        return;
      }

      let needsException = false;
      let isOutOfBounds = false;
      let isManual = !!manualTime;

      if (community?.location) {
        const commLat =
          community.location._lat || community.location.latitude || 0;
        const commLng =
          community.location._long || community.location.longitude || 0;
        const check = isWithinRange(
          pos.lat,
          pos.lng,
          commLat,
          commLng,
          getEntryAllowedRadius(pos),
        );
        setDistanceInfo(check);

        isOutOfBounds = !check.withinRange;

        if (isOutOfBounds || isManual) {
          needsException = true;
        }
      } else if (isManual) {
        needsException = true;
      }

      if (needsException) {
        setPendingAction({
          type: "checkin",
          manualTime,
          pos,
          isOutOfBounds,
          isManual,
        });
        setActionLoading(false);
        setCheckInPhase(null);
        return;
      }

      await executeCheckIn(pos, manualTime, null);
    } catch (err) {
      alert("Error al iniciar servicio: " + err);
      console.error(err);
      setActionLoading(false);
      setCheckInPhase(null);
    }
  }

  async function executeCheckIn(pos, manualTime, exceptionReason) {
    setActionLoading(true);
    setCheckInPhase("saving");
    let checkInConfirmed = false;
    try {
      if (activeCheckIn) {
        console.warn("Ya hay un fichaje activo. No se creará otro.");
        return;
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        speed: pos.speed,
        timestamp: pos.timestamp,
        manualTime: manualTime,
        exceptionReason: exceptionReason,
      });
      checkInConfirmed = true;

      setActiveCheckIn({
        id: checkInId,
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        checkInTime: manualTime ? new Date(manualTime) : new Date(),
        checkOutTime: null,
      });
      setCheckInPhase("preparing");

      const currentGroup = getCurrentServiceGroup(groupedServices, service);
      for (const s of currentGroup) {
        // secureCheckIn already updates the service used for the check-in.
        if (s.id !== serviceId) {
          await updateScheduledServiceStatus(companyId, s.id, "in_progress");
        }
        if (s.assignedUserId !== userProfile.uid) {
          if (
            !s.companionIds?.includes(userProfile.uid) ||
            !s.participantIds?.includes(userProfile.uid)
          ) {
            await addCompanionToService(companyId, s.id, userProfile.uid);
          }
        }
        if (activeWorkday?.currentCompanionId) {
          if (
            !s.companionIds?.includes(activeWorkday.currentCompanionId) ||
            !s.participantIds?.includes(activeWorkday.currentCompanionId)
          ) {
            await addCompanionToService(
              companyId,
              s.id,
              activeWorkday.currentCompanionId,
            );
          }
        }
      }

      const otherUsers = new Set();
      if (
        service.assignedUserId &&
        service.assignedUserId !== userProfile.uid
      ) {
        otherUsers.add(service.assignedUserId);
      }
      if (service.companionIds && Array.isArray(service.companionIds)) {
        service.companionIds.forEach((cid) => {
          if (cid && cid !== userProfile.uid) {
            otherUsers.add(cid);
          }
        });
      }
      if (
        activeWorkday?.currentCompanionId &&
        activeWorkday.currentCompanionId !== userProfile.uid
      ) {
        otherUsers.add(activeWorkday.currentCompanionId);
      }

      for (const companionId of otherUsers) {
        try {
          await createCheckIn({
            userId: companionId,
            scheduledServiceId: serviceId,
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            speed: pos.speed,
            timestamp: pos.timestamp,
            manualTime: manualTime,
            exceptionReason: exceptionReason,
          });
        } catch (compErr) {
          console.warn(
            `[Companion] Error al fichar automáticamente al compañero ${companionId}:`,
            compErr,
          );
        }
      }

      localStorage.removeItem(`detected_entry_${serviceId}`);
      setSuggestedIn(null);

      const svcDate = service.scheduledDate?.toDate
        ? service.scheduledDate.toDate()
        : new Date(service.scheduledDate);

      // These reads do not depend on each other. Keep optional query failures
      // isolated so a temporary read error does not undo the confirmed entry.
      const tasksPromise = tasks.length > 0
        ? Promise.resolve(tasks)
        : getCommunityTasks(companyId, service.communityId);
      const weeklyPromise = (async () => {
        try {
          const startW = Timestamp.fromDate(
            startOfWeek(svcDate, { weekStartsOn: 1 }),
          );
          const endW = Timestamp.fromDate(
            endOfWeek(svcDate, { weekStartsOn: 1 }),
          );

          const qWeeklyExecs = query(
            tenantCollection(db, companyId, "taskExecutions"),
            where("userId", "==", userProfile.uid),
            where("createdAt", ">=", startW),
            where("createdAt", "<=", endW),
          );
          const weeklyExecsSnap = await getDocs(qWeeklyExecs);
          return new Set(
            weeklyExecsSnap.docs
              .map((d) => d.data())
              .filter((e) => e.status === "completed")
              .map((e) => e.communityTaskId),
          );
        } catch (err) {
          console.warn("Error fetching weekly task executions:", err);
          return new Set();
        }
      })();
      const pendingPromise = (async () => {
        try {
          const qPendingRed = query(
            tenantCollection(db, companyId, "scheduledServices"),
            where("communityId", "==", service.communityId),
            where("status", "==", "pending"),
          );
          return await getDocs(qPendingRed);
        } catch (err) {
          console.warn("Error fetching pending red services:", err);
          return null;
        }
      })();
      const [allTasks, completedTaskIdsThisWeek, pendingSnap] =
        await Promise.all([tasksPromise, weeklyPromise, pendingPromise]);

      const groupedTaskIds = new Set(
        currentGroup.map((s) => s.communityTaskId).filter(Boolean),
      );

      const currentSpecificTask = allTasks.find(
        (t) => t.id === service.communityTaskId,
      );
      const currentLowerName = (service.taskName || "").toLowerCase();
      const currentPrintColor =
        currentSpecificTask?.printColor ||
        (currentLowerName.includes("escalera")
          ? "#22c55e"
          : currentLowerName.includes("portal") ||
              currentLowerName.includes("repaso")
            ? "#eab308"
            : currentLowerName.includes("oficina")
              ? "#3b82f6"
              : "#ef4444");
      const currentIsGarage =
        !!currentSpecificTask?.isGarage ||
        currentLowerName.includes("garaje") ||
        !!service.isGarage;
      const currentIsOtras =
        currentPrintColor === "#ef4444" && !currentIsGarage;

      // Obtener tareas rojas ("otras") pendientes de la base de datos para esta comunidad
      let pendingRedTaskIds = new Set();
      const pendingTaskServices = [];
      pendingSnap?.forEach((d) => {
        const sData = d.data();
        if (!isTaskServiceAvailableOn(sData, svcDate)) return;
        const t = allTasks.find((x) => x.id === sData.communityTaskId);
        const scheduledTask = { id: d.id, ...sData };
        if (
          !shouldShowScheduledTaskInHost({
            scheduledTask,
            taskDefinition: t,
            hostService: service,
          })
        ) {
          return;
        }
        pendingTaskServices.push(scheduledTask);
        if (t) {
          const taskLowerName = (t.taskName || "").toLowerCase();
          const taskPrintColor =
            t.printColor ||
            (taskLowerName.includes("escalera")
              ? "#22c55e"
              : taskLowerName.includes("portal") ||
                  taskLowerName.includes("repaso")
                ? "#eab308"
                : taskLowerName.includes("oficina")
                  ? "#3b82f6"
                  : "#ef4444");
          const taskIsGarage =
            !!t.isGarage || taskLowerName.includes("garaje");
          const taskIsOtras = taskPrintColor === "#ef4444" && !taskIsGarage;
          if (taskIsOtras) {
            pendingRedTaskIds.add(sData.communityTaskId);
          }
        }
      });

      const relevantTasks = allTasks.filter((task) => {
        const taskLowerName = (task.taskName || "").toLowerCase();
        const taskPrintColor =
          task.printColor ||
          (taskLowerName.includes("escalera")
            ? "#22c55e"
            : taskLowerName.includes("portal") ||
                taskLowerName.includes("repaso")
              ? "#eab308"
              : taskLowerName.includes("oficina")
                ? "#3b82f6"
                : "#ef4444");
        const taskIsGarage =
          !!task.isGarage || taskLowerName.includes("garaje");
        const taskIsOtras = taskPrintColor === "#ef4444" && !taskIsGarage;

        // Every service rendered inside the current card needs its own
        // execution record so that its task button is actionable.
        if (groupedTaskIds.has(task.id)) return true;

        if (!currentIsOtras) {
          const isMainTask = service.communityTaskId
            ? task.id === service.communityTaskId
            : task.taskName === service.taskName;
          if (isMainTask) return true;

          // Si la tarea actual no es roja, pero hay tareas rojas pendientes en la comunidad,
          // las inyectamos dentro de esta tarjeta
          if (taskIsOtras && pendingRedTaskIds.has(task.id)) {
            return true;
          }
          return false;
        }

        if (!taskIsOtras) return false;

        if (completedTaskIdsThisWeek.has(task.id)) return false;
        if (groupedTaskIds.has(task.id)) return true;
        if (shouldScheduleOnDay(task, svcDate)) return true;
        if (task.flexibleWeek) {
          const monday = startOfWeek(svcDate, { weekStartsOn: 1 });
          if (shouldScheduleOnDay(task, monday)) return true;
        }
        return false;
      });

      for (const task of relevantTasks) {
        const existing = taskExecutions.find(
          (e) => e.communityTaskId === task.id,
        );
        if (!existing) {
          const sourceService = currentGroup.find((s) => s.communityTaskId === task.id) ||
            pendingTaskServices.filter((s) => s.communityTaskId === task.id &&
              (!s.assignedUserId || s.assignedUserId === service.assignedUserId))
              .sort((a, b) => {
                const date = (s) => s.scheduledDate?.toDate?.() || new Date(s.scheduledDate);
                return date(a) - date(b);
              })[0];
          await createTaskExecution(companyId, {
            scheduledServiceId: serviceId,
            communityTaskId: task.id,
            userId: userProfile.uid,
            sourceScheduledServiceId: sourceService?.id || null,
            originalScheduledDate: sourceService?.originalScheduledDate || sourceService?.originalDate || sourceService?.scheduledDate || null,
          });
        }
      }

      // This refresh does not affect whether the service and tasks are ready.
      void loadStaticData();
    } catch (err) {
      alert(checkInConfirmed
        ? "El servicio está iniciado, pero no se pudieron preparar todas las tareas. Recarga el servicio y comprueba las tareas antes de finalizarlo."
        : "Error al iniciar servicio: " + err);
    } finally {
      setActionLoading(false);
      setCheckInPhase(null);
    }
  }

  async function handleCheckOut(manualTime = null, taskDecision = null) {
    if (!activeCheckIn) return;

    const currentGroup = getCurrentServiceGroup(groupedServices, service);
    const pendingTasks = getPendingTaskConfirmations({
      groupedServices: currentGroup,
      taskExecutions,
      tasks,
      taskDecision,
      referenceDate: service?.scheduledDate,
    });

    if (pendingTasks.length > 0 && taskDecision === null) {
      setPendingTaskConfirmation({ mode: "checkout", pendingTasks, manualTime });
      return;
    }

    beginCheckoutAttempt();
    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFastPosition();
      } catch (geoErr) {
        console.warn("[useCheckInFlow] No se pudo obtener GPS para finalizar:", geoErr);
        if (!manualTime) {
          if (geoErr?.code === "LOCATION_SERVICES_DISABLED") {
            alert(
              "La ubicación del teléfono está desactivada. Actívala para finalizar el servicio.",
            );
            await openNativeLocationSettings();
          } else {
            alert(
              "No se ha podido obtener una ubicación reciente. Comprueba el GPS y vuelve a intentarlo.",
            );
          }
          clearCheckoutInProgress(serviceId);
          setActionLoading(false);
          return;
        }
      }

      const lat = pos?.lat ?? null;
      const lng = pos?.lng ?? null;

      // First, check for exit geofence/detection if not manualTime and out of bounds
      let check = null;
      if (!manualTime && community?.location) {
        const commLat =
          community.location._lat || community.location.latitude || 0;
        const commLng =
          community.location._long || community.location.longitude || 0;
        check = isWithinRange(
          lat,
          lng,
          commLat,
          commLng,
          getCommunityExitRadiusMeters(community),
        );
        setDistanceInfo(check);

        if (!check.withinRange) {
          let detectedExitTime = null;
          const confirmedRaw = localStorage.getItem(
            `detected_exit_${serviceId}`,
          );
          const pendingRaw = localStorage.getItem(
            `detected_exit_pending_${serviceId}`,
          );

          if (confirmedRaw) {
            detectedExitTime = new Date(confirmedRaw);
          } else if (pendingRaw) {
            try {
              const pending = JSON.parse(pendingRaw);
              detectedExitTime = new Date(pending.exitTime);
            } catch (e) {
              /* ignore */
            }
          }

          if (detectedExitTime) {
            const diffMs = Date.now() - detectedExitTime.getTime();
            const diffMinutes = Math.round(diffMs / 60000);

            if (diffMinutes >= 5) {
              const useDetected = window.confirm(
                `Estás a ${check.distance}m de la comunidad.\n\n` +
                  `Se detectó tu salida a las ${format(detectedExitTime, "HH:mm")} (hace ${diffMinutes} min).\n\n` +
                  `¿Usar las ${format(detectedExitTime, "HH:mm")} como hora de finalización?\n\n` +
                  `Aceptar = Usar hora detectada (${format(detectedExitTime, "HH:mm")})\n` +
                  `Cancelar = Usar hora actual`,
              );
              if (useDetected) {
                manualTime = detectedExitTime;
              }
            }
          }
        }
      }

      // Now determine if we need an exception reason
      let needsException = false;
      let isOutOfBounds = false;
      let isManual = !!manualTime;

      if (community?.location) {
        const commLat =
          community.location._lat || community.location.latitude || 0;
        const commLng =
          community.location._long || community.location.longitude || 0;
        if (!check) {
          check = isWithinRange(
            lat,
            lng,
            commLat,
            commLng,
            getCommunityExitRadiusMeters(community),
          );
          setDistanceInfo(check);
        }
        isOutOfBounds = !check.withinRange;

        if (isOutOfBounds || isManual) {
          needsException = true;
        }
      } else if (isManual) {
        needsException = true;
      }

      if (needsException) {
        setPendingAction({
          type: "checkout",
          manualTime,
          pos,
          lat,
          lng,
          clientSignature,
          isOutOfBounds,
          isManual,
          taskDecision,
        });
        setActionLoading(false);
        return;
      }

      await executeCheckOut(
        pos,
        lat,
        lng,
        manualTime,
        clientSignature,
        null,
        taskDecision,
      );
    } catch (err) {
      console.error(err);
      clearCheckoutInProgress(serviceId);
      setActionLoading(false);
    }
  }

  async function executeCheckOut(
    pos,
    lat,
    lng,
    manualTime,
    clientSignature,
    exceptionReason,
    taskDecision = null,
  ) {
    beginCheckoutAttempt();
    setActionLoading(true);
    try {
      const currentGroup = getCurrentServiceGroup(groupedServices, service);
      const result = await completeCheckOut(
        activeCheckIn.id,
        lat,
        lng,
        manualTime,
        clientSignature,
        {
          ...pos,
          exceptionReason,
        },
      );

      try {
        const qComp = query(
          tenantCollection(db, companyId, "checkIns"),
          where("scheduledServiceId", "==", serviceId),
          where("checkOutTime", "==", null),
        );
        const compSnap = await getDocs(qComp);
        for (const docSnap of compSnap.docs) {
          if (docSnap.id !== activeCheckIn.id) {
            await completeCheckOut(docSnap.id, lat, lng, manualTime, null, {
              ...pos,
              exceptionReason,
            });
          }
        }
      } catch (compErr) {
        console.warn(
          "[useCheckInFlow] Error al finalizar check-outs de los acompañantes:",
          compErr,
        );
      }

      for (const s of currentGroup) {
        if (s.communityTaskId) {
          const exec = taskExecutions.find(
            (e) => e.communityTaskId === s.communityTaskId,
          );
          const confirmedCompleted =
            taskDecision?.completedTaskIds?.includes(s.communityTaskId);

          const specificTask = tasks.find((t) => t.id === s.communityTaskId);
          const sName = (
            s.taskName ||
            specificTask?.taskName ||
            ""
          ).toLowerCase();
          const isException =
            sName.includes("escalera") ||
            sName.includes("portal") ||
            sName.includes("garaje") ||
            sName.includes("oficina");
          const isGarage = sName.includes("garaje");
          const mustStayOnScheduledDay = shouldNeverCarryTask(sName);

          const presentation =
            specificTask?.displayMode || s.displayMode || "standalone";
          const shouldCarryInCards =
            presentation === "embedded" &&
            (specificTask?.carryUntilCompleted ??
              s.carryUntilCompleted ??
              true);

          if (
            (exec && exec.status === "completed") ||
            confirmedCompleted ||
            mustStayOnScheduledDay ||
            (isException && presentation !== "embedded")
          ) {
            await updateScheduledServiceStatus(companyId, s.id, "completed");
          } else if (shouldCarryInCards) {
            const movedToNextHost = await passEmbeddedTaskToNextHost(companyId, {
              ...s,
              displayMode: presentation,
              hostTaskIds: specificTask?.hostTaskIds || s.hostTaskIds || [],
              carryUntilCompleted:
                specificTask?.carryUntilCompleted ??
                s.carryUntilCompleted ??
                true,
            });
            const fallbackStatus =
              getEmbeddedCarryFallbackStatus(movedToNextHost);
            if (fallbackStatus) {
              await updateScheduledServiceStatus(companyId, s.id, fallbackStatus);
            }
          } else {
            await passTaskToNextService(companyId, s, isGarage);
          }
        } else {
          await updateScheduledServiceStatus(companyId, s.id, "completed");
        }
      }

      localStorage.removeItem(`detected_exit_${serviceId}`);
      localStorage.removeItem(`detected_exit_pending_${serviceId}`);
      setSuggestedOut(null);

      alert(`Servicio finalizado. Duración: ${result.duration} minutos`);
      setActiveCheckIn(null);
      if (setClientSignature) setClientSignature(null);
      loadStaticData();
    } catch (err) {
      alert("Error: " + err);
    } finally {
      clearCheckoutInProgress(serviceId);
      setActionLoading(false);
    }
  }

  async function confirmPendingTasks(completed) {
    const confirmation = pendingTaskConfirmation;
    if (!confirmation) return;

    setActionLoading(true);
    try {
      const resolution = resolvePendingTaskAnswer({
        pendingTasks: confirmation.pendingTasks,
        completedTaskIds: confirmation.completedTaskIds || [],
        completed,
      });
      const task = resolution.answeredTask;
      if (!task) {
        setPendingTaskConfirmation(null);
        return;
      }

      if (completed) {
        let execution = task.execution;
        if (!execution) {
          execution = await createTaskExecution(companyId, {
            scheduledServiceId: serviceId,
            communityTaskId: task.communityTaskId,
            userId: userProfile.uid,
            sourceScheduledServiceId: task.sourceScheduledServiceId,
            originalScheduledDate:
              task.originalScheduledDate || service.scheduledDate || null,
          });
        }
        await updateTaskExecution(companyId, execution.id, {
          status: "completed",
          completedAt: serverTimestamp(),
        });

        // The task can be displayed in this card while its actual scheduled
        // occurrence belongs to an earlier day. Closing the execution alone
        // would make it reappear on the next host card.
        if (task.isExternalSource) {
          let sourceScheduledServiceId = task.sourceScheduledServiceId;

          // Older executions did not retain their source occurrence. Find
          // that pending task as a compatibility fallback so a positive
          // answer is durable for services created before this field.
          if (!sourceScheduledServiceId) {
            const pendingSources = await getDocs(
              query(
                tenantCollection(db, companyId, "scheduledServices"),
                where("communityId", "==", service.communityId),
                where("status", "==", "pending"),
              ),
            );
            sourceScheduledServiceId = pendingSources.docs
              .map((document) => ({ id: document.id, ...document.data() }))
              .filter(
                (candidate) =>
                  candidate.communityTaskId === task.communityTaskId &&
                  (!candidate.assignedUserId ||
                    candidate.assignedUserId === userProfile.uid),
              )
              .sort((left, right) => {
                const leftDate = left.scheduledDate?.toDate
                  ? left.scheduledDate.toDate()
                  : new Date(left.scheduledDate);
                const rightDate = right.scheduledDate?.toDate
                  ? right.scheduledDate.toDate()
                  : new Date(right.scheduledDate);
                return leftDate - rightDate;
              })[0]?.id;
          }

          if (sourceScheduledServiceId) {
            await updateScheduledServiceStatus(
              companyId,
              sourceScheduledServiceId,
              "completed",
            );
          }
        }
      }

      if (resolution.remainingTasks.length > 0) {
        setPendingTaskConfirmation({
          ...confirmation,
          pendingTasks: resolution.remainingTasks,
          completedTaskIds: resolution.completedTaskIds,
        });
        return;
      }

      setPendingTaskConfirmation(null);
      if (confirmation.mode === "force") {
        await handleForceComplete({
          completedTaskIds: resolution.completedTaskIds,
        });
      } else {
        await handleCheckOut(confirmation.manualTime, {
          completedTaskIds: resolution.completedTaskIds,
        });
      }
    } catch (error) {
      console.error("[useCheckInFlow] Error confirmando tareas:", error);
      alert("No se pudo guardar la respuesta. Inténtalo de nuevo.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFullManualSubmit() {
    if (!manualEntryTime || !manualExitTime) return;
    setActionLoading(true);
    try {
      const entryDate = parseHHMM(manualEntryTime);
      const exitDate = parseHHMM(manualExitTime);

      if (!entryDate || !exitDate) {
        alert("Formato de hora inválido.");
        setActionLoading(false);
        return;
      }

      if (exitDate.getTime() <= entryDate.getTime()) {
        alert("La hora de salida debe ser posterior a la de entrada.");
        setActionLoading(false);
        return;
      }

      setPendingAction({
        type: "fullManual",
        entryDate,
        exitDate,
      });
      setActionLoading(false);
    } catch (err) {
      console.error(err);
      setActionLoading(false);
    }
  }

  async function executeFullManual(entryDate, exitDate, exceptionReason) {
    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFastPosition();
      } catch (geoErr) {
        console.warn(
          "[useCheckInFlow] Registro manual sin posición GPS disponible:",
          geoErr,
        );
        pos = {
          lat: null,
          lng: null,
          accuracy: null,
          speed: null,
          timestamp: null,
        };
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        speed: pos.speed,
        timestamp: pos.timestamp,
        manualTime: entryDate,
        exceptionReason,
      });

      await completeCheckOut(
        checkInId,
        pos.lat,
        pos.lng,
        exitDate,
        clientSignature,
        { ...pos, exceptionReason },
      );

      const otherUsers = new Set();
      if (
        service.assignedUserId &&
        service.assignedUserId !== userProfile.uid
      ) {
        otherUsers.add(service.assignedUserId);
      }
      if (service.companionIds && Array.isArray(service.companionIds)) {
        service.companionIds.forEach((cid) => {
          if (cid && cid !== userProfile.uid) {
            otherUsers.add(cid);
          }
        });
      }
      if (
        activeWorkday?.currentCompanionId &&
        activeWorkday.currentCompanionId !== userProfile.uid
      ) {
        otherUsers.add(activeWorkday.currentCompanionId);
      }

      for (const companionId of otherUsers) {
        try {
          const compCheckInId = await createCheckIn({
            userId: companionId,
            communityId: service.communityId,
            scheduledServiceId: serviceId,
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            speed: pos.speed,
            timestamp: pos.timestamp,
            manualTime: entryDate,
            exceptionReason,
          });
          await completeCheckOut(
            compCheckInId,
            pos.lat,
            pos.lng,
            exitDate,
            null,
            { ...pos, exceptionReason },
          );
        } catch (compErr) {
          console.warn(
            `[Companion] Error al fichar manualmente al compañero ${companionId}:`,
            compErr,
          );
        }
      }

      const currentGroup = getCurrentServiceGroup(groupedServices, service);
      for (const s of currentGroup) {
        if (s.communityTaskId) {
          const exec = taskExecutions.find(
            (e) => e.communityTaskId === s.communityTaskId,
          );
          if (exec && exec.status === "completed") {
            await updateScheduledServiceStatus(companyId, s.id, "completed");
          } else {
            await updateScheduledServiceStatus(companyId, s.id, "missed");
          }
        } else {
          await updateScheduledServiceStatus(companyId, s.id, "completed");
        }
        if (s.assignedUserId !== userProfile.uid) {
          if (
            !s.companionIds?.includes(userProfile.uid) ||
            !s.participantIds?.includes(userProfile.uid)
          ) {
            await addCompanionToService(companyId, s.id, userProfile.uid);
          }
        }
        if (
          activeWorkday?.currentCompanionId &&
          (!s.companionIds?.includes(activeWorkday.currentCompanionId) ||
            !s.participantIds?.includes(activeWorkday.currentCompanionId))
        ) {
          await addCompanionToService(
            companyId,
            s.id,
            activeWorkday.currentCompanionId,
          );
        }
      }

      localStorage.removeItem(`detected_entry_${serviceId}`);
      localStorage.removeItem(`detected_exit_${serviceId}`);
      localStorage.removeItem(`detected_exit_pending_${serviceId}`);
      setSuggestedIn(null);
      setSuggestedOut(null);

      alert("Servicio registrado correctamente de forma retroactiva.");
      setShowFullManualForm(false);
      await loadStaticData();
    } catch (err) {
      alert("Error al registrar servicio: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleForceComplete(taskDecision = null) {
    const currentGroup = getCurrentServiceGroup(groupedServices, service);
    const pendingTasks = getPendingTaskConfirmations({
      groupedServices: currentGroup,
      taskExecutions,
      tasks,
      taskDecision,
      referenceDate: service?.scheduledDate,
    });

    if (pendingTasks.length > 0 && taskDecision === null) {
      setPendingTaskConfirmation({ mode: "force", pendingTasks });
      return;
    }

    if (taskDecision !== null ||
      window.confirm(
        "No tienes un fichaje activo. ¿Deseas marcar este servicio como terminado directamente?",
      )
    ) {
      setActionLoading(true);
      try {
        for (const s of currentGroup) {
          if (s.communityTaskId) {
            const exec = taskExecutions.find(
              (e) => e.communityTaskId === s.communityTaskId,
            );
            const specificTask = tasks.find((t) => t.id === s.communityTaskId);
            const sName = (
              s.taskName ||
              specificTask?.taskName ||
              ""
            ).toLowerCase();
            const isException =
              sName.includes("escalera") ||
              sName.includes("portal") ||
              sName.includes("garaje") ||
              sName.includes("oficina");
            const isGarage = sName.includes("garaje");
            const presentation =
              specificTask?.displayMode || s.displayMode || "standalone";

            const confirmedCompleted =
              taskDecision?.completedTaskIds?.includes(s.communityTaskId);
            if ((exec && exec.status === "completed") || confirmedCompleted || isException) {
              await updateScheduledServiceStatus(companyId, s.id, "completed");
            } else if (presentation === "embedded") {
              const movedToNextHost = await passEmbeddedTaskToNextHost(companyId, {
                ...s,
                displayMode: presentation,
                hostTaskIds: specificTask?.hostTaskIds || s.hostTaskIds || [],
                carryUntilCompleted:
                  specificTask?.carryUntilCompleted ??
                  s.carryUntilCompleted ??
                  true,
              });
              const fallbackStatus =
                getEmbeddedCarryFallbackStatus(movedToNextHost);
              if (fallbackStatus) {
                await updateScheduledServiceStatus(companyId, s.id, fallbackStatus);
              }
            } else {
              await passTaskToNextService(companyId, s, isGarage);
            }
          } else {
            await updateScheduledServiceStatus(companyId, s.id, "completed");
          }
        }
        alert("Servicio marcado como terminado");
        navigate("/operario");
      } catch (e) {
        alert("Error: " + e.message);
      } finally {
        setActionLoading(false);
      }
    }
  }

  async function sendGPSLocation() {
    setSendingGPS(true);
    try {
      const pos = await getFastPosition();
      if (!pos || pos.accuracy > 100) {
        throw new Error(
          "La señal GPS no tiene suficiente precisión. Sal al exterior y vuelve a intentarlo.",
        );
      }
      await createGPSSuggestion(companyId, {
        communityId: service.communityId,
        communityName: community.name,
        userId: userProfile.uid,
        userName: userProfile.name || userProfile.email,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
      });
      setGpsSent(true);
    } catch (err) {
      alert("Error al capturar GPS: " + err.message);
    } finally {
      setSendingGPS(false);
    }
  }

  const handleDismissSuggestion = () => {
    const silenceDuration = 25 * 60 * 1000; // 25 min
    localStorage.setItem(
      `dismissed_until_${serviceId}`,
      (Date.now() + silenceDuration).toString(),
    );
    setSuggestedIn(null);
    setSuggestedOut(null);
    setEntryDetails(null);
  };

  return {
    actionLoading,
    checkInPhase,
    distanceInfo,
    sendingGPS,
    gpsSent,
    suggestedIn,
    setSuggestedIn,
    entrySource,
    suggestedOut,
    setSuggestedOut,
    entryDetails,
    handleDismissSuggestion,
    estimatedIn,
    estimatedOut,
    showManualEntryForm,
    setShowManualEntryForm,
    showManualExitForm,
    setShowManualExitForm,
    showFullManualForm,
    setShowFullManualForm,
    manualEntryTime,
    setManualEntryTime,
    manualExitTime,
    setManualExitTime,
    pendingAction,
    setPendingAction,
    cancelPendingAction,
    pendingTaskConfirmation,
    confirmPendingTasks,
    handleCheckIn,
    handleCheckOut,
    handleFullManualSubmit,
    handleForceComplete,
    sendGPSLocation,
    executeCheckIn,
    executeCheckOut,
    executeFullManual,
  };
}
