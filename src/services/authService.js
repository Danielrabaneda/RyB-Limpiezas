import { 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updatePassword
} from 'firebase/auth';
import { 
  doc, setDoc, getDocs, deleteDoc, collection, query, where, 
  updateDoc, serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export async function createAdminUser(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const profile = {
    uid: cred.user.uid,
    name,
    email,
    phone: '',
    role: 'admin',
    active: true,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', cred.user.uid), profile);
  return profile;
}

export async function getOperarios() {
  const q = query(collection(db, 'users'), where('role', '==', 'operario'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
}

export async function toggleUserActive(uid, active) {
  await updateDoc(doc(db, 'users', uid), { active });
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Elimina un operario: borra su documento de usuario y limpia datos asociados.
 * - Desactiva asignaciones de comunidades
 * - Elimina servicios programados pendientes
 * - Nota: NO elimina el usuario de Firebase Auth (requeriría Admin SDK)
 */
/**
 * Elimina un operario de forma selectiva.
 * @param {string} uid - ID del usuario.
 * @param {Object} options - Opciones de borrado.
 * @param {boolean} options.deleteHistory - Si true, borra fichajes y jornadas pasadas.
 * @param {boolean} options.deleteMaterials - Si true, borra sus solicitudes de materiales.
 * @param {boolean} options.deleteReports - Si true, borra sus informes enviados.
 */
export async function deleteOperario(uid, options = {}) {
  const batch = writeBatch(db);

  // 1. SIEMPRE: Desactivar/Eliminar asignaciones actuales (imprescindible)
  const assignQ = query(collection(db, 'assignments'), where('userId', '==', uid));
  const assignSnap = await getDocs(assignQ);
  assignSnap.docs.forEach(d => batch.delete(d.ref));

  // 2. SIEMPRE: Eliminar servicios programados PENDIENTES
  const svcQ = query(
    collection(db, 'scheduledServices'),
    where('assignedUserId', '==', uid),
    where('status', '==', 'pending')
  );
  const svcSnap = await getDocs(svcQ);
  svcSnap.docs.forEach(d => batch.delete(d.ref));

  // 3. SIEMPRE: Eliminar notificaciones y traspasos pendientes
  const notifQ = query(collection(db, 'systemNotifications'), where('userId', '==', uid));
  const notifSnap = await getDocs(notifQ);
  notifSnap.docs.forEach(d => batch.delete(d.ref));

  const transFromQ = query(collection(db, 'transfers'), where('fromUserId', '==', uid), where('status', '==', 'pending'));
  const transToQ = query(collection(db, 'transfers'), where('toUserId', '==', uid), where('status', '==', 'pending'));
  const [transFromSnap, transToSnap] = await Promise.all([getDocs(transFromQ), getDocs(transToQ)]);
  transFromSnap.docs.forEach(d => batch.delete(d.ref));
  transToSnap.docs.forEach(d => batch.delete(d.ref));

  // 4. OPCIONAL: Borrar historial de fichajes y jornadas
  if (options.deleteHistory) {
    const checkInQ = query(collection(db, 'checkIns'), where('userId', '==', uid));
    const workdayQ = query(collection(db, 'workdays'), where('userId', '==', uid));
    const mileageQ = query(collection(db, 'mileage'), where('userId', '==', uid));
    
    const [cSnap, wSnap, mSnap] = await Promise.all([
      getDocs(checkInQ), 
      getDocs(workdayQ),
      getDocs(mileageQ)
    ]);
    
    cSnap.docs.forEach(d => batch.delete(d.ref));
    wSnap.docs.forEach(d => batch.delete(d.ref));
    mSnap.docs.forEach(d => batch.delete(d.ref));
  }

  // 5. OPCIONAL: Borrar solicitudes de materiales
  if (options.deleteMaterials) {
    const matQ = query(collection(db, 'materialRequests'), where('userId', '==', uid));
    const matSnap = await getDocs(matQ);
    matSnap.docs.forEach(d => batch.delete(d.ref));
  }

  // 6. OPCIONAL: Borrar informes
  if (options.deleteReports) {
    const repQ = query(collection(db, 'reports'), where('userId', '==', uid));
    const repSnap = await getDocs(repQ);
    repSnap.docs.forEach(d => batch.delete(d.ref));
  }

  // 7. FINALMENTE: Eliminar documento de usuario
  batch.delete(doc(db, 'users', uid));

  await batch.commit();
}
