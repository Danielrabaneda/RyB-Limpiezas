
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findTodayServices() {
  const userId = '3sn1FsGPgNT2NcfXfwXIjZF513I3';
  const start = new Date('2026-05-12T22:00:00Z');
  const end = new Date('2026-05-13T21:59:59Z');

  const snap = await db.collection('scheduledServices')
    .where('assignedUserId', '==', userId)
    .get();

  const todayServices = [];
  snap.forEach(doc => {
    const data = doc.data();
    const d = data.scheduledDate.toDate();
    if (d >= start && d <= end) {
      todayServices.push({ id: doc.id, ...data });
    }
  });

  console.log(`Found ${todayServices.length} services for today:`);
  todayServices.forEach(s => {
    console.log(`- ID: ${s.id}, Task: ${s.taskName}, Community: ${s.communityId}, Status: ${s.status}, CreatedAt: ${s.createdAt ? s.createdAt.toDate().toISOString() : 'N/A'}`);
  });
}

findTodayServices().catch(console.error);
