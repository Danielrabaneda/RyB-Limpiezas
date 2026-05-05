import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function main() {
  const commSnap = await getDocs(collection(db, 'communities'));
  const communities = commSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const huertos = communities.filter(c => c.name && c.name.toLowerCase().includes('huerto'));
  
  const tasksSnap = await getDocs(collection(db, 'communityTasks'));
  const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const h of huertos) {
    console.log(`--- Community: ${h.name} (${h.id}) ---`);
    const tasks = allTasks.filter(t => t.communityId === h.id);
    tasks.forEach(t => {
      console.log(`Task: ${t.taskName} | Active: ${t.active} | Freq: ${t.frequencyType} | Week: ${t.weekOfMonth}`);
    });
  }

  process.exit(0);
}

main().catch(console.error);
