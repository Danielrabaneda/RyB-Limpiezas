import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/config/firebase.js';

async function main() {
  const commSnap = await getDocs(collection(db, 'communities'));
  const communities = commSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const huertos = communities.filter(c => c.name && c.name.toLowerCase().includes('huerto'));
  console.log('Huertos communities:', huertos.map(h => ({ id: h.id, name: h.name })));

  process.exit(0);
}

main().catch(console.error);
