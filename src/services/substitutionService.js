import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getOperarios } from './authService';
import { checkUserAbsenceForDate } from './absenceService';
import { getDistance } from '../utils/geolocation';

/**
 * Busca y sugiere operarios sustitutos disponibles para un servicio afectado en una fecha.
 * 
 * @param {string} serviceId - ID del servicio programado que necesita cobertura.
 * @param {Date} date - Fecha en la que se realiza la sustitución.
 * @returns {Promise<Array>} Lista de operarios candidatos ordenados por distancia al servicio.
 */
export async function findSubstitutesForService({ serviceId, date }) {
  // 1. Obtener detalles del servicio afectado
  const serviceSnap = await getDoc(doc(db, 'scheduledServices', serviceId));
  if (!serviceSnap.exists()) {
    throw new Error('Servicio no encontrado');
  }
  const serviceData = serviceSnap.data();
  const communityId = serviceData.communityId;

  // 2. Obtener la ubicación de la comunidad
  const communitySnap = await getDoc(doc(db, 'communities', communityId));
  if (!communitySnap.exists()) {
    throw new Error('Comunidad asociada no encontrada');
  }
  const communityData = communitySnap.data();
  const location = communityData.location;
  if (!location) {
    throw new Error('La comunidad afectada no tiene coordenadas de geolocalización registradas.');
  }

  const targetLat = location._lat || location.latitude;
  const targetLng = location._long || location.longitude;

  // 3. Obtener todos los operarios habilitados
  const operarios = await getOperarios();

  // 4. Filtrar candidatos disponibles
  const candidates = [];

  for (const op of operarios) {
    // A. Ignorar al mismo operario que ya estaba asignado
    if (op.uid === serviceData.assignedUserId) continue;

    // B. Comprobar si el candidato está ausente o de baja en esta fecha
    const isAbsent = await checkUserAbsenceForDate(op.uid, date);
    if (isAbsent) continue;

    // C. Comprobar si ya tiene otro servicio asignado en el mismo rango de hora (colisión horaria)
    // Para simplificar, buscamos si tiene servicios el mismo día
    const dateStr = date.toISOString().split('T')[0];
    const collisionQuery = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', op.uid),
      where('date', '==', dateStr),
      where('status', 'in', ['pending', 'in_progress'])
    );
    const collisionSnap = await getDocs(collisionQuery);
    
    // Si queremos verificar colisiones de franja horaria más precisas, comparamos las horas:
    const preferredTime = communityData.preferredTime || null;
    let hasTimeConflict = false;

    if (preferredTime) {
      for (const d of collisionSnap.docs) {
        const otherSvc = d.data();
        // Obtener detalles de la otra comunidad para saber su hora preferida
        const otherCommSnap = await getDoc(doc(db, 'communities', otherSvc.communityId));
        if (otherCommSnap.exists()) {
          const otherComm = otherCommSnap.data();
          if (otherComm.preferredTime === preferredTime) {
            hasTimeConflict = true;
            break;
          }
        }
      }
    }

    if (hasTimeConflict) continue;

    // D. Obtener última ubicación GPS del operario (o usar una ubicación base)
    // Consultamos su registro de check-in activo o su último check-in
    let opLat = null;
    let opLng = null;

    const activeCheckInQuery = query(
      collection(db, 'checkIns'),
      where('userId', '==', op.uid),
      where('status', '==', 'active')
    );
    const activeCheckInSnap = await getDocs(activeCheckInQuery);

    if (!activeCheckInSnap.empty) {
      const activeCheckIn = activeCheckInSnap.docs[0].data();
      const activeCommSnap = await getDoc(doc(db, 'communities', activeCheckIn.communityId));
      if (activeCommSnap.exists() && activeCommSnap.data().location) {
        const loc = activeCommSnap.data().location;
        opLat = loc._lat || loc.latitude;
        opLng = loc._long || loc.longitude;
      }
    }

    // Si no está haciendo un servicio ahora, buscamos la ubicación de su primer servicio del día
    if ((opLat === null || opLng === null) && !collisionSnap.empty) {
      const firstSvc = collisionSnap.docs[0].data();
      const firstCommSnap = await getDoc(doc(db, 'communities', firstSvc.communityId));
      if (firstCommSnap.exists() && firstCommSnap.data().location) {
        const loc = firstCommSnap.data().location;
        opLat = loc._lat || loc.latitude;
        opLng = loc._long || loc.longitude;
      }
    }

    // E. Calcular distancia al servicio
    let distance = null;
    if (opLat !== null && opLng !== null) {
      distance = getDistance(opLat, opLng, targetLat, targetLng); // en metros
    }

    candidates.push({
      ...op,
      distance, // en metros, o null si no se puede estimar
      distanceKm: distance !== null ? (distance / 1000).toFixed(1) : '—'
    });
  }

  // 5. Ordenar candidatos: primero los que tienen ubicación estimada más cercana, luego el resto
  candidates.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });

  return candidates;
}
