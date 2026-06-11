import { 
  collection, doc, getDoc, getDocs, query, where, orderBy 
} from 'firebase/firestore';
import { db } from '../config/firebase';

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
 * Obtiene el histórico de servicios completados y reportados de las comunidades del cliente.
 * 
 * @param {Array<string>} communityIds - Lista de comunidades a consultar.
 * @returns {Promise<Array>} Listado de servicios reportados.
 */
export async function getClientReports(communityIds) {
  if (!communityIds || communityIds.length === 0) return [];

  // Firestore limita los operadores 'in' a 10/30 elementos.
  // Si hay más de 10 comunidades, realizamos consultas en lotes o individuales.
  const CHUNK_LIMIT = 10;
  const reports = [];

  for (let i = 0; i < communityIds.length; i += CHUNK_LIMIT) {
    const chunk = communityIds.slice(i, i + CHUNK_LIMIT);
    const q = query(
      collection(db, 'reports'),
      where('communityId', 'in', chunk),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => reports.push({ id: d.id, ...d.data() }));
  }

  // Enriquecer reportes con los nombres de las comunidades
  for (const rep of reports) {
    try {
      const commSnap = await getDoc(doc(db, 'communities', rep.communityId));
      if (commSnap.exists()) {
        rep.communityName = commSnap.data().name;
      }
    } catch (e) {
      rep.communityName = 'Comunidad';
    }
  }

  return reports;
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
    const q = query(
      collection(db, 'evidenceReports'),
      where('communityId', 'in', chunk),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => evidences.push({ id: d.id, ...d.data() }));
  }

  return evidences;
}
