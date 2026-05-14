
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

if (!require('firebase-admin').apps.length) {
  require('firebase-admin').initializeApp({
    credential: require('firebase-admin').credential.cert(serviceAccount)
  });
}

const db = getFirestore();

async function findAllToday() {
  const start = new Date('2026-05-12T22:00:00Z');
  const end = new Date('2026-05-13T21:59:59Z');

  const snap = await db.collection('scheduledServices')
    .where('scheduledDate', '>=', Timestamp.fromDate(start))
    .where('scheduledDate', '<=', Timestamp.fromDate(end))
    .get();

  const services = [];
  snap.forEach(doc => {
    services.push({ id: doc.id, ...doc.data() });
  });

  console.log(`Found ${services.length} services for today.`);
  
  // Group by community and task
  const groups = {};
  services.forEach(s => {
    const key = `${s.communityId} | ${s.taskName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 1) {
      console.log(`\nDUPLICATE: ${key}`);
      list.forEach(s => {
        console.log(`  - ID: ${s.id}, Status: ${s.status}, Assigned: ${s.assignedUserId}, Created: ${s.createdAt ? s.createdAt.toDate().toISOString() : 'N/A'}`);
      });
    }
  }
}

findAllToday().catch(console.error);
