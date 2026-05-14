import { 
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, orderBy, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'gpsSuggestions';

/**
 * Crea una sugerencia GPS para una comunidad.
 * El operario envía su posición actual como propuesta de ubicación.
 */
export async function createGPSSuggestion({ communityId, communityName, userId, userName, lat, lng, accuracy }) {
  const docData = {
    communityId,
    communityName: communityName || '',
    userId,
    userName: userName || '',
    lat,
    lng,
    accuracy: Math.round(accuracy || 0),
    status: 'pending', // pending | accepted | rejected
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), docData);
  return { id: ref.id, ...docData };
}

/**
 * Obtiene sugerencias GPS pendientes para una comunidad específica.
 */
export async function getPendingSuggestionsForCommunity(communityId) {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  
  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.communityId === communityId);
    
  return docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
}

/**
 * Obtiene todas las sugerencias pendientes (para el panel admin).
 */
export async function getAllPendingSuggestions() {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs
    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
    .slice(0, 20);
}

/**
 * Marca una sugerencia como aceptada.
 */
export async function acceptSuggestion(suggestionId) {
  await updateDoc(doc(db, COLLECTION, suggestionId), { 
    status: 'accepted', 
    acceptedAt: serverTimestamp() 
  });
}

/**
 * Marca una sugerencia como rechazada.
 */
export async function rejectSuggestion(suggestionId) {
  await updateDoc(doc(db, COLLECTION, suggestionId), { 
    status: 'rejected',
    rejectedAt: serverTimestamp()
  });
}
