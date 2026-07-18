import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  GeoPoint,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import { deleteScheduledServicesByCommunity } from "./scheduleService";

const COLLECTION = "communities";

export async function createCommunity(companyId, data) {
  const docData = {
    name: data.name,
    address: data.address,
    location: new GeoPoint(data.lat || 0, data.lng || 0),
    type: data.type || "comunidad",
    contactPerson: data.contactPerson || "",
    contactPhone: data.contactPhone || "",
    preferredTime: data.preferredTime || null,
    individualTimeTracking: !!data.individualTimeTracking,
    billingCif: data.billingCif || "",
    billingAddress: data.billingAddress || "",
    basePrice: parseFloat(data.basePrice) || 0,
    paymentMethod: data.paymentMethod || "transferencia",
    billingEmail: data.billingEmail || "",
    billingIban: data.billingIban || "",
    billingMandateRef: data.billingMandateRef || "",
    billingMandateDate: data.billingMandateDate || "",
    administratorId: data.administratorId || "",
    active: true,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(tenantCollection(db, companyId, COLLECTION), docData);
  return { id: ref.id, ...docData };
}

export async function updateCommunity(companyId, id, data) {
  const updateData = { ...data, updatedAt: serverTimestamp() };
  if (data.lat !== undefined && data.lng !== undefined) {
    updateData.location = new GeoPoint(data.lat, data.lng);
    delete updateData.lat;
    delete updateData.lng;
  }
  await updateDoc(tenantDoc(db, companyId, COLLECTION, id), updateData);
}

export async function deleteCommunity(companyId, id) {
  // 1. Inactivar la comunidad
  await updateDoc(tenantDoc(db, companyId, COLLECTION, id), { active: false });

  // 2. Eliminar servicios programados pendientes
  await deleteScheduledServicesByCommunity(companyId, id);

  // 3. Inactivar tareas de esta comunidad (para que el generador no las use)
  const tasksQ = query(
    tenantCollection(db, companyId, "communityTasks"),
    where("communityId", "==", id),
  );
  const tasksSnap = await getDocs(tasksQ);

  // 4. Inactivar asignaciones de esta comunidad
  const assignQ = query(
    tenantCollection(db, companyId, "assignments"),
    where("communityId", "==", id),
  );
  const assignSnap = await getDocs(assignQ);

  // Actualizar todo en lotes de 400 para evitar los límites de Firestore writeBatch
  const allDocs = [...tasksSnap.docs, ...assignSnap.docs];
  const CHUNK_SIZE = 400;
  for (let i = 0; i < allDocs.length; i += CHUNK_SIZE) {
    const chunk = allDocs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.update(d.ref, { active: false }));
    await batch.commit();
  }
}

export async function getCommunities(companyId) {
  const q = query(
    tenantCollection(db, companyId, COLLECTION),
    where("active", "==", true),
    orderBy("name"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCommunity(companyId, id) {
  const snap = await getDoc(tenantDoc(db, companyId, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCommunitiesForOperario(companyId, userId) {
  const assignQ = query(
    tenantCollection(db, companyId, "assignments"),
    where("userId", "==", userId),
    where("active", "==", true),
  );
  const assignSnap = await getDocs(assignQ);
  const communityIds = assignSnap.docs.map((d) => d.data().communityId);

  if (communityIds.length === 0) return [];

  const communities = [];
  for (const cId of communityIds) {
    const comm = await getCommunity(companyId, cId);
    if (comm && comm.active) communities.push(comm);
  }
  return communities;
}
