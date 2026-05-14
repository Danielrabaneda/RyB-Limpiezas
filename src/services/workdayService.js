import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp, Timestamp, limit, deleteDoc, arrayUnion
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay, differenceInMinutes, format } from 'date-fns';
import { calculateDailyMileage } from './mileageService';

const COLLECTION_NAME = 'workdays';

export async function startWorkday(userId, userName = 'Operario') {
  // Verificación de seguridad: No permitir iniciar si ya hay una activa
  const existing = await getActiveWorkday(userId);
  if (existing) {
    console.log('Ya existe una jornada activa para este usuario');
    return existing.id;
  }

  const now = new Date();
  const ref = await addDoc(collection(db, COLLECTION_NAME), {
    userId,
    userName, // <--- Guardamos el nombre para evitar "desconocido"
    date: Timestamp.fromDate(startOfDay(now)),
    startTime: serverTimestamp(),
    endTime: null,
    totalMinutes: 0,
    status: 'active',
    currentCompanionId: null, // <--- Added to track global companion
    createdAt: serverTimestamp(),
  });
  return ref.id;
}


export async function endWorkday(workdayId, breadcrumbs = []) {
  const endTime = new Date();
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  
  // Get workday data to calculate duration
  const workdaySnap = await getDoc(workdayRef);
  
  let duration = 0;
  let workdayData = null;
  if (workdaySnap.exists()) {
    workdayData = workdaySnap.data();
    if (workdayData.startTime) {
      const startTimeDate = workdayData.startTime.toDate ? workdayData.startTime.toDate() : new Date(workdayData.startTime);
      duration = differenceInMinutes(endTime, startTimeDate);
    }
  }
  
  // Auto-close active car session if any
  let updatedCarSessions = workdayData?.carSessions || [];
  if (workdayData?.carActive) {
    updatedCarSessions = updatedCarSessions.map(session => {
      if (!session.endTime) {
        const startTimeDate = session.startTime?.toDate ? session.startTime.toDate() : new Date(session.startTime);
        
        const sessionBreadcrumbs = breadcrumbs.filter(b => {
          const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
          return bTime >= startTimeDate.getTime() && bTime <= endTime.getTime();
        });

        return { 
          ...session, 
          endTime: Timestamp.fromDate(endTime),
          breadcrumbs: sessionBreadcrumbs
        };
      }
      return session;
    });
  }
  
  await updateDoc(workdayRef, {
    endTime: Timestamp.fromDate(endTime),
    totalMinutes: duration,
    status: 'completed',
    carActive: false,
    carSessions: updatedCarSessions,
  });
  
  // Trigger mileage calculation
  // Usamos la fecha "lógica" de la jornada (workdayData.date) para que el kilometraje 
  // se guarde en el día correcto, incluso si la jornada termina después de medianoche.
  const logicalDate = workdayData?.date?.toDate ? workdayData.date.toDate() : endTime;
  
  if (workdayData?.userId) {
    try {
      await calculateDailyMileage(
        workdayData.userId,
        logicalDate,
        workdayData.userName || 'Operario',
        updatedCarSessions
      );
      console.log('[Workday] Kilometraje procesado automáticamente al finalizar jornada');
    } catch (err) {
      console.error('[Workday] Error calculando kilometraje:', err);
    }
  }
  
  return { duration };
}

export async function getActiveWorkday(userId) {
  // Ultra-simplificado: solo filtramos por userId para evitar CUALQUIER necesidad de índice compuesto.
  // Como un usuario tiene muy pocos registros de jornada al mes, filtrar en memoria es instantáneo.
  const q = query(
    collection(db, COLLECTION_NAME),
    where('userId', '==', userId)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  // Filtramos el que esté activo en memoria
  const active = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(wd => wd.status === 'active');
  
  return active || null;
}



export async function getWorkdaysForAdmin(startDate, endDate, userId = null) {
  try {
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));
    
    // Consulta base: por rango de fechas (esto solo requiere un índice simple que suele estar auto-generado)
    const q = query(
      collection(db, COLLECTION_NAME),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'desc')
    );
    
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Si hay un userId, filtramos en memoria para evitar errores de índices compuestos
    if (userId) {
      results = results.filter(wd => wd.userId === userId);
    }

    return results;
  } catch (error) {
    console.error("Error in getWorkdaysForAdmin:", error);
    // Si falla por ordenación/índices, intentamos una carga ultra-simple sin ordenar para que al menos no se rompa la App
    const qSimple = query(collection(db, COLLECTION_NAME));
    const snapSimple = await getDocs(qSimple);
    return snapSimple.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function deleteWorkday(workdayId) {
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  await deleteDoc(workdayRef);
}

export async function getWorkdaysForOperario(userId, startDate, endDate) {
  try {
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));
    
    // Query only by userId to pass Firestore security rules and avoid composite indexes
    const q = query(
      collection(db, COLLECTION_NAME),
      where('userId', '==', userId)
    );
    
    const snap = await getDocs(q);
    
    let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Filter by date range in memory and sort
    results = results.filter(wd => {
      const wdDateRaw = wd.date?.toDate ? wd.date.toDate() : new Date(wd.date);
      return wdDateRaw >= startOfDay(startDate) && wdDateRaw <= endOfDay(endDate);
    });
    
    // Sort descending by date
    results.sort((a, b) => {
      const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return bDate - aDate;
    });

    return results;
  } catch (error) {
    console.error("Error in getWorkdaysForOperario:", error);
    return [];
  }
}

