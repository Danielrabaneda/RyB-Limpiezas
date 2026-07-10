import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCommunity } from '../services/communityService';
import { getCommunityTasks } from '../services/taskService';
import { getScheduledServicesForDate, removeCompanionFromService } from '../services/scheduleService';
import { getActiveCheckIn, updateTaskExecution } from '../services/checkInService';
import { getOperarios } from '../services/authService';
import { getCommunityGuides } from '../services/documentVaultService';
import { getActiveWorkday } from '../services/workdayService';

export function useServiceData(serviceId, userProfile) {
  const [service, setService] = useState(null);
  const [community, setCommunity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskExecutions, setTaskExecutions] = useState([]);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [otherActiveCheckIn, setOtherActiveCheckIn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [operariosMap, setOperariosMap] = useState({});
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [communityDocs, setCommunityDocs] = useState([]);
  const [groupedServices, setGroupedServices] = useState([]);

  async function loadStaticData() {
    if (!serviceId || !userProfile?.uid) return;
    try {
      const [ops, checkIn, workday] = await Promise.all([
        getOperarios(),
        getActiveCheckIn(userProfile.uid),
        getActiveWorkday(userProfile.uid),
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
    } catch (err) {
      console.error('[useServiceData] Error in loadStaticData:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serviceId || !userProfile?.uid) return;

    // Reset state when service changes
    setActiveCheckIn(null);
    setService(null);
    setCommunity(null);
    setTasks([]);
    setTaskExecutions([]);
    setCommunityDocs([]);
    setGroupedServices([]);
    setLoading(true);

    let commLoaded = null;

    // 1. Listen to service document
    const unsubService = onSnapshot(doc(db, 'scheduledServices', serviceId), async (snap) => {
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const svcData = { id: snap.id, ...snap.data() };
      setService(svcData);

      // Load static info if not already loaded
      if (!commLoaded) {
        try {
          const comm = await getCommunity(svcData.communityId);
          commLoaded = comm;
          setCommunity(comm);
          
          const commTasks = await getCommunityTasks(svcData.communityId);
          setTasks(commTasks);

          const docs = await getCommunityGuides(svcData.communityId);
          setCommunityDocs(docs || []);

          // Load grouped services on the same day for this community
          const svcDate = svcData.scheduledDate?.toDate ? svcData.scheduledDate.toDate() : new Date(svcData.scheduledDate);
          const allSvcsToday = await getScheduledServicesForDate(userProfile.uid, svcDate);
          
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
            filtered = [svcData];
          }

          if (!filtered.some(s => s.id === svcData.id)) {
            filtered.push(svcData);
          }
          setGroupedServices(filtered);
        } catch (err) {
          console.warn('[useServiceData] Error loading community/tasks/docs/grouped:', err);
          setGroupedServices([svcData]);
        }
      }
    }, (err) => {
      console.error('[useServiceData] Firestore service snapshot error:', err);
    });

    // 2. Listen to task executions
    const qExecs = query(
      collection(db, 'taskExecutions'),
      where('scheduledServiceId', '==', serviceId)
    );
    const unsubExecs = onSnapshot(qExecs, (snap) => {
      setTaskExecutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('[useServiceData] Firestore taskExecutions snapshot error:', err);
    });

    // 3. One-time fetches
    loadStaticData();

    return () => {
      unsubService();
      unsubExecs();
    };
  }, [serviceId, userProfile?.uid]);

  async function toggleTaskStatus(exec) {
    const newStatus = exec.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTaskExecution(exec.id, { status: newStatus });
    } catch (err) {
      console.error('[useServiceData] Error in toggleTaskStatus:', err);
      alert('Error al actualizar tarea: ' + err.message);
    }
  }

  async function handleRemoveCompanion(companionId) {
    if (!window.confirm('¿Seguro que este compañero ya no está en el servicio?')) return;
    try {
      await removeCompanionFromService(serviceId, companionId);
    } catch (err) {
      console.error('[useServiceData] Error in handleRemoveCompanion:', err);
      alert('Error quitando acompañante: ' + err.message);
    }
  }

  return {
    service,
    community,
    tasks,
    taskExecutions,
    activeCheckIn,
    setActiveCheckIn,
    otherActiveCheckIn,
    loading,
    operariosMap,
    activeWorkday,
    communityDocs,
    groupedServices,
    loadStaticData,
    toggleTaskStatus,
    handleRemoveCompanion,
  };
}
