import { 
  collection, doc, addDoc, updateDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCheckInsForDate } from './checkInService';
import { getCommunity } from './communityService';
import { getDistance } from '../utils/geolocation';
import { startOfDay, endOfDay, format, differenceInMinutes, eachDayOfInterval, isSameDay } from 'date-fns';

const COLLECTION = 'dailyMileage';
const ROAD_FACTOR = 1.3; // Factor de corrección línea recta → carretera

/**
 * Calcula la distancia total recorrida sumando los puntos de migas de pan (breadcrumbs).
 */
function calculateBreadcrumbsDistance(carSessions) {
  let totalMeters = 0;
  
  for (const session of carSessions) {
    const breadcrumbs = session.breadcrumbs || [];
    if (breadcrumbs.length < 2) continue;
    
    for (let i = 0; i < breadcrumbs.length - 1; i++) {
      const p1 = breadcrumbs[i];
      const p2 = breadcrumbs[i + 1];
      
      if (p1.lat && p1.lng && p2.lat && p2.lng) {
        totalMeters += getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      }
    }
  }
  
  return Math.round((totalMeters / 1000) * 100) / 100;
}

/**
 * Calcula el kilometraje diario de un operario basándose en sus fichajes GPS.
 * Solo considera fichajes que caigan dentro de sesiones de coche activas.
 */
