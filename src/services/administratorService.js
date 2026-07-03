import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'administrators';

export async function getAdministrators() {
  const q = query(collection(db, COLLECTION), where('active', '==', true), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createAdministrator(data) {
  const docData = {
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    contactPerson: data.contactPerson || '',
    active: true,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTION), docData);
  return { id: ref.id, ...docData };
}

export async function updateAdministrator(id, data) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    name: data.name,
    email: data.email,
    phone: data.phone,
    contactPerson: data.contactPerson,
    updatedAt: serverTimestamp()
  });
}

export async function deleteAdministrator(id) {
  const ref = doc(db, COLLECTION, id);
  // Soft delete: set active to false
  await updateDoc(ref, {
    active: false,
    updatedAt: serverTimestamp()
  });
}
