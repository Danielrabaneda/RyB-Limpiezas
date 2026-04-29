import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  startOfDay, endOfDay, addDays, format, getDay, getDate, getMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth,
  isSameDay, isSameWeek, getWeekOfMonth, isWithinInterval, lastDayOfMonth
} from 'date-fns';

// ==================== SCHEDULED SERVICES ====================
export async function createScheduledService(data) {
  let scheduledDate = data.scheduledDate;
  if (!(scheduledDate instanceof Timestamp)) {
    scheduledDate = Timestamp.fromDate(new Date(scheduledDate));
  }

  const ref = await addDoc(collection(db, 'scheduledServices'), {
    communityId: data.communityId,
    communityTaskId: data.communityTaskId,
    taskName: data.taskName || '', 
    assignedUserId: data.assignedUserId,
    scheduledDate,
    flexibleWeek: data.flexibleWeek || false,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function deleteFutureServicesForTask(taskId) {
  try {
    const now = Timestamp.fromDate(startOfDay(new Date()));
    const q = query(
      collection(db, 'scheduledServices'),
      where('communityTaskId', '==', taskId),
      where('scheduledDate', '>=', now),
      where('status', '==', 'pending')
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      batch.delete(d.ref);
    });
    
    await batch.commit();
    console.log(`[Schedule] Eliminados ${snap.size} servicios futuros pendientes para la tarea ${taskId}`);
    return snap.size;
  } catch (error) {
    console.error('[Schedule] Error eliminando servicios futuros:', error);
    throw error;
  }
}

/**
 * Deletes ALL scheduledServices linked to a task, regardless of status or date.
 * Use this when permanently removing a task and its full calendar history.
 */
export async function deleteAllServicesForTask(taskId) {
  try {
    const q = query(
      collection(db, 'scheduledServices'),
      where('communityTaskId', '==', taskId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    // Process in batches of 490 to stay under Firestore's 500-op limit
    let batch = writeBatch(db);
    let count = 0;
    let total = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      total++;
      if (count >= 490) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
    console.log(`[Schedule] Eliminados ${total} servicios (todos) para la tarea ${taskId}`);
    return total;
  } catch (error) {
    console.error('[Schedule] Error eliminando todos los servicios de la tarea:', error);
    throw error;
  }
}


export async function getScheduledServicesForDate(userId, date = new Date()) {
  try {
    const startOfTarget = startOfDay(date);
    
    console.log(`[Schedule] Fetching services for ${userId} on ${format(startOfTarget, 'yyyy-MM-dd')}`);

    // 1. Fetch my own services
    const qOwn = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userId)
    );
    
    // 2. Fetch services where I am explicitly listed as companion
    const qExplicitCompanion = query(
      collection(db, 'scheduledServices'),
      where('companionIds', 'array-contains', userId)
    );

    // 3. Fetch services from workdays where I am/was a companion today
    const qAllWorkdaysAsCompanion = query(
      collection(db, 'workdays'),
      where('currentCompanionId', '==', userId)
    );

    let results1 = [];
    let results2 = [];
    let results3 = [];

    try {
      const [snapOwn, snapExplicit, snapWorkdays] = await Promise.all([
        getDocs(qOwn),
        getDocs(qExplicitCompanion),
        getDocs(qAllWorkdaysAsCompanion)
      ]);

      results1 = snapOwn.docs.map(d => ({ id: d.id, ...d.data() }));
      results2 = snapExplicit.docs.map(d => ({ id: d.id, ...d.data(), isCompanion: true }));

      // Filter workdays to only those of "today"
      const relevantTitularIds = [...new Set(snapWorkdays.docs
        .filter(d => {
          const wdDate = d.data().date?.toDate ? d.data().date.toDate() : new Date(d.data().date);
          return isSameDay(wdDate, date);
        })
        .map(d => d.data().userId)
      )];

      if (relevantTitularIds.length > 0) {
        for (const titularId of relevantTitularIds) {
          const qTitular = query(
            collection(db, 'scheduledServices'),
            where('assignedUserId', '==', titularId)
          );
          const snapTitular = await getDocs(qTitular);
          results3.push(...snapTitular.docs.map(d => ({ id: d.id, ...d.data(), isCompanion: true })));
        }
      }
    } catch (err) {
      console.warn("[Schedule] Primary retrieval failed, attempting fallback:", err.message);
      const snapFallback = await getDocs(query(collection(db, 'scheduledServices'), where('assignedUserId', '==', userId)));
      results1 = snapFallback.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const uniqueMap = new Map();
    const allFetched = [...results1, ...results2, ...results3];

    for (const svc of allFetched) {
      const existing = uniqueMap.get(svc.id);
      if (!existing) {
        uniqueMap.set(svc.id, svc);
      } else {
        const statusPriority = { 'completed': 3, 'in_progress': 2, 'started': 2, 'pending': 1, 'cancelled': 0 };
        const currentPrio = statusPriority[svc.status] || 0;
        const existingPrio = statusPriority[existing.status] || 0;
        
        if (currentPrio > existingPrio) {
          uniqueMap.set(svc.id, svc);
        } else if (currentPrio === existingPrio && !existing.isCompanion && svc.isCompanion) {
          uniqueMap.set(svc.id, { ...existing, isCompanion: true });
        }
      }
    }

    const targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(date);

    const filtered = Array.from(uniqueMap.values()).filter(svc => {
      const svcDateRaw = svc.scheduledDate instanceof Timestamp ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
      
      // Strict day check with timezone robustness
      const svcDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(svcDateRaw);
      const isToday = svcDateStr === targetDateStr;
      
      // Flexible week logic
      const isFlexiblePending = svc.flexibleWeek && 
        svc.status === 'pending' && 
        isSameWeek(svcDateRaw, date, { weekStartsOn: 1 });
      
      // Edge case: services completed/started today even if scheduled for another day
      let wasModifiedToday = false;
      if (svc.updatedAt) {
        const updatedDate = svc.updatedAt.toDate ? svc.updatedAt.toDate() : new Date(svc.updatedAt);
        wasModifiedToday = isSameDay(updatedDate, date);
      }

      const isModifiedToday = wasModifiedToday;
      const isInProgress = svc.status === 'in_progress';
      
      if (isToday) return true;
      if (isInProgress) return true; // Always show active services
      if (isModifiedToday && svc.status === 'completed') return true;
      if (isFlexiblePending) return true;

      return false;
    });

    filtered.sort((a, b) => {
      const dateA = (a.scheduledDate instanceof Timestamp ? a.scheduledDate.toDate() : new Date(a.scheduledDate));
      const dateB = (b.scheduledDate instanceof Timestamp ? b.scheduledDate.toDate() : new Date(b.scheduledDate));
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`[Schedule] Found ${allFetched.length} raw docs, ${filtered.length} matched for ${format(date, 'yyyy-MM-dd')}`);
    return filtered;
  } catch (error) {
    console.error(`[Schedule] Error in getScheduledServicesForDate:`, error);
    return [];
  }
}

export async function getScheduledServicesForWeek(userId, date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const startRange = startOfDay(weekStart).getTime();
  const endRange = endOfDay(weekEnd).getTime();
  
  try {
    // Fetch everything for these relevant users without date filters to avoid index errors
    const qOwn = query(collection(db, 'scheduledServices'), where('assignedUserId', '==', userId));
    const qCompanion = query(collection(db, 'scheduledServices'), where('companionIds', 'array-contains', userId));
    const qWorkdays = query(
      collection(db, 'workdays'),
      where('currentCompanionId', '==', userId),
      where('status', '==', 'active')
    );

    const [snapOwn, snapCompanion, snapWorkdays] = await Promise.all([
      getDocs(qOwn),
      getDocs(qCompanion),
      getDocs(qWorkdays)
    ]);

    const resultsMap = new Map();
    const allFetched = [...snapOwn.docs, ...snapCompanion.docs];
    
    // Add titulars from active workdays
    if (!snapWorkdays.empty) {
      for (const wdDoc of snapWorkdays.docs) {
        const titularId = wdDoc.data().userId;
        const qTitular = query(collection(db, 'scheduledServices'), where('assignedUserId', '==', titularId));
        const snapTitular = await getDocs(qTitular);
        allFetched.push(...snapTitular.docs);
      }
    }

    allFetched.forEach(d => {
      const svc = { id: d.id, ...d.data() };
      const svcDateRaw = svc.scheduledDate instanceof Timestamp ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
      const svcTime = svcDateRaw.getTime();

      // Check range in memory
      if (svcTime < startRange || svcTime > endRange) return;

      const svcDateStr = format(svcDateRaw, 'yyyy-MM-dd');
      const existing = Array.from(resultsMap.values()).find(s => {
        const sDate = s.scheduledDate instanceof Timestamp ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
        const sDateStr = format(sDate, 'yyyy-MM-dd');
        return sDateStr === svcDateStr && s.communityId === svc.communityId && s.communityTaskId === svc.communityTaskId;
      });

      if (!existing) {
        resultsMap.set(svc.id, svc);
      } else {
        const statusPriority = { 'completed': 3, 'in_progress': 2, 'started': 2, 'pending': 1 };
        if ((statusPriority[svc.status] || 0) > (statusPriority[existing.status] || 0)) {
          resultsMap.delete(existing.id);
          resultsMap.set(svc.id, svc);
        }
      }
    });

    const allServices = Array.from(resultsMap.values());
    allServices.sort((a, b) => {
      const timeA = (a.scheduledDate instanceof Timestamp ? a.scheduledDate.toDate() : new Date(a.scheduledDate)).getTime();
      const timeB = (b.scheduledDate instanceof Timestamp ? b.scheduledDate.toDate() : new Date(b.scheduledDate)).getTime();
      return timeA - timeB;
    });
    return allServices;;
  } catch (error) {
    console.error("Error in getScheduledServicesForWeek:", error);
    // Fallback to basic query if complex fails or for simplicity
    const q = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userId),
      where('scheduledDate', '>=', start),
      where('scheduledDate', '<=', end),
      orderBy('scheduledDate')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function getScheduledServicesRange(startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));
  
  let q;
  if (filters.userId) {
    q = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', filters.userId),
      where('scheduledDate', '>=', start),
      where('scheduledDate', '<=', end),
      orderBy('scheduledDate')
    );
  } else {
    q = query(
      collection(db, 'scheduledServices'),
      where('scheduledDate', '>=', start),
      where('scheduledDate', '<=', end),
      orderBy('scheduledDate')
    );
  }
  
  let results = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  
  if (filters.communityId) {
    results = results.filter(r => r.communityId === filters.communityId);
  }
  if (filters.status) {
    results = results.filter(r => r.status === filters.status);
  }
  
  return results;
}

export async function updateScheduledServiceStatus(id, status) {
  await updateDoc(doc(db, 'scheduledServices', id), { status, updatedAt: serverTimestamp() });
}

export async function deleteScheduledService(id) {
  await deleteDoc(doc(db, 'scheduledServices', id));
}

export async function deleteScheduledServicesByCommunity(communityId) {
  const q = query(
    collection(db, 'scheduledServices'), 
    where('communityId', '==', communityId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;
  
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function deleteFutureServicesForUserInCommunity(userId, communityId) {
  try {
    const now = Timestamp.fromDate(startOfDay(new Date()));
    const q = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userId),
      where('communityId', '==', communityId),
      where('scheduledDate', '>=', now),
      where('status', '==', 'pending')
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`[Schedule] Eliminados ${snap.size} servicios futuros para el usuario ${userId} en comunidad ${communityId}`);
    return snap.size;
  } catch (error) {
    console.error('[Schedule] Error eliminando servicios por usuario:', error);
    throw error;
  }
}

// ==================== CLEANUP DUPLICATES ====================
/**
 * Finds and removes duplicate scheduledServices documents.
 * A duplicate is defined as two docs with the same (communityTaskId, assignedUserId, date).
 * When duplicates are found, the one with a non-pending status is kept (already worked);
 * if both are pending, the oldest (by createdAt) is kept.
 * Returns the number of deleted documents.
 */
export async function cleanupDuplicateScheduledServices() {
  console.log('[Cleanup] Buscando servicios duplicados...');
  const snap = await getDocs(collection(db, 'scheduledServices'));
  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  console.log(`[Cleanup] Total documentos: ${docs.length}`);

  // Group by unique key
  const groups = {};
  for (const svc of docs) {
    const dateObj = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const key = `${svc.communityTaskId}_${svc.assignedUserId}_${dateStr}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(svc);
  }

  const duplicateGroups = Object.entries(groups).filter(([, svcs]) => svcs.length > 1);
  console.log(`[Cleanup] Grupos con duplicados: ${duplicateGroups.length}`);

  let totalDeleted = 0;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const [key, svcs] of duplicateGroups) {
    // Sort: non-pending first (already worked), then by createdAt asc (oldest first)
    const sorted = [...svcs].sort((a, b) => {
      const aWorked = a.status !== 'pending' ? 0 : 1;
      const bWorked = b.status !== 'pending' ? 0 : 1;
      if (aWorked !== bWorked) return aWorked - bWorked;
      const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
      const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
      return aTime - bTime;
    });

    const [keep, ...toDelete] = sorted;
    console.log(`[Cleanup] Conservando ${keep.id} (${keep.status}), eliminando ${toDelete.length} duplicado(s) para clave: ${key}`);

    for (const del of toDelete) {
      batch.delete(del.ref);
      batchCount++;
      totalDeleted++;
      // Firestore batch limit is 500 operations
      if (batchCount >= 490) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`[Cleanup] Limpieza completada. ${totalDeleted} duplicados eliminados.`);
  return totalDeleted;
}

// ==================== GENERATE SERVICES ====================
/**
 * Generates services for a specific date range
 */

export async function generateServicesForRange(startDate, endDate) {
  try {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    console.log(`[Schedule] Iniciando generación: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    // Get all active communities
    const commsSnap = await getDocs(
      query(collection(db, 'communities'), where('active', '==', true))
    );
    const activeCommunityIds = new Set(commsSnap.docs.map(d => d.id));
    console.log(`[Schedule] ${activeCommunityIds.size} comunidades activas encontradas`);

    // Get all active community tasks
    const tasksSnap = await getDocs(
      query(collection(db, 'communityTasks'), where('active', '==', true))
    );
    const communityTasks = tasksSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => activeCommunityIds.has(t.communityId));
    console.log(`[Schedule] ${communityTasks.length} tareas activas filtradas`);
    
    // Get all active assignments
    const assignSnap = await getDocs(
      query(collection(db, 'assignments'), where('active', '==', true))
    );
    const assignments = assignSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => activeCommunityIds.has(a.communityId));
    console.log(`[Schedule] ${assignments.length} asignaciones activas filtradas`);
    
    // Check existing scheduled services to avoid duplicates
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));
    const existingSnap = await getDocs(
      query(
        collection(db, 'scheduledServices'),
        where('scheduledDate', '>=', start),
        where('scheduledDate', '<=', end)
      )
    );
    
    const existingKeys = new Set(
      existingSnap.docs.map(d => {
        const data = d.data();
        const date = data.scheduledDate.toDate();
        return `${data.communityTaskId}_${data.assignedUserId}_${format(date, 'yyyy-MM-dd')}`;
      })
    );
    console.log(`[Schedule] ${existingKeys.size} servicios ya existen en el rango.`);
    
    let created = 0;
    
    for (const task of communityTasks) {
      let targetUsers = [];
      if (task.assignedUserId) {
        targetUsers = [{ userId: task.assignedUserId }];
      } else {
        targetUsers = assignments.filter(a => a.communityId === task.communityId).map(a => ({ userId: a.userId }));
      }
      
      if (targetUsers.length === 0) continue;
      
      for (const day of days) {
        if (!shouldScheduleOnDay(task, day)) continue;
        
        const dayStr = format(day, 'yyyy-MM-dd');
        for (const target of targetUsers) {
          const key = `${task.id}_${target.userId}_${dayStr}`;
          if (existingKeys.has(key)) continue;
          
          console.log(`[Schedule] Creando: ${task.taskName} (${dayStr}) -> ${target.userId}`);
          await createScheduledService({
            communityId: task.communityId,
            communityTaskId: task.id,
            taskName: task.taskName,
            assignedUserId: target.userId,
            scheduledDate: startOfDay(day), // Use direct Date object instead of ISO string
            flexibleWeek: task.flexibleWeek || false,
          });
          existingKeys.add(key);
          created++;
        }
      }
    }
    
    console.log(`[Schedule] Finalizado: ${created} nuevos servicios.`);
    return created;
  } catch (error) {
    console.error('[Schedule] Error en generación masiva:', error);
    throw error;
  }
}

