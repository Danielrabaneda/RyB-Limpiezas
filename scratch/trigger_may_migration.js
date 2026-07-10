import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, Timestamp, serverTimestamp, query, collection, where, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addMonths, format } from "date-fns";

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

async function handleGarageCompletion(serviceId, completionDate) {
  const serviceRef = doc(db, 'scheduledServices', serviceId);
  const serviceSnap = await getDoc(serviceRef);
  if (!serviceSnap.exists()) return;
  
  const serviceData = serviceSnap.data();
  console.log(`\nProcessing service: ${serviceId} ("${serviceData.taskName}")`);
  
  // 1. Fetch the communityTask
  const taskRef = doc(db, 'communityTasks', serviceData.communityTaskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) {
    console.log(`Task ${serviceData.communityTaskId} not found.`);
    return;
  }
  
  const taskData = taskSnap.data();
  
  // 2. Determine frequency in months
  const freqMap = {
    'monthly': 1,
    'bimonthly': 2,
    'trimonthly': 3,
    'quadrimonthly': 4,
    'semiannual': 6,
    'eightmonthly': 8,
    'annual': 12
  };
  const monthsToAdd = freqMap[taskData.frequencyType] || 2;
  
  const nextDate = addMonths(completionDate, monthsToAdd);
  
  // 3. Update the communityTask's startDate to the completion date
  const completionDateStr = format(completionDate, 'yyyy-MM-dd');
  await updateDoc(taskRef, {
    startDate: completionDateStr,
    updatedAt: serverTimestamp()
  });
  console.log(`Updated task ${serviceData.communityTaskId} startDate to: ${completionDateStr}`);
  
  // 4. Look for the next pending scheduledService for this task (scheduledDate > completionDate)
  const qNext = query(
    collection(db, 'scheduledServices'),
    where('communityTaskId', '==', serviceData.communityTaskId),
    where('status', '==', 'pending')
  );
  const nextSnap = await getDocs(qNext);
  
  if (!nextSnap.empty) {
    const nextServices = nextSnap.docs
      .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter(s => {
        if (!s.scheduledDate) return false;
        const sDate = s.scheduledDate.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
        return sDate.getTime() > completionDate.getTime();
      })
      .sort((a, b) => {
        const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
        const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate);
        return dA.getTime() - dB.getTime();
      });
      
    if (nextServices.length > 0) {
      const targetService = nextServices[0];
      const targetDate = targetService.scheduledDate.toDate();
      console.log(`Found next pending service: ${targetService.id} scheduled for ${format(targetDate, 'yyyy-MM-dd')}`);
      console.log(`Rescheduling it to: ${format(nextDate, 'yyyy-MM-dd')}`);
      
      await updateDoc(targetService.ref, {
        scheduledDate: Timestamp.fromDate(nextDate),
        originalDate: targetService.originalDate || targetService.scheduledDate,
        isRescheduled: true,
        updatedAt: serverTimestamp()
      });
      console.log("Rescheduled successfully!");
    } else {
      console.log("No pending services found in database after completion date.");
    }
  } else {
    console.log("No pending services found for this task.");
  }
}

async function main() {
  await signInWithEmailAndPassword(auth, "admin@ryblimpiezas.com", "Admin2024!");
  console.log("Signed in successfully!");
  
  const completionDateConfitero = new Date("2026-07-03T10:00:00");
  await handleGarageCompletion("6WnOfmIdDWeU2PzM4v1M", completionDateConfitero);
  
  console.log("\nMigration completed.");
  process.exit(0);
}

main().catch(console.error);
