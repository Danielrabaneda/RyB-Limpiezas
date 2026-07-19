import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import {
  generateServicesForTask,
  generateServicesForRange,
  deleteFutureServicesForTask,
  deleteFutureServicesForUserInCommunity,
} from "./scheduleService";
import { startOfMonth, endOfMonth, addDays } from "date-fns";

// ==================== TASK TEMPLATES ====================
export async function createTaskTemplate(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "taskTemplates"), {
    name: data.name,
    description: data.description || "",
    category: data.category || "general",
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function getTaskTemplates(companyId) {
  const snap = await getDocs(
    query(tenantCollection(db, companyId, "taskTemplates"), orderBy("name")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateTaskTemplate(companyId, id, data) {
  await updateDoc(tenantDoc(db, companyId, "taskTemplates", id), data);
}

// ==================== COMMUNITY TASKS ====================
export async function createCommunityTask(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "communityTasks"), {
    communityId: data.communityId,
    taskTemplateId: data.taskTemplateId || "",
    taskName: data.taskName,
    assignedUserId: data.assignedUserId || null,
    frequencyType: data.frequencyType || "weekly",
    frequencyValue: data.frequencyValue || 1,
    weekDays: data.weekDays || [],
    monthDays: data.monthDays || [],
    punctualDate: data.punctualDate || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    weekOfMonth: data.weekOfMonth || null,
    monthOfYear: data.monthOfYear !== undefined ? data.monthOfYear : null,
    serviceMode: data.serviceMode || "periodic",
    printColor: data.printColor || "#ef4444",
    isUrgent: !!data.isUrgent,
    active: true,
    createdAt: serverTimestamp(),
  });

  // Auto-generate services for this task for the current month
  try {
    await generateServicesForTask(companyId, ref.id);
  } catch (err) {
    console.error("Error auto-generating services for new task:", err);
  }

  return { id: ref.id, ...data };
}

export async function getCommunityTasks(companyId, communityIdParam) {
  const q = query(
    tenantCollection(db, companyId, "communityTasks"),
    where("communityId", "==", communityIdParam),
    where("active", "==", true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllActiveTasks(companyId) {
  const q = query(
    tenantCollection(db, companyId, "communityTasks"),
    where("active", "==", true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateCommunityTask(companyId, id, data) {
  await updateDoc(tenantDoc(db, companyId, "communityTasks", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });

  // Clean up future pending services and regenerate them with new settings
  try {
    await deleteFutureServicesForTask(companyId, id);

    // Fetch the updated task to regenerate services
    const updatedTaskSnap = await getDoc(tenantDoc(db, companyId, "communityTasks", id));
    if (updatedTaskSnap.exists() && updatedTaskSnap.data().active !== false) {
      const updatedTask = { id: updatedTaskSnap.id, ...updatedTaskSnap.data() };
      const start = startOfMonth(new Date());
      const end = endOfMonth(addDays(new Date(), 45)); // Generate for next month and a half
      await generateServicesForTask(companyId, id, start, end);
    }
  } catch (err) {
    console.error("Error updating services for modified task:", err);
  }
}

export async function deleteCommunityTask(companyId, id) {
  await updateDoc(tenantDoc(db, companyId, "communityTasks", id), {
    active: false,
    updatedAt: serverTimestamp(),
  });
  // Clean up future pending services to avoid duplicates or residues
  try {
    await deleteFutureServicesForTask(companyId, id);
  } catch (err) {
    console.error("Error cleaning up services for deleted task:", err);
  }
}

// ==================== ASSIGNMENTS ====================
export async function createAssignment(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "assignments"), {
    communityId: data.communityId,
    userId: data.userId,
    active: true,
    createdAt: serverTimestamp(),
  });

  // Since a new person is assigned, generate services for all active tasks of this community
  try {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    await generateServicesForRange(companyId, start, end);
  } catch (err) {
    console.error("Error auto-generating services for new assignment:", err);
  }

  return { id: ref.id, ...data };
}

export async function getAssignmentsForCommunity(companyId, communityIdParam) {
  const q = query(
    tenantCollection(db, companyId, "assignments"),
    where("communityId", "==", communityIdParam),
    where("active", "==", true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAssignmentsForUser(companyId, userId) {
  const q = query(
    tenantCollection(db, companyId, "assignments"),
    where("userId", "==", userId),
    where("active", "==", true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteAssignment(companyId, id) {
  try {
    const snap = await getDoc(tenantDoc(db, companyId, "assignments", id));
    if (snap.exists()) {
      const { userId, communityId } = snap.data();
      await updateDoc(tenantDoc(db, companyId, "assignments", id), {
        active: false,
        updatedAt: serverTimestamp(),
      });
      await deleteFutureServicesForUserInCommunity(companyId, userId, communityId);
    }
  } catch (err) {
    console.error("Error deleting assignment and cleaning services:", err);
    await updateDoc(tenantDoc(db, companyId, "assignments", id), { active: false });
  }
}
