const admin = require('firebase-admin');

// No need to pass serviceAccount if we are running in an environment where FIREBASE_CONFIG or GOOGLE_APPLICATION_CREDENTIALS might be set, but wait. If we don't have the serviceAccount, let's see if we can read the file.
const fs = require('fs');
let serviceAccount;
try {
    serviceAccount = JSON.parse(fs.readFileSync('./scratch/serviceAccountKey.json', 'utf8'));
} catch (e) {
    console.log("No serviceAccountKey.json found, exiting admin approach.");
    process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkOpen() {
  const rs = await db.collection('checkIns')
    .where('userId', '==', '3sn1FsGPgNT2NcfXfwXIjZF513I3')
    .get();
  
  let open = [];
  rs.forEach(d => {
    const data = d.data();
    if (!data.checkOutTime) {
      open.push({id: d.id, checkIn: data.checkInTime ? data.checkInTime.toDate() : null});
    }
  });
  console.log("Open checkIns:");
  console.dir(open);
}

checkOpen().catch(console.error).finally(() => process.exit(0));
