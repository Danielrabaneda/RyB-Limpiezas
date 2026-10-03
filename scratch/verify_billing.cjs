const fs = require("fs");

async function run() {
  try {
    const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config.tokens.access_token;
    const projectId = "ryb-limpiezas-app";
    
    // Fetch Root settings/billing
    const rootUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/billing`;
    const rootRes = await fetch(rootUrl, { headers: { Authorization: `Bearer ${token}` } });
    const rootData = rootRes.ok ? await rootRes.json() : null;

    // Fetch Migrated companies/rayba/settings/billing
    const tenantUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/rayba/settings/billing`;
    const tenantRes = await fetch(tenantUrl, { headers: { Authorization: `Bearer ${token}` } });
    const tenantData = tenantRes.ok ? await tenantRes.json() : null;
    
    if (!rootData || !tenantData) {
      console.log("Error: One or both documents could not be fetched.");
      return;
    }

    const rootFields = rootData.fields || {};
    const tenantFields = tenantData.fields || {};

    const allKeys = new Set([...Object.keys(rootFields), ...Object.keys(tenantFields)]);
    const diffs = [];

    for (const key of allKeys) {
      if (!(key in rootFields)) {
        diffs.push({ key, type: "only_in_tenant", tenantVal: tenantFields[key] });
      } else if (!(key in tenantFields)) {
        diffs.push({ key, type: "only_in_root", rootVal: rootFields[key] });
      } else {
        const rootStr = JSON.stringify(rootFields[key]);
        const tenantStr = JSON.stringify(tenantFields[key]);
        if (rootStr !== tenantStr) {
          diffs.push({ key, type: "mismatch", rootVal: rootFields[key], tenantVal: tenantFields[key] });
        }
      }
    }

    console.log(`=== BILLING SETTINGS DIFFS: ${diffs.length} differences ===`);
    console.log(JSON.stringify(diffs, null, 2));

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
