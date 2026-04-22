import { 
  collection, doc, addDoc, updateDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ==================== PRODUCT CATALOG ====================
export async function getProducts() {
  const q = query(collection(db, 'products'), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createProduct(data) {
  const ref = await addDoc(collection(db, 'products'), {
    name: data.name,
    unit: data.unit || 'uds', // uds, litros, paquetes...
    category: data.category || 'general',
    createdAt: serverTimestamp()
  });
  return { id: ref.id, ...data };
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, 'products', id));
}

// ==================== MATERIAL REQUESTS ====================
export async function createMaterialRequest(data) {
  const ref = await addDoc(collection(db, 'materialRequests'), {
    userId: data.userId,
    communityId: data.communityId,
    productId: data.productId,
    productName: data.productName, // Desnormalizado para facilitar lectura
    quantity: parseFloat(data.quantity) || 1,
    unit: data.unit,
    status: 'pending', // pending, completed, cancelled
    notes: data.notes || '',
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function getMaterialRequests(filters = {}) {
  let q = collection(db, 'materialRequests');
  
  if (filters.status) {
    q = query(q, where('status', '==', filters.status));
  }
  
  // Como no queremos líos con índices compuestos ahora, ordenamos en memoria si es necesario
  // pero Firestore requiere orderBy si hay rangos, usaremos la consulta base:
  const queryFinal = query(q, orderBy('createdAt', 'desc'));
  
  const snap = await getDocs(queryFinal);
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  if (filters.userId) results = results.filter(r => r.userId === filters.userId);
  if (filters.communityId) results = results.filter(r => r.communityId === filters.communityId);
  
  return results;
}

export async function updateRequestStatus(requestId, status) {
  const ref = doc(db, 'materialRequests', requestId);
  await updateDoc(ref, { 
    status, 
    updatedAt: serverTimestamp() 
  });
}

export async function deleteMaterialRequest(id) {
  await deleteDoc(doc(db, 'materialRequests', id));
}
