import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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
  
  console.log("=== INSPECTION FOR GARAJE CADIZ & ALBARDA ===");
  
  // 1. Fetch communities matching Cadiz or Albarda
  const commsSnap = await getDocs(collection(db, "communities"));
  const communities = commsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  console.log("\n--- Communities matching Cadiz or Albarda ---");
  const matchingComms = communities.filter(c => 
    c.name?.toLowerCase().includes("cadiz") || 
    c.name?.toLowerCase().includes("albarda")
  );
  
  matchingComms.forEach(c => {
    console.log(`[Community] ID: ${c.id} | Name: ${c.name} | Type: ${c.type} | Active: ${c.active}`);
  });

  // 2. Fetch tasks matching Albarda or Cadiz
  const tasksSnap = await getDocs(collection(db, "communityTasks"));
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  console.log("\n--- Tasks matching Albarda or Cadiz or Garage ---");
  const matchingTasks = tasks.filter(t => {
    const comm = communities.find(c => c.id === t.communityId);
    const commName = comm ? comm.name.toLowerCase() : "";
    const taskName = (t.taskName || "").toLowerCase();
    return commName.includes("cadiz") || commName.includes("albarda") || 
           taskName.includes("cadiz") || taskName.includes("albarda");
  });
  
  matchingTasks.forEach(t => {
    const comm = communities.find(c => c.id === t.communityId);
    console.log(`[Task] ID: ${t.id} | Name: ${t.taskName} | Community: ${comm?.name || 'Unknown'} (${t.communityId}) | Active: ${t.active} | Frequency: ${t.frequencyType} | isGarage: ${t.isGarage}`);
  });

  // 3. Fetch scheduled services for matching tasks or communities
  const servicesSnap = await getDocs(collection(db, "scheduledServices"));
  const services = servicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  console.log("\n--- Scheduled Services for matching communities/tasks ---");
  const matchingServices = services.filter(s => {
    const comm = communities.find(c => c.id === s.communityId);
    const commName = comm ? comm.name.toLowerCase() : "";
    const taskName = (s.taskName || "").toLowerCase();
    return commName.includes("cadiz") || commName.includes("albarda") || 
           taskName.includes("cadiz") || taskName.includes("albarda");
  });
  
  matchingServices.forEach(s => {
    const date = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
    const dateStr = date.toISOString().split("T")[0];
    console.log(`[Service] ID: ${s.id} | Task: ${s.taskName} | Date: ${dateStr} | Status: ${s.status} | AssignedUserId: ${s.assignedUserId} | isRollover: ${s.isRollover} | rolledOverFrom: ${s.rolledOverFrom || 'None'}`);
  });

  process.exit(0);
}

main().catch(console.error);
