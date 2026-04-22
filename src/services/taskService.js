import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { generateServicesForTask, generateServicesForRange } from './scheduleService';
import { startOfMonth, endOfMonth } from 'date-fns';

// ==================== TASK TEMPLATES ====================
export async function createTaskTemplate(data) {
  const ref = await addDoc(collection(db, 'taskTemplates'), {
    name: data.name,
    description: data.description || '',
    category: data.category || 'general',
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function getTaskTemplates() {
  const snap = await getDocs(query(collection(db, 'taskTemplates'), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateTaskTemplate(id, data) {
  await updateDoc(doc(db, 'taskTemplates', id), data);
}

// ==================== COMMUNITY TASKS ====================
export async function createCommunityTask(data) {
  const ref = await addDoc(collection(db, 'communityTasks'), {
    communityId: data.communityId,
    taskTemplateId: data.taskTemplateId || '',
    taskName: data.taskName,
    assignedUserId: data.assignedUserId || null,
    frequencyType: data.frequencyType || 'weekly',
    frequencyValue: data.frequencyValue || 1,
    weekDays: data.weekDays || [],
    monthDays: data.monthDays || [],
    punctualDate: data.punctualDate || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    weekOfMonth: data.weekOfMonth || null,
    monthOfYear: data.monthOfYear !== undefined ? data.monthOfYear : null,
    serviceMode: data.serviceMode || 'periodic',
    active: true,
    createdAt: serverTimestamp(),
  });
  
  // Auto-generate services for this task for the current month
  try {
    await generateServicesForTask(ref.id);
  } catch (err) {
    console.error('Error auto-generating services for new task:', err);
  }
  
  return { id: ref.id, ...data };
}

export async function getCommunityTasks(communityId) {
  const q = query(
    collection(db, 'communityTasks'),
    where('communityId', '==', communityId),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateCommunityTask(id, data) {
  await updateDoc(doc(db, 'communityTasks', id), { ...data, updatedAt: serverTimestamp() });
  // Optionally re-generate? Probably better to do it manually if frequency changes.
}

export async function deleteCommunityTask(id) {
  await updateDoc(doc(db, 'communityTasks', id), { active: false });
}

// ==================== ASSIGNMENTS ====================
export async function createAssignment(data) {
  const ref = await addDoc(collection(db, 'assignments'), {
    communityId: data.communityId,
    userId: data.userId,
    active: true,
    createdAt: serverTimestamp(),
  });

  // Since a new person is assigned, generate services for all active tasks of this community
  try {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    await generateServicesForRange(start, end);
  } catch (err) {
    console.error('Error auto-generating services for new assignment:', err);
  }

  return { id: ref.id, ...data };
}

export async function getAssignmentsForCommunity(communityId) {
  const q = query(
    collection(db, 'assignments'),
    where('communityId', '==', communityId),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAssignmentsForUser(userId) {
  const q = query(
    collection(db, 'assignments'),
    where('userId', '==', userId),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteAssignment(id) {
  await updateDoc(doc(db, 'assignments', id), { active: false });
}
