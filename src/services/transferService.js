import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  query, where, serverTimestamp, writeBatch, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';

/**
 * Creates a transfer request and updates the services immediately.
 */
export async function transferService({ serviceId, fromUserId, toUserId, requesterRole }) {
  const serviceRef = doc(db, 'scheduledServices', serviceId);
  const serviceSnap = await getDoc(serviceRef);
  
  if (!serviceSnap.exists()) throw new Error('Servicio no encontrado');
  const serviceData = serviceSnap.data();

  // Operarios solo pueden traspasar si el servicio está pendiente
  if (requesterRole !== 'admin' && serviceData.status !== 'pending' && serviceData.status !== undefined) {
    throw new Error('Solo se pueden traspasar servicios que aún no han comenzado.');
  }

  const batch = writeBatch(db);
  const transferData = {
    serviceId,
    fromUserId,
    toUserId,
    type: 'single',
    status: requesterRole === 'admin' ? 'approved' : 'pending',
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  const transferRef = await addDoc(collection(db, 'transfers'), transferData);

  batch.update(serviceRef, {
    assignedUserId: toUserId,
    isTransferred: true,
    originalAssignedUserId: fromUserId,
    transferId: transferRef.id,
    transferValidated: requesterRole === 'admin',
    updatedAt: serverTimestamp()
  });

  await batch.commit();
  return transferRef.id;
}

export async function transferDay({ date, fromUserId, toUserId, requesterRole }) {
  const start = Timestamp.fromDate(startOfDay(date));
  const end = Timestamp.fromDate(endOfDay(date));

  const q = query(
    collection(db, 'scheduledServices'),
    where('assignedUserId', '==', fromUserId),
    where('scheduledDate', '>=', start),
    where('scheduledDate', '<=', end)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Si es operario, validar que NINGÚN servicio haya comenzado
  if (requesterRole !== 'admin') {
    const hasStarted = snap.docs.some(d => {
      const s = d.data().status;
      return s === 'completed' || s === 'in_progress';
    });
    if (hasStarted) {
      throw new Error('No se puede traspasar el día porque algunos servicios ya han comenzado o finalizado.');
    }
  }

  const batch = writeBatch(db);
  const transferData = {
    date: Timestamp.fromDate(date),
    fromUserId,
    toUserId,
    type: 'day',
    serviceCount: snap.size,
    status: requesterRole === 'admin' ? 'approved' : 'pending',
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  const transferRef = await addDoc(collection(db, 'transfers'), transferData);

  snap.forEach(d => {
    batch.update(d.ref, {
      assignedUserId: toUserId,
      isTransferred: true,
      originalAssignedUserId: fromUserId,
      transferId: transferRef.id,
      transferValidated: requesterRole === 'admin',
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return transferRef.id;
}

export async function transferWeek({ dateInWeek, fromUserId, toUserId, requesterRole }) {
  const weekStart = startOfWeek(dateInWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(dateInWeek, { weekStartsOn: 1 });
  const start = Timestamp.fromDate(startOfDay(weekStart));
  const end = Timestamp.fromDate(endOfDay(weekEnd));

  const q = query(
    collection(db, 'scheduledServices'),
    where('assignedUserId', '==', fromUserId),
    where('scheduledDate', '>=', start),
    where('scheduledDate', '<=', end)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Si es operario, validar que NINGÚN servicio de la semana haya comenzado
  if (requesterRole !== 'admin') {
    const hasStarted = snap.docs.some(d => {
      const s = d.data().status;
      return s === 'completed' || s === 'in_progress';
    });
    if (hasStarted) {
      throw new Error('No se puede traspasar la semana porque algunos servicios ya han comenzado o finalizado.');
    }
  }

  const batch = writeBatch(db);
  const transferData = {
    startDate: Timestamp.fromDate(weekStart),
    endDate: Timestamp.fromDate(weekEnd),
    fromUserId,
    toUserId,
    type: 'week',
    serviceCount: snap.size,
    status: requesterRole === 'admin' ? 'approved' : 'pending',
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  const transferRef = await addDoc(collection(db, 'transfers'), transferData);

  snap.forEach(d => {
    batch.update(d.ref, {
      assignedUserId: toUserId,
      isTransferred: true,
      originalAssignedUserId: fromUserId,
      transferId: transferRef.id,
      transferValidated: requesterRole === 'admin',
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return transferRef.id;
}

export async function getPendingTransfers() {
  const q = query(
    collection(db, 'transfers'),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approveTransfer(transferId) {
  const transferRef = doc(db, 'transfers', transferId);
  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) return;

  const batch = writeBatch(db);
  batch.update(transferRef, { status: 'approved', validatedAt: serverTimestamp() });

  // Update all associated services
  const q = query(
    collection(db, 'scheduledServices'),
    where('transferId', '==', transferId)
  );
  const servicesSnap = await getDocs(q);
  servicesSnap.forEach(d => {
    batch.update(d.ref, { transferValidated: true });
  });

  await batch.commit();
}

export async function rejectTransfer(transferId) {
  const transferRef = doc(db, 'transfers', transferId);
  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) return;

  const data = transferSnap.data();
  const batch = writeBatch(db);
  
  batch.update(transferRef, { status: 'rejected', validatedAt: serverTimestamp() });

  // Return all associated services to original user
  const q = query(
    collection(db, 'scheduledServices'),
    where('transferId', '==', transferId)
  );
  const servicesSnap = await getDocs(q);
  servicesSnap.forEach(d => {
    batch.update(d.ref, { 
      assignedUserId: data.fromUserId,
      isTransferred: false,
      transferValidated: false,
      transferId: null,
      originalAssignedUserId: null
    });
  });

  await batch.commit();
}
