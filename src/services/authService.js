import { 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updatePassword
} from 'firebase/auth';
import { 
  doc, setDoc, getDocs, collection, query, where, 
  updateDoc, serverTimestamp 
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
