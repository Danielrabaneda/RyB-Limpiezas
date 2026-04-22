import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  startOfDay, endOfDay, addDays, format, getDay, getDate, getMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth,
  isSameDay, getWeekOfMonth, isWithinInterval
} from 'date-fns';

// ==================== SCHEDULED SERVICES ====================
export async function createScheduledService(data) {
  const ref = await addDoc(collection(db, 'scheduledServices'), {
    communityId: data.communityId,
    communityTaskId: data.communityTaskId,
    taskName: data.taskName || '', // Añadido para visibilidad directa
    assignedUserId: data.assignedUserId,
    scheduledDate: Timestamp.fromDate(new Date(data.scheduledDate)),
    flexibleWeek: data.flexibleWeek || false,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function getScheduledServicesForDate(userId, date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const startQuery = Timestamp.fromDate(startOfDay(weekStart));
  const endQuery = Timestamp.fromDate(endOfDay(date));

  console.log(`[Schedule] Buscando servicios para ${userId} desde el inicio de la semana hasta el día ${date.toISOString()}`);

  try {
    const q1 = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userId),
      where('scheduledDate', '>=', startQuery),
      where('scheduledDate', '<=', endQuery),
      orderBy('scheduledDate')
    );
    const snap1 = await getDocs(q1);
    const results1 = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

    let results2 = [];
    try {
      const q2 = query(
        collection(db, 'scheduledServices'),
        where('companionIds', 'array-contains', userId),
        where('scheduledDate', '>=', startQuery),
        where('scheduledDate', '<=', endQuery),
        orderBy('scheduledDate')
      );
      const snap2 = await getDocs(q2);
      results2 = snap2.docs.map(d => ({ id: d.id, ...d.data(), isCompanion: true }));
    } catch (idxError) {
      console.warn("[Schedule] Missing composite index for companionIds. Fetching without date filter.", idxError);
      const q2fallback = query(
        collection(db, 'scheduledServices'),
        where('companionIds', 'array-contains', userId)
      );
      const snap2 = await getDocs(q2fallback);
      results2 = snap2.docs.map(d => ({ id: d.id, ...d.data(), isCompanion: true })).filter(svc => {
        const d = svc.scheduledDate.toDate().getTime();
        return d >= startQuery.toDate().getTime() && d <= endQuery.toDate().getTime();
      });
    }

    // Merge and deduplicate
    const allResults = [...results1];
    const existingIds = new Set(results1.map(r => r.id));
    for (const r2 of results2) {
      if (!existingIds.has(r2.id)) {
        allResults.push(r2);
      }
    }

    // Sort combined array
    allResults.sort((a, b) => a.scheduledDate.toDate().getTime() - b.scheduledDate.toDate().getTime());
    
    // In memory filter:
    const todayStart = startOfDay(date).getTime();
    const todayEnd = endOfDay(date).getTime();

    const filtered = allResults.filter(svc => {
      const svcDate = svc.scheduledDate.toDate().getTime();
      const isToday = svcDate >= todayStart && svcDate <= todayEnd;
      
      // Check if it was modified (e.g. completed) today
      const updatedAt = svc.updatedAt?.toDate ? svc.updatedAt.toDate().getTime() : 0;
      const wasModifiedToday = updatedAt >= todayStart && updatedAt <= todayEnd;
      
      // Companion filter: if user is companion, they should only see it if they haven't left or it was today
      if (svc.companionIds?.includes(userId)) {
        const myLog = svc.companionLogs?.find(log => log.userId === userId);
        // If I have left already (leftAt exists), I only see it if it was today (to see summary)
        if (myLog?.leftAt && !isToday) return false;
        // If I haven't joined yet (no log) and it's not today, shouldn't see it (unless flexible?)
        // Actually, companions only see what they are currently on or did today.
        if (!myLog && !isToday) return false;
      }

      if (isToday) return true;
      
      // If it was completed or worked on today, show it even if it was scheduled for earlier
      if (wasModifiedToday && (svc.status === 'completed' || svc.status === 'in_progress')) return true;

      // If it's a flexible task from earlier this week and not completed
      if (svc.flexibleWeek && svc.status !== 'completed' && svc.status !== 'missed') {
         return true;
      }
      return false;
    });

    console.log(`[Schedule] Resultados encontrados hoy o pendientes flexibles: ${filtered.length}`);
    return filtered;
  } catch (error) {
    console.error(`[Schedule] Error en getScheduledServicesForDate:`, error);
    throw error;
  }
}

export async function getScheduledServicesForWeek(userId, date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const start = Timestamp.fromDate(startOfDay(weekStart));
  const end = Timestamp.fromDate(endOfDay(weekEnd));
  
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

// ==================== GENERATE SERVICES ====================
/**
 * Generates services for a specific date range
 */
export async function generateServicesForRange(startDate, endDate) {
  try {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    console.log(`[Schedule] Iniciando generación: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    // Get all active community tasks
    const tasksSnap = await getDocs(
      query(collection(db, 'communityTasks'), where('active', '==', true))
    );
    const communityTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[Schedule] ${communityTasks.length} tareas activas encontradas`);
    
    // Get all active assignments
    const assignSnap = await getDocs(
      query(collection(db, 'assignments'), where('active', '==', true))
    );
    const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[Schedule] ${assignments.length} asignaciones activas encontradas`);
    
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
      return `${data.assignedUserId}_${format(date, 'yyyy-MM-dd')}`;
    }));

    let createdCount = 0;
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });

    for (const day of days) {
      if (!shouldScheduleOnDay(task, day)) continue;
      const dayStr = format(day, 'yyyy-MM-dd');

      for (const target of targetUsers) {
        const key = `${target.userId}_${dayStr}`;
        if (existingKeys.has(key)) continue;

        await createScheduledService({
          communityId: task.communityId,
          communityTaskId: task.id,
          taskName: task.taskName,
          assignedUserId: target.userId,
          scheduledDate: startOfDay(day).toISOString(),
          flexibleWeek: task.flexibleWeek || false,
        });
        createdCount++;
        existingKeys.add(key);
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

function shouldScheduleOnDay(task, date) {
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
  if (task.monthOfYear !== undefined && task.monthOfYear !== null) {
    if (currentMonthIdx !== parseInt(task.monthOfYear)) return false;
  }

  // Filter by Week of Month if specified
  if (task.weekOfMonth) {
    const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
    if (weekNum !== parseInt(task.weekOfMonth)) return false;
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
      // Default: 1st of month
      return dayOfMonth === 1;

    case 'bimonthly': 
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 2 !== 0) return false;
      } else if (currentMonth % 2 === 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : dayOfMonth === 1;

    case 'trimonthly':
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 3 !== 0) return false;
      } else if (currentMonth % 3 !== 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : dayOfMonth === 1;

    case 'semiannual':
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 6 !== 0) return false;
      } else if (currentMonth % 6 !== 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : dayOfMonth === 1;

    case 'annual':
      if (taskStart) {
        if (date.getMonth() !== taskStart.getMonth()) return false;
      } else if (currentMonth !== 1) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : dayOfMonth === 1;
      
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
