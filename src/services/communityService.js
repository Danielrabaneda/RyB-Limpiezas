import {
  collection,
  doc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  GeoPoint,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import {
  deleteScheduledServicesByCommunity,
} from "./scheduleService";

const COLLECTION = "communities";

export async function createCommunity(companyId, data) {
  if (!companyId) throw new Error("No hay una empresa activa.");
  try {
    const result = await httpsCallable(functions, "createTenantCommunity")({
      community: {
        ...data,
        basePrice: parseFloat(data.basePrice) || 0,
        individualTimeTracking: !!data.individualTimeTracking,
        active: true,
      },
    });
    return { id: result.data.id, ...data, active: true };
  } catch (error) {
    if (error?.code === "functions/not-found") {
      throw new Error(
        "El servicio para crear comunidades no está disponible. Contacta con soporte.",
      );
    }
    throw error;
  }
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

export async function pauseCommunity(companyId, id) {
  // La pausa conserva el historial, las facturas y la configuracion.
  await updateDoc(tenantDoc(db, companyId, COLLECTION, id), {
    active: false,
    pausedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

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
  const allDocs = [...tasksSnap.docs, ...assignSnap.docs].filter(
    (document) => document.data().active !== false,
  );
  const CHUNK_SIZE = 400;
  for (let i = 0; i < allDocs.length; i += CHUNK_SIZE) {
    const chunk = allDocs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) =>
      batch.update(d.ref, {
        active: false,
        pausedByCommunity: true,
        updatedAt: serverTimestamp(),
      }),
    );
    await batch.commit();
  }
}

export async function reactivateCommunity(companyId, id) {
  const tasksQ = query(
    tenantCollection(db, companyId, "communityTasks"),
    where("communityId", "==", id),
  );
  const assignQ = query(
    tenantCollection(db, companyId, "assignments"),
    where("communityId", "==", id),
  );
  const [tasksSnap, assignSnap] = await Promise.all([
    getDocs(tasksQ),
    getDocs(assignQ),
  ]);
  const pausedDocs = [...tasksSnap.docs, ...assignSnap.docs].filter(
    (document) => document.data().pausedByCommunity === true,
  );

  const CHUNK_SIZE = 400;
  for (let i = 0; i < pausedDocs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    pausedDocs.slice(i, i + CHUNK_SIZE).forEach((document) =>
      batch.update(document.ref, {
        active: true,
        pausedByCommunity: false,
        updatedAt: serverTimestamp(),
      }),
    );
    await batch.commit();
  }

  await updateDoc(tenantDoc(db, companyId, COLLECTION, id), {
    active: true,
    pausedAt: null,
    reactivatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

}

export async function archiveCommunity(companyId, id) {
  await pauseCommunity(companyId, id);
  await updateDoc(tenantDoc(db, companyId, COLLECTION, id), {
    active: false,
    archived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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

export async function getCommunitiesForAdmin(companyId) {
  const q = query(
    tenantCollection(db, companyId, COLLECTION),
    orderBy("name"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (community) =>
        community.archived !== true &&
        (community.active !== false || Boolean(community.pausedAt)),
    );
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
