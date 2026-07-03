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
  console.log("Fetching all scheduled services...");
  const snap = await getDocs(collection(db, "scheduledServices"));
  const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const missedServices = services.filter(s => s.status === 'missed');
  console.log(`Found ${missedServices.length} missed services in total.`);
  
  for (const s of missedServices) {
    await updateDoc(doc(db, "scheduledServices", s.id), { status: "completed" });
    console.log(`- Updated ${s.id} to completed (was missed)`);
  }

  console.log(`Done.`);
  process.exit(0);
}

main().catch(console.error);
