const fs = require("fs");

async function run() {
  try {
    const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config.tokens.access_token;
    const projectId = "ryb-limpiezas-app";
    
    const collections = [
      "communities", "scheduledServices", "workdays", "accessCodes", "materialRequests",
      "products", "stockMovements", "dailyMileage", "transfers", "systemNotifications",
      "settings", "taskTemplates"
    ];
    
    console.log("=== COUNTING DOCUMENTS UNDER COMPANIES/RAYBA/ ===");
    for (const coll of collections) {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/rayba/${coll}?pageSize=100`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        const count = data.documents ? data.documents.length : 0;
        console.log(`- companies/rayba/${coll}: ${count} documents found.`);
      } else {
        console.log(`- companies/rayba/${coll}: failed check (HTTP ${res.status}).`);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
