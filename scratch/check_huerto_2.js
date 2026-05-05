import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function main() {
  const communityId = 'sypBI4G4vfEK6ETMSUaf';
  
  // 1. Get assignments
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('communityId', '==', communityId), where('active', '==', true)));
  const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log('--- Assignments for Huerto de los Frailes 2 ---');
  if (assignments.length === 0) {
    console.log('NO ACTIVE ASSIGNMENTS FOUND!');
  } else {
    assignments.forEach(a => console.log(`User: ${a.userId}`));
  }

  // 2. Get tasks
  const tasksSnap = await getDocs(query(collection(db, 'communityTasks'), where('communityId', '==', communityId)));
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log('\n--- Tasks ---');
  tasks.forEach(t => {
    console.log(`Task: ${t.taskName} | Active: ${t.active} | Freq: ${t.frequencyType} | Week: ${t.weekOfMonth}`);
  });

  process.exit(0);
}

main().catch(console.error);
