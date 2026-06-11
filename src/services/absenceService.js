import { 
  collection, doc, addDoc, getDocs, query, where, updateDoc, 
  serverTimestamp, limit, getDoc 
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Solicita una nueva ausencia o baja médica (Operario).
 */
export async function requestAbsence({ userId, userName, type, startDate, endDate, reason = '', docUrl = '' }) {
  const absenceRef = collection(db, 'absences');
  const docData = {
    userId,
    userName,
    type, // 'vacation' | 'sick_leave' | 'personal_day'
    startDate: startDate instanceof Date ? startDate : new Date(startDate),
    endDate: endDate instanceof Date ? endDate : new Date(endDate),
    reason,
    docUrl, // Enlace a foto en Storage si aplica (justificante)
    status: 'pending',
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(absenceRef, docData);
  return { id: docRef.id, ...docData };
}

/**
 * Aprueba una ausencia solicitada (Admin).
 */
export async function approveAbsence(absenceId, adminId) {
  const ref = doc(db, 'absences', absenceId);
  await updateDoc(ref, {
    status: 'approved',
    resolvedBy: adminId,
    resolvedAt: serverTimestamp()
  });
}

/**
 * Rechaza una ausencia solicitada (Admin).
 */
export async function rejectAbsence(absenceId, adminId) {
  const ref = doc(db, 'absences', absenceId);
  await updateDoc(ref, {
    status: 'rejected',
    resolvedBy: adminId,
    resolvedAt: serverTimestamp()
  });
}

/**
 * Obtiene todas las solicitudes de ausencia pendientes.
 */
export async function getPendingAbsences() {
  const q = query(collection(db, 'absences'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Obtiene todas las solicitudes de ausencia de un usuario.
 */
export async function getUserAbsences(userId) {
  const q = query(collection(db, 'absences'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Comprueba si un operario tiene una ausencia aprobada para una fecha específica.
 * @param {string} userId - ID del operario.
 * @param {Date} date - Fecha a validar.
 * @returns {Promise<boolean>} True si el operario está de baja/vacaciones en esa fecha.
 */
export async function checkUserAbsenceForDate(userId, date) {
  const q = query(
    collection(db, 'absences'), 
    where('userId', '==', userId), 
    where('status', '==', 'approved')
  );
  const snap = await getDocs(q);
  const checkTime = date.getTime();

  for (const d of snap.docs) {
    const data = d.data();
    const start = data.startDate?.toDate ? data.startDate.toDate().getTime() : new Date(data.startDate).getTime();
    const end = data.endDate?.toDate ? data.endDate.toDate().getTime() : new Date(data.endDate).getTime();
    
    // Normalizar a fechas sin hora para la comprobación diaria
    const startDateNormalized = new Date(start).setHours(0,0,0,0);
    const endDateNormalized = new Date(end).setHours(23,59,59,999);
    
    if (checkTime >= startDateNormalized && checkTime <= endDateNormalized) {
      return true;
    }
  }
  return false;
}

/**
 * Obtiene todas las solicitudes de ausencia (Admin).
 */
export async function getAllAbsences() {
  const q = query(collection(db, 'absences'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
