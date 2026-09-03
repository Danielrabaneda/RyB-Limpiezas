import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
  console.log("Fetching all workdays...");
  const snap = await getDocs(collection(db, "workdays"));
  const workdays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Total workdays in DB: ${workdays.length}`);

  const activeWorkdays = workdays.filter((w) => w.status === "active");
  console.log(`\nActive Workdays: ${activeWorkdays.length}`);
  activeWorkdays.forEach((w) => {
    const startTimeDate = w.startTime?.toDate
      ? w.startTime.toDate()
      : new Date(w.startTime);
    console.log(`- Workday ID: ${w.id}`);
    console.log(`  User: ${w.userName || "Unknown"} (${w.userId})`);
    console.log(`  Companion UID: ${w.currentCompanionId || "None"}`);
    console.log(`  StartTime: ${startTimeDate.toISOString()}`);
  });

  process.exit(0);
}

main().catch(console.error);
