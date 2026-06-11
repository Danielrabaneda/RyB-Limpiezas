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
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === 'operario' || u.isOperario === true);
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
 * Elimina un operario de forma selectiva.
 * Usa chunking de batch para soportar >500 documentos (límite de Firestore).
 * @param {string} uid - ID del usuario.
 * @param {Object} options - Opciones de borrado.
 * @param {boolean} options.deleteHistory - Si true, borra fichajes y jornadas pasadas.
 * @param {boolean} options.deleteMaterials - Si true, borra sus solicitudes de materiales.
 * @param {boolean} options.deleteReports - Si true, borra sus informes enviados.
 */
export async function deleteOperario(uid, options = {}) {
  const BATCH_LIMIT = 500;
  const refsToDelete = [];

  // 1. SIEMPRE: Eliminar asignaciones
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('userId', '==', uid)));
  assignSnap.docs.forEach(d => refsToDelete.push(d.ref));

  // 2. SIEMPRE: Eliminar servicios programados PENDIENTES
  const svcSnap = await getDocs(query(
    collection(db, 'scheduledServices'),
    where('assignedUserId', '==', uid),
    where('status', '==', 'pending')
  ));
  svcSnap.docs.forEach(d => refsToDelete.push(d.ref));

  // 3. SIEMPRE: Eliminar notificaciones y traspasos pendientes
  const notifSnap = await getDocs(query(collection(db, 'systemNotifications'), where('userId', '==', uid)));
  notifSnap.docs.forEach(d => refsToDelete.push(d.ref));

  const transFromSnap = await getDocs(query(collection(db, 'transfers'), where('fromUserId', '==', uid), where('status', '==', 'pending')));
  const transToSnap = await getDocs(query(collection(db, 'transfers'), where('toUserId', '==', uid), where('status', '==', 'pending')));
  transFromSnap.docs.forEach(d => refsToDelete.push(d.ref));
  transToSnap.docs.forEach(d => refsToDelete.push(d.ref));

  // 4. OPCIONAL: Borrar historial de fichajes y jornadas
  if (options.deleteHistory) {
    const [cSnap, wSnap, mSnap] = await Promise.all([
      getDocs(query(collection(db, 'checkIns'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'workdays'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'mileage'), where('userId', '==', uid))),
    ]);
    cSnap.docs.forEach(d => refsToDelete.push(d.ref));
    wSnap.docs.forEach(d => refsToDelete.push(d.ref));
    mSnap.docs.forEach(d => refsToDelete.push(d.ref));
  }

  // 5. OPCIONAL: Borrar solicitudes de materiales
  if (options.deleteMaterials) {
    const matSnap = await getDocs(query(collection(db, 'materialRequests'), where('userId', '==', uid)));
    matSnap.docs.forEach(d => refsToDelete.push(d.ref));
  }

  // 6. OPCIONAL: Borrar informes
  if (options.deleteReports) {
    const repSnap = await getDocs(query(collection(db, 'reports'), where('userId', '==', uid)));
    repSnap.docs.forEach(d => refsToDelete.push(d.ref));
  }

  // 7. FINALMENTE: Eliminar documento de usuario
  refsToDelete.push(doc(db, 'users', uid));

  // Commit en bloques de 500 (límite de Firestore)
  for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}
