const admin = require("firebase-admin");
const fs = require("fs");

let serviceAccount;
try {
  serviceAccount = JSON.parse(
    fs.readFileSync("./scratch/serviceAccountKey.json", "utf8"),
  );
} catch (e) {
  console.error("No serviceAccountKey.json found!");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const userId = "AuSojNbpE8dN7JbD3g3RWLyGGaH3"; // Alexandra Párraga

async function inspectOperator() {
  console.log(`Admin Inspecting records for Operator UID: ${userId}`);

  // 1. Inspect Workdays
  console.log("\n--- 1. WORKDAYS ---");
  const wdSnap = await db
    .collection("workdays")
    .where("userId", "==", userId)
    .get();
  console.log(`Found ${wdSnap.size} total workday sessions.`);
  wdSnap.forEach((doc) => {
    const data = doc.data();
    const dateStr = data.date
      ? data.date.toDate
        ? data.date.toDate().toISOString()
        : JSON.stringify(data.date)
      : "N/A";
    const startStr = data.startTime
      ? data.startTime.toDate
        ? data.startTime.toDate().toISOString()
        : JSON.stringify(data.startTime)
      : "N/A";
    const endStr = data.endTime
      ? data.endTime.toDate
        ? data.endTime.toDate().toISOString()
        : JSON.stringify(data.endTime)
      : "N/A";
    if (data.status === "active") {
      console.log(`[ACTIVE WORKDAY] ID: ${doc.id}`);
      console.log(`  Date: ${dateStr}`);
      console.log(`  StartTime: ${startStr}`);
      console.log(`  EndTime: ${endStr}`);
      console.log(`  Status: ${data.status}`);
    } else {
      console.log(
        `[COMPLETED] ID: ${doc.id}, Date: ${dateStr}, Start: ${startStr}, End: ${endStr}`,
      );
    }
  });

  // 2. Inspect Check-Ins
  console.log("\n--- 2. CHECK-INS ---");
  const ciSnap = await db
    .collection("checkIns")
    .where("userId", "==", userId)
    .get();
  console.log(`Found ${ciSnap.size} total check-in records.`);
  ciSnap.forEach((doc) => {
    const data = doc.data();
    const checkInStr = data.checkInTime
      ? data.checkInTime.toDate
        ? data.checkInTime.toDate().toISOString()
        : JSON.stringify(data.checkInTime)
      : "N/A";
    const checkOutStr = data.checkOutTime
      ? data.checkOutTime.toDate
        ? data.checkOutTime.toDate().toISOString()
        : JSON.stringify(data.checkOutTime)
      : "null";
    if (data.checkOutTime === null) {
      console.log(`[OPEN CHECK-IN] ID: ${doc.id}`);
      console.log(`  Service ID: ${data.scheduledServiceId}`);
      console.log(`  Community ID: ${data.communityId}`);
      console.log(`  Check-in Time: ${checkInStr}`);
      console.log(`  Check-out Time: ${checkOutStr}`);
    } else {
      console.log(
        `[CLOSED] ID: ${doc.id}, Service ID: ${data.scheduledServiceId}, In: ${checkInStr}, Out: ${checkOutStr}`,
      );
    }
  });

  // 3. Inspect Scheduled Services
  console.log("\n--- 3. SCHEDULED SERVICES ---");
  const ssSnap = await db
    .collection("scheduledServices")
    .where("assignedUserId", "==", userId)
    .get();
  console.log(`Found ${ssSnap.size} total assigned scheduled services.`);
  ssSnap.forEach((doc) => {
    const data = doc.data();
    const dateStr = data.date
      ? data.date.toDate
        ? data.date.toDate().toISOString()
        : JSON.stringify(data.date)
      : "N/A";
    if (data.status === "in_progress") {
      console.log(`[IN PROGRESS SERVICE] ID: ${doc.id}`);
      console.log(`  Date: ${dateStr}`);
      console.log(`  Community ID: ${data.communityId}`);
      console.log(`  Status: ${data.status}`);
    } else {
      console.log(
        `[${data.status.toUpperCase()}] ID: ${doc.id}, Date: ${dateStr}, Community ID: ${data.communityId}`,
      );
    }
  });

  process.exit(0);
}

inspectOperator().catch((err) => {
  console.error(err);
  process.exit(1);
});
