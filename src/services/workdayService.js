import { 
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, orderBy, serverTimestamp, Timestamp, limit, deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

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
    createdAt: serverTimestamp(),
  });
  return ref.id;
}


export async function endWorkday(workdayId) {
  const endTime = new Date();
  const workdayRef = doc(db, COLLECTION_NAME, workdayId);
  
  // Get workday data to calculate duration
  const snap = await getDocs(query(
    collection(db, COLLECTION_NAME),
    where('__name__', '==', workdayId)
  ));
  
  let duration = 0;
  if (!snap.empty) {
    const data = snap.docs[0].data();
    if (data.startTime) {
      const startTimeDate = data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime);
      duration = differenceInMinutes(endTime, startTimeDate);
    }
  }
  
  await updateDoc(workdayRef, {
    endTime: Timestamp.fromDate(endTime),
    totalMinutes: duration,
    status: 'completed',
  });
  
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
  // Simplemente reutilizamos la lógica de filtrado seguro que ya creamos
  return getWorkdaysForAdmin(startDate, endDate, userId);
}

