import { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { getEntryDetection, getExitDetection } from '../services/geoDetectionService';
import { getCommunity } from '../services/communityService';
import { getCheckInsForDate, createCheckIn, completeCheckOut, isWithinRange } from '../services/checkInService';
import { getCommunityTasks } from '../services/taskService';
import { shouldScheduleOnDay, addCompanionToService, updateScheduledServiceStatus, passTaskToNextService } from '../services/scheduleService';
import { createGPSSuggestion } from '../services/gpsSuggestionService';
import { getDistance } from '../utils/geolocation';
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import { createTaskExecution } from '../services/checkInService';
import { parseHHMM, formatTimeToHHMM } from '../utils/formatTime';

export function useCheckInFlow(serviceId, userProfile, serviceData, {
  navigate,
  getCurrentPosition,
  getFilteredPosition,
  clientSignature,
  setClientSignature,
  actionLoading: externalActionLoading,
  setActionLoading: externalSetActionLoading
}) {
  const {
    service,
    community,
    tasks,
    taskExecutions,
    activeCheckIn,
    setActiveCheckIn,
    activeWorkday,
    groupedServices,
    loadStaticData
  } = serviceData;

  const [localActionLoading, setLocalActionLoading] = useState(false);
  const actionLoading = externalActionLoading !== undefined ? externalActionLoading : localActionLoading;
  const setActionLoading = externalSetActionLoading !== undefined ? externalSetActionLoading : setLocalActionLoading;
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [sendingGPS, setSendingGPS] = useState(false);
  const [gpsSent, setGpsSent] = useState(false);
  const [suggestedIn, setSuggestedIn] = useState(null);
  const [entrySource, setEntrySource] = useState('realtime');
  const [suggestedOut, setSuggestedOut] = useState(null);
  
  const [estimatedIn, setEstimatedIn] = useState(null);
  const [estimatedOut, setEstimatedOut] = useState(null);
  const [showManualEntryForm, setShowManualEntryForm] = useState(false);
  const [showManualExitForm, setShowManualExitForm] = useState(false);
  const [showFullManualForm, setShowFullManualForm] = useState(false);
  const [manualEntryTime, setManualEntryTime] = useState('');
  const [manualExitTime, setManualExitTime] = useState('');

  const lastEstimatedServiceId = useRef(null);

  // Cargar sugerencias de geolocalización
  useEffect(() => {
    if (!serviceId || !userProfile?.uid) return;

    const loadGeoSuggestions = async () => {
      try {
        const sIn = localStorage.getItem(`detected_entry_${serviceId}`);
        const sOut = localStorage.getItem(`detected_exit_${serviceId}`);
        
        if (sIn) {
          setSuggestedIn(new Date(sIn));
          setEntrySource(localStorage.getItem(`detected_entry_source_${serviceId}`) || 'realtime');
        } else {
          const dbEntry = await getEntryDetection(userProfile.uid, serviceId);
          if (dbEntry && dbEntry.detectedAt) {
            setSuggestedIn(dbEntry.detectedAt.toDate ? dbEntry.detectedAt.toDate() : new Date(dbEntry.detectedAt));
            setEntrySource(dbEntry.source || 'realtime');
          }
        }

        if (sOut) {
          setSuggestedOut(new Date(sOut));
        } else {
          const dbExit = await getExitDetection(userProfile.uid, serviceId);
          if (dbExit && dbExit.detectedAt) {
            setSuggestedOut(dbExit.detectedAt.toDate ? dbExit.detectedAt.toDate() : new Date(dbExit.detectedAt));
          } else {
            const pendingRaw = localStorage.getItem(`detected_exit_pending_${serviceId}`);
            if (pendingRaw) {
              try {
                const pending = JSON.parse(pendingRaw);
                const elapsed = Date.now() - pending.firstDetectedAt;
                if (elapsed >= 5 * 60 * 1000) {
                  localStorage.setItem(`detected_exit_${serviceId}`, pending.exitTime);
                  localStorage.removeItem(`detected_exit_pending_${serviceId}`);
                  setSuggestedOut(new Date(pending.exitTime));
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
      } catch (err) {
        console.warn('[useCheckInFlow] Error loading suggestions:', err);
      }
    };
    loadGeoSuggestions();

    const exitPollInterval = setInterval(() => {
      const confirmedExit = localStorage.getItem(`detected_exit_${serviceId}`);
      if (confirmedExit && !suggestedOut) {
        setSuggestedOut(new Date(confirmedExit));
      } else if (!confirmedExit && !suggestedOut) {
        const pendingRaw = localStorage.getItem(`detected_exit_pending_${serviceId}`);
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            const elapsed = Date.now() - pending.firstDetectedAt;
            if (elapsed >= 5 * 60 * 1000) {
              localStorage.setItem(`detected_exit_${serviceId}`, pending.exitTime);
              localStorage.removeItem(`detected_exit_pending_${serviceId}`);
              setSuggestedOut(new Date(pending.exitTime));
            }
          } catch (e) { /* ignore */ }
        }
      }
    }, 10_000);

    return () => {
      clearInterval(exitPollInterval);
    };
  }, [serviceId, userProfile?.uid]);

  // Efecto para calcular estimaciones al cargar datos estáticos (ejecuta una vez por servicio)
  useEffect(() => {
    if (service && service.id === serviceId && activeWorkday && lastEstimatedServiceId.current !== serviceId) {
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
        const pos = await getCurrentPosition({ maximumAge: 5000 });
        if (!active) return;
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        if (commLat && commLng) {
          const check = isWithinRange(pos.lat, pos.lng, commLat, commLng, 500);
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
      const checkIns = await getCheckInsForDate(userId, today);
      const completedCheckIns = checkIns
        .filter(c => c.checkOutTime !== null)
        .sort((a, b) => {
          const aTime = a.checkOutTime?.toDate ? a.checkOutTime.toDate().getTime() : new Date(a.checkOutTime).getTime();
          const bTime = b.checkOutTime?.toDate ? b.checkOutTime.toDate().getTime() : new Date(b.checkOutTime).getTime();
          return bTime - aTime;
        });

      let estIn = null;
      let estOut = null;

      if (completedCheckIns.length > 0) {
        const lastCheckIn = completedCheckIns[0];
        const lastExitTime = lastCheckIn.checkOutTime?.toDate ? lastCheckIn.checkOutTime.toDate() : new Date(lastCheckIn.checkOutTime);
        
        let travelMinutes = 15;
        
        try {
          const lastComm = await getCommunity(lastCheckIn.communityId);
          if (lastComm?.location && currentSvc?.communityId) {
            const currentComm = await getCommunity(currentSvc.communityId);
            if (currentComm?.location) {
              const lat1 = lastComm.location._lat || lastComm.location.latitude || 0;
              const lng1 = lastComm.location._long || lastComm.location.longitude || 0;
              const lat2 = currentComm.location._lat || currentComm.location.latitude || 0;
              const lng2 = currentComm.location._long || currentComm.location.longitude || 0;
              
              if (lat1 && lng1 && lat2 && lng2) {
                const dist = getDistance(lat1, lng1, lat2, lng2);
                travelMinutes = Math.round(dist / 666) + 2; 
                if (travelMinutes < 2) travelMinutes = 2;
                if (travelMinutes > 120) travelMinutes = 15;
              }
            }
          }
        } catch (e) {
          console.warn('[Estimator] Error calculating distance:', e);
        }

        estIn = new Date(lastExitTime.getTime() + travelMinutes * 60 * 1000);
      } else if (workday?.startTime) {
        const workdayStart = workday.startTime.toDate ? workday.startTime.toDate() : new Date(workday.startTime);
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
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      };
      setManualEntryTime(formatTime(estIn));
      setManualExitTime(formatTime(estOut));

    } catch (err) {
      console.error('[Estimator] Error calculating estimates:', err);
    }
  };

  async function handleCheckIn(manualTime = null) {
    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFilteredPosition();
      } catch (geoErr) {
        console.warn('[useCheckInFlow] Error al obtener posición filtrada, usando fallback:', geoErr);
        try {
          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        } catch (rawErr) {
          console.warn('[useCheckInFlow] Error al obtener posición rápida, usando fallback de la comunidad:', rawErr);
          const commLat = community?.location?._lat || community?.location?.latitude || 0;
          const commLng = community?.location?._long || community?.location?.longitude || 0;
          pos = { lat: commLat, lng: commLng };
        }
      }
      
      if (community?.location) {
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        const check = isWithinRange(pos.lat, pos.lng, commLat, commLng, 500);
        setDistanceInfo(check);
      }

      if (activeCheckIn) {
        console.warn('Ya hay un fichaje activo. No se creará otro.');
        return;
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        manualTime: manualTime
      });

      setActiveCheckIn({
        id: checkInId,
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        checkInTime: manualTime ? new Date(manualTime) : new Date(),
        checkOutTime: null
      });

      const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
      for (const s of currentGroup) {
        await updateScheduledServiceStatus(s.id, 'in_progress');
      }

      if (activeWorkday?.currentCompanionId) {
        for (const s of currentGroup) {
          if (!s.companionIds?.includes(activeWorkday.currentCompanionId)) {
            await addCompanionToService(s.id, activeWorkday.currentCompanionId);
          }
        }
      }

      const companionsToCheckIn = [...(service.companionIds || [])];
      if (activeWorkday?.currentCompanionId && !companionsToCheckIn.includes(activeWorkday.currentCompanionId)) {
        companionsToCheckIn.push(activeWorkday.currentCompanionId);
      }

      for (const companionId of companionsToCheckIn) {
        try {
          await createCheckIn({
            userId: companionId,
            communityId: service.communityId,
            scheduledServiceId: serviceId,
            lat: pos.lat,
            lng: pos.lng,
            manualTime: manualTime
          });
        } catch (compErr) {
          console.warn(`[Companion] Error al fichar automáticamente al compañero ${companionId}:`, compErr);
        }
      }

      localStorage.removeItem(`detected_entry_${serviceId}`);
      setSuggestedIn(null);

      let allTasks = tasks;
      if (allTasks.length === 0) {
        allTasks = await getCommunityTasks(service.communityId);
      }

      const svcDate = service.scheduledDate?.toDate ? service.scheduledDate.toDate() : new Date(service.scheduledDate);
      
      let completedTaskIdsThisWeek = new Set();
      try {
        const startW = Timestamp.fromDate(startOfWeek(svcDate, { weekStartsOn: 1 }));
        const endW = Timestamp.fromDate(endOfWeek(svcDate, { weekStartsOn: 1 }));
        
        const qWeeklyExecs = query(
          collection(db, 'taskExecutions'),
          where('userId', '==', userProfile.uid),
          where('createdAt', '>=', startW),
          where('createdAt', '<=', endW)
        );
        const weeklyExecsSnap = await getDocs(qWeeklyExecs);
        completedTaskIdsThisWeek = new Set(
          weeklyExecsSnap.docs
            .map(d => d.data())
            .filter(e => e.status === 'completed')
            .map(e => e.communityTaskId)
        );
      } catch (err) {
        console.warn('Error fetching weekly task executions:', err);
      }

      const groupedTaskIds = new Set(currentGroup.map(s => s.communityTaskId).filter(Boolean));

      const currentSpecificTask = allTasks.find(t => t.id === service.communityTaskId);
      const currentLowerName = (service.taskName || '').toLowerCase();
      const currentPrintColor = currentSpecificTask?.printColor || (
        currentLowerName.includes('escalera') ? '#22c55e' :
        currentLowerName.includes('portal') || currentLowerName.includes('repaso') ? '#eab308' :
        currentLowerName.includes('oficina') ? '#3b82f6' : '#ef4444'
      );
      const currentIsGarage = !!currentSpecificTask?.isGarage || currentLowerName.includes('garaje') || !!service.isGarage;
      const currentIsOtras = currentPrintColor === '#ef4444' && !currentIsGarage;

      const relevantTasks = allTasks.filter(task => {
        if (!currentIsOtras) {
          if (service.communityTaskId) {
            return task.id === service.communityTaskId;
          } else {
            return task.taskName === service.taskName;
          }
        }

        const taskLowerName = (task.taskName || '').toLowerCase();
        const taskPrintColor = task.printColor || (
          taskLowerName.includes('escalera') ? '#22c55e' :
          taskLowerName.includes('portal') || taskLowerName.includes('repaso') ? '#eab308' :
          taskLowerName.includes('oficina') ? '#3b82f6' : '#ef4444'
        );
        const taskIsGarage = !!task.isGarage || taskLowerName.includes('garaje');
        const taskIsOtras = taskPrintColor === '#ef4444' && !taskIsGarage;

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
        const existing = taskExecutions.find(e => e.communityTaskId === task.id);
        if (!existing) {
          await createTaskExecution({
            scheduledServiceId: serviceId,
            communityTaskId: task.id,
            userId: userProfile.uid,
          });
        }
      }

      await loadStaticData();
    } catch (err) {
      alert('Error: ' + err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut(manualTime = null) {
    if (!activeCheckIn) return;

    const pendingTasks = [];
    const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
    for (const s of currentGroup) {
      if (s.communityTaskId) {
        const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
        const specificTask = tasks.find(t => t.id === s.communityTaskId);
        const sName = (s.taskName || specificTask?.taskName || '').toLowerCase();
        const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');
        const isDone = exec && exec.status === 'completed';
        
        if (!isDone && !isException) {
          pendingTasks.push(s.taskName || specificTask?.taskName || 'Tarea');
        }
      }
    }

    if (pendingTasks.length > 0) {
      const confirmMsg = `No has marcado la tarea realizada: "${pendingTasks.join(', ')}".\n\n` +
                         `¿Quieres volver atrás para marcarla como completada?\n\n` +
                         `Aceptar (OK) = Volver atrás para marcarla\n` +
                         `Cancelar = Continuar y finalizar el servicio (la tarea pasará al próximo día)`;
      if (window.confirm(confirmMsg)) {
        return;
      }
    }

    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFilteredPosition();
      } catch (geoErr) {
        console.warn('[useCheckInFlow] Error al obtener posición filtrada, usando fallback:', geoErr);
        try {
          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        } catch (rawErr) {
          console.warn('[useCheckInFlow] Error al obtener posición rápida, usando fallback de check-in:', rawErr);
        }
      }
      
      const lat = pos?.lat || activeCheckIn?.checkInLocation?.latitude || activeCheckIn?.checkInLocation?._lat || 0;
      const lng = pos?.lng || activeCheckIn?.checkInLocation?.longitude || activeCheckIn?.checkInLocation?._long || 0;
      
      if (!manualTime && community?.location) {
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        const check = isWithinRange(lat, lng, commLat, commLng, 500);
        setDistanceInfo(check);
        
        if (!check.withinRange) {
          let detectedExitTime = null;
          const confirmedRaw = localStorage.getItem(`detected_exit_${serviceId}`);
          const pendingRaw = localStorage.getItem(`detected_exit_pending_${serviceId}`);
          
          if (confirmedRaw) {
            detectedExitTime = new Date(confirmedRaw);
          } else if (pendingRaw) {
            try {
              const pending = JSON.parse(pendingRaw);
              detectedExitTime = new Date(pending.exitTime);
            } catch (e) { /* ignore */ }
          }
          
          if (detectedExitTime) {
            const diffMs = Date.now() - detectedExitTime.getTime();
            const diffMinutes = Math.round(diffMs / 60000);
            
            if (diffMinutes >= 5) {
              const useDetected = window.confirm(
                `Estás a ${check.distance}m de la comunidad.\n\n` +
                `Se detectó tu salida a las ${format(detectedExitTime, 'HH:mm')} (hace ${diffMinutes} min).\n\n` +
                `¿Usar las ${format(detectedExitTime, 'HH:mm')} como hora de finalización?\n\n` +
                `Aceptar = Usar hora detectada (${format(detectedExitTime, 'HH:mm')})\n` +
                `Cancelar = Usar hora actual`
              );
              if (useDetected) {
                manualTime = detectedExitTime;
              }
            }
          }
        }
      }
      
      const result = await completeCheckOut(activeCheckIn.id, lat, lng, manualTime, clientSignature);

      try {
        const qComp = query(
          collection(db, 'checkIns'),
          where('scheduledServiceId', '==', serviceId),
          where('checkOutTime', '==', null)
        );
        const compSnap = await getDocs(qComp);
        for (const docSnap of compSnap.docs) {
          if (docSnap.id !== activeCheckIn.id) {
            await completeCheckOut(docSnap.id, lat, lng, manualTime, null);
          }
        }
      } catch (compErr) {
        console.warn('[useCheckInFlow] Error al finalizar check-outs de los acompañantes:', compErr);
      }

      for (const s of currentGroup) {
        if (s.communityTaskId) {
          const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
          
          const specificTask = tasks.find(t => t.id === s.communityTaskId);
          const sName = (s.taskName || specificTask?.taskName || '').toLowerCase();
          const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');
          const isGarage = sName.includes('garaje');

          if ((exec && exec.status === 'completed') || isException) {
            await updateScheduledServiceStatus(s.id, 'completed');
          } else {
            await passTaskToNextService(s, isGarage);
          }
        } else {
          await updateScheduledServiceStatus(s.id, 'completed');
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
      alert('Error: ' + err);
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
        alert('Formato de hora inválido.');
        setActionLoading(false);
        return;
      }

      if (exitDate.getTime() <= entryDate.getTime()) {
        alert('La hora de salida debe ser posterior a la de entrada.');
        setActionLoading(false);
        return;
      }

      let pos = null;
      try {
        pos = await getFilteredPosition();
      } catch (geoErr) {
        console.warn('[useCheckInFlow] Error al obtener posición para manual, usando fallback:', geoErr);
        try {
          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        } catch (rawErr) {
          const commLat = community?.location?._lat || community?.location?.latitude || 0;
          const commLng = community?.location?._long || community?.location?.longitude || 0;
          pos = { lat: commLat, lng: commLng };
        }
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        manualTime: entryDate
      });

      await completeCheckOut(checkInId, pos.lat, pos.lng, exitDate, clientSignature);

      const companionsToCheckIn = [...(service.companionIds || [])];
      if (activeWorkday?.currentCompanionId && !companionsToCheckIn.includes(activeWorkday.currentCompanionId)) {
        companionsToCheckIn.push(activeWorkday.currentCompanionId);
      }

      for (const companionId of companionsToCheckIn) {
        try {
          const compCheckInId = await createCheckIn({
            userId: companionId,
            communityId: service.communityId,
            scheduledServiceId: serviceId,
            lat: pos.lat,
            lng: pos.lng,
            manualTime: entryDate
          });
          await completeCheckOut(compCheckInId, pos.lat, pos.lng, exitDate, null);
        } catch (compErr) {
          console.warn(`[Companion] Error al fichar manualmente al compañero ${companionId}:`, compErr);
        }
      }

      const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
      for (const s of currentGroup) {
        if (s.communityTaskId) {
          const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
          if (exec && exec.status === 'completed') {
            await updateScheduledServiceStatus(s.id, 'completed');
          } else {
            await updateScheduledServiceStatus(s.id, 'missed');
          }
        } else {
          await updateScheduledServiceStatus(s.id, 'completed');
        }
      }

      localStorage.removeItem(`detected_entry_${serviceId}`);
      localStorage.removeItem(`detected_exit_${serviceId}`);
      localStorage.removeItem(`detected_exit_pending_${serviceId}`);
      setSuggestedIn(null);
      setSuggestedOut(null);

      alert('Servicio registrado correctamente de forma retroactiva.');
      setShowFullManualForm(false);
      await loadStaticData();
    } catch (err) {
      alert('Error al registrar servicio: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleForceComplete() {
    const pendingTasks = [];
    const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
    for (const s of currentGroup) {
      if (s.communityTaskId) {
        const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
        const specificTask = tasks.find(t => t.id === s.communityTaskId);
        const sName = (s.taskName || specificTask?.taskName || '').toLowerCase();
        const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');
        const isDone = exec && exec.status === 'completed';
        
        if (!isDone && !isException) {
          pendingTasks.push(s.taskName || specificTask?.taskName || 'Tarea');
        }
      }
    }

    if (pendingTasks.length > 0) {
      const confirmMsg = `No has marcado la tarea realizada: "${pendingTasks.join(', ')}".\n\n` +
                         `¿Quieres volver atrás para marcarla como completada?\n\n` +
                         `Aceptar (OK) = Volver atrás para marcarla\n` +
                         `Cancelar = Continuar y forzar la finalización (la tarea pasará al próximo día)`;
      if (window.confirm(confirmMsg)) {
        return;
      }
    }

    if (window.confirm('No tienes un fichaje activo. ¿Deseas marcar este servicio como terminado directamente?')) {
      setActionLoading(true);
      try {
        for (const s of currentGroup) {
          if (s.communityTaskId) {
            const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
            const specificTask = tasks.find(t => t.id === s.communityTaskId);
            const sName = (s.taskName || specificTask?.taskName || '').toLowerCase();
            const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');
            const isGarage = sName.includes('garaje');

            if ((exec && exec.status === 'completed') || isException) {
              await updateScheduledServiceStatus(s.id, 'completed');
            } else {
              await passTaskToNextService(s, isGarage);
            }
          } else {
            await updateScheduledServiceStatus(s.id, 'completed');
          }
        }
        alert('Servicio marcado como terminado');
        navigate('/operario');
      } catch(e) {
        alert('Error: ' + e.message);
      } finally {
        setActionLoading(false);
      }
    }
  }

  async function sendGPSLocation() {
    setSendingGPS(true);
    try {
      const pos = await getFilteredPosition();
      await createGPSSuggestion({
        communityId: service.communityId,
        communityName: community.name,
        userId: userProfile.uid,
        userName: userProfile.name || userProfile.email,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy
      });
      setGpsSent(true);
    } catch (err) {
      alert('Error al capturar GPS: ' + err.message);
    } finally {
      setSendingGPS(false);
    }
  }

  return {
    actionLoading,
    distanceInfo,
    sendingGPS,
    gpsSent,
    suggestedIn,
    setSuggestedIn,
    entrySource,
    suggestedOut,
    setSuggestedOut,
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
    handleCheckIn,
    handleCheckOut,
    handleFullManualSubmit,
    handleForceComplete,
    sendGPSLocation
  };
}
