const fs = require('fs');

const config = JSON.parse(fs.readFileSync('C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json', 'utf8'));
const token = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const userId = "3sn1FsGPgNT2NcfXfwXIjZF513I3"; // Daniel Rabaneda

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
    .map(r => r.document.name);
}

async function run() {
  const paths = await runQuery("scheduledServices", {
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "assignedUserId" },
              op: "EQUAL",
              value: { stringValue: userId }
            }
          }
        ]
      }
    }
  });

  console.log(`Total services paths found: ${paths.length}`);
  const uniqueCompanies = new Set();
  paths.forEach(p => {
    // Path format: projects/ryb-limpiezas-app/databases/(default)/documents/companies/rayba/scheduledServices/ID
    const parts = p.split('/');
    const companyIndex = parts.indexOf("companies");
    if (companyIndex !== -1 && companyIndex + 1 < parts.length) {
      uniqueCompanies.add(parts[companyIndex + 1]);
    }
  });
  console.log("Unique companyIds in paths:", Array.from(uniqueCompanies));
  console.log("First 10 paths:");
  paths.slice(0, 10).forEach(p => console.log(`  - ${p}`));
}

run().catch(console.error);
