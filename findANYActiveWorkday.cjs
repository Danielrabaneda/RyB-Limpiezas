const fs = require('fs');

const config = JSON.parse(fs.readFileSync('C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json', 'utf8'));
const token = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const companyId = "rayba";

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
      const fields = {};
      for (const [key, val] of Object.entries(doc.fields || {})) {
        if (val.stringValue !== undefined) fields[key] = val.stringValue;
        else if (val.integerValue !== undefined) fields[key] = parseInt(val.integerValue);
        else if (val.booleanValue !== undefined) fields[key] = val.booleanValue;
        else if (val.timestampValue !== undefined) fields[key] = val.timestampValue;
        else if (val.mapValue !== undefined) fields[key] = val.mapValue;
        else if (val.arrayValue !== undefined) fields[key] = val.arrayValue;
        else fields[key] = val;
      }
      return {
        id: doc.name.split('/').pop(),
        ...fields
      };
    });
}

async function run() {
  console.log("=== CHECKING ALL WORKDAYS FOR STATUS ACTIVE ===");
  const workdays = await runQuery("workdays", {});
  console.log(`Total workdays in DB: ${workdays.length}`);
  const activeWds = workdays.filter(w => w.status === "active" || w.active === true);
  console.log(`Active workdays in DB: ${activeWds.length}`, activeWds);

  console.log("\n=== CHECKING ALL CHECKINS FOR OPEN OR ACTIVE ===");
  const checkIns = await runQuery("checkIns", {});
  console.log(`Total checkIns in DB: ${checkIns.length}`);
  const openCheckIns = checkIns.filter(c => !c.checkOutTime || c.status === "active");
  console.log(`Open checkIns in DB: ${openCheckIns.length}`, openCheckIns);
}

run().catch(console.error);