export async function calculateDailyMileage(userId, date, userName = 'Operario', carSessions = []) {
  const dateStr = format(date, 'yyyy-MM-dd');

  try {
    // 0. Si ya existe un registro MANUAL, no lo sobrescribimos automáticamente
    const existing = await findExistingRecord(userId, dateStr);
    if (existing && (existing.type === 'manual' || (existing.type !== 'auto' && existing.totalKm > 0 && (!existing.tramos || existing.tramos.length === 0)))) {
      console.log(`[Mileage] Saltando cálculo automático para ${dateStr} porque ya existe un registro MANUAL o modificado.`);
      return existing;
    }

    // 1. Calcular migas de pan (breadcrumbs) - Trayectoria real muestreada
    const breadcrumbsKm = calculateBreadcrumbsDistance(carSessions);

    // 2. Obtener todos los fichajes del día (propios y de compañeros de equipo)
    const ownCheckIns = await getCheckInsForDate(userId, date);
    const relatedCheckIns = await getRelatedCheckIns(userId, date);
    
    // Unificar y deduplicar por communityId y hora aproximada
    const allCheckIns = [...ownCheckIns, ...relatedCheckIns];
    const uniqueCheckIns = [];
    const seenKeys = new Set();

    for (const ci of allCheckIns) {
      const time = ci.checkInTime?.toDate ? ci.checkInTime.toDate().getTime() : 0;
      const timeKey = Math.floor(time / 60000); 
      const key = `${ci.communityId}_${timeKey}`;
      
      if (!seenKeys.has(key)) {
        uniqueCheckIns.push(ci);
        seenKeys.add(key);
      }
    }

    // Ordenar cronológicamente
    let completed = uniqueCheckIns
      .filter(c => c.checkInTime)
      .sort((a, b) => {
        const timeA = a.checkInTime?.toDate ? a.checkInTime.toDate().getTime() : 0;
        const timeB = b.checkInTime?.toDate ? b.checkInTime.toDate().getTime() : 0;
        return timeA - timeB;
      });

    // --- MEJORA: Puntos Virtuales de Inicio/Fin de Jornada ---
    // Si no tiene check-ins pero sí sesiones de coche, añadimos los puntos GPS inicial/final
    // para que el cálculo por centros tenga puntos de anclaje.
    const virtualPoints = [];
    if (carSessions.length > 0) {
      // Ordenar sesiones por tiempo por si acaso
      const sortedSessions = [...carSessions].sort((a, b) => {
        const tA = a.startTime?.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime).getTime();
        const tB = b.startTime?.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime).getTime();
        return tA - tB;
      });

      // Primer punto de la primera sesión
      const firstSession = sortedSessions[0];
      const firstBread = firstSession.breadcrumbs?.[0];
      if (firstBread) {
        virtualPoints.push({
          communityId: 'VIRTUAL_START',
          communityName: 'Inicio de trayecto (Coche)',
          checkInTime: Timestamp.fromMillis(firstBread.timestamp),
          checkOutTime: Timestamp.fromMillis(firstBread.timestamp),
          lat: firstBread.lat,
          lng: firstBread.lng,
          isVirtual: true
        });
      }

      // Último punto de la última sesión
      const lastSession = sortedSessions[sortedSessions.length - 1];
      const lastBread = lastSession.breadcrumbs?.[lastSession.breadcrumbs?.length - 1];
      if (lastBread && lastBread !== firstBread) {
        virtualPoints.push({
          communityId: 'VIRTUAL_END',
          communityName: 'Fin de trayecto (Coche)',
          checkInTime: Timestamp.fromMillis(lastBread.timestamp),
          checkOutTime: Timestamp.fromMillis(lastBread.timestamp),
          lat: lastBread.lat,
          lng: lastBread.lng,
          isVirtual: true
        });
      }
    }

    // Combinar check-ins reales con puntos virtuales y volver a ordenar
    const fullPoints = [...completed, ...virtualPoints].sort((a, b) => {
      const timeA = a.checkInTime?.toDate ? a.checkInTime.toDate().getTime() : 0;
      const timeB = b.checkInTime?.toDate ? b.checkInTime.toDate().getTime() : 0;
      return timeA - timeB;
    });

    // 3. Si no hay suficientes puntos para calcular tramos, devolvemos breadcrumbs
    if (fullPoints.length < 2) {
      const finalKm = breadcrumbsKm > 0 ? breadcrumbsKm : 0;
      if (breadcrumbsKm > 0) {
        console.log(`[Mileage] Insuficientes puntos, usando migas de pan: ${finalKm} km`);
      }
      return await saveMileageRecord(userId, userName, date, dateStr, [], finalKm);
    }

    // 4. Si no activó el coche (no hay sesiones), no se calculan kilómetros automáticamente.
    if (carSessions.length === 0) {
      console.log(`[Mileage] No hay sesiones de coche para ${dateStr}. 0 km.`);
      return await saveMileageRecord(userId, userName, date, dateStr, [], 0);
    }

    // 5. Construir la ruta entera
    const route = buildRoute(fullPoints);

    if (route.length < 2) {
      const finalKm = breadcrumbsKm > 0 ? breadcrumbsKm : 0;
      return await saveMileageRecord(userId, userName, date, dateStr, [], finalKm);
    }

    // 6. Calcular tramos
    const tramos = [];
    let totalKm = 0;
    let tramosSospechosos = 0;
    const communityCache = {};

    for (let i = 0; i < route.length - 1; i++) {
      const origen = route[i];
      const destino = route[i + 1];

      let origenLat, origenLng, origenNombre;
      let destinoLat, destinoLng, destinoNombre;

      // Resolver origen
      if (origen.isVirtual) {
        origenLat = origen.lat;
        origenLng = origen.lng;
        origenNombre = origen.communityName;
      } else {
        if (!communityCache[origen.communityId]) communityCache[origen.communityId] = await getCommunity(origen.communityId);
        const comm = communityCache[origen.communityId];
        origenLat = comm?.location?._lat || comm?.location?.latitude || 0;
        origenLng = comm?.location?._long || comm?.location?.longitude || 0;
        origenNombre = comm?.name || 'Comunidad';
      }

      // Resolver destino
      if (destino.isVirtual) {
        destinoLat = destino.lat;
        destinoLng = destino.lng;
        destinoNombre = destino.communityName;
      } else {
        if (!communityCache[destino.communityId]) communityCache[destino.communityId] = await getCommunity(destino.communityId);
        const comm = communityCache[destino.communityId];
        destinoLat = comm?.location?._lat || comm?.location?.latitude || 0;
        destinoLng = comm?.location?._long || comm?.location?.longitude || 0;
        destinoNombre = comm?.name || 'Comunidad';
      }

      // Calcular distancia
      const distanciaMetros = getDistance(origenLat, origenLng, destinoLat, destinoLng);
      const kmLineaRecta = Math.round((distanciaMetros / 1000) * 100) / 100;
      const kmEstimados = Math.round(kmLineaRecta * ROAD_FACTOR * 100) / 100;

      // Tiempos
      const horaSalida = (origen.checkOutTime || origen.checkInTime).toDate();
      const horaLlegada = destino.checkInTime.toDate();
      const minutosDesplazamiento = Math.max(0, differenceInMinutes(horaLlegada, horaSalida));

      // Verificar solapamiento con coche
      const overlapCar = tramoOverlapsWithCarSession(horaSalida, horaLlegada, carSessions);
      const velocidadEstimada = minutosDesplazamiento > 0 ? Math.round((kmEstimados / (minutosDesplazamiento / 60)) * 10) / 10 : 0;
      const sospechoso = detectarSospechoso(kmEstimados, minutosDesplazamiento, velocidadEstimada);

      const mismoCentro = origen.communityId === destino.communityId;
      const esCaminando = !mismoCentro && distanciaMetros < 150;
      const ignorarDistancia = mismoCentro || esCaminando || !overlapCar;

      const tramo = {
        origenId: origen.communityId,
        origenNombre,
        origenCoords: { lat: origenLat, lng: origenLng },
        destinoId: destino.communityId,
        destinoNombre,
        destinoCoords: { lat: destinoLat, lng: destinoLng },
        horaSalida: Timestamp.fromDate(horaSalida),
        horaLlegada: Timestamp.fromDate(horaLlegada),
        kmLineaRecta: ignorarDistancia ? 0 : kmLineaRecta,
        kmEstimados: ignorarDistancia ? 0 : kmEstimados,
        minutosDesplazamiento,
        velocidadEstimada: ignorarDistancia ? 0 : velocidadEstimada,
        sospechoso: ignorarDistancia ? false : sospechoso,
        mismoCentro,
        esCaminando,
        enCoche: overlapCar,
      };

      tramos.push(tramo);
      if (!ignorarDistancia) {
        totalKm += kmEstimados;
        if (sospechoso) tramosSospechosos++;
      }
    }

    totalKm = Math.round(totalKm * 100) / 100;
    
    // Comparar con breadcrumbs y usar el máximo
    if (breadcrumbsKm > totalKm) {
      totalKm = breadcrumbsKm;
      console.log(`[Mileage] Usando trayectoria real (breadcrumbs): ${totalKm} km`);
    }

    return await saveMileageRecord(userId, userName, date, dateStr, tramos, totalKm, tramosSospechosos);

  } catch (error) {
    console.error('[Mileage] Error calculando kilometraje:', error);
    throw error;
  }
}

