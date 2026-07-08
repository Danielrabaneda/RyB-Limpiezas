import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunitiesForOperario, getCommunity } from '../../services/communityService';
import { optimizeRoute } from '../../services/routeOptimizerService';
import { getCommunityTasks } from '../../services/taskService';
import { getActiveCheckIn, createCheckIn } from '../../services/checkInService';
import { getActiveWorkday, startWorkday, endWorkday, activateCar, deactivateCar, getWorkdaysSummaryForDate, findLastActivityForUser, closeStaleWorkday } from '../../services/workdayService';
import { saveManualMileage } from '../../services/mileageService';
import { transferService, transferDay, transferWeek, rescheduleService } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import RescheduleModal from '../../components/RescheduleModal';
import { getOperarios } from '../../services/authService';
import { updateWorkdayCompanion } from '../../services/workdayService';
import { addCompanionToService, removeCompanionFromService } from '../../services/scheduleService';
import { useNavigate } from 'react-router-dom';
import { format, addDays, startOfDay, endOfDay, isSameDay, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, onSnapshot, Timestamp, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';

import { getDistance } from '../../utils/geolocation';

const getCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn("[GPS] Error obteniendo ubicación para recorrido:", err);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
};

const getOrigDateStr = (originalDate) => {
  if (!originalDate) return '';
  try {
    const dateObj = originalDate.toDate ? originalDate.toDate() : new Date(originalDate);
    return format(dateObj, 'dd/MM');
  } catch (e) {
    return '';
  }
};