/**
 * Genera servicios específicos para una nueva tarea (especialmente útil para tareas puntuales)
 */
export async function generateServicesForTask(taskId, startDate = new Date(), endDate = addDays(new Date(), 90)) {
  try {
    const taskDoc = await getDoc(doc(db, 'communityTasks', taskId));
    if (!taskDoc.exists() || !taskDoc.data().active) return 0;
    
    const task = { id: taskDoc.id, ...taskDoc.data() };
    let targetUsers = [];
    if (task.assignedUserId) {
      targetUsers = [{ userId: task.assignedUserId }];
    } else {
      const assignSnap = await getDocs(query(collection(db, 'assignments'), where('communityId', '==', task.communityId), where('active', '==', true)));
      targetUsers = assignSnap.docs.map(d => ({ userId: d.data().userId }));
    }
    
    if (targetUsers.length === 0) return 0;

    // Use current month if no range specified
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));
    
    const existingSnap = await getDocs(
      query(
        collection(db, 'scheduledServices'),
        where('communityTaskId', '==', taskId),
        where('scheduledDate', '>=', start),
        where('scheduledDate', '<=', end)
      )
    );
    
    const existingKeys = new Set(existingSnap.docs.map(doc => {
      const data = doc.data();
      const date = data.scheduledDate.toDate ? data.scheduledDate.toDate() : new Date(data.scheduledDate);
      // IMPORTANT: include communityTaskId in key (same format as generateServicesForRange)
      // to avoid blocking creation of a second task from the same community on the same day
      return `${data.communityTaskId}_${data.assignedUserId}_${format(date, 'yyyy-MM-dd')}`;
    }));

    let createdCount = 0;
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });

    for (const day of days) {
      if (!shouldScheduleOnDay(task, day)) continue;
      const dayStr = format(day, 'yyyy-MM-dd');

      for (const target of targetUsers) {
        const key = `${task.id}_${target.userId}_${dayStr}`;
        if (existingKeys.has(key)) continue;

        await createScheduledService({
          communityId: task.communityId,
          communityTaskId: task.id,
          taskName: task.taskName,
          assignedUserId: target.userId,
          scheduledDate: Timestamp.fromDate(startOfDay(day)),
          flexibleWeek: task.flexibleWeek || false,
        });
        createdCount++;
        existingKeys.add(key); // key already includes task.id
      }
    }
    return createdCount;
  } catch (error) {
    console.error('[Schedule] Error en generación selectiva:', error);
    return 0;
  }
}

