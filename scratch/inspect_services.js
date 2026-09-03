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
  console.log("Fetching all scheduled services...");
  const snap = await getDocs(collection(db, "scheduledServices"));
  const services = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Total services in DB: ${services.length}`);

  console.log("\nServices scheduled for May 19, 2026:");
  const todayStart = new Date("2026-05-19T00:00:00");
  const todayEnd = new Date("2026-05-19T23:59:59");

  const todayServices = services.filter((s) => {
    if (!s.scheduledDate) return false;
    const date = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    return date >= todayStart && date <= todayEnd;
  });

  console.log(`Found ${todayServices.length} services today.`);

  todayServices.forEach((s) => {
    const date = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    console.log(`- Service ID: ${s.id}`);
    console.log(`  Community ID: ${s.communityId}`);
    console.log(`  Community Name: ${s.communityName || "N/A"}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Assigned User ID: ${s.assignedUserId}`);
    console.log(`  Assigned User Name: ${s.assignedUserName || "N/A"}`);
    console.log(`  Companion IDs: ${JSON.stringify(s.companionIds || [])}`);
    console.log(`  Companion Logs: ${JSON.stringify(s.companionLogs || [])}`);
  });

  process.exit(0);
}

main().catch(console.error);
