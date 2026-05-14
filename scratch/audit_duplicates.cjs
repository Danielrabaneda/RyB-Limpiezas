
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function audit() {
  const communityId = 'O9NtCO4ceFpVVUvXd0hT'; // Huerto de los Frailes 3
  const snap = await db.collection('scheduledServices')
    .where('communityId', '==', communityId)
    .where('status', '==', 'pending')
    .get();

  const services = [];
  snap.forEach(doc => {
    const data = doc.data();
    const date = data.scheduledDate.toDate().toISOString().split('T')[0];
    services.push({
      id: doc.id,
      taskName: data.taskName,
      date,
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : 'N/A'
    });
  });

  // Group by date and task
  const groups = {};
  services.forEach(s => {
    const key = `${s.date}_${s.taskName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  console.log('--- PENDING SERVICES AUDIT ---');
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 1) {
      console.log(`DUPLICATE FOUND: ${key}`);
      list.forEach(item => {
        console.log(`  - ID: ${item.id}, CreatedAt: ${item.createdAt}`);
      });
    } else {
      // console.log(`OK: ${key} (ID: ${list[0].id})`);
    }
  }
}

audit().catch(console.error);
