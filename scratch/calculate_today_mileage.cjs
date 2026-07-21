const fs = require("fs");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

// Initialize Admin SDK using default credentials or emulator if active
if (process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.GCLOUD_PROJECT = "demo-project";
  initializeApp({ projectId: "demo-project" });
} else {
  // Read token and initialize for production
  const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  // We'll initialize firebase-admin for the production project
  initializeApp({
    projectId: "ryb-limpiezas-app"
  });
}

const db = getFirestore();
const companyId = "rayba";
const targetDateStr = "2026-07-20";

async function run() {
  try {
    console.log(`=== CALCULATING MILEAGE FOR ${targetDateStr} ===`);
    
    // Find all workdays for today
    const workdaysRef = db.collection(`companies/${companyId}/workdays`);
    const snap = await workdaysRef.where("date", "==", targetDateStr).get();
    
    if (snap.empty) {
      console.log("No workdays found for today.");
      return;
    }
    
    console.log(`Found ${snap.size} workdays today.`);
    
    for (const doc of snap.docs) {
      const wd = doc.data();
      const userId = wd.userId;
      const userName = wd.userName || "Operario";
      const carSessions = wd.carSessions || [];
      
      console.log(`\nProcessing user: ${userName} (${userId})`);
      
      // Let's run a calculation helper directly inside our script to avoid importing client-side helpers
      // We will fetch check-ins for this user today from production
      const checkInsRef = db.collection(`companies/${companyId}/checkIns`);
      const start = new Date(targetDateStr + "T00:00:00.000Z");
      const end = new Date(targetDateStr + "T23:59:59.999Z");
      
      const checkInSnap = await checkInsRef
        .where("userId", "==", userId)
        .where("checkInTime", ">=", Timestamp.fromDate(start))
        .where("checkInTime", "<=", Timestamp.fromDate(end))
        .get();
        
      console.log(`Found ${checkInSnap.size} check-ins today.`);
      
      // If there are no check-ins, we can't calculate mileage
      if (checkInSnap.empty) {
        console.log("No check-ins today, skipping.");
        continue;
      }
      
      // Import/require the local mileageService to execute the correct calculateDailyMileage!
      // But wait: mileageService.js is an ES Module!
      // Since it's an ES Module, we can import it using dynamic import in Node.
      const path = require("path");
      const mileageServicePath = path.resolve(__dirname, "../src/services/mileageService.js");
      
      // Wait, Node.js require() cannot load ES Module directly unless we use dynamic import.
      // Let's implement the calculation directly in this script, or load it via dynamic import.
      // Let's write a simple JS function to call the recalculated mileage
      // Let's do it using dynamic import:
      const { calculateDailyMileage } = await import("file://" + mileageServicePath.replace(/\\/g, "/"));
      
      const date = new Date(targetDateStr);
      const res = await calculateDailyMileage(companyId, userId, date, userName, carSessions);
      console.log("Calculation result:", res);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
