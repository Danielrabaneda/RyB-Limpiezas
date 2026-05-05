import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function main() {
  const commSnap = await getDocs(collection(db, 'communities'));
  const communities = commSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const huerto = communities.find(c => c.name && c.name.toLowerCase().includes('huerto'));
  console.log('Huerto community:', huerto);

  if (huerto) {
    const tasksSnap = await getDocs(collection(db, 'communityTasks'));
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.communityId === huerto.id);
    console.log('Tasks for Huerto:', tasks);
  }
  
  process.exit(0);
}

main().catch(console.error);
