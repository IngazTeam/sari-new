/**
 * Automated namespace import converter — DEEP (recursive)
 * Converts all files in server/ and subdirectories
 */

const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, 'server');

// Recursively find all .ts files
function findFiles(dir) {
  let results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.includes('node_modules')) {
      results = results.concat(findFiles(fullPath));
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts') && item.name !== 'db.ts' && item.name !== '_shared.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = findFiles(serverDir);

// Filter to files with "import * as db"
const files = allFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf-8');
  return /import \* as db from/.test(content);
});

console.log(`Found ${files.length} files with "import * as db" in subdirectories`);

let totalConverted = 0;
let errors = [];

for (const filePath of files) {
  const relPath = path.relative(__dirname, filePath);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Find all db.xxx patterns — extract function/property names
  const dbRefPattern = /\bdb\.(\w+)/g;
  const funcNames = new Set();
  let match;
  
  while ((match = dbRefPattern.exec(content)) !== null) {
    funcNames.add(match[1]);
  }
  
  if (funcNames.size === 0) {
    // Has import but no usage — remove the import
    const importMatch = content.match(/import \* as db from ['"](.*?)['"];?\r?\n/);
    if (importMatch) {
      content = content.replace(importMatch[0], `// DB import removed — unused\n`);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`  🧹 ${relPath} — removed unused import`);
      totalConverted++;
    }
    continue;
  }
  
  const sortedFuncs = [...funcNames].sort();
  
  // Find the import and its path
  const importMatch = content.match(/import \* as db from ['"](.*?)['"];?\r?\n/);
  if (!importMatch) {
    console.log(`  ERROR ${relPath} — could not find import pattern`);
    errors.push(relPath);
    continue;
  }
  
  const importPath = importMatch[1];
  
  // Build new import
  const importLine = sortedFuncs.length <= 3
    ? `import { ${sortedFuncs.join(', ')} } from '${importPath}';`
    : `import {\n  ${sortedFuncs.join(',\n  ')},\n} from '${importPath}';`;
  
  let newContent = content.replace(importMatch[0], importLine + '\n');
  
  // Replace all db.funcName with funcName
  for (const func of sortedFuncs) {
    const callRegex = new RegExp(`\\bdb\\.${func}\\b`, 'g');
    newContent = newContent.replace(callRegex, func);
  }
  
  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`  ✅ ${relPath} — converted ${funcNames.size} functions`);
  totalConverted++;
}

console.log(`\n=== SUMMARY ===`);
console.log(`Converted: ${totalConverted} files`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) console.log(`  ${errors.join('\n  ')}`);
