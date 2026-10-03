const fs = require("fs");
const path = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";

async function run() {
  try {
    const config = JSON.parse(fs.readFileSync(path, "utf8"));
    const token = config.tokens.access_token;
    
    const url = "https://firestore.googleapis.com/v1/projects/ryb-limpiezas-app/databases/(default)/documents/companies/rayba:runQuery";
    
    const queryBody = {
      "structuredQuery": {
        "from": [{ "collectionId": "dailyMileage", "allDescendants": false }],
        "where": {
          "fieldFilter": {
            "field": { "fieldPath": "date" },
            "op": "EQUAL",
            "value": { "timestampValue": "2026-07-19T22:00:00Z" }
          }
        }
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryBody)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    console.log("Query returned items:", data.length);
    const results = data
      .filter(item => item.document)
      .map(item => {
        const d = item.document;
        const fields = d.fields;
        return {
          userName: fields.userName?.stringValue,
          userId: fields.userId?.stringValue,
          date: fields.date?.timestampValue,
          totalKm: fields.totalKm?.doubleValue || fields.totalKm?.integerValue,
          path: d.name
        };
      });
      
    console.log("Daily mileage today:", results);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
