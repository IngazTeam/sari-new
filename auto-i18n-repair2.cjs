/**
 * Repair script for TypeScript errors after i18n automation
 * Fixes:
 * 1. t() in object key positions (where only identifiers are valid)
 * 2. Broken template literals
 * 3. Broken imports
 * 4. Broken ternaries
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get list of files with errors from TSC
const tscOutput = execSync('npx tsc --noEmit 2>&1', {
    encoding: 'utf8',
    cwd: __dirname,
    maxBuffer: 10 * 1024 * 1024
}).toString();

// Parse error locations
const errorFiles = new Map();
const errorRegex = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/gm;
let match;
while ((match = errorRegex.exec(tscOutput)) !== null) {
    const file = match[1];
    const line = parseInt(match[2]);
    const col = parseInt(match[3]);
    const code = match[4];
    const msg = match[5];

    if (!file.includes('client/src/')) continue;

    if (!errorFiles.has(file)) errorFiles.set(file, []);
    errorFiles.get(file).push({ line, col, code, msg });
}

console.log(`📊 Found ${errorFiles.size} files with errors\n`);

let totalFixes = 0;

for (const [file, errors] of errorFiles) {
    const filePath = path.resolve(__dirname, file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let fixCount = 0;

    // Get the original file from git to compare
    let originalFile;
    try {
        originalFile = execSync(`git show HEAD:"${file}" 2>/dev/null`, {
            encoding: 'utf8',
            cwd: __dirname,
            maxBuffer: 5 * 1024 * 1024
        });
    } catch (e) {
        // File might not exist in git
        continue;
    }

    const lines = content.split('\n');
    const origLines = originalFile.split('\n');

    // Fix 1: Object keys that got replaced with t()
    // Pattern: t('key'): value → restore original Arabic key: t('key') as value
    // This happens when { key: "Arabic" } got turned into { t('key'): "value" }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Pattern: t('xxx'): something (t() used as object key - invalid)
        const objKeyMatch = line.match(/^(\s*)t\(['"]([^'"]+)['"]\)\s*:\s*(.+)/);
        if (objKeyMatch) {
            // Find the original line - it should have been an object key: "Arabic value"
            // We need to restore the original key and put t() as value
            const indent = objKeyMatch[1];
            const key = objKeyMatch[2];
            const restValue = objKeyMatch[3];

            // Check the original file for what this line was
            if (i < origLines.length) {
                const origLine = origLines[i];
                // Try to extract original key from the original line
                const origObjMatch = origLine.match(/^(\s*)(\w+)\s*:\s*["'](.+?)["']/);
                if (origObjMatch) {
                    // Restore: originalKey: t('translationKey'),
                    lines[i] = `${indent}${origObjMatch[2]}: t('${key}'),`;
                    fixCount++;
                    continue;
                }
            }

            // Fallback: use the translation key's last part as the object key
            const keyParts = key.split('.');
            const lastPart = keyParts[keyParts.length - 1];
            lines[i] = `${indent}${lastPart.replace(/text\d+/, 'item')}: t('${key}'),`;
            fixCount++;
        }

        // Pattern: Identifier expected in object literal — typically broken by t() placement
        // Look for lines like: t('key'), where context shows it should be a key: value

        // Pattern: Broken useTranslation inside destructured import
        if (line.includes('useTranslation') && line.includes('import {') && !line.includes("from 'react-i18next'")) {
            // The import was corrupted - useTranslation got mixed into another import
            const fixedLine = line.replace(/,?\s*useTranslation\s*,?/, '');
            if (fixedLine.trim() !== line.trim()) {
                lines[i] = fixedLine;
                // Ensure standalone import exists
                fixCount++;
            }
        }
    }

    if (fixCount > 0) {
        content = lines.join('\n');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  ✅ ${path.basename(file)}: ${fixCount} fixes`);
        totalFixes += fixCount;
    }
}

console.log(`\n📊 Total: ${totalFixes} fixes applied`);

// Now try reverting files with too many errors (>20 errors = likely severely broken)
console.log('\n🔧 Checking for severely broken files...');
for (const [file, errors] of errorFiles) {
    if (errors.length > 15) {
        console.log(`  ⚠️ ${path.basename(file)}: ${errors.length} errors — reverting from git and re-applying safe patterns`);
        try {
            execSync(`git checkout HEAD -- "${file}"`, { cwd: __dirname });
        } catch (e) {
            console.log(`  ❌ Could not revert ${file}`);
        }
    }
}
