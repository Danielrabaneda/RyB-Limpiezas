const admin = require("firebase-admin");
admin.initializeApp({
  projectId: "ryb-limpiezas-app"
});
const db = admin.firestore();
async function run() {
  const snapshot = await db.collection("communities").get();
  snapshot.forEach(doc => {
    if (doc.data().name.toLowerCase().includes("huerto")) {
      console.log(doc.id, doc.data().name);
    }
  });
}
run().catch(console.error);
