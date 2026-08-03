const client = require("firebase-tools");

async function main() {
  console.log("Checking firebase-tools...");
  const token = await client.login.ci();
  console.log("Token:", token);
}

main().catch(console.error);
