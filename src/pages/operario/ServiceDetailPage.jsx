import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { getCommunity } from '../../services/communityService';
import { getCommunityTasks } from '../../services/taskService';
import { getScheduledServicesForDate, updateScheduledServiceStatus, addCompanionToService, removeCompanionFromService, shouldScheduleOnDay, updateScheduledServiceNotesAndPhotos, passTaskToNextService } from '../../services/scheduleService';
import { 
  createCheckIn, completeCheckOut, getActiveCheckIn, getCheckInsForDate,
  createTaskExecution, updateTaskExecution, getTaskExecutionsForService,
  isWithinRange
} from '../../services/checkInService';
import { uploadPhoto } from '../../services/storageService';
import { createGPSSuggestion } from '../../services/gpsSuggestionService';
import { createEvidenceReport } from '../../services/evidenceService';
import { transferService, rescheduleService } from '../../services/transferService';
import { getOperarios } from '../../services/authService';
import TransferModal from '../../components/TransferModal';
import RescheduleModal from '../../components/RescheduleModal';
import SignatureCanvas from '../../components/SignatureCanvas';
import { getCommunityGuides } from '../../services/documentVaultService';
import { getActiveWorkday } from '../../services/workdayService';
import { getEntryDetection, getExitDetection } from '../../services/geoDetectionService';
import { getDistance } from '../../utils/geolocation';
import { doc, getDoc, onSnapshot, collection, query, where, updateDoc, arrayUnion, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export default function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { userProfile } = useAuth();
  const { getCurrentPosition, getFilteredPosition, loading: geoLoading } = useGeolocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [service, setService] = useState(null);
  const [community, setCommunity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskExecutions, setTaskExecutions] = useState([]);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [otherActiveCheckIn, setOtherActiveCheckIn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [operariosMap, setOperariosMap] = useState({});
  const [selectedTaskExec, setSelectedTaskExec] = useState(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [sendingGPS, setSendingGPS] = useState(false);
  const [gpsSent, setGpsSent] = useState(false);
  const [suggestedIn, setSuggestedIn] = useState(null);
  const [entrySource, setEntrySource] = useState('realtime');
  const [suggestedOut, setSuggestedOut] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [submittingEvidence, setSubmittingEvidence] = useState({});
  const [submittedEvidence, setSubmittedEvidence] = useState({});
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [clientSignature, setClientSignature] = useState(null);
  const [communityDocs, setCommunityDocs] = useState([]);
  const [groupedServices, setGroupedServices] = useState([]);
  
  // Estados para evidencias generales
  const [generalNotes, setGeneralNotes] = useState('');
  const [generalPhotos, setGeneralPhotos] = useState([]);
  const [uploadingGeneralPhoto, setUploadingGeneralPhoto] = useState(false);
  const [submittingGeneralEvidence, setSubmittingGeneralEvidence] = useState(false);
  const [submittedGeneralEvidence, setSubmittedGeneralEvidence] = useState(false);
  
  // Estados para fichaje manual y estimaciones
  const [estimatedIn, setEstimatedIn] = useState(null);
  const [estimatedOut, setEstimatedOut] = useState(null);
  const [showManualEntryForm, setShowManualEntryForm] = useState(false);
  const [showManualExitForm, setShowManualExitForm] = useState(false);
  const [showFullManualForm, setShowFullManualForm] = useState(false);
  const [manualEntryTime, setManualEntryTime] = useState('');
  const [manualExitTime, setManualExitTime] = useState('');

  useEffect(() => {
    if (!serviceId) return;

    // Reset state when service changes
    setActiveCheckIn(null);
    setService(null);
    setCommunity(null);
    setTasks([]);
    setTaskExecutions([]);
    setDistanceInfo(null);
    setClientSignature(null);
    setShowSignatureModal(false);
    setCommunityDocs([]);

    // 1. Listen to service document
    const unsubService = onSnapshot(doc(db, 'scheduledServices', serviceId), async (snap) => {
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const svcData = { id: snap.id, ...snap.data() };
      setService(svcData);
      setGeneralNotes(svcData.generalNotes || '');
      setGeneralPhotos(svcData.generalPhotoUrls || []);

      // Load static info if not already loaded
      if (!community) {
        const comm = await getCommunity(svcData.communityId);
        setCommunity(comm);
        
        const commTasks = await getCommunityTasks(svcData.communityId);
        setTasks(commTasks);

        const docs = await getCommunityGuides(svcData.communityId);
        setCommunityDocs(docs || []);
      }

      // Load grouped services on the same day for this community
      try {
        const svcDate = svcData.scheduledDate?.toDate ? svcData.scheduledDate.toDate() : new Date(svcData.scheduledDate);
        const allSvcsToday = await getScheduledServicesForDate(userProfile.uid, svcDate);
        
        // Find category/color for the current service to apply selective grouping
        const currentSpecificTask = commTasks.find(t => t.id === svcData.communityTaskId);
        const currentLowerName = (svcData.taskName || '').toLowerCase();
        const currentPrintColor = currentSpecificTask?.printColor || (
          currentLowerName.includes('escalera') ? '#22c55e' :
          currentLowerName.includes('portal') || currentLowerName.includes('repaso') ? '#eab308' :
          currentLowerName.includes('oficina') ? '#3b82f6' : '#ef4444'
        );
        const currentIsGarage = !!currentSpecificTask?.isGarage || currentLowerName.includes('garaje') || !!svcData.isGarage;
        const currentIsOtras = currentPrintColor === '#ef4444' && !currentIsGarage;

        let filtered = [];
        if (currentIsOtras) {
          // Group only "Otras" (red) tasks of the same community today
          for (const s of allSvcsToday) {
            if (s.communityId === svcData.communityId) {
              const specTask = commTasks.find(t => t.id === s.communityTaskId);
              const lowerName = (s.taskName || '').toLowerCase();
              const printColor = specTask?.printColor || (
                lowerName.includes('escalera') ? '#22c55e' :
                lowerName.includes('portal') || lowerName.includes('repaso') ? '#eab308' :
                lowerName.includes('oficina') ? '#3b82f6' : '#ef4444'
              );
              const isGarage = !!specTask?.isGarage || lowerName.includes('garaje') || !!s.isGarage;
              const isOtras = printColor === '#ef4444' && !isGarage;
              
              if (isOtras) {
                filtered.push(s);
              }
            }
          }
        } else {
          // Escalera, Portal and Garaje do not group with anything else
          filtered = [svcData];
        }

        if (!filtered.some(s => s.id === svcData.id)) {
          filtered.push(svcData);
        }
        setGroupedServices(filtered);
      } catch (err) {
        console.warn('Error loading grouped services:', err);
        setGroupedServices([svcData]);
      }
    });

    // 2. Listen to task executions
    const qExecs = query(
      collection(db, 'taskExecutions'),
      where('scheduledServiceId', '==', serviceId)
    );
    const unsubExecs = onSnapshot(qExecs, (snap) => {
      setTaskExecutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. One-time fetches
    loadStaticData();
    
    // Cargar sugerencias de geolocalización (local y Firestore)
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
        console.warn('[ServiceDetail] Error loading suggestions:', err);
      }
    };
    loadGeoSuggestions();

    // Polling para detectar salida confirmada o promover pending exits
    const exitPollInterval = setInterval(() => {
      const confirmedExit = localStorage.getItem(`detected_exit_${serviceId}`);
      if (confirmedExit && !suggestedOut) {
        setSuggestedOut(new Date(confirmedExit));
      } else if (!confirmedExit && !suggestedOut) {
        // Comprobar si hay un pending que debería promoverse
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
    }, 10_000); // cada 10 segundos

    return () => {
      unsubService();
      unsubExecs();
      clearInterval(exitPollInterval);
    };
  }, [serviceId, userProfile]);

  // Efecto para actualizar la distancia en tiempo real
  useEffect(() => {
    if (!community?.location) return;

    let active = true;
    let intervalId = null;

    const updateDistance = async () => {
      try {
        // Usar getCurrentPosition con un cache de 5 segundos para que sea rápido y eficiente,
        // evitando el costoso filtro de Kalman para actualizaciones periódicas en la UI
        const pos = await getCurrentPosition({ maximumAge: 5000 });
        if (!active) return;
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        if (commLat && commLng) {
          const check = isWithinRange(pos.lat, pos.lng, commLat, commLng, 500);
          setDistanceInfo(check);
        }
      } catch (err) {
        // Ignorar errores de GPS silenciosos
      }
    };

    updateDistance();
    intervalId = setInterval(updateDistance, 10_000); // 10 segundos

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
        
        let travelMinutes = 15; // default fallback
        
        // Intenta calcular la distancia si tenemos las ubicaciones
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
                // 666 m/min = 40 km/h
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
        estIn = new Date(workdayStart.getTime() + 10 * 60 * 1000); // 10 min de viaje inicial
      } else {
        estIn = new Date();
      }

      // Evitar que la hora estimada de entrada sea en el futuro
      if (estIn.getTime() > Date.now()) {
        estIn = new Date();
      }

      // Estimar salida: entrada + 30 min
      estOut = new Date(estIn.getTime() + 30 * 60 * 1000);
      if (estOut.getTime() > Date.now()) {
        estOut = new Date();
      }

      setEstimatedIn(estIn);
      setEstimatedOut(estOut);

      // Inicializar campos del formulario manual con formato "HH:mm"
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

  async function loadStaticData() {
    try {
      // Load all required static data in parallel
      const [ops, checkIn, workday, docSnap] = await Promise.all([
        getOperarios(),
        getActiveCheckIn(userProfile.uid),
        getActiveWorkday(userProfile.uid),
        getDoc(doc(db, 'scheduledServices', serviceId))
      ]);

      const map = {};
      ops.forEach(op => map[op.uid] = op.name);
      setOperariosMap(map);

      if (checkIn) {
        if (checkIn.scheduledServiceId === serviceId) {
          setActiveCheckIn(checkIn);
          setOtherActiveCheckIn(null);
        } else {
          setActiveCheckIn(null);
          setOtherActiveCheckIn(checkIn);
        }
      } else {
        setActiveCheckIn(null);
        setOtherActiveCheckIn(null);
      }

      setActiveWorkday(workday);

      if (docSnap.exists()) {
        const svcData = { id: docSnap.id, ...docSnap.data() };
        await calculateEstimates(userProfile.uid, svcData, workday);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransferConfirm(toUserId) {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      await transferService({
        serviceId,
        fromUserId: userProfile.uid,
        toUserId,
        requesterRole: 'operario'
      });
      alert('Traspaso solicitado correctamente.');
      setTransferModalOpen(false);
      navigate('/operario');
    } catch (err) {
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRescheduleConfirm(newDate) {
    setActionLoading(true);
    try {
      await rescheduleService({
        serviceId,
        newDate,
        requesterRole: 'operario',
        userId: userProfile.uid
      });
      alert('Cambio de fecha solicitado. El administrador deberá validarlo.');
      setRescheduleModalOpen(false);
      fetchServiceDetails();
    } catch (err) {
      alert('Error en el cambio de fecha: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }



  async function handleRemoveCompanion(companionId) {
    if (!window.confirm('¿Seguro que este compañero ya no está en el servicio?')) return;
    setActionLoading(true);
    try {
      await removeCompanionFromService(serviceId, companionId);
    } catch (err) {
      alert('Error quitando acompañante: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckIn(manualTime = null) {
    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFilteredPosition();
      } catch (geoErr) {
        console.warn('[ServiceDetail] Error al obtener posición filtrada, usando fallback:', geoErr);
        try {
          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        } catch (rawErr) {
          console.warn('[ServiceDetail] Error al obtener posición rápida, usando fallback de la comunidad:', rawErr);
          const commLat = community?.location?._lat || community?.location?.latitude || 0;
          const commLng = community?.location?._long || community?.location?.longitude || 0;
          pos = { lat: commLat, lng: commLng };
        }
      }
      
      // Validate distance (solo si no es manual o para informar)
      if (community?.location) {
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        const check = isWithinRange(pos.lat, pos.lng, commLat, commLng, 500);
        setDistanceInfo(check);
      }

      // Prevent double check-in if already active
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

      // Set active check-in immediately for better responsiveness
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

      // AUTO-ASSIGN GLOBAL COMPANION
      if (activeWorkday?.currentCompanionId) {
        for (const s of currentGroup) {
          if (!s.companionIds?.includes(activeWorkday.currentCompanionId)) {
            await addCompanionToService(s.id, activeWorkday.currentCompanionId);
          }
        }
      }

      // Fichar automáticamente a los acompañantes en segundo plano
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

      // Limpiar sugerencia utilizada
      localStorage.removeItem(`detected_entry_${serviceId}`);
      setSuggestedIn(null);

      let allTasks = tasks;
      if (allTasks.length === 0) {
        allTasks = await getCommunityTasks(service.communityId);
        setTasks(allTasks);
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

      // Find category/color for the current service to filter relevant tasks
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

        // If it's "Otras", filter community tasks that are also "Otras" (red, not garage)
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
        if (groupedTaskIds.has(task.id)) return true; // Explicitly in today's group (handles rescheduling/manual dates)
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

    // Verificar si hay tareas pendientes que no sean excepciones
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
        return; // Detener la salida
      }
    }

    setActionLoading(true);
    try {
      let pos = null;
      try {
        pos = await getFilteredPosition();
      } catch (geoErr) {
        console.warn('[ServiceDetail] Error al obtener posición filtrada, usando fallback:', geoErr);
        try {
          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        } catch (rawErr) {
          console.warn('[ServiceDetail] Error al obtener posición rápida, usando fallback de check-in:', rawErr);
        }
      }
      
      const lat = pos?.lat || activeCheckIn?.checkInLocation?.latitude || activeCheckIn?.checkInLocation?._lat || 0;
      const lng = pos?.lng || activeCheckIn?.checkInLocation?.longitude || activeCheckIn?.checkInLocation?._long || 0;
      
      // Si no se proporcionó hora manual, verificar si el usuario está lejos
      // y hay una hora de salida detectada que debería ofrecerse
      if (!manualTime && community?.location) {
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        const check = isWithinRange(lat, lng, commLat, commLng, 500);
        setDistanceInfo(check);
        
        if (!check.withinRange) {
          // Buscar hora de salida detectada (confirmed o pending)
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

      // Finalizar automáticamente los check-ins de los acompañantes
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
        console.warn('[Companion] Error al finalizar check-outs de los acompañantes:', compErr);
      }

      // Update status
      const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
      for (const s of currentGroup) {
        if (s.communityTaskId) {
          const exec = taskExecutions.find(e => e.communityTaskId === s.communityTaskId);
          
          // Excepciones que se consideran completadas al finalizar el servicio
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

      // Limpiar sugerencia utilizada (confirmed + pending)
      localStorage.removeItem(`detected_exit_${serviceId}`);
      localStorage.removeItem(`detected_exit_pending_${serviceId}`);
      setSuggestedOut(null);

      alert(`Servicio finalizado. Duración: ${result.duration} minutos`);
      setActiveCheckIn(null);
      setClientSignature(null);
      loadStaticData();
    } catch (err) {
      alert('Error: ' + err);
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleTaskStatus(exec) {
    const newStatus = exec.status === 'completed' ? 'pending' : 'completed';
    await updateTaskExecution(exec.id, { status: newStatus });
  }

  async function handleGeneralPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es demasiado grande (máximo 10MB)');
      return;
    }

    setUploadingGeneralPhoto(true);
    try {
      const url = await uploadPhoto(file, userProfile.uid, serviceId);
      setGeneralPhotos(prev => [...prev, url]);
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    } finally {
      setUploadingGeneralPhoto(false);
      if (e.target) e.target.value = '';
    }
  }

  async function handleSubmitGeneralEvidence() {
    setSubmittingGeneralEvidence(true);
    try {
      await updateScheduledServiceNotesAndPhotos(serviceId, generalNotes, generalPhotos);
      setSubmittedGeneralEvidence(true);
      setTimeout(() => setSubmittedGeneralEvidence(false), 3000);
    } catch (error) {
      alert('Error guardando evidencia: ' + error.message);
    } finally {
      setSubmittingGeneralEvidence(false);
    }
  }

  async function handleSaveNotes(execId) {
    await updateTaskExecution(execId, { notes });
  }

  if (loading) {
    return <div className="flex justify-center p-6"><div className="spinner"></div></div>;
  }

  if (!service) {
    return <div className="empty-state"><p>Servicio no encontrado</p></div>;
  }

  const isCheckedIn = !!activeCheckIn;
  const isCompleted = service.status === 'completed';
  const isInProgress = service.status === 'in_progress';
  const isTitular = service.assignedUserId === userProfile.uid;
  const isCompanion = !isTitular;
  // Can edit if titular checked in OR is active companion and service is in progress
  const canEdit = !isCompleted && (isCheckedIn || isInProgress);
  const showTasks = isInProgress || isCompleted;

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button className="btn btn-ghost mb-4" onClick={() => navigate('/operario')} style={{ marginLeft: '-8px' }}>
        ← Volver
      </button>

      {/* Community info */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 800 }}>{community?.name}</h2>
            <p className="text-sm text-muted">{community?.address}</p>
            {isCompanion && (
              <span className="badge badge-info mt-2" style={{ display: 'inline-block' }}>🤝 Modo Acompañante</span>
            )}
            {community?.preferredTime && (
              <span className="badge mt-2" style={{ display: 'inline-block', background: '#fee2e2', color: '#dc2626', border: '1px solid currentColor', marginLeft: isCompanion ? '6px' : '0px' }}>
                🕐 Hora preferida: {community.preferredTime}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`badge ${
              service.status === 'completed' ? 'badge-success' :
              service.status === 'in_progress' ? 'badge-info' :
              'badge-warning'
            }`}>
              {service.status === 'completed' ? '✅ Completado' :
              service.status === 'in_progress' ? '🔄 En curso' : '⏳ Pendiente'}
            </span>
            {!isCompleted && !isCheckedIn && isTitular && (
              <div className="flex gap-2">
                <button 
                  className="btn btn-ghost btn-xs" 
                  onClick={() => setTransferModalOpen(true)}
                  style={{ color: 'var(--color-warning)', padding: '4px 8px', border: '1px solid currentColor' }}
                >
                  🔄 Traspasar
                </button>
                <button 
                  className="btn btn-ghost btn-xs" 
                  onClick={() => setRescheduleModalOpen(true)}
                  style={{ color: 'var(--color-primary)', padding: '4px 8px', border: '1px solid currentColor' }}
                >
                  📅 Mover día
                </button>
              </div>
            )}
          </div>
        </div>
        {distanceInfo && (
          <div className={`mt-2 text-xs`} style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: distanceInfo.withinRange ? 'var(--color-success-light)' : 'var(--color-warning-light)',
          }}>
            📍 Distancia: {distanceInfo.distance}m {distanceInfo.withinRange ? '✅' : '⚠️ Fuera de rango'}
          </div>
        )}
        {/* Botón para enviar ubicación GPS al administrador */}
        {!isCompleted && community && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            {gpsSent ? (
              <div className="text-xs" style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-success-light)', textAlign: 'center' }}>
                ✅ Ubicación GPS enviada al administrador
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm w-full"
                disabled={sendingGPS}
                onClick={async () => {
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
                }}
                style={{ fontSize: '0.8rem' }}
              >
                {sendingGPS ? '⏳ Capturando GPS...' : '📲 Enviar mi ubicación GPS al admin'}
              </button>
            )}
            <p className="text-xs text-muted mt-1" style={{ textAlign: 'center' }}>
              Envía tu posición exacta para mejorar la precisión de esta comunidad
            </p>
          </div>
        )}
      </div>

      {/* Guías e instrucciones */}
      {communityDocs.length > 0 && (
        <div className="card mb-4 animate-fadeIn">
          <h3 className="card-title text-sm mb-3" style={{ fontSize: 'var(--font-sm)', fontWeight: 'bold' }}>📄 Biblioteca Digital (Instrucciones)</h3>
          <div className="flex flex-col gap-2">
            {communityDocs.map(doc => (
              <div 
                key={doc.id} 
                className="flex items-center justify-between p-2" 
                style={{ background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
              >
                <span className="text-xs font-semibold truncate" style={{ flex: 1, marginRight: '8px' }}>
                  📄 {doc.title}
                </span>
                <a 
                  href={doc.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-secondary btn-xs font-bold"
                  style={{ textDecoration: 'none', padding: '4px 8px', whiteSpace: 'nowrap' }}
                >
                  Abrir PDF
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <TransferModal 
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={`Traspasar servicio ${community?.name}`}
      />

      <RescheduleModal 
        isOpen={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        onConfirm={handleRescheduleConfirm}
        currentDate={service?.scheduledDate}
        loading={actionLoading}
      />



      {/* Check-in/out button */}
      {otherActiveCheckIn && !isCompleted && isTitular && (
        <div className="card mb-4" style={{ border: '2px solid var(--color-warning)', background: 'var(--color-warning-light)' }}>
          <p className="text-sm font-bold text-warning-dark mb-2">
            ⚠️ Tienes otro servicio en curso
          </p>
          <p className="text-xs mb-3">
            Debes finalizar el servicio activo antes de iniciar uno nuevo.
          </p>
          <button 
            className="btn btn-warning btn-sm w-full"
            onClick={() => navigate(`/operario/servicio/${otherActiveCheckIn.scheduledServiceId}`)}
          >
            Ir al servicio activo
          </button>
        </div>
      )}

      {((!isCompleted && isTitular) || isCheckedIn) && !otherActiveCheckIn && (
        <div className="mb-4 flex flex-col gap-3">
          
          {/* ================= SUGERENCIAS DE FICHAJE ================= */}
          {!isCheckedIn && (suggestedIn || estimatedIn || activeWorkday?.startTime) && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold text-slate-700 mb-2">💡 Sugerencias de Llegada:</h4>
              <div className="flex flex-col gap-2">
                {suggestedIn && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: entrySource === 'estimated' ? '#fdf4ff' : 'var(--color-accent-light)', borderColor: entrySource === 'estimated' ? '#f0abfc' : 'var(--color-accent)', color: '#0f172a', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      handleCheckIn(suggestedIn);
                    }}
                    disabled={actionLoading}
                  >
                    <span>
                      {entrySource === 'estimated' ? '⏱️ Llegada estimada (background): ' : '📍 GPS detectado: '} 
                      <strong>{format(suggestedIn, 'HH:mm')}</strong>
                    </span>
                    <span>Usar →</span>
                  </button>
                )}
                {estimatedIn && (!suggestedIn || Math.abs(estimatedIn.getTime() - suggestedIn.getTime()) > 60000) && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      handleCheckIn(estimatedIn);
                    }}
                    disabled={actionLoading}
                  >
                    <span>🚗 Llegada estimada (viaje): <strong>{format(estimatedIn, 'HH:mm')}</strong></span>
                    <span>Usar →</span>
                  </button>
                )}
                {activeWorkday?.startTime && !suggestedIn && !estimatedIn && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: '#faf5ff', borderColor: '#e9d5ff', color: '#7c3aed', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      const wdStart = activeWorkday.startTime.toDate ? activeWorkday.startTime.toDate() : new Date(activeWorkday.startTime);
                      handleCheckIn(wdStart);
                    }}
                    disabled={actionLoading}
                  >
                    <span>👷 Inicio de jornada: <strong>{format(activeWorkday.startTime.toDate ? activeWorkday.startTime.toDate() : new Date(activeWorkday.startTime), 'HH:mm')}</strong></span>
                    <span>Usar →</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {isCheckedIn && suggestedOut && (
            <div className="exit-suggestion-card animate-fadeIn">
              <div className="exit-suggestion-icon">🏃</div>
              <div className="exit-suggestion-content">
                <p className="exit-suggestion-title">Salida confirmada</p>
                <p className="exit-suggestion-subtitle">
                  Se detectó tu salida a las <strong>{format(suggestedOut, 'HH:mm')}</strong> y no volviste en 5 minutos
                </p>
              </div>
              <button 
                className="btn-pulse-glow" 
                onClick={() => handleCheckOut(suggestedOut)}
                disabled={actionLoading}
              >
                ⏱️ Finalizar a las {format(suggestedOut, 'HH:mm')}
              </button>
            </div>
          )}

          {/* ================= FORMULARIO ENTRADA MANUAL ================= */}
          {showManualEntryForm && !isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-3">⏱️ Iniciar con Hora Manual</h4>
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-semibold text-slate-600">Hora de llegada:</span>
                <input 
                  type="time" 
                  value={manualEntryTime} 
                  onChange={(e) => setManualEntryTime(e.target.value)}
                  className="form-input"
                  style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary btn-sm flex-1 font-bold"
                  onClick={() => {
                    if (!manualEntryTime) return;
                    const [h, m] = manualEntryTime.split(':').map(Number);
                    const entryDate = new Date();
                    entryDate.setHours(h, m, 0, 0);
                    handleCheckIn(entryDate);
                    setShowManualEntryForm(false);
                  }}
                  disabled={actionLoading}
                >
                  Confirmar Entrada
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowManualEntryForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= FORMULARIO COMPLETO RETROACTIVO ================= */}
          {showFullManualForm && !isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-1">📝 Registrar Servicio Completo</h4>
              <p className="text-[10px] text-muted mb-4">Registra entrada y salida de forma retroactiva si no pudiste hacerlo al momento.</p>
              
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-600">Hora de llegada:</span>
                  <input 
                    type="time" 
                    value={manualEntryTime} 
                    onChange={(e) => setManualEntryTime(e.target.value)}
                    className="form-input"
                    style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-600">Hora de salida:</span>
                  <input 
                    type="time" 
                    value={manualExitTime} 
                    onChange={(e) => setManualExitTime(e.target.value)}
                    className="form-input"
                    style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  className="btn btn-success btn-sm flex-1 font-bold"
                  onClick={async () => {
                    if (!manualEntryTime || !manualExitTime) return;
                    setActionLoading(true);
                    try {
                      const [inH, inM] = manualEntryTime.split(':').map(Number);
                      const [outH, outM] = manualExitTime.split(':').map(Number);
                      
                      const entryDate = new Date();
                      entryDate.setHours(inH, inM, 0, 0);
                      
                      const exitDate = new Date();
                      exitDate.setHours(outH, outM, 0, 0);

                      if (exitDate.getTime() <= entryDate.getTime()) {
                        alert('La hora de salida debe ser posterior a la de entrada.');
                        setActionLoading(false);
                        return;
                      }

                      let pos = null;
                      try {
                        pos = await getFilteredPosition();
                      } catch (geoErr) {
                        console.warn('[ServiceDetail] Error al obtener posición filtrada para registro manual, usando fallback:', geoErr);
                        try {
                          pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
                        } catch (rawErr) {
                          console.warn('[ServiceDetail] Error al obtener posición rápida para registro manual, usando fallback de la comunidad:', rawErr);
                          const commLat = community?.location?._lat || community?.location?.latitude || 0;
                          const commLng = community?.location?._long || community?.location?.longitude || 0;
                          pos = { lat: commLat, lng: commLng };
                        }
                      }

                       // 1. Crear el check-in con hora manual de entrada
                      const checkInId = await createCheckIn({
                        userId: userProfile.uid,
                        communityId: service.communityId,
                        scheduledServiceId: serviceId,
                        lat: pos.lat,
                        lng: pos.lng,
                        manualTime: entryDate
                      });

                      // 2. Completar el check-out con hora manual de salida
                      await completeCheckOut(checkInId, pos.lat, pos.lng, exitDate, clientSignature);

                      // Fichar automáticamente a los acompañantes en segundo plano
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

                      // 3. Actualizar estado según tareas completadas
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

                      // 4. Limpiar sugerencias locales
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
                  }}
                  disabled={actionLoading}
                >
                  Guardar Registro
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowFullManualForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= FORMULARIO SALIDA MANUAL ================= */}
          {showManualExitForm && isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-3">🛑 Finalizar con Hora Manual</h4>
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-semibold text-slate-600">Hora de salida:</span>
                <input 
                  type="time" 
                  value={manualExitTime} 
                  onChange={(e) => setManualExitTime(e.target.value)}
                  className="form-input"
                  style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary btn-sm flex-1 font-bold"
                  onClick={() => {
                    if (!manualExitTime) return;
                    const [h, m] = manualExitTime.split(':').map(Number);
                    const exitDate = new Date();
                    exitDate.setHours(h, m, 0, 0);
                    
                    const checkInTime = activeCheckIn.checkInTime?.toDate 
                      ? activeCheckIn.checkInTime.toDate() 
                      : new Date(activeCheckIn.checkInTime);
                    
                    if (exitDate.getTime() <= checkInTime.getTime()) {
                      alert('La hora de salida debe ser posterior a la de entrada.');
                      return;
                    }

                    handleCheckOut(exitDate);
                    setShowManualExitForm(false);
                  }}
                  disabled={actionLoading}
                >
                  Confirmar Salida
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowManualExitForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= BOTONES DE ACCIÓN PRINCIPALES ================= */}
          {!isCheckedIn ? (
            <div className="flex flex-col gap-2 w-full">
              {!showManualEntryForm && !showFullManualForm && (
                <>
                  <button
                    className="checkin-btn start"
                    onClick={() => handleCheckIn()}
                    disabled={actionLoading || geoLoading}
                  >
                    {actionLoading ? '📍 Obteniendo ubicación...' : '📍 Iniciar servicio'}
                  </button>
                  
                  <div className="flex gap-2 mt-1">
                    <button
                      className="btn btn-secondary btn-sm flex-1 font-bold"
                      onClick={() => setShowManualEntryForm(true)}
                    >
                      ⏱️ Entrada Manual
                    </button>
                    <button
                      className="btn btn-secondary btn-sm flex-1 font-bold"
                      onClick={() => setShowFullManualForm(true)}
                    >
                      📝 Todo Retroactivo
                    </button>
                  </div>
                </>
              )}
              
              {isInProgress && !showManualEntryForm && !showFullManualForm && (
                <button
                  className="btn btn-warning w-full flex items-center justify-center gap-2 mt-2"
                  onClick={async () => {
                    // Verificar si hay tareas pendientes que no sean excepciones
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
                        return; // Detener la salida
                      }
                    }

                    if (window.confirm('No tienes un fichaje activo. ¿Deseas marcar este servicio como terminado directamente?')) {
                      setActionLoading(true);
                      try {
                        const currentGroup = groupedServices.length > 0 ? groupedServices : [service];
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
                  }}
                  disabled={actionLoading}
                >
                  ⚠️ Forzar Finalización
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 w-full animate-fadeIn">
              {/* Card de firma del cliente */}
              <div className="card" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-3) var(--space-4)', margin: 0 }}>
                <h4 style={{ fontSize: 'var(--font-sm)', fontWeight: 'bold', margin: '0 0 var(--space-2) 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ✍️ Firma del Cliente (Opcional)
                </h4>
                {clientSignature ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-success-light)' }}>
                    <div style={{ flex: 1 }}>
                      <span className="text-xs font-bold text-success" style={{ display: 'block' }}>✅ Firma de conformidad registrada</span>
                      <span className="text-[10px] text-muted" style={{ display: 'block' }}>Nombre: {clientSignature.signerName}</span>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-ghost btn-xs" 
                      onClick={() => setClientSignature(null)}
                      style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: '2px 6px', fontSize: '10px' }}
                    >
                      Borrar
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm w-full" 
                    onClick={() => setShowSignatureModal(true)}
                    disabled={actionLoading}
                    style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                  >
                    ✍️ Capturar firma de conformidad
                  </button>
                )}
              </div>

              {!showManualExitForm && (
                <>
                  <button
                    className="checkin-btn stop"
                    onClick={() => handleCheckOut()}
                    disabled={actionLoading || geoLoading}
                  >
                    {actionLoading ? '📍 Finalizando...' : '🛑 Finalizar servicio'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm w-full font-bold mt-1"
                    onClick={() => setShowManualExitForm(true)}
                  >
                    ⏱️ Salida Manual
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task checklist */}
      <div className="card">
        <h3 className="card-title mb-4">📋 Tareas</h3>
        {!showTasks && tasks.length > 0 ? (
          <p className="text-muted text-sm">Ficha entrada para ver las tareas</p>
        ) : taskExecutions.length === 0 ? (
          <p className="text-muted text-sm">No hay tareas configuradas</p>
        ) : (
          <div className="flex flex-col gap-3">
            {taskExecutions.map(exec => {
              const task = tasks.find(t => t.id === exec.communityTaskId);
              const isDone = exec.status === 'completed';
              const isUrgent = task?.isUrgent || service?.isUrgent;
              
              const sName = (task?.taskName || '').toLowerCase();
              const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');

              return (
                <button
                  key={exec.id}
                  className={`btn w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-sm transition-all ${
                    isDone 
                      ? 'bg-success text-white border-success' 
                      : 'bg-white text-dark border border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => canEdit && toggleTaskStatus(exec)}
                  style={{ minHeight: '80px' }}
                >
                  <span className="font-bold text-lg mb-1" style={{ wordBreak: 'break-word', textAlign: 'center' }}>
                    {isUrgent && !isDone ? '🚨 ' : ''}{task?.taskName || 'Tarea'}
                  </span>
                  {isDone ? (
                    <span className="text-sm font-semibold opacity-90">✅ COMPLETADO</span>
                  ) : isException ? (
                    <span className="text-xs text-muted font-medium">Automático al finalizar</span>
                  ) : (
                    <span className="text-xs text-primary font-bold uppercase tracking-wide">Pulsar para completar</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* General Evidences Card */}
      {showTasks && canEdit && (
        <div className="card mt-4">
          <h3 className="card-title mb-4">📸 Evidencias y Notas Generales</h3>
          <p className="text-xs text-muted mb-3">
            Las fotos y notas que añadas aquí se registrarán a nombre de esta comunidad para este servicio.
          </p>
          
          <textarea
            className="form-textarea mb-3"
            placeholder="Añadir notas sobre la comunidad..."
            style={{ minHeight: '80px', fontSize: 'var(--font-sm)' }}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
          />

          <div className="photo-upload mb-4">
            {generalPhotos.map((url, i) => (
              <img key={i} src={url} alt={`Evidencia ${i+1}`} className="photo-thumb" />
            ))}
            <label className="photo-upload-btn">
              📷
              <span>Foto</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleGeneralPhotoUpload}
                disabled={uploadingGeneralPhoto}
              />
            </label>
          </div>

          {(generalPhotos.length > 0 || generalNotes.trim().length > 0) && (
            <div>
              {submittedGeneralEvidence ? (
                <div style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-success-light, #dcfce7)',
                  color: 'var(--color-success, #16a34a)',
                  fontSize: 'var(--font-sm)',
                  fontWeight: 700,
                  textAlign: 'center',
                }}>
                  ✅ Evidencia guardada correctamente
                </div>
              ) : (
                <button
                  className="btn btn-primary w-full p-3 text-sm font-bold"
                  onClick={handleSubmitGeneralEvidence}
                  disabled={submittingGeneralEvidence}
                >
                  {submittingGeneralEvidence ? '⏳ Guardando...' : '📤 Enviar Evidencias'}
                </button>
              )}
            </div>
          )}
          {uploadingGeneralPhoto && <p className="text-xs text-muted mt-2">Subiendo foto...</p>}
        </div>
      )}

      {isTitular && (
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title m-0">🤝 Acompañantes</h3>
          </div>
          
          {activeWorkday?.currentCompanionId && (
            <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
              <span className="text-blue-600 text-sm">🤝</span>
              <span className="text-[10px] text-blue-700 font-medium">
                Acompañante global configurado: <strong>{operariosMap[activeWorkday.currentCompanionId] || '...'}</strong>
              </span>
            </div>
          )}
          
          {(!service.companionLogs || service.companionLogs.length === 0) ? (

            <p className="text-muted text-sm">No hay acompañantes en este servicio.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {service.companionLogs.map((log, i) => {
                const isActive = !log.leftAt;
                const name = operariosMap[log.userId] || 'Compañero';
                return (
                  <div key={i} className="flex justify-between items-center p-3" style={{ background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div className="font-bold text-sm">
                        {name} {isActive && <span className="text-success text-xs">● Activo</span>}
                      </div>
                      <div className="text-xs text-muted">
                        Entrada: {format(new Date(log.joinedAt), 'HH:mm')}
                        {log.leftAt && ` - Salida: ${format(new Date(log.leftAt), 'HH:mm')}`}
                      </div>
                    </div>
                    {isActive && !isCompleted && log.userId !== activeWorkday?.currentCompanionId && (
                      <button 
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => handleRemoveCompanion(log.userId)}
                        style={{ border: '1px solid var(--color-danger)' }}
                      >
                        Quitar
                      </button>
                    )}
                    {isActive && log.userId === activeWorkday?.currentCompanionId && (
                      <span className="text-[10px] font-bold text-blue-500 uppercase">Fijo</span>
                    )}
                  </div>

                );
              })}
            </div>
          )}
        </div>
      )}

      {showSignatureModal && (
        <SignatureCanvas 
          onSave={async ({ base64Image, signerName }) => {
            setShowSignatureModal(false);
            setActionLoading(true);
            try {
              // Convert base64 to file
              const byteString = atob(base64Image.split(',')[1]);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: 'image/png' });
              const file = new File([blob], `signature_${serviceId}_${Date.now()}.png`, { type: 'image/png' });
              
              const imageUrl = await uploadPhoto(file, userProfile.uid, serviceId);
              setClientSignature({
                imageUrl,
                signerName,
                signedAt: new Date()
              });
              alert('Firma guardada correctamente.');
            } catch (err) {
              console.error(err);
              alert('Error al guardar firma: ' + err.message);
            } finally {
              setActionLoading(false);
            }
          }}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}
