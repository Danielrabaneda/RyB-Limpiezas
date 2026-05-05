import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  startOfDay, endOfDay, addDays, format, getDay, getDate, getMonth, getYear,
  startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth,
  isSameDay, isSameWeek, getWeekOfMonth, isWithinInterval, lastDayOfMonth,
  isBefore, differenceInCalendarWeeks
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

export function shouldScheduleOnDay(task, date, options = {}) {
  const { isForecasting = false } = options;
  const dayOfWeek = getDay(date); // 0=Sunday, 1=Monday...
  const dayOfMonth = getDate(date);
  const currentMonthIdx = getMonth(date); // 0-11
  
  // 1. Boundary Checks (Start and End dates)
  const explicitStart = task.startDate?.toDate ? task.startDate.toDate() : (task.startDate ? new Date(task.startDate + (task.startDate.includes('T') ? '' : 'T00:00:00')) : null);
  const punctualStart = task.punctualDate?.toDate ? task.punctualDate.toDate() : (task.punctualDate ? new Date(task.punctualDate + (task.punctualDate.includes('T') ? '' : 'T00:00:00')) : null);
  const taskStart = explicitStart || punctualStart;
  
  const taskEnd = task.endDate?.toDate ? task.endDate.toDate() : (task.endDate ? new Date(task.endDate + (task.endDate.includes('T') ? '' : 'T23:59:59')) : null);

  const taskCreationDateRaw = task.createdAt?.toDate ? task.createdAt.toDate() : (task.createdAt ? new Date(task.createdAt) : new Date(2020, 0, 1));
  const taskCreationDate = startOfDay(taskCreationDateRaw);
  
  // If forecasting, we are less strict about when the task was created, 
  // but we still respect the explicit start date if provided.
  // 2. Date Bounds Check
  const isAfterEnd = taskEnd && startOfDay(date) > startOfDay(taskEnd);
  const isBeforeStart = taskStart && startOfDay(date) < startOfDay(taskStart);

  if (!isForecasting) {
    if (isBeforeStart || isAfterEnd) return false;
    
    // Original creation month check for actual scheduling
    const evalMonthStart = startOfMonth(date);
    const creationMonthStart = startOfMonth(taskCreationDate);
    if (isBefore(evalMonthStart, creationMonthStart)) return false;
  } else {
    // For forecasting (Yearly View), we allow showing dots for the whole year 
    // of the start date, even if it's before the exact day, to show the pattern.
    // We only block if the year is completely outside the bounds.
    if (taskStart && getYear(date) < getYear(taskStart)) return false;
    if (taskEnd && getYear(date) > getYear(taskEnd)) return false;
  }

  // 3. Service Mode Logic
  if (task.serviceMode === 'once') {
    return taskStart ? isSameDay(date, taskStart) : false;
  }

  // 3. Month and Frequency Logic
  const periodicMultiMonth = ['bimonthly', 'trimonthly', 'quadrimonthly', 'semiannual', 'eightmonthly', 'annual'];
  const isPeriodic = periodicMultiMonth.includes(task.frequencyType);

  // Calculate anchor
  let anchorMonth = 0;
  let anchorYear = 2024; // Standard anchor year for consistent cycles
  
  const taskMonthOfYear = task.monthOfYear !== undefined && task.monthOfYear !== null && task.monthOfYear !== '' ? parseInt(task.monthOfYear) : NaN;
  
  if (!isNaN(taskMonthOfYear)) {
    anchorMonth = taskMonthOfYear;
    anchorYear = taskStart ? getYear(taskStart) : getYear(taskCreationDate);
  } else if (isPeriodic) {
    // Standard Cycle (SYC): Align with Ene, Mar, May...
    anchorMonth = 0;
    anchorYear = 2024;
  } else if (taskStart) {
    anchorMonth = getMonth(taskStart);
    anchorYear = getYear(taskStart);
  } else {
    anchorMonth = getMonth(taskCreationDate);
    anchorYear = getYear(taskCreationDate);
  }

  const monthDiff = (getYear(date) - anchorYear) * 12 + (currentMonthIdx - anchorMonth);

  if (isPeriodic) {
    const freqMap = {
      'bimonthly': 2,
      'trimonthly': 3,
      'quadrimonthly': 4,
      'semiannual': 6,
      'eightmonthly': 8,
      'annual': 12
    };
    const frequency = freqMap[task.frequencyType] || 1;
    // Robust modulo for negative month differences
    const normalizedDiff = ((monthDiff % frequency) + frequency) % frequency;
    if (normalizedDiff !== 0) return false;
  } else if (!isNaN(taskMonthOfYear)) {
    if (currentMonthIdx !== taskMonthOfYear) return false;
  }

  // Helper to check if a day matches the selected weekdays (handling types safely)
  const isWeekdayMatch = (dOfWeek) => {
    if (!task.weekDays || task.weekDays.length === 0) return false;
    return task.weekDays.some(wd => parseInt(wd) === dOfWeek);
  };

  // 4. Week/Day Filters
  if (task.weekOfMonth) {
    const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
    const targetWeek = parseInt(task.weekOfMonth);
    if (targetWeek === 5) {
      const lastDay = lastDayOfMonth(date);
      const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
      if (weekNum !== lastWeekNum) return false;
    } else {
      if (weekNum !== targetWeek) return false;
    }
  }

  // Flexible week logic: In "live" mode, it's true on Monday (or first day of month if week starts before month)
  // In "forecasting" mode for the yearly view, we might want it to fall on a specific day if weekDays are set
  if (task.flexibleWeek && !isForecasting) {
    const mon = startOfWeek(date, { weekStartsOn: 1 });
    let anchorDate = mon;
    if (getMonth(mon) !== currentMonthIdx) {
      anchorDate = new Date(date.getFullYear(), currentMonthIdx, 1);
    }
    
    if (!isSameDay(date, anchorDate)) return false;

    if (!task.weekOfMonth) {
      const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
      if (weekNum !== 1) return false;
    }

    if (task.frequencyType === 'biweekly') {
      const refDate = taskStart || taskCreationDate;
      // Use weekStartsOn: 0 (Sunday) to ensure tasks created on Sunday for the upcoming week 
      // are anchored to the same week (Week 0) instead of the previous one.
      const weeksDiff = Math.abs(differenceInCalendarWeeks(date, refDate, { weekStartsOn: 0 }));
      if (weeksDiff % 2 !== 0) return false; 
    }
    return true;
  }

  // 5. Day of Month / Day of Week Matching
  const isDefaultDay = () => {
    // Priority 1: weekDays selection
    if (task.weekDays && task.weekDays.length > 0) {
      let targetWeek = task.weekOfMonth ? parseInt(task.weekOfMonth) : null;
      
      if (!targetWeek) {
        const refDate = taskStart || taskCreationDate;
        targetWeek = getWeekOfMonth(refDate, { weekStartsOn: 1 });
      }

      if (targetWeek) {
        const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
        let weekMatches = (weekNum === targetWeek);
        if (targetWeek === 5) {
          const lastDay = lastDayOfMonth(date);
          const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
          weekMatches = (weekNum === lastWeekNum);
        }
        
        if (!weekMatches) return false;
        return isWeekdayMatch(dayOfWeek);
      }
      
      return isWeekdayMatch(dayOfWeek) && dayOfMonth <= 7; // First week fallback
    }

    // Priority 2: weekOfMonth only (default to Monday of that week)
    if (task.weekOfMonth) {
      return dayOfWeek === 1; 
    }

    // Priority 3: taskStart day of month
    if (taskStart) {
      const targetDay = getDate(taskStart);
      const lastDate = getDate(lastDayOfMonth(date));
      return dayOfMonth === Math.min(targetDay, lastDate);
    }

    // Priority 4: taskCreationDate day
    const creationDay = getDate(taskCreationDate);
    const lastDate = getDate(lastDayOfMonth(date));
    return dayOfMonth === Math.min(creationDay, lastDate);
  };

  switch (task.frequencyType) {
    case 'weekly':
      if (task.weekDays && task.weekDays.length > 0) {
        return isWeekdayMatch(dayOfWeek);
      }
      return dayOfWeek === 1;
      
    case 'biweekly':
      {
        const refDate = taskStart || taskCreationDate;
        // Use weekStartsOn: 0 (Sunday) to ensure tasks created on Sunday for the upcoming week 
        // are anchored to the same week (Week 0) instead of the previous one.
        // This addresses the issue where tasks created on Sunday for a Tuesday would skip the first week.
        const weeksSinceStart = Math.abs(differenceInCalendarWeeks(date, refDate, { weekStartsOn: 0 }));
        const isCorrectWeek = weeksSinceStart % 2 === 0;
        
        if (task.weekDays && task.weekDays.length > 0) {
          return isWeekdayMatch(dayOfWeek) && isCorrectWeek;
        }
        return dayOfWeek === 1 && isCorrectWeek;
      }
      
    case 'monthly':
    case 'bimonthly': 
    case 'trimonthly':
    case 'quadrimonthly':
    case 'semiannual':
    case 'eightmonthly':
    case 'annual':
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.some(d => parseInt(d) === dayOfMonth);
      }
      return isDefaultDay();
      
    case 'custom':
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.some(d => parseInt(d) === dayOfMonth);
      }
      return false;
      
    default:
      if (task.serviceMode === 'period' || task.serviceMode === 'periodic') return true; 
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
