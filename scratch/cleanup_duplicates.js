import { initializeApp } from "firebase/app";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";
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
  await signInWithEmailAndPassword(auth, "admin@ryblimpiezas.com", "Admin2024!");
  console.log("Signed in successfully!");
  
  const toDelete = [
    "EkBrX1uSXnf3vcdoy62n", // Albarda May 15 duplicate
    "k0dvscn6CLTnpEkumudI", // Cadiz May 15 duplicate
    "JI0Mw5yakQP7WEE8ubUX", // Albarda Jul 6 rollover duplicate
    "FfZmFTpgY1gp4UZlm9QU"  // Cadiz Jul 6 rollover duplicate
  ];
  
  for (const id of toDelete) {
    console.log(`Deleting document: ${id}`);
    await deleteDoc(doc(db, "scheduledServices", id));
    console.log(`Deleted ${id} successfully.`);
  }
  
  console.log("Cleanup finished.");
  process.exit(0);
}

main().catch(console.error);
