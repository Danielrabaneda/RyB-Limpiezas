import { 
  collection, doc, addDoc, updateDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCheckInsForDate } from './checkInService';
import { getCommunity } from './communityService';
import { getDistance } from '../utils/geolocation';
import { startOfDay, endOfDay, format, differenceInMinutes, eachDayOfInterval } from 'date-fns';

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
    // 0. Si ya existe un registro MANUAL, no lo sobrescribimos automáticamente (ej: al terminar jornada)
    const existing = await findExistingRecord(userId, dateStr);
    if (existing && (existing.type === 'manual' || (existing.type !== 'auto' && existing.totalKm > 0 && (!existing.tramos || existing.tramos.length === 0)))) {
      console.log(`[Mileage] Saltando cálculo automático para ${dateStr} porque ya existe un registro MANUAL o modificado.`);
      return existing;
    }

    // 1. Calcular migas de pan (breadcrumbs) por si las hay
    const breadcrumbsKm = calculateBreadcrumbsDistance(carSessions);

    // 2. Obtener todos los fichajes del día
    const checkIns = await getCheckInsForDate(userId, date);
    
    const completed = checkIns ? checkIns
      .filter(c => c.checkOutTime !== null && c.checkInTime)
      .sort((a, b) => {
        const timeA = a.checkInTime?.toDate ? a.checkInTime.toDate().getTime() : 0;
        const timeB = b.checkInTime?.toDate ? b.checkInTime.toDate().getTime() : 0;
        return timeA - timeB;
      }) : [];

    if (completed.length < 2) {
      const finalKm = breadcrumbsKm > 0 ? breadcrumbsKm : 0;
      if (breadcrumbsKm > 0) {
        console.log(`[Mileage] Menos de 2 fichajes completados, usando kilometraje de migas de pan: ${finalKm} km`);
      }
      return await saveMileageRecord(userId, userName, date, dateStr, [], finalKm);
    }

    // 3. Filtrar fichajes que caigan dentro de sesiones de coche
    // Si no activó el coche (no hay sesiones), no se calculan kilómetros automáticamente.
    if (carSessions.length === 0) {
      console.log(`[Mileage] No hay sesiones de coche para ${dateStr}. No se contarán kilómetros.`);
      return await saveMileageRecord(userId, userName, date, dateStr, [], 0);
    }

    const relevantCheckIns = filterByCarSessions(completed, carSessions);

    if (relevantCheckIns.length < 2) {
      const finalKm = breadcrumbsKm > 0 ? breadcrumbsKm : 0;
      return await saveMileageRecord(userId, userName, date, dateStr, [], finalKm);
    }

    // 4. Construir la ruta: eliminar fichajes consecutivos en el mismo centro
    const route = buildRoute(relevantCheckIns);

    if (route.length < 2) {
      const finalKm = breadcrumbsKm > 0 ? breadcrumbsKm : 0;
      return await saveMileageRecord(userId, userName, date, dateStr, [], finalKm);
    }

    // 5. Calcular tramos entre centros consecutivos
    const tramos = [];
    let totalKm = 0;
    let tramosSospechosos = 0;

    // Cache de comunidades para no repetir lecturas
    const communityCache = {};

    for (let i = 0; i < route.length - 1; i++) {
      const origen = route[i];
      const destino = route[i + 1];

      // Obtener datos de comunidades
      if (!communityCache[origen.communityId]) {
        communityCache[origen.communityId] = await getCommunity(origen.communityId);
      }
      if (!communityCache[destino.communityId]) {
        communityCache[destino.communityId] = await getCommunity(destino.communityId);
      }

      const commOrigen = communityCache[origen.communityId];
      const commDestino = communityCache[destino.communityId];

      // Coordenadas: usar las del centro de trabajo (más fiables que las del GPS del operario)
      const origenLat = commOrigen?.location?._lat || commOrigen?.location?.latitude || 0;
      const origenLng = commOrigen?.location?._long || commOrigen?.location?.longitude || 0;
      const destinoLat = commDestino?.location?._lat || commDestino?.location?.latitude || 0;
      const destinoLng = commDestino?.location?._long || commDestino?.location?.longitude || 0;

      // Calcular distancia
      const distanciaMetros = getDistance(origenLat, origenLng, destinoLat, destinoLng);
      const kmLineaRecta = Math.round((distanciaMetros / 1000) * 100) / 100;
      const kmEstimados = Math.round(kmLineaRecta * ROAD_FACTOR * 100) / 100;

      // Calcular tiempo de desplazamiento
      const horaSalida = origen.checkOutTime?.toDate ? origen.checkOutTime.toDate() : new Date(origen.checkOutTime);
      const horaLlegada = destino.checkInTime?.toDate ? destino.checkInTime.toDate() : new Date(destino.checkInTime);
      const minutosDesplazamiento = Math.max(0, differenceInMinutes(horaLlegada, horaSalida));

      // Calcular velocidad estimada
      const velocidadEstimada = minutosDesplazamiento > 0 
        ? Math.round((kmEstimados / (minutosDesplazamiento / 60)) * 10) / 10
        : 0;

      // Detectar tramos sospechosos
      const sospechoso = detectarSospechoso(kmEstimados, minutosDesplazamiento, velocidadEstimada);

      // Si es el mismo centro, distancia = 0, ignorar para el total
      const mismoCentro = origen.communityId === destino.communityId;

      const tramo = {
        origenId: origen.communityId,
        origenNombre: commOrigen?.name || 'Desconocido',
        origenCoords: { lat: origenLat, lng: origenLng },
        destinoId: destino.communityId,
        destinoNombre: commDestino?.name || 'Desconocido',
        destinoCoords: { lat: destinoLat, lng: destinoLng },
        horaSalida: Timestamp.fromDate(horaSalida),
        horaLlegada: Timestamp.fromDate(horaLlegada),
        kmLineaRecta: mismoCentro ? 0 : kmLineaRecta,
        kmEstimados: mismoCentro ? 0 : kmEstimados,
        minutosDesplazamiento,
        velocidadEstimada: mismoCentro ? 0 : velocidadEstimada,
        sospechoso: mismoCentro ? false : sospechoso,
        mismoCentro,
      };

      tramos.push(tramo);

      if (!mismoCentro) {
        totalKm += kmEstimados;
        if (sospechoso) tramosSospechosos++;
      }
    }

    // Si hay migas de pan registradas en las sesiones de coche, las usamos para el total
    if (breadcrumbsKm > 0) {
      totalKm = breadcrumbsKm;
      console.log(`[Mileage] Usando kilometraje real de migas de pan (breadcrumbs): ${totalKm} km`);
    } else {
      totalKm = Math.round(totalKm * 100) / 100;
    }

    return await saveMileageRecord(userId, userName, date, dateStr, tramos, totalKm, tramosSospechosos);

  } catch (error) {
    console.error('[Mileage] Error calculando kilometraje:', error);
    throw error;
  }
}

