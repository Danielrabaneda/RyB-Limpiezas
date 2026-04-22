import { 
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp, GeoPoint, writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { deleteScheduledServicesByCommunity } from './scheduleService';

const COLLECTION = 'communities';

export async function createCommunity(data) {
  const docData = {
    name: data.name,
    address: data.address,
    location: new GeoPoint(data.lat || 0, data.lng || 0),
    type: data.type || 'comunidad',
    contactPerson: data.contactPerson || '',
    contactPhone: data.contactPhone || '',
    active: true,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), docData);
  return { id: ref.id, ...docData };
}

export async function updateCommunity(id, data) {
  const updateData = { ...data, updatedAt: serverTimestamp() };
  if (data.lat !== undefined && data.lng !== undefined) {
    updateData.location = new GeoPoint(data.lat, data.lng);
    delete updateData.lat;
    delete updateData.lng;
  }
  await updateDoc(doc(db, COLLECTION, id), updateData);
}

export async function deleteCommunity(id) {
  // 1. Inactivar la comunidad
  await updateDoc(doc(db, COLLECTION, id), { active: false });
  
  // 2. Eliminar servicios programados pendientes
  await deleteScheduledServicesByCommunity(id);

  // 3. Inactivar tareas de esta comunidad (para que el generador no las use)
  const tasksQ = query(collection(db, 'communityTasks'), where('communityId', '==', id));
  const tasksSnap = await getDocs(tasksQ);
  const batch = writeBatch(db);
  tasksSnap.docs.forEach(d => batch.update(d.ref, { active: false }));
  
  // 4. Inactivar asignaciones de esta comunidad
  const assignQ = query(collection(db, 'assignments'), where('communityId', '==', id));
  const assignSnap = await getDocs(assignQ);
  assignSnap.docs.forEach(d => batch.update(d.ref, { active: false }));

  await batch.commit();
}

export async function getCommunities() {
  const q = query(collection(db, COLLECTION), where('active', '==', true), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCommunity(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCommunitiesForOperario(userId) {
  const assignQ = query(
    collection(db, 'assignments'), 
    where('userId', '==', userId),
    where('active', '==', true)
  );
  const assignSnap = await getDocs(assignQ);
  const communityIds = assignSnap.docs.map(d => d.data().communityId);
  
  if (communityIds.length === 0) return [];
  
  const communities = [];
  for (const cId of communityIds) {
    const comm = await getCommunity(cId);
    if (comm && comm.active) communities.push(comm);
  }
  return communities;
}
