import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

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
  const commId = "COzlTl9mBtKtG9HjLQeJ";

  // 1. Fetch scheduled services for this community
  console.log(
    "Fetching scheduled services for Secretario Francisco Martínez 9...",
  );
  const svcsSnap = await getDocs(
    query(
      collection(db, "scheduledServices"),
      where("communityId", "==", commId),
    ),
  );
  const svcs = svcsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Total services for this community: ${svcs.length}`);

  const todayStr = "2026-06-15";
  const todayStart = new Date(`${todayStr}T00:00:00`);
  const todayEnd = new Date(`${todayStr}T23:59:59`);

  const todaySvcs = svcs.filter((s) => {
    if (!s.scheduledDate) return false;
    const date = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    return date >= todayStart && date <= todayEnd;
  });

  console.log(`\nServices scheduled for today (${todayStr}):`);
  todaySvcs.forEach((s) => {
    const sDate = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    console.log(`- Service ID: ${s.id}`);
    console.log(`  Task: ${s.taskName}`);
    console.log(`  Date: ${sDate.toISOString()}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Assigned User: ${s.assignedUserId}`);
    console.log(`  Companion IDs: ${JSON.stringify(s.companionIds || [])}`);
    console.log(`  Companion Logs: ${JSON.stringify(s.companionLogs || [])}`);
  });

  // 2. Fetch all check-ins for today
  console.log("\nFetching all check-ins for today...");
  const checkInsSnap = await getDocs(collection(db, "checkIns"));
  const checkIns = checkInsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const todayCheckIns = checkIns.filter((c) => {
    if (!c.checkInTime) return false;
    const date = c.checkInTime.toDate
      ? c.checkInTime.toDate()
      : new Date(c.checkInTime);
    return date >= todayStart && date <= todayEnd;
  });

  console.log(`Total check-ins today: ${todayCheckIns.length}`);
  todayCheckIns.forEach((c) => {
    const ciDate = c.checkInTime.toDate
      ? c.checkInTime.toDate()
      : new Date(c.checkInTime);
    const coDate = c.checkOutTime?.toDate
      ? c.checkOutTime.toDate().toISOString()
      : c.checkOutTime
        ? new Date(c.checkOutTime).toISOString()
        : "OPEN (null)";
    console.log(`- Check-In ID: ${c.id}`);
    console.log(`  Community ID: ${c.communityId}`);
    console.log(`  User ID: ${c.userId}`);
    console.log(`  Check-In Time: ${ciDate.toISOString()}`);
    console.log(`  Check-Out Time: ${coDate}`);
    console.log(`  Is Automatic: ${c.isAutomatic}`);
    console.log(`  Status: ${c.status}`);
  });

  process.exit(0);
}

main().catch(console.error);
