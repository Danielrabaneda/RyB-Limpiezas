const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.GCLOUD_PROJECT = "demo-project";
}
initializeApp({ projectId: "demo-project" });
const auth = getAuth();

async function verify() {
  console.log("Verifying custom claims for user1...");
  const user1 = await auth.getUser("user1");
  console.log(`User1 claims:`, user1.customClaims);

  console.log("Verifying custom claims for user2...");
  const user2 = await auth.getUser("user2");
  console.log(`User2 claims:`, user2.customClaims);
}

verify().catch(console.error);
