const fs = require("fs");
const https = require("https");

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const accessToken = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const workdayId = "YlC1183Dms2IFEygkJ1z";
const companyId = "rayba";

const endTimeStr = "2026-07-23T12:09:32.922Z";
const totalMinutes = 480;

function patchDocument(docPath, fields, updateMaskFields) {
  return new Promise((resolve, reject) => {
    const mask = updateMaskFields.map(f => `updateMask.fieldPaths=${f}`).join("&");
    const data = JSON.stringify({ fields });
    const options = {
      hostname: "firestore.googleapis.com",
      port: 443,
      path: `/v1/projects/${projectId}/databases/(default)/documents/${docPath}?${mask}`,
      method: "PATCH",
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
  console.log(`=== CLOSING WORKDAY ${workdayId} FOR ALEXANDRA PÁRRAGA ===`);
  const fields = {
    status: { stringValue: "completed" },
    endTime: { timestampValue: endTimeStr },
    totalMinutes: { integerValue: String(totalMinutes) },
    autoClosed: { booleanValue: true },
    autoCloseReason: { stringValue: "Cierre automático de jornada olvidada (>12h)" }
  };
  const result = await patchDocument(
    `companies/${companyId}/workdays/${workdayId}`,
    fields,
    ["status", "endTime", "totalMinutes", "autoClosed", "autoCloseReason"]
  );
  console.log("Patch Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
