import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function main() {
  const tasksSnap = await getDocs(query(collection(db, 'communityTasks'), where('active', '==', true), where('weekOfMonth', '==', 5)));
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${tasks.length} active tasks with weekOfMonth: 5`);
  
  tasks.forEach(t => {
    console.log(`- CommunityID: ${t.communityId} | Task: ${t.taskName}`);
  });

  process.exit(0);
}

main().catch(console.error);
