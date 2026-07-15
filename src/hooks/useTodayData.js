import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getScheduledServicesForDate } from '../services/scheduleService';
import { getCommunity } from '../services/communityService';
import { getCommunityTasks } from '../services/taskService';
import { getActiveCheckIn, completeCheckOut } from '../services/checkInService';
import { getWorkdaysSummaryForDate, findLastActivityForUser } from '../services/workdayService';
import { optimizeRoute } from '../services/routeOptimizerService';
import { format, isSameDay } from 'date-fns';
import { getCurrentLocation, getDistance } from '../utils/geolocation';

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
      console.log(`[TodayPage] Loading data for ${userProfile.uid} at ${now.toISOString()}`);

      const [svcs, checkIn, summary] = await Promise.all([
        getScheduledServicesForDate(userProfile.uid, now),
        getActiveCheckIn(userProfile.uid),
        getWorkdaysSummaryForDate(userProfile.uid, now)
      ]);

      console.log(`[TodayPage] Fetched ${svcs.length} services and summary (active: ${summary.hasActive})`);

      if (checkIn) {
        try {
          const comm = await getCommunity(checkIn.communityId);
          checkIn.communityName = comm?.name || 'Comunidad';
        } catch (e) {
          checkIn.communityName = 'Comunidad';
        }
      }

      setActiveCheckIn(checkIn);
      
      // Auto-cerrar fichaje pendiente de días anteriores si existe (Stale Check-in)
      if (checkIn) {
        const checkInDate = checkIn.checkInTime?.toDate ? checkIn.checkInTime.toDate() : new Date(checkIn.checkInTime);
        if (!isSameDay(checkInDate, now)) {
          console.log(`[TodayPage] Fichaje pendiente obsoleto detectado del día ${format(checkInDate, 'dd/MM/yyyy')}. Auto-cerrando a las 23:59...`);
          const endOfCheckInDay = new Date(checkInDate);
          endOfCheckInDay.setHours(23, 59, 59, 999);
          try {
            await completeCheckOut(checkIn.id, 0, 0, endOfCheckInDay);
            setActiveCheckIn(null);
            console.log('[TodayPage] Fichaje pendiente obsoleto cerrado correctamente.');
          } catch (err) {
            console.error('[TodayPage] Error auto-cerrando fichaje obsoleto:', err);
          }
        }
      }
      
      // Check for stale workday (orphaned from previous day)
      if (summary.activeWorkday) {
        const wdDate = summary.activeWorkday.date?.toDate ? summary.activeWorkday.date.toDate() : new Date(summary.activeWorkday.date);
        if (!isSameDay(wdDate, now)) {
          const lastActivity = await findLastActivityForUser(userProfile.uid, wdDate, summary.activeWorkday.id);
          setStaleWorkday({
            workday: summary.activeWorkday,
            suggestedEndTime: lastActivity || (summary.activeWorkday.startTime?.toDate ? summary.activeWorkday.startTime.toDate() : new Date())
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
      const uniqueCommunityIds = [...new Set(svcs.map(s => s.communityId))].filter(Boolean);
      await Promise.all(uniqueCommunityIds.map(async (commId) => {
        try {
          const [comm, tasks] = await Promise.all([
            getCommunity(commId),
            getCommunityTasks(commId)
          ]);
          communityCache[commId] = comm;
          taskCache[commId] = tasks;
        } catch (err) {
          console.warn(`Error prefetching community/tasks for ${commId}:`, err);
        }
      }));

      for (const svc of svcs) {
        try {
          const communityTasks = taskCache[svc.communityId] || [];
          const specificTask = communityTasks.find(t => t.id === svc.communityTaskId);

          const lowerName = (svc.taskName || '').toLowerCase();
          const isGarage = !!specificTask?.isGarage || lowerName.includes('garaje') || !!svc.isGarage;
          const printColor = specificTask?.printColor || (
            lowerName.includes('escalera') ? '#22c55e' :
            lowerName.includes('portal') || lowerName.includes('repaso') ? '#eab308' :
            lowerName.includes('oficina') ? '#3b82f6' : '#ef4444'
          );

          let tasks = [];
          if (svc.taskName) {
            tasks = [{ 
              id: svc.communityTaskId || svc.id, 
              taskName: svc.taskName,
              isUrgent: svc.isUrgent || specificTask?.isUrgent || false,
              status: svc.status
            }];
          } else if (specificTask) {
            tasks = [{
              ...specificTask,
              isUrgent: specificTask.isUrgent || svc.isUrgent || false,
              status: svc.status
            }];
          }

          enriched.push({
            ...svc,
            community: communityCache[svc.communityId] || { name: 'Comunidad desconocida' },
            tasks,
            isGarage,
            printColor
          });
        } catch (enrichErr) {
          console.warn(`Error enriching service ${svc.id}:`, enrichErr);
          enriched.push({ ...svc, community: { name: 'Comunidad...' }, tasks: [] });
        }
      }

      let optimized = [...enriched];
      let isRouteOptimized = false;
      let startLat = null;
      let startLng = null;

      if (checkIn && checkIn.communityId) {
        const comm = communityCache[checkIn.communityId];
        if (comm && comm.location) {
          startLat = comm.location._lat || comm.location.latitude || null;
          startLng = comm.location._long || comm.location.longitude || null;
        }
      }

      if (!startLat || !startLng) {
        const activeSvc = enriched.find(s => s.status === 'in_progress' || s.status === 'started');
        if (activeSvc && activeSvc.community?.location) {
          const loc = activeSvc.community.location;
          startLat = loc._lat || loc.latitude || null;
          startLng = loc._long || loc.longitude || null;
        }
      }

      if (!startLat || !startLng) {
        const completedSvcs = enriched.filter(s => s.status === 'completed');
        if (completedSvcs.length > 0) {
          completedSvcs.sort((a, b) => {
            const tA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
            const tB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
            return tA - tB;
          });
          const lastCompleted = completedSvcs[completedSvcs.length - 1];
          if (lastCompleted.community?.location) {
            const loc = lastCompleted.community.location;
            startLat = loc._lat || loc.latitude || null;
            startLng = loc._long || loc.longitude || null;
          }
        }
      }

      if (!startLat || !startLng) {
        try {
          const currentPos = await getCurrentLocation();
          if (currentPos) {
            startLat = currentPos.lat;
            startLng = currentPos.lng;
          }
        } catch (gpsErr) {
          console.warn('[GPS] Error getting position for route:', gpsErr);
        }
      }

      if (!startLat || !startLng) {
        const firstWithLocation = enriched.find(s => s.community?.location);
        if (firstWithLocation) {
          const loc = firstWithLocation.community.location;
          startLat = loc._lat || loc.latitude || null;
          startLng = loc._long || loc.longitude || null;
        }
      }

      if (startLat && startLng) {
        try {
          optimized = optimizeRoute(enriched, startLat, startLng);
          isRouteOptimized = true;
        } catch (optimizeErr) {
          console.error('Error optimizing route:', optimizeErr);
        }
      }

      const grouped = [];
      const seenGroupKeys = new Set();
      
      for (const svc of optimized) {
        if (!svc.communityId) {
          grouped.push(svc);
          continue;
        }
        
        const isOtras = svc.printColor === '#ef4444' && !svc.isGarage;
        if (isOtras) continue;
        const groupKey = `${svc.communityId}_${svc.id}`;
        
        if (seenGroupKeys.has(groupKey)) {
          const existingGroup = grouped.find(g => g.groupKey === groupKey);
          if (existingGroup) {
            existingGroup.groupedServices.push(svc);
            if (svc.tasks && svc.tasks.length > 0) {
              existingGroup.tasks.push(...svc.tasks);
            }
            if (svc.flexibleWeek) existingGroup.flexibleWeek = true;
            if (svc.isCompanion) existingGroup.isCompanion = true;
            if (svc.isTransferred) existingGroup.isTransferred = true;
            if (svc.isRescheduled) existingGroup.isRescheduled = true;
            if (svc.isGarage) existingGroup.isGarage = true;
            
            const allSvcs = existingGroup.groupedServices;
            if (allSvcs.every(s => s.status === 'completed')) {
              existingGroup.status = 'completed';
            } else if (allSvcs.every(s => s.status === 'missed')) {
              existingGroup.status = 'missed';
            } else if (allSvcs.every(s => s.status === 'completed' || s.status === 'missed')) {
              existingGroup.status = 'completed';
            } else if (allSvcs.some(s => s.status === 'in_progress' || s.status === 'started' || s.status === 'completed' || s.status === 'missed')) {
              existingGroup.status = 'in_progress';
            } else {
              existingGroup.status = 'pending';
            }
          }
        } else {
          seenGroupKeys.add(groupKey);
          grouped.push({
            ...svc,
            groupKey,
            groupedServices: [svc]
          });
        }
      }

      setRouteOptimized(isRouteOptimized);
      setEnrichedServices(grouped);
    } catch (err) {
      console.error('Error loading today:', err);
    } finally {
      isLoadingTodayRef.current = false;
      setLoading(false);
    }
  };

  // 3. Suscripción en tiempo real a Firebase
  useEffect(() => {
    if (!userProfile?.uid) return;
    
    setLoading(true);
    let unsubWorkdays = () => {};
    let unsubMyServices = () => {};

    const qWorkdays = query(
      collection(db, 'workdays'),
      where('status', '==', 'active')
    );

    unsubWorkdays = onSnapshot(qWorkdays, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myWorkday = docs.find(d => d.userId === userProfile.uid);
      
      setActiveWorkdaysList(docs);
      setActiveWorkday(myWorkday || null);

      loadToday();
    }, (err) => {
      console.error("Error in workdays snapshot:", err);
    });

    const qMySvcs = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userProfile.uid)
    );
    unsubMyServices = onSnapshot(qMySvcs, () => loadToday(), (err) => {
      console.error("Error in myServices snapshot:", err);
    });

    return () => {
      unsubWorkdays();
      unsubMyServices();
    };
  }, [userProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      isLoadingTodayRef.current = false;
      await loadToday();
    } catch (err) {
      console.error('Error refreshing today page:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Temporizador de seguridad
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('Safety timeout triggered for TodayPage loading state');
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
    handleRefresh
  };
}