/**
 * Gets a summary of all workdays (active or completed) for a specific date.
 * Useful for aggregating hours from multiple sessions in one day.
 */
export async function getWorkdaysSummaryForDate(userId, date = new Date()) {
  // Query only by userId to avoid composite index requirements
  const q = query(
    collection(db, COLLECTION_NAME),
    where('userId', '==', userId)
  );
  
  const snap = await getDocs(q);
  const allWorkdays = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Robust date filtering using Madrid timezone strings
  const targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(date);
  
  const todayWorkdays = allWorkdays.filter(wd => {
    try {
      const wdDateRaw = wd.date?.toDate ? wd.date.toDate() : new Date(wd.date);
      const wdDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(wdDateRaw);
      return wdDateStr === targetDateStr;
    } catch (e) {
      return false;
    }
  });
  
  let totalMinutes = 0;
  let hasActive = false;
  let activeWorkday = null;
  let firstStartTime = null;
  
  const now = new Date();
  
  // Sort by startTime to find the absolute first start of the day
  const sortedWorkdays = [...todayWorkdays].sort((a, b) => {
    const aTime = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
    const bTime = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
    return aTime - bTime;
  });

  if (sortedWorkdays.length > 0) {
    const first = sortedWorkdays[0];
    firstStartTime = first.startTime?.toDate ? first.startTime.toDate() : new Date(first.startTime);
  }

  // BUSCAR JORNADA ACTIVA EN TODOS LOS DÍAS (por si se olvidó cerrarla ayer)
  const globalActiveWd = allWorkdays.find(wd => wd.status === 'active');
  if (globalActiveWd) {
    hasActive = true;
    activeWorkday = globalActiveWd;
    if (!firstStartTime) {
      firstStartTime = globalActiveWd.startTime?.toDate ? globalActiveWd.startTime.toDate() : new Date(globalActiveWd.startTime);
    }
  }

  for (const wd of todayWorkdays) {
    if (wd.status === 'active') {
      const startTime = wd.startTime?.toDate ? wd.startTime.toDate() : new Date(wd.startTime);
      totalMinutes += Math.max(0, differenceInMinutes(now, startTime));
    } else {
      totalMinutes += (Number(wd.totalMinutes) || 0);
    }
  }

  // Si la jornada activa es de días anteriores, calcular sus minutos también para mostrar en UI
  if (globalActiveWd && !todayWorkdays.find(w => w.id === globalActiveWd.id)) {
    const startTime = globalActiveWd.startTime?.toDate ? globalActiveWd.startTime.toDate() : new Date(globalActiveWd.startTime);
    totalMinutes += Math.max(0, differenceInMinutes(now, startTime));
  }
  
  return {
    totalMinutes,
    hasActive,
    activeWorkday,
    firstStartTime,
    count: todayWorkdays.length,
    allSessions: todayWorkdays // Optional: return all sessions for detailed UI
  };
}

export async function updateWorkdayCompanion(workdayId, companionId) {
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  await updateDoc(workdayRef, {
    currentCompanionId: companionId,
    updatedAt: serverTimestamp()
  });
}

/**
 * Finds all active workdays where the specified user is a companion.
 */
export async function getActiveWorkdaysForCompanion(userId) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('currentCompanionId', '==', userId),
    where('status', '==', 'active')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ==================== CAR SESSION MANAGEMENT ====================

/**
 * Activates car mode for the current workday.
 * Creates a new car session with startTime = now.
 */
export async function activateCar(workdayId) {
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  const now = Timestamp.fromDate(new Date());
  
  await updateDoc(workdayRef, {
    carActive: true,
    carActiveSince: now,
    carSessions: arrayUnion({ startTime: now, endTime: null }),
    updatedAt: serverTimestamp()
  });
}

/**
 * Deactivates car mode for the current workday.
 * Closes the active car session.
 */
export async function deactivateCar(workdayId, breadcrumbs = []) {
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  const now = new Date();
  
  // Get current sessions and close the open one
  const workdaySnap = await getDoc(workdayRef);
  if (!workdaySnap.exists()) return;
  
  const data = workdaySnap.data();
  const updatedSessions = (data.carSessions || []).map(session => {
    if (!session.endTime) {
      const startTimeDate = session.startTime?.toDate ? session.startTime.toDate() : new Date(session.startTime);
      
      const sessionBreadcrumbs = breadcrumbs.filter(b => {
        const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
        return bTime >= startTimeDate.getTime() && bTime <= now.getTime();
      });

      return { 
        ...session, 
        endTime: Timestamp.fromDate(now),
        breadcrumbs: sessionBreadcrumbs 
      };
    }
    return session;
  });
  
  await updateDoc(workdayRef, {
    carActive: false,
    carActiveSince: null,
    carSessions: updatedSessions,
    updatedAt: serverTimestamp()
  });
}

/**
 * Gets car sessions for a specific workday.
 */
export async function getCarSessions(workdayId) {
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  const snap = await getDoc(workdayRef);
  if (!snap.exists()) return [];
  return snap.data().carSessions || [];
}
