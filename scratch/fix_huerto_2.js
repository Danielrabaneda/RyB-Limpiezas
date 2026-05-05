import { doc, updateDoc, collection, getDocs, query, where, addDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';
import { shouldScheduleOnDay } from '../src/services/scheduleService.js';
import { startOfDay, eachDayOfInterval, format, addDays } from 'date-fns';

async function createScheduledService(data) {
  return await addDoc(collection(db, 'scheduledServices'), {
    ...data,
    status: 'pending',
    createdAt: new Date(),
    scheduledDate: data.scheduledDate instanceof Date ? Timestamp.fromDate(data.scheduledDate) : Timestamp.fromDate(new Date(data.scheduledDate))
  });
}

async function main() {
  const communityId = 'sypBI4G4vfEK6ETMSUaf';
  const week4TaskId = 'U55gP07cmWmbXqDhNDMe';
  const week5TaskId = 'uIzmA4bR4qTNldaphHsp';

  // 1. Ensure the correct task is active
  console.log('Ensuring week 5 task is active and week 4 is inactive...');
  await updateDoc(doc(db, 'communityTasks', week4TaskId), { active: false });
  await updateDoc(doc(db, 'communityTasks', week5TaskId), { active: true });

  // 2. Load task and assignments
  const taskDoc = await getDoc(doc(db, 'communityTasks', week5TaskId));
  const task = { id: taskDoc.id, ...taskDoc.data() };
  
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('communityId', '==', communityId), where('active', '==', true)));
  const targetUsers = assignSnap.docs.map(d => ({ userId: d.data().userId }));

  if (targetUsers.length === 0) {
    console.log('No assignments found.');
    process.exit(0);
  }

  // 3. Generate services for April and May 2026
  const startDate = new Date('2026-04-01');
  const endDate = new Date('2026-05-31');
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  console.log(`Generating services from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}...`);
  
  let created = 0;
  for (const day of days) {
    if (shouldScheduleOnDay(task, day)) {
      const dayStr = format(day, 'yyyy-MM-dd');
      for (const target of targetUsers) {
        console.log(`Creating service for ${task.taskName} on ${dayStr} for user ${target.userId}`);
        await createScheduledService({
          communityId: task.communityId,
          communityTaskId: task.id,
          taskName: task.taskName,
          assignedUserId: target.userId,
          scheduledDate: startOfDay(day),
          flexibleWeek: task.flexibleWeek || false,
        });
        created++;
      }
    }
  }

  console.log(`Successfully created ${created} services.`);
  process.exit(0);
}

main().catch(console.error);
