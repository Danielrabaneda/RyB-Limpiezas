const fs = require('fs');

const config = JSON.parse(fs.readFileSync('C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json', 'utf8'));
const token = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";

async function runQuery(collectionId, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...structuredQuery
      }
    })
  });
  
  const results = await response.json();
  return results
    .filter(r => r.document)
    .map(r => {
      const doc = r.document;
      return {
        id: doc.name.split('/').pop(),
        fields: doc.fields
      };
    });
}

async function run() {
  const workdays = await runQuery("workdays", {});
  const kesiaUid = "dcbgbPUz66aTkJ0RXV9cnfCCfPm1";

  console.log("=== CHECK IF KESIA IS MENTIONED ANYWHERE IN WORKDAYS ===");
  workdays.forEach(w => {
    const rawStr = JSON.stringify(w.fields || {});
    if (rawStr.includes("Kesia") || rawStr.includes(kesiaUid)) {
      console.log(`Found Kesia in Workday ID: ${w.id}`, w.fields);
    }
  });

  console.log("=== CHECK IF KESIA IS MENTIONED ANYWHERE IN CHECKINS ===");
  const checkIns = await runQuery("checkIns", {});
  checkIns.forEach(c => {
    const rawStr = JSON.stringify(c.fields || {});
    if (rawStr.includes("Kesia") || rawStr.includes(kesiaUid)) {
      console.log(`Found Kesia in CheckIn ID: ${c.id}`, c.fields);
    }
  });

  console.log("=== CHECK IF KESIA IS MENTIONED ANYWHERE IN SCHEDULED SERVICES ===");
  const services = await runQuery("scheduledServices", {});
  services.forEach(s => {
    const rawStr = JSON.stringify(s.fields || {});
    if (rawStr.includes("Kesia") || rawStr.includes(kesiaUid)) {
      console.log(`Found Kesia in Service ID: ${s.id}`, s.fields);
    }
  });
}

run().catch(console.error);
