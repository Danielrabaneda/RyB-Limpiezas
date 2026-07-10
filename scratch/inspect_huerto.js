import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";

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
  const commsSnap = await getDocs(collection(db, "communities"));
  const comms = commsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const targetComm = comms.find(c => c.name.toLowerCase().includes("huerto de los frailes 3"));
  if (!targetComm) {
    console.log("No community found");
    process.exit(0);
  }
  
  console.log("Found community:", targetComm.id, targetComm.name);
  
  const tasksSnap = await getDocs(query(collection(db, "communityTasks"), where("communityId", "==", targetComm.id)));
  console.log("\nTasks:");
  tasksSnap.docs.forEach(d => {
    const data = d.data();
    console.log(`- Task ${d.id}: ${data.taskName}, frequency: ${data.frequency}, startDate: ${data.startDate}, recurrenceType: ${data.recurrenceType}, assignedUser: ${data.assignedUserId}, createdAt: ${data.createdAt?.toDate?.() || data.createdAt}`);
  });
  
  const servicesSnap = await getDocs(query(collection(db, "scheduledServices"), where("communityId", "==", targetComm.id)));
  console.log("\nScheduled Services:");
  const services = servicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  services.sort((a,b) => {
    const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
    const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate);
    return dA.getTime() - dB.getTime();
  });
  
  services.forEach(s => {
    const d = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
    const dateStr = d.toISOString().split("T")[0];
    const createdStr = s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : "unknown";
    console.log(`- [${dateStr}] [${s.status}] id: ${s.id}, taskId: ${s.communityTaskId}, user: ${s.assignedUserId}, createdAt: ${createdStr}`);
  });
  
  process.exit(0);
}

main().catch(console.error);
