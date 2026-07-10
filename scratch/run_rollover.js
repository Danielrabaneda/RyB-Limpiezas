import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, addDoc, updateDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { startOfDay, startOfWeek, addDays, format } from 'date-fns';

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
const auth = getAuth(app);

async function main() {
  console.log("Signing in...");
  await signInWithEmailAndPassword(auth, "admin@ryblimpiezas.com", "Admin2024!");
  console.log("Signed in successfully!");

  console.log("=== RUNNING ROLLOVER TEST ===");
  
  const todayStart = startOfDay(new Date());
  console.log(`Today starts at: ${todayStart.toISOString()}`);
  
  // Fetch all pending services
  const q = query(
    collection(db, 'scheduledServices'),
    where('status', '==', 'pending')
  );
  
  const snap = await getDocs(q);
  console.log(`Pending services count: ${snap.size}`);
  
  if (snap.empty) {
    console.log("No pending services found.");
    process.exit(0);
  }
  
  const pendingServices = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  
  // Filter to garage cleanings only that are scheduled in the past
  const garageServices = pendingServices.filter(svc => {
    if (!svc.scheduledDate) return false;
    const svcDate = svc.scheduledDate.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
    const isPast = startOfDay(svcDate) < todayStart;
    const lowerName = (svc.taskName || '').toLowerCase();
    const isGarage = svc.isGarage || lowerName.includes('garaje') || lowerName.includes('garage');
    return isPast && isGarage;
  });
  
  console.log(`Pending past garage services count: ${garageServices.length}`);
  
  if (garageServices.length === 0) {
    console.log("No pending past garage services found.");
    process.exit(0);
  }
  
  for (const svc of garageServices) {
    const origDate = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
    console.log(`\nFound target: "${svc.taskName}" | Scheduled: ${format(origDate, 'yyyy-MM-dd')} | ID: ${svc.id}`);
    
    // Calculate the Monday of the next week recursively until it is today or in the future
    let nextDate = origDate;
    while (startOfDay(nextDate) < todayStart) {
      nextDate = addDays(startOfWeek(nextDate, { weekStartsOn: 1 }), 7);
    }
    
    const nextDateTimestamp = Timestamp.fromDate(nextDate);
    console.log(`Rollover target date calculated: ${format(nextDate, 'yyyy-MM-dd')}`);
    
    // Perform Rollover
    console.log("Creating new rolled-over service...");
    const newDocRef = await addDoc(collection(db, 'scheduledServices'), {
      communityId: svc.communityId,
      communityTaskId: svc.communityTaskId,
      taskName: svc.taskName || '',
      assignedUserId: svc.assignedUserId,
      scheduledDate: nextDateTimestamp,
      flexibleWeek: svc.flexibleWeek || false,
      isUrgent: svc.isUrgent || false,
      isGarage: svc.isGarage || true,
      status: 'pending',
      createdAt: serverTimestamp(),
      isRollover: true,
      rolledOverFrom: svc.id
    });
    console.log(`Created new service ID: ${newDocRef.id}`);
    
    console.log("Updating original service status to 'missed'...");
    await updateDoc(svc.ref, {
      status: 'missed',
      updatedAt: serverTimestamp()
    });
    console.log("Updated successfully!");
  }
  
  console.log("\nRollover completed successfully.");
  process.exit(0);
}

main().catch(console.error);
