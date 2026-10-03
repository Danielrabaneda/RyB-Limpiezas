const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
for (const script of ["seedData.cjs", "migrateToMultiTenant.cjs"]) {
  execFileSync(process.execPath, [path.join(__dirname, script)], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}
