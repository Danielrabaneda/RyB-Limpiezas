const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkOpen() {
  const rs = await db.collection('attendance')
    .where('userId', '==', '3sn1FsGPgNT2NcfXfwXIjZF513I3')
    .get();
  
  let open = [];
  rs.forEach(d => {
    const data = d.data();
    if (!data.checkOutTime) {
      open.push({id: d.id, checkIn: data.checkInTime ? data.checkInTime.toDate() : null});
    }
  });
  console.log("Open records:");
  console.dir(open);
}

checkOpen().catch(console.error).finally(() => process.exit(0));
