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
  // Query all services in July 13th, 2026 local Madrid time (2026-07-12T22:00:00Z to 2026-07-13T21:59:59Z)
  console.log("=== SERVICES IN JULY 13, 2026 ===");
  const services = await runQuery("scheduledServices", {
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "scheduledDate" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: "2026-07-12T22:00:00Z" }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: "scheduledDate" },
              op: "LESS_THAN_OR_EQUAL",
              value: { timestampValue: "2026-07-13T22:00:00Z" }
            }
          }
        ]
      }
    }
  });

  services.forEach(s => {
    console.log(`\nService: ${s.taskName} (${s.id})`);
    console.log(`  assignedUserId: ${s.assignedUserId}`);
    console.log(`  scheduledDate: ${s.scheduledDate}`);
    console.log(`  status: ${s.status}`);
    console.log(`  communityId: ${s.communityId}`);
    console.log(`  companionIds:`, JSON.stringify(s.companionIds));
  });
}

run().catch(console.error);
