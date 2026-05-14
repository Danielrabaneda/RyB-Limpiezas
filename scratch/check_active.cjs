const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

async function run() {
  const db = getFirestore();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  console.log('Checking active check-ins for Alexandra Alvarez (3sn1FsGPgNT2NcfXfwXIjZF513I3)...');
  
  const snap = await db.collection('checkIns')
    .where('userId', '==', '3sn1FsGPgNT2NcfXfwXIjZF513I3')
    .where('status', '==', 'open')
    .get();
    
  if (snap.empty) {
    console.log('No active check-ins found.');
  } else {
    snap.forEach(doc => {
      console.log('Active Check-In:', doc.id, doc.data());
    });
  }
}

run().catch(console.error);
