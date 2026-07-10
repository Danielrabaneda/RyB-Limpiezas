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
  console.log("Fetching all check-ins...");
  // Get all check-ins
  const checkInsSnap = await getDocs(collection(db, "checkIns"));
  const checkIns = checkInsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total check-ins in DB: ${checkIns.length}`);

  // Filter check-ins with checkOutTime == null
  const openCheckIns = checkIns.filter(c => !c.checkOutTime);
  console.log(`\nOpen Check-ins (checkOutTime is null/falsy): ${openCheckIns.length}`);
  openCheckIns.forEach(c => {
    const date = c.checkInTime?.toDate ? c.checkInTime.toDate() : new Date(c.checkInTime);
    console.log(`- CheckIn ID: ${c.id}`);
    console.log(`  User UID: ${c.userId}`);
    console.log(`  Community ID: ${c.communityId}`);
    console.log(`  Time: ${date.toISOString()}`);
  });

  console.log("\nAll check-ins from today (May 19, 2026):");
  const todayStart = new Date("2026-05-19T00:00:00");
  const todayEnd = new Date("2026-05-19T23:59:59");
  const todayCheckIns = checkIns.filter(c => {
    const date = c.checkInTime?.toDate ? c.checkInTime.toDate() : new Date(c.checkInTime);
    return date >= todayStart && date <= todayEnd;
  });
  
  todayCheckIns.forEach(c => {
    const date = c.checkInTime?.toDate ? c.checkInTime.toDate() : new Date(c.checkInTime);
    const checkoutDate = c.checkOutTime?.toDate ? c.checkOutTime.toDate().toISOString() : "Not Checked Out";
    console.log(`- [${date.toISOString()}] User UID: ${c.userId}, Out: ${checkoutDate}, ID: ${c.id}`);
  });

  process.exit(0);
}

main().catch(console.error);
