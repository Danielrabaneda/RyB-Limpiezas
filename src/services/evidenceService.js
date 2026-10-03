import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { startOfDay, endOfDay } from "date-fns";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

/**
 * Create a new evidence report (photos + notes submitted by an operario)
 */
export async function createEvidenceReport(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "evidenceReports"), {
    scheduledServiceId: data.scheduledServiceId,
    communityId: data.communityId,
    communityName: data.communityName || "",
    userId: data.userId,
    userName: data.userName || "",
    notes: data.notes || "",
    photoUrls: data.photoUrls || [],
    taskName: data.taskName || "",
    communityTaskId: data.communityTaskId || "",
    status: "submitted", // submitted | reviewed | dismissed
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Get all evidence reports within a date range, optionally filtered
 */
export async function getEvidenceReportsRange(
  companyId,
  startDate,
  endDate,
  filters = {},
) {
  const start = Timestamp.fromDate(startOfDay(startDate));
  const end = Timestamp.fromDate(endOfDay(endDate));

  let q;
  if (filters.userId) {
    q = query(
      tenantCollection(db, companyId, "evidenceReports"),
      where("userId", "==", filters.userId),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end),
      orderBy("createdAt", "desc"),
    );
  } else {
    q = query(
      tenantCollection(db, companyId, "evidenceReports"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end),
      orderBy("createdAt", "desc"),
    );
  }

  let results = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.communityId) {
    results = results.filter((r) => r.communityId === filters.communityId);
  }

  return results;
}

/**
 * Delete an evidence report
 */
export async function deleteEvidenceReport(companyId, id) {
  await deleteDoc(tenantDoc(db, companyId, "evidenceReports", id));
}

/**
 * Mark an evidence report as reviewed
 */
export async function markEvidenceReviewed(companyId, id) {
  await updateDoc(tenantDoc(db, companyId, "evidenceReports", id), {
    status: "reviewed",
    reviewedAt: serverTimestamp(),
  });
}
