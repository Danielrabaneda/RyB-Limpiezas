const fs = require("fs");
const https = require("https");

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const accessToken = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";

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
  console.log("--- Last 3 Workdays ---");
  const wdRes = await postFirestoreQuery("workdays", {
    from: [{ collectionId: "workdays" }],
    where: {
      fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "AuSojNbpE8dN7JbD3g3RWLyGGaH3" } }
    },
    orderBy: [{ field: { fieldPath: "startTime" }, direction: "DESCENDING" }],
    limit: 3
  });
  console.log(JSON.stringify(wdRes, null, 2));
}

main().catch(console.error);