/**
 * Verifica si el desplazamiento solapa temporalmente con alguna sesión de coche
 */
function tramoOverlapsWithCarSession(horaSalida, horaLlegada, carSessions) {
  const salida = horaSalida.getTime();
  const llegada = horaLlegada.getTime();
  const MARGIN_MS = 30 * 60 * 1000;

  return carSessions.some(session => {
    const sessionStart = session.startTime?.toDate 
      ? session.startTime.toDate().getTime() 
      : new Date(session.startTime).getTime();
    const sessionEnd = session.endTime 
      ? (session.endTime?.toDate ? session.endTime.toDate().getTime() : new Date(session.endTime).getTime())
      : Date.now();
      
    return (sessionStart - MARGIN_MS) <= llegada && (sessionEnd + MARGIN_MS) >= salida;
  });
}

/**
 * Construye la ruta eliminando fichajes consecutivos en el mismo centro.
 */
function buildRoute(points) {
  const route = [];
  let lastCommunityId = null;

  for (const p of points) {
    if (p.communityId !== lastCommunityId || p.communityId.startsWith('VIRTUAL')) {
      route.push(p);
      lastCommunityId = p.communityId;
    }
  }

  return route;
}

/**
 * Detecta si un tramo es sospechoso.
 */
function detectarSospechoso(kmEstimados, minutosDesplazamiento, velocidadEstimada) {
  if (velocidadEstimada > 150) return true;
  if (kmEstimados > 0.5 && minutosDesplazamiento < 2) return true;
  if (kmEstimados < 1 && minutosDesplazamiento > 60) return true;
  return false;
}

/**
 * Guarda o actualiza el registro de kilometraje diario.
 */
async function saveMileageRecord(userId, userName, date, dateStr, tramos, totalKm, tramosSospechosos = 0, type = 'auto') {
  const existing = await findExistingRecord(userId, dateStr);

  const data = {
    userId,
    userName,
    date: dateStr,
    dateTimestamp: Timestamp.fromDate(startOfDay(date)),
    totalKm,
    totalTramos: tramos.filter(t => !t.mismoCentro).length,
    tramosSospechosos,
    tramos,
    calculadoEn: serverTimestamp(),
    version: existing ? (existing.version || 0) + 1 : 1,
    type,
  };

  if (existing) {
    await updateDoc(doc(db, COLLECTION, existing.id), data);
    return { id: existing.id, ...data };
  } else {
    const ref = await addDoc(collection(db, COLLECTION), data);
    return { id: ref.id, ...data };
  }
}

/**
 * Guarda un registro de kilometraje manual.
 */
export async function saveManualMileage(userId, userName, date, km) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const tramos = [];
  return await saveMileageRecord(userId, userName, date, dateStr, tramos, parseFloat(km), 0, 'manual');
}

/**
 * Busca un registro existente para un usuario y fecha.
 */
async function findExistingRecord(userId, dateStr) {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('date', '==', dateStr)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/**
 * Recalcula el kilometraje de un día concreto para un operario.
 */
export async function recalculateMileage(userId, date, userName = 'Operario', carSessions = []) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const existing = await findExistingRecord(userId, dateStr);
  if (existing) {
    await deleteDoc(doc(db, COLLECTION, existing.id));
  }
  return await calculateDailyMileage(userId, date, userName, carSessions);
}

/**
 * Obtiene el informe de kilometraje por rango de fechas.
 */
