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
  await signInWithEmailAndPassword(
    auth,
    "admin@ryblimpiezas.com",
    "Admin2024!",
  );
  console.log("Signed in successfully!");

  console.log("=== INSPECTING CONFITERO ===");

  const commsSnap = await getDocs(collection(db, "communities"));
  const communities = commsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const confitero = communities.find((c) =>
    c.name.toLowerCase().includes("confitero"),
  );
  if (!confitero) {
    console.log("Garaje El Confitero not found.");
    process.exit(0);
  }

  console.log(`Found community: ${confitero.name} (ID: ${confitero.id})`);

  const tasksSnap = await getDocs(collection(db, "communityTasks"));
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const confiteroTasks = tasks.filter((t) => t.communityId === confitero.id);

  confiteroTasks.forEach((t) => {
    console.log(
      `Task: ${t.id} | Name: ${t.taskName} | FrequencyType: ${t.frequencyType} | startDate: ${t.startDate} | Active: ${t.active}`,
    );
  });

  const servicesSnap = await getDocs(collection(db, "scheduledServices"));
  const services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const confiteroServices = services.filter(
    (s) => s.communityId === confitero.id,
  );

  confiteroServices.sort((a, b) => {
    const dA = a.scheduledDate?.toDate
      ? a.scheduledDate.toDate()
      : new Date(a.scheduledDate);
    const dB = b.scheduledDate?.toDate
      ? b.scheduledDate.toDate()
      : new Date(b.scheduledDate);
    return dA.getTime() - dB.getTime();
  });

  confiteroServices.forEach((s) => {
    const date = s.scheduledDate?.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    const dateStr = date.toISOString().split("T")[0];
    console.log(
      `Service: ${s.id} | Task: ${s.taskName} | Date: ${dateStr} | Status: ${s.status} | isRollover: ${s.isRollover}`,
    );
  });

  process.exit(0);
}

main().catch(console.error);
