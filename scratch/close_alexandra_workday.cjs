const fs = require("fs");
const { UserRefreshClient } = require("google-auth-library");
const https = require("https");

const configPath = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const refreshToken = config.tokens.refresh_token;
const projectId = "ryb-limpiezas-app";
const workdayId = "YlC1183Dms2IFEygkJ1z";
const companyId = "rayba";

async function main() {
  // Firebase CLI OAuth client credentials
  const client = new UserRefreshClient({
    clientId: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
    clientSecret: "V2p0-fz33nWZUYhpAtA3B7Dq", // firebase-tools client secret
    refreshToken: refreshToken,
  });

  const credentials = await client.refreshAccessToken();
  const accessToken = credentials.credentials.access_token;
  console.log("Got access token!");

  const endTimeStr = "2026-07-23T12:09:32.922Z";
  const totalMinutes = 480;

  const fields = {
    status: { stringValue: "completed" },
    endTime: { timestampValue: endTimeStr },
    totalMinutes: { integerValue: String(totalMinutes) },
    autoClosed: { booleanValue: true },
    autoCloseReason: { stringValue: "Cierre automático de jornada olvidada (>12h)" }
  };

  const mask = ["status", "endTime", "totalMinutes", "autoClosed", "autoCloseReason"]
    .map(f => `updateMask.fieldPaths=${f}`).join("&");
  const data = JSON.stringify({ fields });

  const options = {
    hostname: "firestore.googleapis.com",
    port: 443,
    path: `/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/workdays/${workdayId}?${mask}`,
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
      console.log("Patch Result:", body);
    });
  });

  req.write(data);
  req.end();
}

main().catch(console.error);
