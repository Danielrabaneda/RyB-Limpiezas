
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  projectId: "ryb-limpiezas-app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findJimena() {
  const q = query(collection(db, "users"), where("displayName", ">=", "Jimena"));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    console.log(`User: ${doc.data().displayName}, UID: ${doc.id}, Role: ${doc.data().role}`);
  });
}

findJimena().catch(console.error);
