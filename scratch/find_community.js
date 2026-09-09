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
  console.log("Searching for community...");
  const snap = await getDocs(collection(db, "communities"));
  const comms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const matches = comms.filter(
    (c) =>
      c.name.toLowerCase().includes("francisco") ||
      c.name.toLowerCase().includes("secretario"),
  );
  console.log(`Found ${matches.length} matches:`);
  matches.forEach((c) => {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Address: ${c.address}`);
  });
  process.exit(0);
}

main().catch(console.error);
