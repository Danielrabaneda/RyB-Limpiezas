import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

/** La función del servidor genera y guarda el enlace sin exponer su registro. */
export async function enableClientPortal(_companyId, communityId) {
  const result = await httpsCallable(functions, "createClientPortalAccess")({ communityId });
  return result.data;
}

/** Recupera el enlace vigente para volver a mostrar o imprimir el mismo QR. */
export async function getClientPortalAccess(communityId) {
  const result = await httpsCallable(functions, "getClientPortalAccess")({ communityId });
  return result.data;
}

/** Consulta las visualizaciones del portal de esta comunidad durante el mes actual. */
export async function getClientPortalStats(communityId) {
  const result = await httpsCallable(functions, "getClientPortalStats")({ communityId });
  return result.data;
}

/**
 * Desactiva el portal de cliente de una comunidad, revocando el acceso.
 */
export async function disableClientPortal(_companyId, communityId) {
  const result = await httpsCallable(functions, "revokeClientPortalAccess")({ communityId });
  return result.data;
}

/**
 * Valida un token de portal público y devuelve la información de la comunidad.
 * TODO: Deprecated in favor of the Cloud Function `getClientPortalDataCallable`.
 */
export async function getCommunityByPortalToken(token) {
  if (!token) return null;

  const portalSnap = await getDoc(doc(db, "publicPortals", token));
  if (!portalSnap.exists() || !portalSnap.data().isActive) {
    return null;
  }

  const { communityId } = portalSnap.data();
  const communitySnap = await getDoc(doc(db, "communities", communityId));

  if (!communitySnap.exists() || !communitySnap.data().active) {
    return null;
  }

  return {
    id: communitySnap.id,
    ...communitySnap.data(),
  };
}

/**
 * Obtiene la lista de IDs de comunidades asignadas a una cuenta de cliente.
 *
 * @param {string} clientId - ID del usuario cliente en Firestore.
 * @returns {Promise<Array<string>>} Array de IDs de comunidades.
 */
export async function getClientAssignedCommunities(clientId) {
  const clientSnap = await getDoc(doc(db, "users", clientId));
  if (!clientSnap.exists()) {
    return [];
  }
  const data = clientSnap.data();
  return data.assignedCommunities || [];
}

/**
 * Obtiene el histórico de servicios completados y reportados de las comunidades del cliente (limitado a los últimos 30 días).
 *
 * @param {Array<string>} communityIds - Lista de comunidades a consultar.
 * @returns {Promise<Array>} Listado de servicios reportados filtrados.
 */
export async function getClientReports(companyId, communityIds) {
  if (!communityIds || communityIds.length === 0) return [];

  const CHUNK_LIMIT = 10;
  const reports = [];

  for (let i = 0; i < communityIds.length; i += CHUNK_LIMIT) {
    const chunk = communityIds.slice(i, i + CHUNK_LIMIT);
    let q;
    if (chunk.length === 1) {
      q = query(
        tenantCollection(db, companyId, "checkIns"),
        where("communityId", "==", chunk[0]),
        orderBy("checkInTime", "desc"),
        limit(10),
      );
    } else {
      q = query(
        tenantCollection(db, companyId, "checkIns"),
        where("communityId", "in", chunk),
        orderBy("checkInTime", "desc"),
        limit(10),
      );
    }
    const snap = await getDocs(q);
    snap.docs.forEach((d) => reports.push({ id: d.id, ...d.data() }));
  }

  // Filtrar en memoria a los últimos 30 días
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const limitTime = thirtyDaysAgo.getTime();

  const filteredReports = reports.filter((r) => {
    const timestamp = r.checkInTime || r.createdAt;
    const time = timestamp?.toDate
      ? timestamp.toDate().getTime()
      : new Date(timestamp).getTime();
    return time >= limitTime;
  });

  // Enriquecer reportes con los nombres de las comunidades
  for (const rep of filteredReports) {
    try {
      const commSnap = await getDoc(tenantDoc(db, companyId, "communities", rep.communityId));
      if (commSnap.exists()) {
        rep.communityName = commSnap.data().name;
      }
    } catch (e) {
      rep.communityName = "Comunidad";
    }
  }

  return filteredReports;
}

/**
 * Obtiene el carrusel de evidencias fotográficas de las comunidades del cliente.
 *
 * @param {Array<string>} communityIds - Lista de comunidades a consultar.
 * @returns {Promise<Array>} Listado de reportes de evidencias.
 */
export async function getClientEvidence(companyId, communityIds) {
  if (!communityIds || communityIds.length === 0) return [];

  const CHUNK_LIMIT = 10;
  const evidences = [];

  for (let i = 0; i < communityIds.length; i += CHUNK_LIMIT) {
    const chunk = communityIds.slice(i, i + CHUNK_LIMIT);
    let q;
    if (chunk.length === 1) {
      q = query(
        tenantCollection(db, companyId, "evidenceReports"),
        where("communityId", "==", chunk[0]),
        orderBy("createdAt", "desc"),
        limit(10),
      );
    } else {
      q = query(
        tenantCollection(db, companyId, "evidenceReports"),
        where("communityId", "in", chunk),
        orderBy("createdAt", "desc"),
        limit(10),
      );
    }
    const snap = await getDocs(q);
    snap.docs.forEach((d) => evidences.push({ id: d.id, ...d.data() }));
  }

  // Filtrar en memoria a los últimos 30 días
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const limitTime = thirtyDaysAgo.getTime();

  const filteredEvidences = evidences.filter((e) => {
    const time = e.createdAt?.toDate
      ? e.createdAt.toDate().getTime()
      : new Date(e.createdAt).getTime();
    return time >= limitTime;
  });

  return filteredEvidences;
}

/**
 * Llama a la Cloud Function getClientPortalData de forma segura para obtener
 * toda la información consolidada del portal público.
 */
export async function getClientPortalDataCallable(token) {
  const getPortalData = httpsCallable(functions, "getClientPortalData");
  const res = await getPortalData({ token });
  return res.data;
}
