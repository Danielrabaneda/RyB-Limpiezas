import { 
  collection, doc, addDoc, updateDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, GeoPoint
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

// ==================== CHECK-INS ====================
export async function createCheckIn(data) {
  const checkInTime = data.manualTime ? Timestamp.fromDate(new Date(data.manualTime)) : serverTimestamp();
  const ref = await addDoc(collection(db, 'checkIns'), {
    userId: data.userId,
    communityId: data.communityId,
    scheduledServiceId: data.scheduledServiceId || '',
    checkInTime,
    checkInLocation: new GeoPoint(data.lat, data.lng),
    checkOutTime: null,
    checkOutLocation: null,
    durationMinutes: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function completeCheckOut(checkInId, lat, lng, manualTime = null) {
  const checkOutTime = manualTime ? new Date(manualTime) : new Date();
  
  // Get checkin data to calculate duration
  const checkInRef = doc(db, 'checkIns', checkInId);
  const snap = await getDocs(query(
    collection(db, 'checkIns'),
    where('__name__', '==', checkInId)
  ));
  
  let duration = 0;
  if (!snap.empty) {
    const data = snap.docs[0].data();
    if (data.checkInTime) {
      const checkInDate = data.checkInTime.toDate ? data.checkInTime.toDate() : new Date(data.checkInTime);
      duration = differenceInMinutes(checkOutTime, checkInDate);
    }
  }
  
  await updateDoc(checkInRef, {
    checkOutTime: Timestamp.fromDate(checkOutTime),
    checkOutLocation: new GeoPoint(lat, lng),
    durationMinutes: Math.max(0, duration),
  });
  
  return { duration };
}

export async function getCheckInsForDate(userId, date) {
  const start = Timestamp.fromDate(startOfDay(date));
  const end = Timestamp.fromDate(endOfDay(date));
  
  const q = query(
    collection(db, 'checkIns'),
    where('userId', '==', userId),
    where('checkInTime', '>=', start),
    where('checkInTime', '<=', end),
    orderBy('checkInTime', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getCheckInsRange(startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));
  
  let q;
  if (filters.userId) {
    q = query(
      collection(db, 'checkIns'),
      where('userId', '==', filters.userId),
      where('checkInTime', '>=', start),
      where('checkInTime', '<=', end),
      orderBy('checkInTime', 'desc')
    );
  } else {
    q = query(
      collection(db, 'checkIns'),
      where('checkInTime', '>=', start),
      where('checkInTime', '<=', end),
      orderBy('checkInTime', 'desc')
    );
  }
  
  let results = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  
  if (filters.communityId) {
    results = results.filter(r => r.communityId === filters.communityId);
  }
  
  return results;
}

export async function deleteCheckIn(id) {
  await deleteDoc(doc(db, 'checkIns', id));
}

export async function getAllOpenCheckIns(userId) {
  const q = query(
    collection(db, 'checkIns'),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.checkOutTime === null);
}

export async function getActiveCheckIn(userId) {
  const open = await getAllOpenCheckIns(userId);
  if (open.length === 0) return null;
  
  // Return the most recent one
  return open.sort((a, b) => {
    const aTime = a.checkInTime?.toDate ? a.checkInTime.toDate() : new Date(a.checkInTime);
    const bTime = b.checkInTime?.toDate ? b.checkInTime.toDate() : new Date(b.checkInTime);
    return bTime - aTime;
  })[0];
}


// ==================== TASK EXECUTIONS ====================
export async function createTaskExecution(data) {
  const ref = await addDoc(collection(db, 'taskExecutions'), {
    scheduledServiceId: data.scheduledServiceId,
    communityTaskId: data.communityTaskId,
    userId: data.userId,
    status: 'pending',
    notes: '',
    photoUrls: [],
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function updateTaskExecution(id, data) {
  await updateDoc(doc(db, 'taskExecutions', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getTaskExecutionsForService(scheduledServiceId) {
  const q = query(
    collection(db, 'taskExecutions'),
    where('scheduledServiceId', '==', scheduledServiceId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTaskExecutionsRange(startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));
  
  const q = query(
    collection(db, 'taskExecutions'),
    where('createdAt', '>=', start),
    where('createdAt', '<=', end),
    orderBy('createdAt', 'desc')
  );
  
  let results = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  
  if (filters.userId) {
    results = results.filter(r => r.userId === filters.userId);
  }
  
  return results;
}

// ==================== DISTANCE VALIDATION ====================
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function isWithinRange(userLat, userLng, communityLat, communityLng, maxMeters = 500) {
  const distance = calculateDistance(userLat, userLng, communityLat, communityLng);
  return { withinRange: distance <= maxMeters, distance: Math.round(distance) };
}
