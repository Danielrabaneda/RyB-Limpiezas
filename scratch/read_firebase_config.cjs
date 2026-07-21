const fs = require("fs");
const path = "C:\\Users\\Hp\\.config\\configstore\\firebase-tools.json";
try {
  const content = JSON.parse(fs.readFileSync(path, "utf8"));
  console.log("Keys in config:", Object.keys(content));
  if (content.tokens) {
    console.log("Tokens keys:", Object.keys(content.tokens));
  }
  if (content.user) {
    console.log("User email:", content.user.email);
  }
} catch (err) {
  console.error("Error reading file:", err);
}