/**
 * Filtra fichajes que caigan dentro de alguna sesión de coche.
 */
function filterByCarSessions(checkIns, carSessions) {
  return checkIns.filter(ci => {
    const ciTime = ci.checkInTime?.toDate ? ci.checkInTime.toDate().getTime() : 0;
    return carSessions.some(session => {
      const sessionStart = session.startTime?.toDate 
        ? session.startTime.toDate().getTime() 
        : new Date(session.startTime).getTime();
      const sessionEnd = session.endTime 
        ? (session.endTime?.toDate ? session.endTime.toDate().getTime() : new Date(session.endTime).getTime())
        : Date.now(); // Si la sesión sigue activa, usar ahora
      return ciTime >= sessionStart && ciTime <= sessionEnd;
    });
  });
}

/**
 * Construye la ruta eliminando fichajes consecutivos en el mismo centro.
 * Mantiene el primero de cada grupo consecutivo.
 */
function buildRoute(checkIns) {
  const route = [];
  let lastCommunityId = null;

  for (const ci of checkIns) {
    if (ci.communityId !== lastCommunityId) {
      route.push(ci);
      lastCommunityId = ci.communityId;
    }
  }

  return route;
}

/**
 * Detecta si un tramo es sospechoso.
 */
function detectarSospechoso(kmEstimados, minutosDesplazamiento, velocidadEstimada) {
  // Velocidad imposible (> 150 km/h)
  if (velocidadEstimada > 150) return true;
  
  // Teletransporte: distancia significativa en muy poco tiempo
  if (kmEstimados > 0.5 && minutosDesplazamiento < 2) return true;
  
  // Parada no registrada: poca distancia con mucho tiempo
  if (kmEstimados < 1 && minutosDesplazamiento > 60) return true;

  return false;
}

/**
 * Guarda o actualiza el registro de kilometraje diario.
 */
async function saveMileageRecord(userId, userName, date, dateStr, tramos, totalKm, tramosSospechosos = 0, type = 'auto') {
  // Buscar si ya existe un registro para este usuario/fecha
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
    type, // 'auto' o 'manual'
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
  
  // Para registros manuales, no hay tramos
  const tramos = [];
  const tramosSospechosos = 0;
  
  return await saveMileageRecord(
    userId, 
    userName, 
    date, 
    dateStr, 
    tramos, 
    parseFloat(km), 
    tramosSospechosos, 
    'manual'
  );
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
  // Borra registro existente
  const dateStr = format(date, 'yyyy-MM-dd');
  const existing = await findExistingRecord(userId, dateStr);
  if (existing) {
    await deleteDoc(doc(db, COLLECTION, existing.id));
  }
  // Recalcular
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

  // Filtro por comunidad en memoria
  if (filters.communityId) {
    results = results.filter(r => 
      r.type === 'manual' || 
      r.tramos?.some(t => 
        t.origenId === filters.communityId || t.destinoId === filters.communityId
      )
    );
  }

  // Ordenar por fecha desc
  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}

/**
 * Recalcula el kilometraje en bloque para un rango de fechas.
 */
export async function recalculateBulk(startDate, endDate, userId, userName, carSessionsByDate = {}) {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const results = [];
  
  for (const day of days) {
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
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
