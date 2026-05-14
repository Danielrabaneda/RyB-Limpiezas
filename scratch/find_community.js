import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import fs from "fs";

const firebaseConfig = {
  apiKey: "AIzaSyDS3pY-5nAPlZKtglyqwt-7IyPJry_dvlg",
  authDomain: "ryb-limpiezas-app.firebaseapp.com",
  projectId: "ryb-limpiezas-app",
  storageBucket: "ryb-limpiezas-app.firebasestorage.app",
  messagingSenderId: "745565950352",
  appId: "1:745565950352:web:b2268685f168da3d92a315"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function findCommunity() {
  const communitiesRef = collection(db, "communities");
  const q = query(communitiesRef);
  const snapshot = await getDocs(q);
  
  let communityId = null;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.name && data.name.toLowerCase().includes("huerto")) {
      console.log("Found community:", doc.id, data.name);
      if (data.name.toLowerCase().includes("3")) {
        communityId = doc.id;
      }
    }
  });

  if (communityId) {
    console.log("Querying scheduledServices for", communityId);
    // Note: The structure might be a subcollection or root collection
    // Looking at firestore.rules, there's no match for communities/{id}/scheduledServices.
    // It's just /scheduledServices/{id}.
    const servicesRef = collection(db, `scheduledServices`);
    const q2 = query(servicesRef, where("communityId", "==", communityId));
    const servicesSnapshot = await getDocs(q2);
    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({ id: doc.id, ...doc.data() });
    });
    
    fs.writeFileSync("output_huerto.json", JSON.stringify(services, null, 2));
    console.log("Wrote services to output_huerto.json");
  } else {
    console.log("Community not found.");
  }
  
  process.exit(0);
}

findCommunity().catch(console.error);
