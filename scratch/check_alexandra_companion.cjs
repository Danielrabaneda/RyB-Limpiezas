const fs = require("fs");
const https = require("https");

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const accessToken = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const alexandraId = "AuSojNbpE8dN7JbD3g3RWLyGGaH3";

function postFirestoreQuery(collectionId, structuredQuery) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ structuredQuery });
    const options = {
      hostname: "firestore.googleapis.com",
      port: 443,
      path: `/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log("=== ROOT CHECKINS FOR ALEXANDRA AFTER JUL 10 ===");
  const ciRes = await postFirestoreQuery("checkIns", {
    from: [{ collectionId: "checkIns" }],
    where: {
      fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: alexandraId } }
    }
  });

  for (const item of ciRes) {
    if (!item.document) continue;
    const fields = item.document.fields;
    const checkInTime = fields.checkInTime?.timestampValue;
    const checkOutTime = fields.checkOutTime?.timestampValue;
    if (checkInTime && checkInTime > "2026-07-15") {
      console.log("CheckIn:", item.document.name.split("/").pop());
      console.log("  In:", checkInTime, "Out:", checkOutTime);
    }
  }
}

main().catch(console.error);
