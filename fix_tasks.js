import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDS3pY-5nAPlZKtglyqwt-7IyPJry_dvlg",
  authDomain: "ryb-limpiezas-app.firebaseapp.com",
  projectId: "ryb-limpiezas-app",
  storageBucket: "ryb-limpiezas-app.firebasestorage.app",
  messagingSenderId: "745565950352",
  appId: "1:745565950352:web:b2268685f168da3d92a315",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log("Fetching scheduled services to fix...");
  const snap = await getDocs(collection(db, "scheduledServices"));
  const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const todayEnd = new Date();
  todayEnd.setHours(23,59,59,999);
  
  const todayServices = services.filter(s => {
    if (!s.scheduledDate) return false;
    const date = s.scheduledDate.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
    return date >= todayStart && date <= todayEnd;
  });

  const missedServices = todayServices.filter(s => s.status === 'missed');
  
  console.log(`Found ${missedServices.length} missed services today.`);
  
  for (const s of missedServices) {
    const sName = (s.taskName || '').toLowerCase();
    console.log(`Updating service: ${s.id} | ${sName}`);
    await updateDoc(doc(db, "scheduledServices", s.id), {
        status: "completed"
    });
    console.log(`- Updated ${s.id} to completed`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(console.error);
