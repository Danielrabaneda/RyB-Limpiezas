import { 
  collection, doc, addDoc, updateDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp, runTransaction
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAllUsers } from './authService';
import { createSystemNotification } from './notificationService';

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
    currentStock: 0,
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

  // Enviar notificación a todos los administradores
  try {
    const allUsers = await getAllUsers();
    const operario = allUsers.find(u => u.uid === data.userId);
    const operarioName = operario ? (operario.name || operario.displayName || 'Un operario') : 'Un operario';
    
    const admins = allUsers.filter(u => u.role === 'admin');
    
    for (const admin of admins) {
      await createSystemNotification(
        admin.uid,
        '📦 Nuevo Pedido de Material',
        `${operarioName} ha solicitado ${data.quantity}x ${data.productName}`,
        'info',
        null, // serviceId
        '/admin/inventory' // targetUrl
      );
    }
  } catch (err) {
    console.error('[MaterialService] Error enviando notificaciones a admins:', err);
  }

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

export async function updateRequestStatus(requestId, status, adminId = 'admin', adminName = 'Admin') {
  const requestRef = doc(db, 'materialRequests', requestId);
  
  if (status === 'completed') {
    // Si se completa, descontar stock usando transacción
    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists()) {
        throw new Error("El pedido no existe!");
      }
      const requestData = requestSnap.data();
      
      // Si ya estaba completado, no hacer nada para evitar doble descuento
      if (requestData.status === 'completed') return;

      const productRef = doc(db, 'products', requestData.productId);
      const productSnap = await transaction.get(productRef);
      
      if (!productSnap.exists()) {
        throw new Error("El producto ya no existe!");
      }
      
      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      const quantityToDeduct = parseFloat(requestData.quantity) || 0;
      const newStock = currentStock - quantityToDeduct;

      // 1. Actualizar stock del producto
      transaction.update(productRef, { currentStock: newStock });
      
      // 2. Registrar movimiento de stock
      const movementRef = doc(collection(db, 'stockMovements'));
      transaction.set(movementRef, {
        productId: requestData.productId,
        productName: requestData.productName || productData.name,
        type: 'out',
        quantity: quantityToDeduct,
        previousStock: currentStock,
        newStock: newStock,
        date: serverTimestamp(),
        userId: requestData.userId, // El operario que recibe
        adminId: adminId, // Admin que entrega
        referenceId: requestId,
        notes: `Entregado pedido de material a operario`
      });

      // 3. Actualizar estado del pedido
      transaction.update(requestRef, { 
        status, 
        updatedAt: serverTimestamp() 
      });
    });
  } else {
    // Para otros estados (pending, cancelled), simplemente actualizar el doc
    await updateDoc(requestRef, { 
      status, 
      updatedAt: serverTimestamp() 
    });
  }
}

export async function deleteMaterialRequest(id) {
  await deleteDoc(doc(db, 'materialRequests', id));
}

// ==================== STOCK MANAGEMENT ====================

export async function addStock(productId, productName, quantity, adminId, adminName, notes = '') {
  const productRef = doc(db, 'products', productId);
  
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("El producto no existe!");
    }
    
    const productData = productSnap.data();
    const currentStock = productData.currentStock || 0;
    const addedQuantity = parseFloat(quantity) || 0;
    const newStock = currentStock + addedQuantity;
    
    // 1. Update product stock
    transaction.update(productRef, { currentStock: newStock });
    
    // 2. Log movement
    const movementRef = doc(collection(db, 'stockMovements'));
    transaction.set(movementRef, {
      productId,
      productName: productName || productData.name,
      type: 'in',
      quantity: addedQuantity,
      previousStock: currentStock,
      newStock: newStock,
      date: serverTimestamp(),
      userId: adminId, // Admin receiving the stock
      userName: adminName,
      notes: notes || 'Entrada de proveedor'
    });
  });
}

export async function adjustStock(productId, productName, newStock, adminId, adminName, notes = '') {
  const productRef = doc(db, 'products', productId);
  
  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("El producto no existe!");
    }
    
    const productData = productSnap.data();
    const currentStock = productData.currentStock || 0;
    const finalStock = parseFloat(newStock) || 0;
    const difference = finalStock - currentStock; // can be negative
    
    // 1. Update product stock
    transaction.update(productRef, { currentStock: finalStock });
    
    // 2. Log movement
    const movementRef = doc(collection(db, 'stockMovements'));
    transaction.set(movementRef, {
      productId,
      productName: productName || productData.name,
      type: 'adjustment',
      quantity: difference,
      previousStock: currentStock,
      newStock: finalStock,
      date: serverTimestamp(),
      userId: adminId, 
      userName: adminName,
      notes: notes || 'Ajuste manual de inventario'
    });
  });
}

export async function getStockMovements(limitNum = 100) {
  // We can add filtering by date or product later if needed
  const q = query(
    collection(db, 'stockMovements'),
    orderBy('date', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
