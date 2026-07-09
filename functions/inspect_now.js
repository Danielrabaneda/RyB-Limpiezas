const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "ryb-limpiezas-app"
});

const db = admin.firestore();

async function main() {
  console.log("=== ACTIVE WORKDAYS ===");
  const workdaysSnap = await db.collection("workdays").where("status", "==", "active").get();
  console.log(`Active workdays: ${workdaysSnap.size}`);
  workdaysSnap.forEach(w => {
    const data = w.data();
    console.log(`- ID: ${w.id}, User: ${data.userName || 'N/A'} (UID: ${data.userId}), StartTime: ${data.startTime?.toDate()?.toISOString() || 'N/A'}`);
  });

  console.log("\n=== OPEN CHECK-INS ===");
  const checkInsSnap = await db.collection("checkIns").where("checkOutTime", "==", null).get();
  console.log(`Open check-ins: ${checkInsSnap.size}`);
  for (const c of checkInsSnap.docs) {
    const data = c.data();
    
    // Fetch user profile name
    let userName = 'Unknown';
    if (data.userId) {
      const userDoc = await db.collection("users").doc(data.userId).get();
      if (userDoc.exists) {
        userName = userDoc.data().name || userDoc.data().email || 'No Name';
      }
    }

    // Fetch community name
    let communityName = 'Unknown';
    if (data.communityId) {
      const commDoc = await db.collection("communities").doc(data.communityId).get();
      if (commDoc.exists) {
        communityName = commDoc.data().name || 'No Name';
      }
    }

    console.log(`- ID: ${c.id}`);
    console.log(`  User: ${userName} (UID: ${data.userId})`);
    console.log(`  Community: ${communityName} (ID: ${data.communityId})`);
    console.log(`  InTime: ${data.checkInTime?.toDate()?.toISOString() || 'N/A'}`);
  }

  process.exit(0);
}

main().catch(console.error);
