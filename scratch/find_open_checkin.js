import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "ryb-limpiezas-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findOpenCheckIn() {
  const attQuery = query(collection(db, "checkIns"), where("userId", "==", "3sn1FsGPgNT2NcfXfwXIjZF513I3"));
  const docs = await getDocs(attQuery);
  let openCount = 0;
  docs.forEach(d => {
    const data = d.data();
    if (!data.checkOutTime) {
      console.log(`Open checkIn found! ID: ${d.id}, Date: ${data.date}, CheckInTime: ${data.checkInTime.toDate()}`);
      openCount++;
    }
  });

  if (openCount === 0) {
    console.log("No open check-ins found for this user.");
  }
}

findOpenCheckIn().catch(err => {
    console.error(err);
    process.exit(1);
}).then(() => process.exit(0));
