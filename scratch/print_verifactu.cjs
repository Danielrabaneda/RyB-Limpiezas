const fs = require("fs");

async function run() {
  try {
    const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config.tokens.access_token;
    const projectId = "ryb-limpiezas-app";
    
    // Fetch Root settings/billing
    const rootRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/billing`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const rootData = await rootRes.json();

    // Fetch Migrated companies/rayba/settings/billing
    const tenantRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/rayba/settings/billing`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const tenantData = await tenantRes.json();
    
    console.log("Root Document Fields:");
    console.log("- nextInvoiceSeq:", rootData.fields?.nextInvoiceSeq);
    console.log("- lastInvoiceHash:", rootData.fields?.lastInvoiceHash);
    
    console.log("\nMigrated Document Fields:");
    console.log("- nextInvoiceSeq:", tenantData.fields?.nextInvoiceSeq);
    console.log("- lastInvoiceHash:", tenantData.fields?.lastInvoiceHash);

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