export default function TodayPage() {
  const { userProfile } = useAuth();
  const { notifications, unreadCount, dismissAll } = useNotifications();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [enrichedServices, setEnrichedServices] = useState([]);
  const [routeOptimized, setRouteOptimized] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [firstStartTime, setFirstStartTime] = useState(null);
  const [allWorkdaysToday, setAllWorkdaysToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModal, setTransferModal] = useState({ open: false, type: 'single', service: null });
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, serviceId: null, currentDate: null });
  const [permissionsMissing, setPermissionsMissing] = useState(false);
  const [allOperarios, setAllOperarios] = useState([]);
  const [companionSelectorOpen, setCompanionSelectorOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [manualKm, setManualKm] = useState('');
  const [staleWorkday, setStaleWorkday] = useState(null); // { workday, suggestedEndTime }
  const [retroactiveModal, setRetroactiveModal] = useState({
    open: false,
    suggestedTime: null,
    suggestedTimeStr: '',
    actualTimeStr: '',
    workdayId: null,
    allTasksCompleted: false
  });

  const [activeWorkdaysList, setActiveWorkdaysList] = useState([]);

  const [userLocation, setUserLocation] = useState(null);

  const [debugLogs, setDebugLogs] = useState([]);
  // Guard to prevent concurrent loadToday() calls from multiple snapshot triggers
  const isLoadingTodayRef = useRef(false);

  // Efecto para actualizar la ubicación del operario periódicamente
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
    intervalId = setInterval(updateLocation, 15_000); // 15 segundos

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (userProfile?.uid) {
      loadOperarios();
    }
  }, [userProfile]);

  const loadOperarios = async () => {
    try {
      const ops = await getOperarios();
      setAllOperarios(ops.filter(o => o.uid !== userProfile.uid && o.active));
    } catch (err) {
      console.error("Error loading operarios", err);
    }
  };



  useEffect(() => {
    let watchId = null;
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('[WakeLock] No se pudo activar el bloqueo de pantalla:', err);
      }
    };

    const releaseWakeLock = async () => {
      try {
        if (wakeLock) {
          await wakeLock.release();
          wakeLock = null;
        }
      } catch (err) {
        console.error('[WakeLock] Error al liberar bloqueo:', err);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && activeWorkday?.carActive) {
        await requestWakeLock();
      }
    };

    if (activeWorkday && activeWorkday.carActive) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; 
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const processPosition = (pos) => {
        const currentBreadcrumb = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now()
        };

        try {
          const existing = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
          
          if (existing.length > 0) {
            const last = existing[existing.length - 1];
            const dist = getDistance(last.lat, last.lng, currentBreadcrumb.lat, currentBreadcrumb.lng);
            const timeDiff = currentBreadcrumb.timestamp - last.timestamp;

            // Guardar si se ha movido > 50m o pasaron > 2 minutos (120s)
            if (dist >= 50 || timeDiff >= 120000) {
              existing.push(currentBreadcrumb);
              localStorage.setItem('ryb_car_breadcrumbs', JSON.stringify(existing));
            }
          } else {
            existing.push(currentBreadcrumb);
            localStorage.setItem('ryb_car_breadcrumbs', JSON.stringify(existing));
          }
        } catch (e) {
          console.error('[GPS] Error guardando breadcrumb en watchPosition:', e);
        }
      };

      if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
          processPosition,
          (error) => console.warn('[GPS] watchPosition error:', error),
          {
            enableHighAccuracy: true, 
            timeout: 20000, 
            maximumAge: 30000 
          }
        );
      }
    }

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (watchId !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeWorkday?.carActive]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    
    setLoading(true);
    let unsubWorkdays = () => {};
    let unsubMyServices = () => {};
    let unsubCompanionServices = () => {};
    let titularUnsubs = [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const dayStart = Timestamp.fromDate(startOfDay(new Date()));
    const dayEnd = Timestamp.fromDate(endOfDay(new Date()));

    // 1. Listen to active workdays where I am titular OR companion
    const qWorkdays = query(
      collection(db, 'workdays'),
      where('status', '==', 'active')
    );

    unsubWorkdays = onSnapshot(qWorkdays, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myWorkday = docs.find(d => d.userId === userProfile.uid);
      const asCompanionWorkdays = docs.filter(d => d.currentCompanionId === userProfile.uid);
      
      setActiveWorkdaysList(docs);
      setActiveWorkday(myWorkday || null);

      // Cleanup previous titular listeners
      titularUnsubs.forEach(u => u());
      titularUnsubs = [];

      // Single call to loadToday when workdays change
      loadToday();
    }, (err) => {
      console.error("Error in workdays snapshot:", err);
    });

    // 2. Listen to my services (to get status updates) - no date filter to avoid index issues
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
      unsubCompanionServices();
      titularUnsubs.forEach(u => u());
    };
  }, [userProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Force reload by ignoring/clearing the ref guard
      isLoadingTodayRef.current = false;
      await loadToday();
    } catch (err) {
      console.error('Error refreshing today page:', err);
    } finally {
      setRefreshing(false);
    }
  };

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
      
      // Check for stale workday (orphaned from previous day)
      if (summary.activeWorkday) {
        const wdDate = summary.activeWorkday.date?.toDate ? summary.activeWorkday.date.toDate() : new Date(summary.activeWorkday.date);
        if (!isSameDay(wdDate, now)) {
          // It's from another day! Find last activity
          const lastActivity = await findLastActivityForUser(userProfile.uid, wdDate, summary.activeWorkday.id);
          setStaleWorkday({
            workday: summary.activeWorkday,
            suggestedEndTime: lastActivity || (summary.activeWorkday.startTime?.toDate ? summary.activeWorkday.startTime.toDate() : new Date())
          });
          setActiveWorkday(null); // Don't show as "Active" today
        } else {
          setActiveWorkday(summary.activeWorkday);
          setStaleWorkday(null);
        }
      } else {
        setActiveWorkday(null);
        setStaleWorkday(null);
      }

      setFirstStartTime(summary.firstStartTime);
      // We store the aggregated minutes in a virtual allWorkdaysToday-like array for backwards compatibility with UI logic
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
            lowerName.includes('portal') || lowerName.includes('repaso') ? '#eab308' : '#ef4444'
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

      // Route optimization based on current location or started services
      let optimized = [...enriched];
      let isRouteOptimized = false;

      let startLat = null;
      let startLng = null;

      // 1. Check active check-in community location
      if (checkIn && checkIn.communityId) {
        const comm = communityCache[checkIn.communityId];
        if (comm && comm.location) {
          startLat = comm.location._lat || comm.location.latitude || null;
          startLng = comm.location._long || comm.location.longitude || null;
        }
      }

      // 2. Check in_progress or started service community location
      if (!startLat || !startLng) {
        const activeSvc = enriched.find(s => s.status === 'in_progress' || s.status === 'started');
        if (activeSvc && activeSvc.community?.location) {
          const loc = activeSvc.community.location;
          startLat = loc._lat || loc.latitude || null;
          startLng = loc._long || loc.longitude || null;
        }
      }

      // 3. Check latest completed service today
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

      // 4. Fallback to current GPS location of the user (to optimize the route before starting)
      if (!startLat || !startLng) {
        try {
          const currentPos = await getCurrentLocation();
          if (currentPos) {
            startLat = currentPos.lat;
            startLng = currentPos.lng;
          }
        } catch (gpsErr) {
          console.warn('[GPS] Error getting current position for route:', gpsErr);
        }
      }

      // 5. Fallback to first community with a location if we still don't have a starting point
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

      // Group optimized services selectively
      const grouped = [];
      const seenGroupKeys = new Set();
      
      for (const svc of optimized) {
        if (!svc.communityId) {
          grouped.push(svc);
          continue;
        }
        
        const isOtras = svc.printColor === '#ef4444' && !svc.isGarage;
        const groupKey = isOtras ? `${svc.communityId}_otras` : `${svc.communityId}_${svc.id}`;
        
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
            
            // Consolidate status
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
      setServices(svcs);
    } catch (err) {
      console.error('Error loading today:', err);
    } finally {
      isLoadingTodayRef.current = false;
      setLoading(false);
    }
  };

  // Temporizador de seguridad para evitar que la pantalla de carga se quede bloqueada
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('Safety timeout triggered for TodayPage loading state');
        setLoading(false);
      }
    }, 10000); // 10 segundos
    return () => clearTimeout(timer);
  }, [loading]);

  const handleStartWorkday = async () => {
    if (!userProfile?.uid) return;
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || 'Operario';
      await startWorkday(userProfile.uid, name);
      await loadToday();
    } catch (err) {
      console.error(err);
      alert('Error al iniciar jornada: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };


  const handleEndWorkday = async () => {
    if (!activeWorkday) return;
    
    setActionLoading(true);
    try {
      // 1. Buscar la última actividad registrada para este usuario hoy
      const lastActivity = await findLastActivityForUser(userProfile.uid, new Date(), activeWorkday.id);
      
      // 2. Verificar si todas las tareas del día están completadas
      const allTasksCompleted = enrichedServices.length > 0 && enrichedServices.every(s => s.status === 'completed');
      
      if (lastActivity) {
        const diffMins = differenceInMinutes(new Date(), lastActivity);
        // Si ha pasado más de 30 minutos desde la última actividad
        if (diffMins > 30) {
          setRetroactiveModal({
            open: true,
            suggestedTime: lastActivity,
            suggestedTimeStr: format(lastActivity, 'HH:mm'),
            actualTimeStr: format(new Date(), 'HH:mm'),
            workdayId: activeWorkday.id,
            allTasksCompleted
          });
          setActionLoading(false);
          return;
        }
      }
      
      // Si ha pasado menos de 30 minutos o no hay actividad previa, confirmación normal
      setActionLoading(false);
      if (!window.confirm('¿Estás seguro de que quieres finalizar tu jornada laboral?')) return;
      
      setActionLoading(true);
      const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
      await endWorkday(activeWorkday.id, breadcrumbs);
      localStorage.removeItem('ryb_car_breadcrumbs');
      await loadToday();
    } catch (err) {
      console.error('Error al finalizar jornada:', err);
      alert('Error al finalizar jornada: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveEndWorkday = async (useRetroactive) => {
    if (!activeWorkday) return;
    setActionLoading(true);
    try {
      const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
      
      if (useRetroactive && retroactiveModal.suggestedTime) {
        // Finalizar jornada y coche con la hora de última actividad
        await endWorkday(activeWorkday.id, breadcrumbs, retroactiveModal.suggestedTime);
      } else {
        // Finalizar con hora actual
        await endWorkday(activeWorkday.id, breadcrumbs, null);
      }
      
      localStorage.removeItem('ryb_car_breadcrumbs');
      setRetroactiveModal({
        open: false,
        suggestedTime: null,
        suggestedTimeStr: '',
        actualTimeStr: '',
        workdayId: null,
        allTasksCompleted: false
      });
      await loadToday();
    } catch (err) {
      console.error(err);
      alert('Error al procesar el fin de jornada: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferConfirm = async (toUserId) => {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      if (transferModal.type === 'single') {
        const servicesToTransfer = transferModal.service.groupedServices || [transferModal.service];
        for (const s of servicesToTransfer) {
          await transferService({
            serviceId: s.id,
            fromUserId: userProfile.uid,
            toUserId,
            requesterRole: 'operario'
          });
        }
      } else if (transferModal.type === 'day') {
        const today = new Date();
        await transferDay({
          date: today,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
      } else if (transferModal.type === 'week') {
        const nextWeekDate = addDays(new Date(), 7);
        await transferWeek({
          dateInWeek: nextWeekDate,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
      }
      
      alert('Traspaso solicitado. El administrador deberá validarlo.');
      setTransferModal({ open: false, type: 'single', service: null });
      loadToday();
    } catch (err) {
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescheduleConfirm = async (newDate) => {
    if (!rescheduleModal.serviceId) return;
    setActionLoading(true);
    try {
      await rescheduleService({
        serviceId: rescheduleModal.serviceId,
        newDate,
        requesterRole: 'operario',
        userId: userProfile.uid
      });
      alert('Cambio de fecha solicitado. El administrador deberá validarlo.');
      setRescheduleModal({ open: false, serviceId: null, currentDate: null });
      loadToday();
    } catch (err) {
      alert('Error en el cambio de fecha: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetCompanion = async (companionId) => {
    if (!activeWorkday) return;
    const oldCompanionId = activeWorkday.currentCompanionId;
    setActionLoading(true);
    try {
      await updateWorkdayCompanion(activeWorkday.id, companionId);
      
      // If there's an active check-in, also update the companion in that service immediately
      if (activeCheckIn?.scheduledServiceId) {
        // Remove old companion if exists
        if (oldCompanionId && oldCompanionId !== companionId) {
          try {
            await removeCompanionFromService(activeCheckIn.scheduledServiceId, oldCompanionId);
            
            // Eliminar el check-in abierto del compañero anterior
            const qComp = query(
              collection(db, 'checkIns'),
              where('scheduledServiceId', '==', activeCheckIn.scheduledServiceId),
              where('userId', '==', oldCompanionId),
              where('checkOutTime', '==', null)
            );
            const compSnap = await getDocs(qComp);
            for (const docSnap of compSnap.docs) {
              await deleteDoc(docSnap.ref);
            }
          } catch (e) { console.warn("Could not remove old companion check-in", e); }
        }
        // Add new companion if exists
        if (companionId && companionId !== oldCompanionId) {
          await addCompanionToService(activeCheckIn.scheduledServiceId, companionId);
          
          // Crear el check-in automático del nuevo compañero con la misma hora de entrada del titular
          try {
            await createCheckIn({
              userId: companionId,
              communityId: activeCheckIn.communityId,
              scheduledServiceId: activeCheckIn.scheduledServiceId,
              lat: activeCheckIn.checkInLocation?.latitude || 0,
              lng: activeCheckIn.checkInLocation?.longitude || 0,
              manualTime: activeCheckIn.checkInTime?.toDate ? activeCheckIn.checkInTime.toDate() : new Date(activeCheckIn.checkInTime)
            });
          } catch (e) {
            console.warn("Could not create check-in for new companion", e);
          }
        }
      }
      
      await loadToday();
      setCompanionSelectorOpen(false);
    } catch (err) {
      alert("Error al asignar acompañante: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCar = async () => {
    if (!activeWorkday) return;
    setActionLoading(true);
    try {
      if (activeWorkday.carActive) {
        const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
        await deactivateCar(activeWorkday.id, breadcrumbs);
        localStorage.removeItem('ryb_car_breadcrumbs');
      } else {
        localStorage.setItem('ryb_car_breadcrumbs', '[]');
        await activateCar(activeWorkday.id);
      }
      await loadToday();
    } catch (err) {
      alert('Error al cambiar modo coche: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualMileage = async () => {
    if (!manualKm || isNaN(manualKm)) {
      alert('Por favor, ingresa un número válido de kilómetros');
      return;
    }
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || 'Operario';
      await saveManualMileage(userProfile.uid, name, new Date(), manualKm);
      alert('Kilometraje guardado correctamente');
      setMileageModalOpen(false);
      setManualKm('');
    } catch (err) {
      alert('Error al guardar kilometraje: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismissNotifications = async () => {
    await dismissAll();
  };

  const handleResolveStaleWorkday = async () => {
    if (!staleWorkday) return;
    setActionLoading(true);
    try {
      await closeStaleWorkday(staleWorkday.workday.id, staleWorkday.suggestedEndTime);
      setStaleWorkday(null);
      alert('Jornada anterior cerrada correctamente. Ahora puedes iniciar la de hoy.');
      await loadToday();
    } catch (err) {
      alert('Error al cerrar jornada anterior: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  function getStatusBadge(status) {
    switch (status) {
      case 'completed': return <span className="badge badge-success">✅ Completado</span>;
      case 'in_progress': return <span className="badge badge-info">🔄 En curso</span>;
      case 'missed': return <span className="badge badge-danger">❌ No realizado</span>;
      default: return <span className="badge badge-warning">⏳ Pendiente</span>;
    }
  }

  // Obtener información del compañero en tiempo real
  const companionInfo = useMemo(() => {
    if (!activeWorkday) return { uid: null, workday: null, carActive: false, name: '' };
    
    // El compañero puede ser el que yo seleccioné
    let companionUid = activeWorkday.currentCompanionId;
    
    // O si yo no seleccioné a nadie, puede ser el titular que me seleccionó a mí
    if (!companionUid) {
      const titularWd = activeWorkdaysList.find(d => d.currentCompanionId === userProfile?.uid && d.userId !== userProfile?.uid);
      if (titularWd) {
        companionUid = titularWd.userId;
      }
    }
    
    if (!companionUid) return { uid: null, workday: null, carActive: false, name: '' };
    
    const compWd = activeWorkdaysList.find(d => d.userId === companionUid);
    const opInfo = allOperarios.find(o => o.uid === companionUid);
    const name = opInfo?.name?.split(' ')[0] || 'Compañero';
    
    return {
      uid: companionUid,
      workday: compWd || null,
      carActive: compWd?.carActive === true,
      name: name
    };
  }, [activeWorkday, activeWorkdaysList, allOperarios, userProfile?.uid]);

  const hasCarConflict = activeWorkday?.carActive === true && companionInfo.carActive === true;

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ padding: 'var(--space-12)' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {permissionsMissing && (
        <div 
          className="mb-4 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden"
          style={{ 
            background: 'linear-gradient(135deg, #ef4444, #b91c1c)', 
            color: 'white', 
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
          }}
        >
          <div className="flex items-center gap-3 relative z-10">
            <span style={{ fontSize: '1.8rem' }}>⚠️</span>
            <div>
              <div className="font-bold text-lg leading-tight">PERMISOS DENEGADOS</div>
              <div className="text-sm opacity-90 mt-1">
                La app necesita Notificaciones y Ubicación (GPS) para funcionar correctamente.
              </div>
            </div>
          </div>
          <button 
            className="btn btn-sm mt-2 relative z-10 font-bold" 
            style={{ background: 'white', color: '#b91c1c', border: 'none' }}
            onClick={() => alert("Por favor, entra en los Ajustes de tu navegador o de tu teléfono, busca 'RyB Limpiezas' o la web actual, y permite el uso de Ubicación y Notificaciones.")}
          >
            Cómo solucionarlo
          </button>
        </div>
      )}

      {unreadCount > 0 && (
        <div 
          className="mb-4 rounded-xl overflow-hidden"
          style={{ 
            background: 'var(--color-danger)', 
            color: 'white', 
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
            animation: 'pulse 2s infinite'
          }}
        >
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span style={{ fontSize: '1.4rem' }}>🚨</span>
              <div>
                <div className="font-bold leading-tight">AVISO IMPORTANTE ({unreadCount})</div>
                <div className="text-xs opacity-90">Toca “OK” para marcar como leído</div>
              </div>
            </div>
            <button 
               className="btn btn-xs btn-ghost" 
               style={{ color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
               onClick={(e) => {
                 e.stopPropagation();
                 handleDismissNotifications();
               }}
            >
              OK
            </button>
          </div>
          {/* Mostrar contenido de las notificaciones */}
          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {notifications.slice(0, 5).map((notif) => (
              <div 
                key={notif.id}
                onClick={() => notif.serviceId && navigate(`/operario/servicio/${notif.serviceId}`)}
                style={{ 
                  background: 'rgba(255,255,255,0.15)', 
                  borderRadius: '8px', 
                  padding: '8px 12px',
                  cursor: notif.serviceId ? 'pointer' : 'default',
                  fontSize: '0.8rem',
                  lineHeight: 1.3
                }}
              >
                <div style={{ fontWeight: 700 }}>{notif.title || 'Aviso'}</div>
                {notif.body && <div style={{ opacity: 0.85, marginTop: '2px' }}>{notif.body}</div>}
              </div>
            ))}
            {notifications.length > 5 && (
              <div style={{ fontSize: '0.7rem', opacity: 0.7, textAlign: 'center', paddingTop: '4px' }}>
                +{notifications.length - 5} más
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mb-4">
        <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 800 }}>
          Hoy, {format(new Date(), "d 'de' MMMM", { locale: es })}
        </h2>
        <p className="text-sm text-muted">Gestión de jornada y servicios</p>
      </div>

       {/* Acciones Rápidas de Traspaso - Solo si no hay nada iniciado */}
      {(() => {
        const hasStartedDay = enrichedServices.some(s => s.status === 'completed' || s.status === 'in_progress');
        // Para la próxima semana no tenemos los servicios cargados aquí, 
        // pero podemos asumir que si es futura estará libre, 
        // o dejar que el servicio de backend lo valide.
        // Sin embargo, por consistencia, solo mostramos si el día actual no está "sucio" 
        // o si queremos ser más específicos. El usuario pidió bloquear si "ya está iniciado".

        return (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
            {!hasStartedDay ? (
              <button 
                className="btn btn-ghost btn-xs whitespace-nowrap" 
                onClick={() => setTransferModal({ open: true, type: 'day' })}
                style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
              >
                🔄 Todo HOY
              </button>
            ) : (
              <div className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-slate-50">
                🚫 Hoy bloqueado para traspasos
              </div>
            )}
            
            <button 
              className="btn btn-ghost btn-xs whitespace-nowrap" 
              onClick={() => setTransferModal({ open: true, type: 'week' })}
              style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
            >
              📅 Próx. Semana
            </button>
          </div>
        );
      })()}



      {/* SECCIÓN JORNADA GLOBAL - MEJORADO TÁCTILMENTE */}
      {(() => {
        const allServicesIndividual = enrichedServices.length > 0 && enrichedServices.every(s => s.community?.individualTimeTracking);
        
        return (
          <>
            {!allServicesIndividual && (
              <div 
                className="card mb-6 animate-slideUp workday-button-wrapper" 
                onClick={(!actionLoading) ? (activeWorkday ? handleEndWorkday : handleStartWorkday) : undefined}
                style={{ 
                  background: activeWorkday 
                    ? 'linear-gradient(135deg, #2563eb, #1e40af)' 
                    : 'linear-gradient(135deg, #ffffff, #f1f5f9)',
                  padding: 'var(--space-6)',
                  cursor: actionLoading ? 'wait' : 'pointer',
                  borderRadius: 'var(--radius-2xl)',
                  textAlign: 'center',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: activeWorkday 
                    ? '0 10px 25px -5px rgba(37, 99, 235, 0.5), inset 0 -4px 0 rgba(0,0,0,0.2)' 
                    : '0 8px 16px -4px rgba(0, 0, 0, 0.1), inset 0 -4px 0 rgba(0,0,0,0.05)',
                  border: activeWorkday ? 'none' : '1px solid var(--color-border)',
                  transform: actionLoading ? 'scale(0.98)' : 'scale(1)',
                  userSelect: 'none'
                }}
              >
                <div className="flex flex-col items-center gap-2">
                  <div style={{ 
                    fontSize: '3.5rem', 
                    marginBottom: 'var(--space-1)',
                    filter: actionLoading ? 'grayscale(1) opacity(0.5)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                    transition: 'transform 0.2s ease'
                  }} className={activeWorkday && !actionLoading ? 'animate-pulse' : ''}>
                    {actionLoading ? '⏳' : (activeWorkday ? '✅' : '🏢')}
                  </div>
                  
                  <div style={{ 
                    fontSize: 'var(--font-xl)', 
                    fontWeight: 900, 
                    letterSpacing: '0.05em',
                    color: activeWorkday ? '#ffffff' : 'var(--color-primary)' 
                  }}>
                    {actionLoading 
                      ? 'PROCESANDO...' 
                      : activeWorkday 
                         ? 'JORNADA ACTIVA' 
                         : 'INICIAR JORNADA'}
                  </div>

                  <div style={{ 
                    fontSize: 'var(--font-sm)', 
                    color: activeWorkday ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' 
                  }}>
                    {activeWorkday 
                      ? `Empezaste hoy a las ${format(firstStartTime || (activeWorkday.startTime?.toDate ? activeWorkday.startTime.toDate() : new Date()), 'HH:mm')}`
                      : 'Pulsa aquí para empezar a trabajar hoy'}
                  </div>

                  {(() => {
                    const accumulatedMinutes = allWorkdaysToday.reduce((acc, curr) => acc + (curr.totalMinutes || 0), 0);
                    if (accumulatedMinutes > 0) {
                      const h = Math.floor(accumulatedMinutes / 60);
                      const m = accumulatedMinutes % 60;
                      return (
                        <div style={{ 
                          fontSize: 'var(--font-xs)', 
                          fontWeight: 700,
                          marginTop: '4px',
                          color: activeWorkday ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)'
                        }}>
                          ⏱️ Acumulado hoy: {h}h {m}m
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {activeWorkday && !actionLoading && (
                    <div className="mt-4 py-2 px-4" style={{ 
                      background: 'rgba(255,255,255,0.2)', 
                      borderRadius: 'var(--radius-full)',
                      color: 'white',
                      fontSize: 'var(--font-xs)',
                      fontWeight: 700
                    }}>
                      PULSA PARA FINALIZAR
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FILA CON BOTÓN ACOMPAÑANTE + BOTÓN COCHE */}
            {activeWorkday && (
              <div className="mb-6 animate-fadeIn" style={{ display: 'flex', gap: 'var(--space-3)' }}>
                {/* BOTÓN ACOMPAÑANTE */}
                <button 
                  className="btn flex flex-col items-center justify-center gap-1"
                  onClick={() => setCompanionSelectorOpen(true)}
                  style={{
                    flex: 1,
                    background: activeWorkday.currentCompanionId ? 'var(--color-bg-subtle)' : 'white',
                    border: '2px dashed var(--color-primary)',
                    borderRadius: 'var(--radius-xl)',
                    color: 'var(--color-primary)',
                    minHeight: '80px',
                    padding: 'var(--space-3)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>👥</span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-xs)', textAlign: 'center', lineHeight: 1.2 }}>
                    {activeWorkday.currentCompanionId 
                      ? `CON: ${allOperarios.find(o => o.uid === activeWorkday.currentCompanionId)?.name?.split(' ')[0] || '...'}` 
                      : '¿COMPAÑERO?'}
                  </span>
                  <span style={{ fontSize: '9px', opacity: 0.6, textAlign: 'center' }}>
                    {activeWorkday.currentCompanionId ? 'Cambiar/Quitar' : 'Toca para elegir'}
                  </span>
                </button>

                {/* BOTÓN COCHE */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {(() => {
                    const isCompanionDriving = companionInfo.carActive && !activeWorkday.carActive;
                    return (
                      <button 
                        className="btn flex flex-col items-center justify-center gap-1"
                        onClick={handleToggleCar}
                        disabled={actionLoading || isCompanionDriving}
                        style={{
                          width: '100%',
                          background: activeWorkday.carActive 
                            ? 'linear-gradient(135deg, #2563eb, #1e40af)' 
                            : (isCompanionDriving ? '#f8fafc' : 'white'),
                          border: activeWorkday.carActive 
                            ? '2px solid #2563eb' 
                            : (isCompanionDriving ? '2px solid #e2e8f0' : '2px dashed #64748b'),
                          borderRadius: 'var(--radius-xl)',
                          color: activeWorkday.carActive 
                            ? '#ffffff' 
                            : (isCompanionDriving ? '#94a3b8' : '#64748b'),
                          minHeight: '80px',
                          padding: 'var(--space-3)',
                          boxShadow: activeWorkday.carActive 
                            ? '0 4px 12px -2px rgba(37, 99, 235, 0.5)' 
                            : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                          transition: 'all 0.3s ease',
                          opacity: isCompanionDriving ? 0.85 : 1,
                          cursor: isCompanionDriving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '1.2rem' }}>
                          {activeWorkday.carActive ? '🚗' : (isCompanionDriving ? '🚫🚗' : '🚶')}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 'var(--font-xs)', textAlign: 'center', lineHeight: 1.2 }}>
                          {activeWorkday.carActive 
                            ? 'COCHE ACTIVO' 
                            : (isCompanionDriving ? `COCHE CON ${companionInfo.name.toUpperCase()}` : '¿VAS EN COCHE?')}
                        </span>
                        <span style={{ fontSize: '9px', opacity: activeWorkday.carActive ? 0.8 : 0.6, textAlign: 'center' }}>
                          {activeWorkday.carActive 
                            ? `Desde ${activeWorkday.carActiveSince?.toDate ? format(activeWorkday.carActiveSince.toDate(), 'HH:mm') : '...'}` 
                            : (isCompanionDriving ? 'Bloqueado para evitar duplicados' : 'GPS Automático')}
                        </span>
                      </button>
                    );
                  })()}
                  
                  <button 
                    className="btn btn-ghost btn-xs"
                    onClick={() => setMileageModalOpen(true)}
                    style={{ 
                      fontSize: '10px', 
                      color: 'var(--color-primary)', 
                      fontWeight: 600,
                      textDecoration: 'underline'
                    }}
                  >
                    Ingresar km manualmente
                  </button>
                </div>
              </div>
            )}


          </>
        );
      })()}

      {/* MODAL SELECCIÓN ACOMPAÑANTE */}
      {companionSelectorOpen && (
        <div className="modal-overlay" onClick={() => setCompanionSelectorOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Seleccionar Acompañante</h3>
              <button 
                className="btn btn-ghost btn-circle" 
                onClick={() => setCompanionSelectorOpen(false)}
                style={{ fontSize: '1.5rem', minHeight: '44px', height: '44px', width: '44px' }}
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <button 
                className="btn btn-outline w-full text-left justify-start"
                onClick={() => handleSetCompanion(null)}
                style={{ borderColor: 'var(--color-border)' }}
              >
                🚶 Solo (Sin acompañante)
              </button>
              
              <div className="divider my-1"></div>
              
              {allOperarios.map(op => (
                <button
                  key={op.uid}
                  className={`btn w-full text-left justify-start ${activeWorkday?.currentCompanionId === op.uid ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleSetCompanion(op.uid)}
                >
                  👤 {op.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SERVICIO ACTIVO (OPCIONAL) */}
      {activeCheckIn && (
        <div 
          className="card mb-4" 
          onClick={() => navigate(`/operario/servicio/${activeCheckIn.scheduledServiceId}`)}
          style={{ 
            background: 'linear-gradient(135deg, var(--color-success-light), #a7f3d0)',
            border: '2px solid var(--color-success)',
            padding: 'var(--space-3)',
            cursor: 'pointer'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span style={{ fontSize: '1.5rem' }}>📍</span>
              <div>
                <div className="font-bold text-sm" style={{ color: '#065f46' }}>
                  Limpieza en curso: {activeCheckIn.communityName}
                </div>
                <div className="text-xs" style={{ color: '#047857' }}>
                  Entrada: {activeCheckIn.checkInTime?.toDate 
                    ? format(activeCheckIn.checkInTime.toDate(), 'HH:mm') 
                    : 'Ahora'}
                </div>
              </div>
            </div>
            <div className="text-xs font-bold px-2 py-1 bg-white/50 rounded-lg" style={{ color: '#065f46' }}>
              VER DETALLE →
            </div>
          </div>
        </div>
      )}

      {/* LISTADO DE SERVICIOS */}
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex justify-between items-center">
          <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 700 }}>Servicios de hoy</h3>
          <button 
            className="btn btn-ghost btn-xs flex items-center gap-1"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            style={{ color: 'var(--color-primary)', fontWeight: 600 }}
          >
            {refreshing ? 'Actualizando...' : '🔄 Actualizar'}
          </button>
        </div>
        {routeOptimized && (
          <div className="text-xs" style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            <span>⚡ Recorrido optimizado por distancia y horario</span>
          </div>
        )}
      </div>

      {enrichedServices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <h3 className="empty-state-title">Sin servicios hoy</h3>
          <p className="text-muted text-sm">No tienes servicios programados para hoy</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {enrichedServices.map((svc, index) => {
            const hasIndividualTime = svc.community?.individualTimeTracking;
            const canAccess = activeWorkday || hasIndividualTime;
            const statusClass = svc.status === 'completed' ? 'completed' : (svc.status === 'in_progress' || svc.status === 'started') ? 'in-progress' : '';
            const garageClass = svc.isGarage ? 'garage' : '';
            return (
            <div
              key={svc.id}
              className={`service-card ${statusClass} ${garageClass} ${!canAccess ? 'opacity-50 grayscale' : ''}`}
              onClick={() => {
                if (!canAccess) {
                  alert('Debes iniciar tu jornada primero para acceder a los servicios.');
                  return;
                }
                navigate(`/operario/servicio/${svc.id}`);
              }}
              style={{ 
                cursor: canAccess ? 'pointer' : 'not-allowed'
              }}
            >
              <div className="service-card-header">
                <div>
                  <div className="service-community" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {routeOptimized && (
                      <span style={{ fontSize: '10px', background: 'var(--color-primary)', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        #{index + 1}
                      </span>
                    )}
                    {svc.community?.name || 'Comunidad'}
                    {svc.community?.preferredTime && (
                      <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        🕐 Hora pref: {svc.community.preferredTime}
                      </span>
                    )}
                    {hasIndividualTime && (
                      <span style={{ fontSize: '10px', background: 'var(--color-info-light)', color: 'var(--color-info)', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        ⏱️ Indep.
                      </span>
                    )}
                    {svc.flexibleWeek && (
                      <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        📅 Sem. Flexible
                      </span>
                    )}
                    {svc.isCompanion && (
                      <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        🤝 Apoyo prestado
                      </span>
                    )}
                    {svc.isTransferred && (
                      <span style={{ fontSize: '10px', background: '#fef2f2', color: '#ef4444', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        ↪️ Traspasado{svc.transferValidated === false ? ' (Pte.)' : ''}
                      </span>
                    )}
                    {svc.isRescheduled && (
                      <span style={{ fontSize: '10px', background: '#faf5ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        📅 Cambiado{getOrigDateStr(svc.originalDate) ? ` (era ${getOrigDateStr(svc.originalDate)})` : ''}{svc.rescheduleValidated === false ? ' (Pte.)' : ''}
                      </span>
                    )}
                  </div>
                  <div className="service-address" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>{svc.community?.address || ''}</span>
                    {userLocation && svc.community?.location && svc.status !== 'completed' && svc.status !== 'missed' && (
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 'bold', 
                        color: getDistance(userLocation.lat, userLocation.lng, svc.community.location._lat || svc.community.location.latitude, svc.community.location._long || svc.community.location.longitude) <= 500 ? 'var(--color-success)' : 'var(--color-warning)'
                      }}>
                        📍 Distancia: {Math.round(getDistance(userLocation.lat, userLocation.lng, svc.community.location._lat || svc.community.location.latitude, svc.community.location._long || svc.community.location.longitude))}m
                      </span>
                    )}
                  </div>
                </div>
                {getStatusBadge(svc.status)}
              </div>
              
              {!svc.isCompanion && !['completed', 'in_progress'].includes(svc.status) && (
                <div className="flex gap-2 w-full mt-1 mb-2">
                  <button 
                    className="btn btn-ghost btn-xs flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTransferModal({ open: true, type: 'single', service: svc });
                    }}
                    style={{ color: 'var(--color-warning)', border: '1px solid var(--color-warning)', fontSize: '11px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    🔄 Traspasar
                  </button>
                  <button 
                    className="btn btn-ghost btn-xs flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRescheduleModal({ open: true, serviceId: svc.id, currentDate: svc.scheduledDate });
                    }}
                    style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontSize: '11px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    📅 Mover día
                  </button>
                </div>
              )}

              <div className="service-tasks" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
                  {svc.tasks?.map(t => {
                    let chipClass = 'service-task-chip';
                    if (t.status === 'completed') {
                      chipClass += ' completed';
                    } else if (t.status === 'missed') {
                      chipClass += ' missed';
                    } else if (t.isUrgent) {
                      chipClass += ' urgent';
                    }
                    
                    return (
                      <span key={t.id} className={chipClass}>
                        {t.status === 'completed' ? '✓ ' : t.status === 'missed' ? '✕ ' : t.isUrgent ? '🚨 ' : ''}
                        {t.taskName}
                      </span>
                    );
                  })}
                </div>
                {svc.isCompanion ? (
                  <button 
                    className="btn btn-secondary"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Ver detalles
                  </button>
                ) : (!svc.status || svc.status === 'pending') && (
                  <button 
                    className="btn btn-primary"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canAccess) {
                        alert('Debes iniciar tu jornada primero para acceder a este servicio.');
                        return;
                      }
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Inicio
                  </button>
                )}
                {svc.status === 'in_progress' && (
                  <button 
                    className="btn btn-info"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Continuar
                  </button>
                )}
              </div>
              {!canAccess && (
                <div className="text-xs font-bold text-danger mt-3">⚠️ Jornada no iniciada</div>
              )}
            </div>
          );})}
        </div>
      )}

      <TransferModal 
        isOpen={transferModal.open}
        onClose={() => setTransferModal({ open: false, type: 'single', service: null })}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={
          transferModal.type === 'day' ? 'Traspasar todo el día' :
          transferModal.type === 'week' ? 'Traspasar próxima semana' :
          `Traspasar servicio ${transferModal.service?.community?.name || ''}`
        }
      />

      <RescheduleModal 
        isOpen={rescheduleModal.open}
        onClose={() => setRescheduleModal({ open: false, serviceId: null, currentDate: null })}
        onConfirm={handleRescheduleConfirm}
        currentDate={rescheduleModal.currentDate}
        loading={actionLoading}
      />



      {/* MODAL KILOMETRAJE MANUAL */}
      {mileageModalOpen && (
        <div className="modal-overlay" onClick={() => setMileageModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Kilometraje Manual</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setMileageModalOpen(false)}>✕</button>
            </div>
            
            <p className="text-sm text-muted mb-4">
              Ingresa el total de kilómetros recorridos hoy. Esto sobrescribirá cualquier registro automático.
            </p>
            
            <div className="form-group mb-6">
              <label className="form-label">Kilómetros totales</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="Ej: 15.5" 
                value={manualKm}
                onChange={e => setManualKm(e.target.value)}
                autoFocus
              />
            </div>
            
            <button 
              className="btn btn-primary w-full"
              onClick={handleManualMileage}
              disabled={actionLoading || !manualKm}
            >
              {actionLoading ? 'Guardando...' : 'Guardar Kilometraje'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL JORNADA HUÉRFANA (STALE) */}
      {staleWorkday && (
        <div className="modal-overlay">
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '400px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '4rem', marginBottom: 'var(--space-4)' }}>⏰</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-danger)' }}>
                JORNADA SIN CERRAR
              </h3>
              <p className="text-sm text-muted mt-2">
                Parece que olvidaste cerrar tu jornada del día{' '}
                <span className="font-bold">
                  {format(staleWorkday.workday.date?.toDate ? staleWorkday.workday.date.toDate() : new Date(staleWorkday.workday.date), 'dd/MM/yyyy')}
                </span>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl mb-6 border border-slate-200">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted">Inicio detectado:</span>
                <span className="font-bold">
                  {format(staleWorkday.workday.startTime?.toDate ? staleWorkday.workday.startTime.toDate() : new Date(), 'HH:mm')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Última actividad (fin sugerido):</span>
                <span className="font-bold text-primary" style={{ fontSize: '1.1rem' }}>
                  {format(staleWorkday.suggestedEndTime, 'HH:mm')}
                </span>
              </div>
              <p className="text-[10px] text-muted mt-3 italic">
                * El fin sugerido se basa en tu última salida de una comunidad o último movimiento registrado.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold"
                onClick={handleResolveStaleWorkday}
                disabled={actionLoading}
              >
                {actionLoading ? 'CERRANDO...' : 'CONFIRMAR Y CERRAR'}
              </button>
              <p className="text-[10px] text-center text-muted">
                Debes cerrar la jornada anterior antes de poder iniciar una nueva.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FINALIZACIÓN INTELIGENTE (RETROACTIVA) */}
      {retroactiveModal.open && (
        <div className="modal-overlay">
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '420px', padding: '24px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>⏰</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                ¿Ajustar hora de salida?
              </h3>
              {retroactiveModal.allTasksCompleted ? (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg inline-flex items-center gap-2 mt-2 font-medium">
                  ✨ ¡Todas tus tareas del día están completadas!
                </div>
              ) : null}
              <p className="text-sm mt-3" style={{ color: '#334155' }}>
                Detectamos que tu última actividad registrada fue a las <span className="font-bold" style={{ color: '#0f172a' }}>{retroactiveModal.suggestedTimeStr}</span>.
              </p>
              <p className="text-xs mt-1" style={{ color: '#475569', lineHeight: 1.5 }}>
                Parece que han pasado más de 30 minutos desde entonces. ¿Quieres finalizar tu jornada a esa hora para evitar registrar horas de más y corregir el kilometraje del coche?
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl mb-6 border border-slate-200">
              <div className="flex justify-between items-center text-sm mb-3">
                <span className="flex items-center gap-1" style={{ color: '#475569', fontWeight: 500 }}>⏰ Hora sugerida (último trabajo):</span>
                <span className="font-bold text-emerald-600" style={{ fontSize: '1.3rem' }}>
                  {retroactiveModal.suggestedTimeStr}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
                <span style={{ color: '#475569', fontWeight: 500 }}>🕒 Hora actual:</span>
                <span className="font-semibold" style={{ color: '#64748b', fontSize: '1.1rem' }}>
                  {retroactiveModal.actualTimeStr}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold flex justify-center items-center gap-2"
                onClick={() => handleResolveEndWorkday(true)}
                disabled={actionLoading}
                style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
              >
                {actionLoading ? 'FINALIZANDO...' : `SÍ, FINALIZAR A LAS ${retroactiveModal.suggestedTimeStr}`}
              </button>
              
              <button 
                className="btn w-full py-3 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50"
                onClick={() => handleResolveEndWorkday(false)}
                disabled={actionLoading}
                style={{ color: 'var(--color-text)' }}
              >
                {actionLoading ? 'FINALIZANDO...' : `No, finalizar ahora (${retroactiveModal.actualTimeStr})`}
              </button>

              <button 
                className="btn btn-ghost w-full text-sm text-muted"
                onClick={() => setRetroactiveModal({ open: false, suggestedTime: null, suggestedTimeStr: '', actualTimeStr: '', workdayId: null, allTasksCompleted: false })}
                disabled={actionLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFLICTO DE COCHE COMPARTIDO */}
      {hasCarConflict && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '420px', padding: '24px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>🚗⚠️</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                Conflicto de coche activo
              </h3>
              <p className="text-sm mt-3" style={{ color: '#334155', lineHeight: 1.5 }}>
                Hemos detectado que tanto tú como tu compañero <strong>{companionInfo.name}</strong> tenéis el coche activo.
              </p>
              <p className="text-xs mt-2" style={{ color: '#475569', lineHeight: 1.5 }}>
                Para evitar que se registre el kilometraje por duplicado en el sistema, solo uno de vosotros debe marcar que lleva el coche. ¿Quién conduce hoy?
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold flex justify-center items-center gap-2"
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    // Desactivar el coche en la jornada del compañero
                    await deactivateCar(companionInfo.workday.id, []);
                  } catch (e) {
                    console.error("Error al desactivar coche del compañero", e);
                    alert("Error al resolver el conflicto. Por favor inténtalo de nuevo.");
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                style={{ backgroundColor: '#2563eb', borderColor: '#2563eb' }}
              >
                {actionLoading ? 'PROCESANDO...' : '🙋 Lo llevo yo (Conduzco yo)'}
              </button>
              
              <button 
                className="btn w-full py-3 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50"
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    // Desactivar mi coche
                    const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
                    await deactivateCar(activeWorkday.id, breadcrumbs);
                    localStorage.removeItem('ryb_car_breadcrumbs');
                  } catch (e) {
                    console.error("Error al desactivar mi coche", e);
                    alert("Error al resolver el conflicto. Por favor inténtalo de nuevo.");
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                style={{ color: '#475569' }}
              >
                {actionLoading ? 'PROCESANDO...' : `🚗 Lo lleva ${companionInfo.name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

