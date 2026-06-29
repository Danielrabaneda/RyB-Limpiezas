import { 
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  writeBatch, serverTimestamp, deleteDoc, setDoc, updateDoc, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Genera un token aleatorio seguro de 32 caracteres alfanuméricos.
 */
function generatePortalToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < 32; i++) {
    token += chars[array[i] % chars.length];
  }
  return token;
}

/**
 * Activa el portal de cliente para una comunidad, generando un token único.
 */
export async function enableClientPortal(communityId) {
  const token = generatePortalToken();
  const batch = writeBatch(db);

  // 1. Actualizar comunidad con el token
  const communityRef = doc(db, 'communities', communityId);
  batch.update(communityRef, {
    portalToken: token,
    portalTokenCreatedAt: serverTimestamp()
  });

  // 2. Crear documento validador en publicPortals
  const portalRef = doc(db, 'publicPortals', token);
  batch.set(portalRef, {
    communityId,
    isActive: true,
    createdAt: serverTimestamp()
  });

  await batch.commit();
  return token;
}

/**
 * Desactiva el portal de cliente de una comunidad, revocando el acceso.
 */
export async function disableClientPortal(communityId, currentToken) {
  const batch = writeBatch(db);

  // 1. Limpiar token en la comunidad
  const communityRef = doc(db, 'communities', communityId);
  batch.update(communityRef, {
    portalToken: null,
    portalTokenCreatedAt: null
  });

  // 2. Eliminar el documento validador
  if (currentToken) {
    const portalRef = doc(db, 'publicPortals', currentToken);
    batch.delete(portalRef);
  }

  await batch.commit();
}

/**
 * Valida un token de portal público y devuelve la información de la comunidad.
 */
export async function getCommunityByPortalToken(token) {
  if (!token) return null;
  
  const portalSnap = await getDoc(doc(db, 'publicPortals', token));
  if (!portalSnap.exists() || !portalSnap.data().isActive) {
    return null;
  }

  const { communityId } = portalSnap.data();
  const communitySnap = await getDoc(doc(db, 'communities', communityId));
  
  if (!communitySnap.exists() || !communitySnap.data().active) {
    return null;
  }

  return {
    id: communitySnap.id,
    ...communitySnap.data()
  };
}

/**
 * Obtiene la lista de IDs de comunidades asignadas a una cuenta de cliente.
 * 
 * @param {string} clientId - ID del usuario cliente en Firestore.
 * @returns {Promise<Array<string>>} Array de IDs de comunidades.
 */
export async function getClientAssignedCommunities(clientId) {
  const clientSnap = await getDoc(doc(db, 'users', clientId));
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
export async function getClientReports(communityIds) {
  if (!communityIds || communityIds.length === 0) return [];

  const CHUNK_LIMIT = 10;
  const reports = [];

  for (let i = 0; i < communityIds.length; i += CHUNK_LIMIT) {
    const chunk = communityIds.slice(i, i + CHUNK_LIMIT);
    let q;
    if (chunk.length === 1) {
      q = query(
        collection(db, 'checkIns'),
        where('communityId', '==', chunk[0]),
        orderBy('checkInTime', 'desc'),
        limit(10)
      );
    } else {
      q = query(
        collection(db, 'checkIns'),
        where('communityId', 'in', chunk),
        orderBy('checkInTime', 'desc'),
        limit(10)
      );
    }
    const snap = await getDocs(q);
    snap.docs.forEach(d => reports.push({ id: d.id, ...d.data() }));
  }

  // Filtrar en memoria a los últimos 30 días
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const limitTime = thirtyDaysAgo.getTime();

  const filteredReports = reports.filter(r => {
    const timestamp = r.checkInTime || r.createdAt;
    const time = timestamp?.toDate ? timestamp.toDate().getTime() : new Date(timestamp).getTime();
    return time >= limitTime;
  });

  // Enriquecer reportes con los nombres de las comunidades
  for (const rep of filteredReports) {
    try {
      const commSnap = await getDoc(doc(db, 'communities', rep.communityId));
      if (commSnap.exists()) {
        rep.communityName = commSnap.data().name;
      }
    } catch (e) {
      rep.communityName = 'Comunidad';
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
export async function getClientEvidence(communityIds) {
  if (!communityIds || communityIds.length === 0) return [];

  const CHUNK_LIMIT = 10;
  const evidences = [];

  for (let i = 0; i < communityIds.length; i += CHUNK_LIMIT) {
    const chunk = communityIds.slice(i, i + CHUNK_LIMIT);
    let q;
    if (chunk.length === 1) {
      q = query(
        collection(db, 'evidenceReports'),
        where('communityId', '==', chunk[0]),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
    } else {
      q = query(
        collection(db, 'evidenceReports'),
        where('communityId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
    }
    const snap = await getDocs(q);
    snap.docs.forEach(d => evidences.push({ id: d.id, ...d.data() }));
  }

  // Filtrar en memoria a los últimos 30 días
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const limitTime = thirtyDaysAgo.getTime();

  const filteredEvidences = evidences.filter(e => {
    const time = e.createdAt?.toDate ? e.createdAt.toDate().getTime() : new Date(e.createdAt).getTime();
    return time >= limitTime;
  });

  return filteredEvidences;
}
