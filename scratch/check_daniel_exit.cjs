const fs = require("fs");
const https = require("https");

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const accessToken = config.tokens.access_token;
const projectId = "ryb-limpiezas-app";
const companyId = "rayba";

function postFirestoreQuery(parentPath, structuredQuery) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ structuredQuery });
    const options = {
      hostname: "firestore.googleapis.com",
      port: 443,
      path: `/v1/projects/${projectId}/databases/(default)/documents/${parentPath}:runQuery`,
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
  console.log("=== CHECKING USERS FOR DANIEL RABANEDA ===");
  const usersRes = await postFirestoreQuery("", {
    from: [{ collectionId: "users" }]
  });

  let danielId = null;
  if (Array.isArray(usersRes)) {
    for (const item of usersRes) {
      if (!item.document) continue;
      const name = item.document.fields?.name?.stringValue || "";
      if (name.toLowerCase().includes("daniel") || name.toLowerCase().includes("rabaneda")) {
        danielId = item.document.name.split("/").pop();
        console.log("Found Daniel Rabaneda UID:", danielId, "Name:", name);
      }
    }
  }

  if (!danielId) {
    console.log("No Daniel Rabaneda found in users");
    return;
  }

  console.log("\n--- CheckIns for Daniel ---");
  const ciRes = await postFirestoreQuery(`companies/${companyId}`, {
    from: [{ collectionId: "checkIns" }],
    where: {
      fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: danielId } }
    }
  });

  if (Array.isArray(ciRes)) {
    for (const item of ciRes) {
      if (!item.document) continue;
      const fields = item.document.fields;
      console.log("CheckIn ID:", item.document.name.split("/").pop());
      console.log("  checkInTime:", fields.checkInTime?.timestampValue);
      console.log("  checkOutTime:", fields.checkOutTime ? fields.checkOutTime.timestampValue : null);
      console.log("  communityId:", fields.communityId?.stringValue);
      console.log("  scheduledServiceId:", fields.scheduledServiceId?.stringValue);
    }
  }
}

main().catch(console.error);
