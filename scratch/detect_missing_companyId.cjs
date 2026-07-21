const fs = require("fs");
const path = require("path");

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

console.log("=== SCANNING FOR UNDECLARED companyId ===");
walkDir("src", (filePath) => {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) return;
  const content = fs.readFileSync(filePath, "utf8");
  
  if (content.includes("companyId")) {
    // Check if companyId is declared or defined in the file
    const hasConstDestructure = content.includes("companyId } =");
    const hasConstAssign = content.includes("const companyId");
    const hasLetAssign = content.includes("let companyId");
    const hasVarAssign = content.includes("var companyId");
    const hasParam = content.includes("(companyId") || content.includes(", companyId") || content.includes("companyId,");
    const hasImport = content.includes("import companyId");
    
    if (!hasConstDestructure && !hasConstAssign && !hasLetAssign && !hasVarAssign && !hasParam && !hasImport) {
      // It might be undeclared!
      console.log(`\nPotential undeclared companyId in file: ${filePath}`);
      // Print lines containing companyId
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (line.includes("companyId")) {
          console.log(`  Line ${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
console.log("\nScan complete.");
