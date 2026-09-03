const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(WORKSPACE_DIR, 'src', 'services');
const SRC_DIR = path.join(WORKSPACE_DIR, 'src');
const OUTPUT_FILE = path.join(WORKSPACE_DIR, 'audit_results.json');

function getServiceFunctions() {
  if (!fs.existsSync(SERVICES_DIR)) {
    console.error(`Services directory not found: ${SERVICES_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(SERVICES_DIR);
  const functions = {};

  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(SERVICES_DIR, file), 'utf8');

    // Match export async function name(companyId, ...
    // Match export function name(companyId, ...
    const matches = content.matchAll(/export\s+(async\s+)?function\s+(\w+)\s*\(\s*companyId\b/g);
    for (const match of matches) {
      functions[match[2]] = file;
    }
  }
  return functions;
}

function auditCalls(functions) {
  const walk = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        if (file !== 'node_modules' && file !== 'services' && file !== 'config') {
          results = results.concat(walk(fullPath));
        }
      } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  const files = walk(SRC_DIR);
  const findings = [];

  for (const file of files) {
    const relativePath = path.relative(SRC_DIR, file);
    const fileContent = fs.readFileSync(file, 'utf8');

    for (const fn of Object.keys(functions)) {
      let index = 0;
      while ((index = fileContent.indexOf(fn + '(', index)) !== -1) {
        // Find the matching closing parenthesis
        let openParentheses = 1;
        let charIndex = index + fn.length + 1;
        let argsContent = '';

        while (charIndex < fileContent.length && openParentheses > 0) {
          const char = fileContent[charIndex];
          if (char === '(') openParentheses++;
          else if (char === ')') openParentheses--;

          if (openParentheses > 0) {
            argsContent += char;
          }
          charIndex++;
        }

        const argsStr = argsContent.trim();
        const firstArg = argsStr.split(',')[0].trim();

        // Check if the first argument is not companyId
        const isLegacy = firstArg !== 'companyId';

        if (isLegacy) {
          // Find line number
          const lineNum = fileContent.substring(0, index).split('\n').length;
          findings.push({
            file: relativePath,
            lineNum,
            function: fn,
            serviceFile: functions[fn],
            args: argsStr.replace(/\s+/g, ' '),
            snippet: fileContent.substring(index, index + 100).replace(/\s+/g, ' ') + '...'
          });
        }

        index += fn.length + 1;
      }
    }
  }

  return findings;
}

const functions = getServiceFunctions();
const findings = auditCalls(functions);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(findings, null, 2), 'utf8');
console.log(`Successfully wrote ${findings.length} findings to ${OUTPUT_FILE}`);
if (findings.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
