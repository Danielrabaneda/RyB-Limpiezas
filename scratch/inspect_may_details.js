import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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
  
  console.log("=== INSPECTION OF MAY SERVICES IN DETAIL ===");
  
  const ids = [
    "EkBrX1uSXnf3vcdoy62n", // Albarda 15-May (pending/missed)
    "ZUOeoQONf4tkoLy3HqkX", // Albarda 20-May (completed)
    "k0dvscn6CLTnpEkumudI", // Cadiz 15-May (pending/missed)
    "pS1pFWbnYc8GoLJwsWd7"  // Cadiz 20-May (completed)
  ];
  
  for (const id of ids) {
    const snap = await getDoc(doc(db, "scheduledServices", id));
    if (snap.exists()) {
      console.log(`\nDocument ID: ${id}`);
      const data = snap.data();
      Object.entries(data).forEach(([key, val]) => {
        let printVal = val;
        if (val && val.toDate) {
          printVal = `${val.toDate().toISOString()} (Timestamp)`;
        }
        console.log(`  ${key}: ${JSON.stringify(printVal)}`);
      });
    } else {
      console.log(`\nDocument ID: ${id} - NOT FOUND`);
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
