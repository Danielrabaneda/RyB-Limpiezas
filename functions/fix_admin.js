const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "ryb-limpiezas-app"
});

const db = admin.firestore();

async function main() {
  console.log("Fetching scheduled services to fix...");
  const snap = await db.collection("scheduledServices").get();
  const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const todayEnd = new Date();
  todayEnd.setHours(23,59,59,999);
  
  const todayServices = services.filter(s => {
    if (!s.scheduledDate) return false;
    const date = s.scheduledDate.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
    return date >= todayStart && date <= todayEnd;
  });

  const missedServices = todayServices.filter(s => s.status === 'missed');
  
  console.log(`Found ${missedServices.length} missed services today.`);
  
  for (const s of missedServices) {
    const sName = (s.taskName || '').toLowerCase();
    console.log(`Updating service: ${s.id} | ${sName}`);
    await db.collection("scheduledServices").doc(s.id).update({
        status: "completed"
    });
    console.log(`- Updated ${s.id} to completed`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(console.error);
