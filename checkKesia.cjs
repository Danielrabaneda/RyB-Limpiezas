const fs = require('fs');

const config = JSON.parse(fs.readFileSync('C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json', 'utf8'));
const token = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const kesiaUid = "dcbgbPUz66aTkJ0RXV9cnfCCfPm1";

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
  console.log("=== ALL ACTIVE WORKDAYS IN THE SYSTEM ===");
  const allActiveWorkdays = await runQuery("workdays", {
    where: {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: { stringValue: "active" }
      }
    }
  });

  console.log(`Found ${allActiveWorkdays.length} active workdays total:`);
  allActiveWorkdays.forEach(w => {
    console.log(`- Workday ID: ${w.id} | userId: ${w.userId} | date: ${w.date} | currentCompanionId: ${w.currentCompanionId} | startTime: ${w.startTime}`);
  });

  console.log("\n=== ALL CHECKINS FOR KESIA ===");
  const checkIns = await runQuery("checkIns", {
    where: {
      fieldFilter: {
        field: { fieldPath: "userId" },
        op: "EQUAL",
        value: { stringValue: kesiaUid }
      }
    }
  });
  console.log("Kesia checkIns:", checkIns);

  console.log("\n=== ALL WORKDAYS IN THE SYSTEM (LAST 10) ===");
  const allWorkdays = await runQuery("workdays", {});
  allWorkdays.sort((a, b) => (b.date || b.startTime || "").localeCompare(a.date || a.startTime || ""));
  allWorkdays.slice(0, 10).forEach(w => {
    console.log(`- ID: ${w.id} | userId: ${w.userId} | status: ${w.status} | companion: ${w.currentCompanionId} | date: ${w.date} | start: ${w.startTime} | end: ${w.endTime}`);
  });
}

run().catch(console.error);
