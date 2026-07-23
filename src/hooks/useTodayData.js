import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTenant } from "../contexts/TenantContext";
import { tenantCollection } from "../utils/tenantFirestore";
import { getScheduledServicesForDate } from "../services/scheduleService";
import { getCommunity } from "../services/communityService";
import { getCommunityTasks } from "../services/taskService";
import { getActiveCheckIn, completeCheckOut } from "../services/checkInService";
import {
  getWorkdaysSummaryForDate,
  findLastActivityForUser,
} from "../services/workdayService";
import {
  getValidCoordinates,
  optimizeRoutePlan,
} from "../services/routeOptimizerService";
import { format, isSameDay } from "date-fns";
import { getCurrentLocation, getDistance } from "../utils/geolocation";
import { groupServicesByTaskPresentation } from "../utils/taskPresentation";

export function useTodayData(userProfile) {
  const [enrichedServices, setEnrichedServices] = useState([]);
  const [routeOptimized, setRouteOptimized] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [firstStartTime, setFirstStartTime] = useState(null);
  const [allWorkdaysToday, setAllWorkdaysToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleWorkday, setStaleWorkday] = useState(null);
  const [activeWorkdaysList, setActiveWorkdaysList] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const isLoadingTodayRef = useRef(false);
  const { companyId } = useTenant();

  // 1. Ubicación periódica (cada 15s)
  useEffect(() => {
    let active = true;
    let intervalId = null;

    const updateLocation = async () => {
      try {
        const pos = await getCurrentLocation();
        if (active && pos) {
          setUserLocation(pos);
        }
      } catch (e) {
        // Ignorar
      }
    };

    updateLocation();
    intervalId = setInterval(updateLocation, 15_000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // 2. Carga principal de datos
  const loadToday = async () => {
    if (!userProfile?.uid) return;
    if (isLoadingTodayRef.current) return;
    isLoadingTodayRef.current = true;

    try {
      const now = new Date();
      console.log(
        `[TodayPage] Loading data for ${userProfile.uid} at ${now.toISOString()}`,
      );

      const [svcs, checkIn, summary] = await Promise.all([
        getScheduledServicesForDate(companyId, userProfile.uid, now),
        getActiveCheckIn(companyId, userProfile.uid),
        getWorkdaysSummaryForDate(companyId, userProfile.uid, now),
      ]);

      console.log(
        `[TodayPage] Fetched ${svcs.length} services and summary (active: ${summary.hasActive})`,
      );

      if (checkIn) {
        try {
          const comm = await getCommunity(companyId, checkIn.communityId);
          checkIn.communityName = comm?.name || "Comunidad";
        } catch (e) {
          checkIn.communityName = "Comunidad";
        }
      }

      setActiveCheckIn(checkIn);

      // Auto-cerrar fichaje pendiente de días anteriores si existe (Stale Check-in)
      if (checkIn) {
        const checkInDate = checkIn.checkInTime?.toDate
          ? checkIn.checkInTime.toDate()
          : new Date(checkIn.checkInTime);
        if (!isSameDay(checkInDate, now)) {
          console.log(
            `[TodayPage] Fichaje pendiente obsoleto detectado del día ${format(checkInDate, "dd/MM/yyyy")}. Auto-cerrando a las 23:59...`,
          );
          const endOfCheckInDay = new Date(checkInDate);
          endOfCheckInDay.setHours(23, 59, 59, 999);
          try {
            await completeCheckOut(
              checkIn.id,
              null,
              null,
              endOfCheckInDay,
              null,
              {
                exceptionReason:
                  "Cierre automático de fichaje obsoleto al iniciar un nuevo día.",
              },
            );
            setActiveCheckIn(null);
            console.log(
              "[TodayPage] Fichaje pendiente obsoleto cerrado correctamente.",
            );
          } catch (err) {
            console.error(
              "[TodayPage] Error auto-cerrando fichaje obsoleto:",
              err,
            );
          }
        }
      }

      // Check for stale workday (orphaned from previous day)
      if (summary.activeWorkday) {
        const wdDate = summary.activeWorkday.date?.toDate
          ? summary.activeWorkday.date.toDate()
          : new Date(summary.activeWorkday.date);
        if (!isSameDay(wdDate, now)) {
          const lastActivity = await findLastActivityForUser(
            companyId,
            userProfile.uid,
            wdDate,
            summary.activeWorkday.id,
          );
          setStaleWorkday({
            workday: summary.activeWorkday,
            suggestedEndTime:
              lastActivity ||
              (summary.activeWorkday.startTime?.toDate
                ? summary.activeWorkday.startTime.toDate()
                : new Date()),
          });
          setActiveWorkday(null);
        } else {
          setActiveWorkday(summary.activeWorkday);
          setStaleWorkday(null);
        }
      } else {
        setActiveWorkday(null);
        setStaleWorkday(null);
      }

      setFirstStartTime(summary.firstStartTime);
      setAllWorkdaysToday([{ totalMinutes: summary.totalMinutes }]);

      const enriched = [];
      const communityCache = {};
      const taskCache = {};

      // Prefetch all unique communities and community tasks in parallel
      const uniqueCommunityIds = [
        ...new Set(svcs.map((s) => s.communityId)),
      ].filter(Boolean);
      await Promise.all(
        uniqueCommunityIds.map(async (commId) => {
          try {
            const [comm, tasks] = await Promise.all([
              getCommunity(companyId, commId),
              getCommunityTasks(companyId, commId),
            ]);
            communityCache[commId] = comm;
            taskCache[commId] = tasks;
          } catch (err) {
            console.warn(
              `Error prefetching community/tasks for ${commId}:`,
              err,
            );
          }
        }),
      );

      for (const svc of svcs) {
        try {
          const communityTasks = taskCache[svc.communityId] || [];
          const specificTask = communityTasks.find(
            (t) => t.id === svc.communityTaskId,
          );

          const lowerName = (svc.taskName || "").toLowerCase();
          const isGarage =
            !!specificTask?.isGarage ||
            lowerName.includes("garaje") ||
            !!svc.isGarage;
          const printColor =
            specificTask?.printColor ||
            (lowerName.includes("escalera")
              ? "#22c55e"
              : lowerName.includes("portal") || lowerName.includes("repaso")
                ? "#eab308"
                : lowerName.includes("oficina")
                  ? "#3b82f6"
                  : "#ef4444");

          let tasks = [];
          if (svc.taskName) {
            tasks = [
              {
                id: svc.communityTaskId || svc.id,
                taskName: svc.taskName,
                isUrgent: svc.isUrgent || specificTask?.isUrgent || false,
                status: svc.status,
              },
            ];
          } else if (specificTask) {
            tasks = [
              {
                ...specificTask,
                isUrgent: specificTask.isUrgent || svc.isUrgent || false,
                status: svc.status,
              },
            ];
          }

          enriched.push({
            ...svc,
            community: communityCache[svc.communityId] || {
              name: "Comunidad desconocida",
            },
            tasks,
            isGarage,
            printColor,
            displayMode: specificTask?.displayMode || svc.displayMode || "standalone",
            hostTaskIds: specificTask?.hostTaskIds || svc.hostTaskIds || [],
            carryUntilCompleted:
              specificTask?.carryUntilCompleted ??
              svc.carryUntilCompleted ??
              true,
          });
        } catch (enrichErr) {
          console.warn(`Error enriching service ${svc.id}:`, enrichErr);
          enriched.push({
            ...svc,
            community: { name: "Comunidad..." },
            tasks: [],
          });
        }
      }

      let optimized = [...enriched];
      let isRouteOptimized = false;
      let startLat = null;
      let startLng = null;

      if (checkIn && checkIn.communityId) {
        const comm = communityCache[checkIn.communityId];
        const coordinates = getValidCoordinates(comm?.location);
        if (coordinates) {
          startLat = coordinates.lat;
          startLng = coordinates.lng;
        }
      }

      if (!startLat || !startLng) {
        const activeSvc = enriched.find(
          (s) => s.status === "in_progress" || s.status === "started",
        );
        const coordinates = getValidCoordinates(
          activeSvc?.community?.location,
        );
        if (coordinates) {
          startLat = coordinates.lat;
          startLng = coordinates.lng;
        }
      }

      if (!startLat || !startLng) {
        try {
          const currentPos = await getCurrentLocation();
          if (
            currentPos &&
            getValidCoordinates({
              latitude: currentPos.lat,
              longitude: currentPos.lng,
            })
          ) {
            startLat = currentPos.lat;
            startLng = currentPos.lng;
          }
        } catch (gpsErr) {
          console.warn("[GPS] Error getting position for route:", gpsErr);
        }
      }

      if (!startLat || !startLng) {
        const completedSvcs = enriched
          .filter((s) => s.status === "completed")
          .sort((a, b) => {
            const toMillis = (value) =>
              value?.toDate
                ? value.toDate().getTime()
                : value
                  ? new Date(value).getTime()
                  : 0;
            return toMillis(a.updatedAt) - toMillis(b.updatedAt);
          });
        const lastCompleted = completedSvcs[completedSvcs.length - 1];
        const coordinates = getValidCoordinates(
          lastCompleted?.community?.location,
        );
        if (coordinates) {
          startLat = coordinates.lat;
          startLng = coordinates.lng;
        }
      }

      try {
        const routePlan = optimizeRoutePlan(enriched, startLat, startLng);
        optimized = routePlan.services;
        isRouteOptimized = routePlan.optimized;
      } catch (optimizeErr) {
        console.error("Error optimizing route:", optimizeErr);
      }

      const allCommunityTasks = Object.values(taskCache).flat();
      const grouped = groupServicesByTaskPresentation(
        optimized,
        allCommunityTasks,
      );

      setRouteOptimized(isRouteOptimized);
      setEnrichedServices(grouped);
    } catch (err) {
      console.error("Error loading today:", err);
    } finally {
      isLoadingTodayRef.current = false;
      setLoading(false);
    }
  };

  // 3. Suscripción en tiempo real a Firebase
  useEffect(() => {
    if (!userProfile?.uid || !companyId) return;

    setLoading(true);
    let unsubWorkdays = () => {};
    let unsubMyServices = () => {};

    const qWorkdays = query(
      tenantCollection(db, companyId, "workdays"),
      where("status", "==", "active"),
    );

    unsubWorkdays = onSnapshot(
      qWorkdays,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const myWorkday = docs.find((d) => d.userId === userProfile.uid);

        setActiveWorkdaysList(docs);
        setActiveWorkday(myWorkday || null);

        loadToday();
      },
      (err) => {
        console.error("Error in workdays snapshot:", err);
      },
    );

    const qMySvcs = query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("assignedUserId", "==", userProfile.uid),
    );
    unsubMyServices = onSnapshot(
      qMySvcs,
      () => loadToday(),
      (err) => {
        console.error("Error in myServices snapshot:", err);
      },
    );

    return () => {
      unsubWorkdays();
      unsubMyServices();
    };
  }, [userProfile, companyId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      isLoadingTodayRef.current = false;
      await loadToday();
    } catch (err) {
      console.error("Error refreshing today page:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Temporizador de seguridad
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn("Safety timeout triggered for TodayPage loading state");
        setLoading(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  return {
    enrichedServices,
    routeOptimized,
    activeCheckIn,
    setActiveCheckIn,
    activeWorkday,
    setActiveWorkday,
    firstStartTime,
    allWorkdaysToday,
    loading,
    setLoading,
    refreshing,
    staleWorkday,
    setStaleWorkday,
    activeWorkdaysList,
    userLocation,
    loadToday,
    handleRefresh,
  };
}