/**
 * Convenience function to generate services for a whole month
 */
export async function generateServicesForMonth(monthDate) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return generateServicesForRange(start, end);
}

// Deprecated alias for backward compatibility
export async function generateServicesForDays(daysAhead = 14) {
  return generateServicesForRange(new Date(), addDays(new Date(), daysAhead));
}

/**
 * Synchronizes services for a specific date range: deletes pending services 
 * that are no longer matching current configuration and creates missing ones.
 */
export async function syncServicesForRange(startDate, endDate) {
  try {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    console.log(`[Schedule] Iniciando sincronización: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    const commsSnap = await getDocs(
      query(collection(db, 'communities'), where('active', '==', true))
    );
    const activeCommunityIds = new Set(commsSnap.docs.map(d => d.id));
    
    const tasksSnap = await getDocs(
      query(collection(db, 'communityTasks'), where('active', '==', true))
    );
    const communityTasks = tasksSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => activeCommunityIds.has(t.communityId));
      
    const assignSnap = await getDocs(
      query(collection(db, 'assignments'), where('active', '==', true))
    );
    const assignments = assignSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => activeCommunityIds.has(a.communityId));
      
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));
    const existingSnap = await getDocs(
      query(
        collection(db, 'scheduledServices'),
        where('scheduledDate', '>=', start),
        where('scheduledDate', '<=', end)
      )
    );
    
    const existingServices = existingSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
    const pendingServices = existingServices.filter(s => s.status === 'pending');
    const workedServices = existingServices.filter(s => s.status !== 'pending');
    
    const desiredKeys = new Set();
    const desiredServices = [];
    
    for (const task of communityTasks) {
      let targetUsers = [];
      if (task.assignedUserId) {
        targetUsers = [{ userId: task.assignedUserId }];
      } else {
        targetUsers = assignments.filter(a => a.communityId === task.communityId).map(a => ({ userId: a.userId }));
      }
      
      if (targetUsers.length === 0) continue;
      
      for (const day of days) {
        if (!shouldScheduleOnDay(task, day)) continue;
        const dayStr = format(day, 'yyyy-MM-dd');
        for (const target of targetUsers) {
          const key = `${task.id}_${target.userId}_${dayStr}`;
          desiredKeys.add(key);
          desiredServices.push({ task, targetUserId: target.userId, day });
        }
      }
    }
    
    let deletedCount = 0;
    let batch = writeBatch(db);
    let batchCount = 0;
    
    for (const svc of pendingServices) {
      const svcDate = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
      const key = `${svc.communityTaskId}_${svc.assignedUserId}_${format(svcDate, 'yyyy-MM-dd')}`;
      
      if (!desiredKeys.has(key)) {
        batch.delete(svc.ref);
        deletedCount++;
        batchCount++;
        if (batchCount >= 490) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
    
    const keptKeys = new Set();
    for (const svc of workedServices) {
      const svcDate = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
      keptKeys.add(`${svc.communityTaskId}_${svc.assignedUserId}_${format(svcDate, 'yyyy-MM-dd')}`);
    }
    for (const svc of pendingServices) {
      const svcDate = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
      const key = `${svc.communityTaskId}_${svc.assignedUserId}_${format(svcDate, 'yyyy-MM-dd')}`;
      if (desiredKeys.has(key)) {
        keptKeys.add(key);
      }
    }
    
    let createdCount = 0;
    for (const ds of desiredServices) {
      const dayStr = format(ds.day, 'yyyy-MM-dd');
      const key = `${ds.task.id}_${ds.targetUserId}_${dayStr}`;
      
      if (!keptKeys.has(key)) {
        await createScheduledService({
          communityId: ds.task.communityId,
          communityTaskId: ds.task.id,
          taskName: ds.task.taskName,
          assignedUserId: ds.targetUserId,
          scheduledDate: startOfDay(ds.day),
          flexibleWeek: ds.task.flexibleWeek || false,
        });
        keptKeys.add(key);
        createdCount++;
      }
    }
    
    console.log(`[Schedule] Sincronización finalizada: ${deletedCount} eliminados, ${createdCount} creados.`);
    return { deletedCount, createdCount };
  } catch (error) {
    console.error('[Schedule] Error en sincronización masiva:', error);
    throw error;
  }
}

export async function syncServicesForMonth(monthDate) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return syncServicesForRange(start, end);
}

export function shouldScheduleOnDay(task, date) {
  const dayOfWeek = getDay(date); // 0=Sunday, 1=Monday...
  const dayOfMonth = getDate(date);
  const currentMonthIdx = getMonth(date); // 0-11
  const currentMonth = currentMonthIdx + 1; // 1-12
  
  // 1. Boundary Checks (Start and End dates)
  const explicitStart = task.startDate?.toDate ? task.startDate.toDate() : (task.startDate ? new Date(task.startDate) : null);
  const punctualStart = task.punctualDate?.toDate ? task.punctualDate.toDate() : (task.punctualDate ? new Date(task.punctualDate) : null);
  const taskStart = explicitStart || punctualStart;
  
  const taskEnd = task.endDate?.toDate ? task.endDate.toDate() : (task.endDate ? new Date(task.endDate) : null);

  // Evitar programar tareas hacia atrás desde la fecha de creación (no retroactivo)
  const taskCreationDateRaw = task.createdAt?.toDate ? task.createdAt.toDate() : (task.createdAt ? new Date(task.createdAt) : new Date());
  const taskCreationDate = startOfDay(taskCreationDateRaw);
  
  // No programar si la fecha a evaluar es anterior a la fecha en que se programó/creó la tarea
  if (date < taskCreationDate) return false;

  if (taskStart && date < startOfDay(taskStart)) return false;
  if (taskEnd && date > endOfDay(taskEnd)) return false;

  // 2. Service Mode Logic
  if (task.serviceMode === 'once') {
    return taskStart ? isSameDay(date, taskStart) : false;
  }

  // 3. Month and Week Filters
  // Filter by Month of Year if specified (task.monthOfYear is 0-indexed: 0-11)
  if (task.monthOfYear !== undefined && task.monthOfYear !== null && task.monthOfYear !== '') {
    if (currentMonthIdx !== parseInt(task.monthOfYear)) return false;
  }

  // Filter by Week of Month if specified
  if (task.weekOfMonth) {
    const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
    if (parseInt(task.weekOfMonth) === 5) {
      // 5 significa "Última semana"
      const lastDay = lastDayOfMonth(date);
      const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
      if (weekNum !== lastWeekNum) return false;
    } else {
      if (weekNum !== parseInt(task.weekOfMonth)) return false;
    }
  }

  if (task.flexibleWeek) {
    const mon = startOfWeek(date, { weekStartsOn: 1 });
    let anchorDate = mon;
    if (getMonth(mon) !== currentMonthIdx) {
      anchorDate = new Date(date.getFullYear(), currentMonthIdx, 1);
    }
    
    if (!isSameDay(date, anchorDate)) return false;

    // Asegurarse de que cumple también el mes si no tenía weekOfMonth
    if (!task.weekOfMonth && (task.frequencyType === 'monthly' || task.frequencyType === 'bimonthly' || task.frequencyType === 'trimonthly' || task.frequencyType === 'semiannual' || task.frequencyType === 'annual')) {
      const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
      if (weekNum !== 1) return false; // si solo dicen mensualmente, sin semana especifica, usamos la semana 1.
    }

    switch (task.frequencyType) {
       case 'bimonthly': if (currentMonthIdx % 2 !== 0) return false; break;
       case 'trimonthly': if (currentMonthIdx % 3 !== 0) return false; break;
       case 'semiannual': if (currentMonthIdx % 6 !== 0) return false; break;
       case 'annual': if (currentMonthIdx !== 0) return false; break;
       case 'biweekly': 
          if (taskStart) {
            const weeksDiff = Math.floor((date.getTime() - startOfDay(taskStart).getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weeksDiff % 2 !== 0) return false; 
          }
          break;
    }
    
    return true;
  }

  // 4. Frequency Logic (Only for period or periodic modes)
  
  const isDefaultDay = () => {
    if (task.weekOfMonth) {
      const mon = startOfWeek(date, { weekStartsOn: 1 });
      let anchorDate = mon;
      if (getMonth(mon) !== currentMonthIdx) {
        anchorDate = new Date(date.getFullYear(), currentMonthIdx, 1);
      }
      return isSameDay(date, anchorDate);
    }
    return dayOfMonth === 1;
  };

  switch (task.frequencyType) {
    case 'weekly':
      // Schedule on specified weekDays (1=Lun, 2=Mar, etc.)
      if (task.weekDays && task.weekDays.length > 0) {
        return task.weekDays.includes(dayOfWeek);
      }
      // Default: Monday
      return dayOfWeek === 1;
      
    case 'biweekly':
      // Every 2 weeks on specified days
      if (task.weekDays && task.weekDays.length > 0) {
        // Simple parity check based on milliseconds since epoch (approximate)
        // Better: diff in weeks from taskStart
        if (taskStart) {
          const diffInMs = date.getTime() - startOfDay(taskStart).getTime();
          const weeksSinceStart = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));
          return task.weekDays.includes(dayOfWeek) && weeksSinceStart % 2 === 0;
        }
        const weekNum = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
        return task.weekDays.includes(dayOfWeek) && weekNum % 2 === 0;
      }
      return false;
      
    case 'monthly':
      // On specified days of month
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.includes(dayOfMonth);
      }
      return isDefaultDay();

    case 'bimonthly': 
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 2 !== 0) return false;
      } else if (currentMonth % 2 === 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : isDefaultDay();

    case 'trimonthly':
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 3 !== 0) return false;
      } else if (currentMonth % 3 !== 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : isDefaultDay();

    case 'semiannual':
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 6 !== 0) return false;
      } else if (currentMonth % 6 !== 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : isDefaultDay();

    case 'annual':
      if (taskStart) {
        if (date.getMonth() !== taskStart.getMonth()) return false;
      } else if (currentMonth !== 1) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : isDefaultDay();
      
    case 'custom':
      // Custom freq: frequencyValue times per month
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.includes(dayOfMonth);
      }
      return false;
      
    default:
      // If serviceMode is 'period' but no frequency is set, maybe it's daily?
      if (task.serviceMode === 'period') return true; 
      return false;
  }
}

// ==================== COMPANIONS ====================
export async function addCompanionToService(serviceId, companionId) {
  const serviceRef = doc(db, 'scheduledServices', serviceId);
  const snap = await getDoc(serviceRef);
  if (!snap.exists()) throw new Error('Servicio no encontrado');
  
  const data = snap.data();
  const companionIds = data.companionIds || [];
  const companionLogs = data.companionLogs || [];
  
  if (!companionIds.includes(companionId)) {
    companionIds.push(companionId);
  }
  
  // Agregar al log si no hay un log abierto
  const openLog = companionLogs.find(log => log.userId === companionId && !log.leftAt);
  if (!openLog) {
    companionLogs.push({
      userId: companionId,
      joinedAt: new Date().toISOString()
    });
  }
  
  await updateDoc(serviceRef, { companionIds, companionLogs });
}

export async function removeCompanionFromService(serviceId, companionId) {
  const serviceRef = doc(db, 'scheduledServices', serviceId);
  const snap = await getDoc(serviceRef);
  if (!snap.exists()) throw new Error('Servicio no encontrado');
  
  const data = snap.data();
  const companionIds = (data.companionIds || []).filter(id => id !== companionId);
  const companionLogs = data.companionLogs || [];
  
  // Cerrar openLog
  const openLog = companionLogs.find(log => log.userId === companionId && !log.leftAt);
  if (openLog) {
    openLog.leftAt = new Date().toISOString();
  }
  
  await updateDoc(serviceRef, { companionIds, companionLogs });
}
