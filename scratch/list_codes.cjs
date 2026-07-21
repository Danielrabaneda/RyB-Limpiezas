const fs = require("fs");

async function run() {
  try {
    const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config.tokens.access_token;
    
    // List accessCodeIndex
    const url = "https://firestore.googleapis.com/v1/projects/ryb-limpiezas-app/databases/(default)/documents/accessCodeIndex";
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    
    const data = await res.json();
    console.log("=== ACCESS CODE INDEX ===");
    if (!data.documents) {
      console.log("No documents found in accessCodeIndex collection.");
      return;
    }
    
    for (const doc of data.documents) {
      const code = doc.name.split("/").pop();
      console.log(`Code: ${code}`);
      console.log(JSON.stringify(doc.fields, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
