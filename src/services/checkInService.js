import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  GeoPoint,
  getDoc,
} from "firebase/firestore";
import { db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";
import { startOfDay, endOfDay, differenceInMinutes } from "date-fns";
import { getDistance } from "../utils/geolocation";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

// ==================== CHECK-INS ====================
export async function createCheckIn(data) {
  try {
    const secureCheckIn = httpsCallable(functions, "secureCheckIn");
    const res = await secureCheckIn({
      userId: data.userId,
      scheduledServiceId: data.scheduledServiceId || "",
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lng === "number" ? data.lng : null,
      accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
      speed: typeof data.speed === "number" ? data.speed : null,
      timestamp: typeof data.timestamp === "number" ? data.timestamp : null,
      manualTime: data.manualTime || null,
      exceptionReason: data.exceptionReason || null,
      force: data.force || false,
    });
    return res.data.checkInId;
  } catch (err) {
    console.error("[checkInService] Error en secureCheckIn:", err);
    throw err;
  }
}

export async function completeCheckOut(
  checkInId,
  lat,
  lng,
  manualTime = null,
  signatureData = null,
  telemetry = null,
) {
  if (!checkInId) {
    console.warn("[completeCheckOut] checkInId is invalid:", checkInId);
    return { duration: 0 };
  }

  try {
    const secureCheckOut = httpsCallable(functions, "secureCheckOut");
    const res = await secureCheckOut({
      checkInId,
      lat:
        typeof lat === "number"
          ? lat
          : telemetry && typeof telemetry.lat === "number"
            ? telemetry.lat
            : null,
      lng:
        typeof lng === "number"
          ? lng
          : telemetry && typeof telemetry.lng === "number"
            ? telemetry.lng
            : null,
      accuracy:
        telemetry && typeof telemetry.accuracy === "number"
          ? telemetry.accuracy
          : null,
      speed:
        telemetry && typeof telemetry.speed === "number"
          ? telemetry.speed
          : null,
      timestamp:
        telemetry && typeof telemetry.timestamp === "number"
          ? telemetry.timestamp
          : null,
      manualTime: manualTime || null,
      exceptionReason: (telemetry && telemetry.exceptionReason) || null,
      signatureData: signatureData || null,
    });
    return { duration: res.data.duration };
  } catch (err) {
    console.error("[checkInService] Error en secureCheckOut:", err);
    throw err;
  }
}

export async function getCheckInsForDate(companyId, userId, date) {
  const start = Timestamp.fromDate(startOfDay(date));
  const end = Timestamp.fromDate(endOfDay(date));

  const q = query(
    tenantCollection(db, companyId, "checkIns"),
    where("userId", "==", userId),
    where("checkInTime", ">=", start),
    where("checkInTime", "<=", end),
    orderBy("checkInTime", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCheckInsRange(companyId, startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));

  let q;
  if (filters.userId) {
    q = query(
      tenantCollection(db, companyId, "checkIns"),
      where("userId", "==", filters.userId),
      where("checkInTime", ">=", start),
      where("checkInTime", "<=", end),
      orderBy("checkInTime", "desc"),
    );
  } else {
    q = query(
      tenantCollection(db, companyId, "checkIns"),
      where("checkInTime", ">=", start),
      where("checkInTime", "<=", end),
      orderBy("checkInTime", "desc"),
    );
  }

  let results = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.communityId) {
    results = results.filter((r) => r.communityId === filters.communityId);
  }

  return results;
}

export async function deleteCheckIn(id) {
  const secureDeleteCheckIn = httpsCallable(functions, "secureDeleteCheckIn");
  await secureDeleteCheckIn({ checkInId: id });
}

export async function getAllOpenCheckIns(companyId, userId) {
  const q = query(
    tenantCollection(db, companyId, "checkIns"),
    where("userId", "==", userId),
    where("checkOutTime", "==", null),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data({ serverTimestamps: "estimate" }),
  }));
}

export async function getActiveCheckIn(companyId, userId) {
  const open = await getAllOpenCheckIns(companyId, userId);
  if (open.length === 0) return null;

  // Return the most recent one
  return open.sort((a, b) => {
    const aTime = a.checkInTime
      ? a.checkInTime.toDate
        ? a.checkInTime.toDate()
        : new Date(a.checkInTime)
      : new Date();
    const bTime = b.checkInTime
      ? b.checkInTime.toDate
        ? b.checkInTime.toDate()
        : new Date(b.checkInTime)
      : new Date();
    return bTime - aTime;
  })[0];
}

// ==================== TASK EXECUTIONS ====================
export async function createTaskExecution(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "taskExecutions"), {
    scheduledServiceId: data.scheduledServiceId,
    communityTaskId: data.communityTaskId,
    userId: data.userId,
    status: "pending",
    notes: "",
    photoUrls: [],
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function updateTaskExecution(companyId, id, data) {
  await updateDoc(tenantDoc(db, companyId, "taskExecutions", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getTaskExecutionsForService(companyId, scheduledServiceId) {
  const q = query(
    tenantCollection(db, companyId, "taskExecutions"),
    where("scheduledServiceId", "==", scheduledServiceId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTaskExecutionsRange(companyId, startDate, endDate, filters = {}) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));

  const q = query(
    tenantCollection(db, companyId, "taskExecutions"),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc"),
  );

  let results = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.userId) {
    results = results.filter((r) => r.userId === filters.userId);
  }

  return results;
}

// ==================== DISTANCE VALIDATION ====================
export function isWithinRange(
  userLat,
  userLng,
  communityLat,
  communityLng,
  maxMeters = 500,
) {
  const distance = getDistance(userLat, userLng, communityLat, communityLng);
  return { withinRange: distance <= maxMeters, distance: Math.round(distance) };
}
