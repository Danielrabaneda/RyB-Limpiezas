import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

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

async function testPortal(token) {
  try {
    console.log(`\nTesting with token: ${token}`);
    
    console.log("Step 0: Skipping anonymous login (testing unauthenticated access)...");

    console.log("Step 1: Fetching publicPortal document...");
    const portalRef = doc(db, 'publicPortals', token);
    const portalSnap = await getDoc(portalRef);
    if (!portalSnap.exists()) {
      console.error("  -> Portal document does not exist!");
      return;
    }
    const portalData = portalSnap.data();
    console.log("  -> Portal data:", portalData);

    const communityId = portalData.communityId;
    console.log(`Step 2: Fetching community document ${communityId}...`);
    const communityRef = doc(db, 'communities', communityId);
    const communitySnap = await getDoc(communityRef);
    if (!communitySnap.exists()) {
      console.error("  -> Community document does not exist!");
      return;
    }
    const communityData = communitySnap.data();
    console.log("  -> Community data:", communityData);

    console.log("Step 3: Querying checkIns...");
    const reportsQ = query(
      collection(db, 'checkIns'),
      where('communityId', '==', communityId),
      orderBy('checkInTime', 'desc'),
      limit(10)
    );
    const reportsSnap = await getDocs(reportsQ);
    console.log(`  -> Found ${reportsSnap.size} check-ins.`);

    console.log("Step 4: Querying evidence...");
    const evidenceQ = query(
      collection(db, 'evidenceReports'),
      where('communityId', '==', communityId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const evidenceSnap = await getDocs(evidenceQ);
    console.log(`  -> Found ${evidenceSnap.size} evidence reports.`);

    console.log("Step 5: Querying tasks...");
    const tasksQ = query(
      collection(db, 'communityTasks'),
      where('communityId', '==', communityId),
      where('active', '==', true)
    );
    const tasksSnap = await getDocs(tasksQ);
    console.log(`  -> Found ${tasksSnap.size} active tasks.`);

  } catch (err) {
    console.error("  -> FAILED WITH ERROR:", err);
  }
}

async function main() {
  const token = "cyvpqxqhncwam1e9ejhbmf28bl8212i7";
  await testPortal(token);
}

main().catch(console.error);