export async function getMileageReport(startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));

  let q;
  if (filters.userId) {
    q = query(
      collection(db, COLLECTION),
      where('userId', '==', filters.userId),
      where('dateTimestamp', '>=', start),
      where('dateTimestamp', '<=', end)
    );
  } else {
    q = query(
      collection(db, COLLECTION),
      where('dateTimestamp', '>=', start),
      where('dateTimestamp', '<=', end)
    );
  }

  const snap = await getDocs(q);
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (filters.communityId) {
    results = results.filter(r => 
      r.type === 'manual' || 
      r.tramos?.some(t => t.origenId === filters.communityId || t.destinoId === filters.communityId)
    );
  }

  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}

export async function getMileageForWeek(userId, startDate, endDate) {
  return getMileageReport(startDate, endDate, { userId });
}

export async function getMileageForMonth(userId, year, month) {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);
  return getMileageReport(startDate, endDate, { userId });
}

export async function recalculateBulk(startDate, endDate, userId, userName, carSessionsByDate = {}) {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const results = [];
  
  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const sessions = carSessionsByDate[dateStr] || [];
    try {
      const result = await recalculateMileage(userId, day, userName, sessions);
      results.push(result);
    } catch (err) {
      console.error(`[Mileage] Error recalculando ${dateStr}:`, err);
    }
  }
  
  return results;
}

/**
 * Obtiene fichajes de "compañeros de equipo" para un día concreto.
 */
async function getRelatedCheckIns(userId, date) {
  try {
    const relatedCheckIns = [];
    
    // 1. CASO: EL USUARIO ES ACOMPAÑANTE
    const qServicesAsCompanion = query(
      collection(db, 'scheduledServices'),
      where('companionIds', 'array-contains', userId)
    );
    const servicesAsCompSnap = await getDocs(qServicesAsCompanion);
    
    const titularIdsFromServices = servicesAsCompSnap.docs
      .filter(d => {
        const svcData = d.data();
        const svcDate = svcData.scheduledDate?.toDate ? svcData.scheduledDate.toDate() : new Date(svcData.scheduledDate);
        return isSameDay(svcDate, date);
      })
      .map(d => d.data().userId);

    const qWorkdaysAsCompanion = query(
      collection(db, 'workdays'),
      where('currentCompanionId', '==', userId)
    );
    const workdaysAsCompSnap = await getDocs(qWorkdaysAsCompanion);
    
    const titularIdsFromWorkdays = workdaysAsCompSnap.docs
      .filter(d => {
        const wdData = d.data();
        const wdDate = wdData.date?.toDate ? wdData.date.toDate() : new Date(wdData.date);
        return isSameDay(wdDate, date);
      })
      .map(d => d.data().userId);

    // 2. CASO: EL USUARIO ES TITULAR (Traer puntos de sus acompañantes por si acaso uno de ellos fichó algo distinto)
    const qServicesAsTitular = query(
      collection(db, 'scheduledServices'),
      where('userId', '==', userId)
    );
    const servicesAsTitSnap = await getDocs(qServicesAsTitular);
    const companionIdsFromServices = [];
    servicesAsTitSnap.docs.forEach(d => {
      const svcData = d.data();
      const svcDate = svcData.scheduledDate?.toDate ? svcData.scheduledDate.toDate() : new Date(svcData.scheduledDate);
      if (isSameDay(svcDate, date) && svcData.companionIds) companionIdsFromServices.push(...svcData.companionIds);
    });

    const qWorkdaysAsTitular = query(
      collection(db, 'workdays'),
      where('userId', '==', userId)
    );
    const workdaysAsTitSnap = await getDocs(qWorkdaysAsTitular);
    const companionIdsFromWorkdays = [];
    workdaysAsTitSnap.docs.forEach(d => {
      const wdData = d.data();
      const wdDate = wdData.date?.toDate ? wdData.date.toDate() : new Date(wdData.date);
      if (isSameDay(wdDate, date) && wdData.currentCompanionId) companionIdsFromWorkdays.push(wdData.currentCompanionId);
    });

    // 3. RECOPILAR TODOS LOS IDS DE "EQUIPO"
    const teamMemberIds = [...new Set([
      ...titularIdsFromServices,
      ...titularIdsFromWorkdays,
      ...companionIdsFromServices,
      ...companionIdsFromWorkdays
    ])].filter(id => id && id !== userId);

    // 4. OBTENER FICHAJES DE TODOS ELLOS
    for (const memberId of teamMemberIds) {
      const memberCheckIns = await getCheckInsForDate(memberId, date);
      relatedCheckIns.push(...memberCheckIns);
    }

    return relatedCheckIns;
  } catch (err) {
    console.error('[Mileage] Error recuperando fichajes relacionados:', err);
    return [];
  }
}
