/**
 * Repair script — fixes the two main issues from automated i18n:
 * 1. useTranslation import inserted inside multi-line import blocks
 * 2. Broken ternary expressions from Phase 2 replacements
 */

const fs = require('fs');
const path = require('path');

const MERCHANT_DIR = path.join(__dirname, 'client', 'src', 'pages', 'merchant');

let fixCount = 0;

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    let fileFixCount = 0;

    // === Fix 1: useTranslation import inserted inside multi-line import block ===
    // Pattern: import {\nimport { useTranslation } from 'react-i18next';\n  Dialog,
    // Fix: Move the useTranslation import before the multi-line import
    const brokenImportPattern = /import \{\r?\n(import \{ useTranslation \} from 'react-i18next';)\r?\n/g;
    if (brokenImportPattern.test(content)) {
        content = content.replace(brokenImportPattern, (match, translationImport) => {
            fileFixCount++;
            return `${translationImport}\nimport {\n`;
        });
    }

    // Also check for already having a valid useTranslation import + the broken extra one
    // Remove duplicate useTranslation imports
    const imports = content.match(/import \{ useTranslation \} from 'react-i18next';/g);
    if (imports && imports.length > 1) {
        // Remove duplicates, keep only the first one
        let firstFound = false;
        content = content.replace(/import \{ useTranslation \} from 'react-i18next';\r?\n/g, (match) => {
            if (!firstFound) {
                firstFound = true;
                return match;
            }
            fileFixCount++;
            return '';
        });
    }

    // === Fix 2: Broken ternary expressions ===
    // Pattern: {condition\n  {t('key')}\n  : otherCondition  
    // This happens when the script replaced ? "Arabic" with {t('key')} but lost the ? 
    // Need to add back the ? before t()

    // Pattern A: condition\n  {t('page.key')}\n  : 
    // Should be: condition\n  ? t('page.key')\n  :
    const brokenTernaryA = /(\S+)\s*\r?\n(\s+)\{t\('([^']+)'\)\}\r?\n(\s+):/g;
    content = content.replace(brokenTernaryA, (match, condition, indent, key, indent2) => {
        // Only fix if condition doesn't already end with ?
        if (condition.endsWith('?')) return match;
        fileFixCount++;
        return `${condition}\n${indent}? t('${key}')\n${indent2}:`;
    });

    // Pattern B: Same but with variables: {t('page.key', { var0: ... })}
    const brokenTernaryB = /(\S+)\s*\r?\n(\s+)\{t\('([^']+)',\s*(\{[^}]+\})\)\}\r?\n(\s+):/g;
    content = content.replace(brokenTernaryB, (match, condition, indent, key, vars, indent2) => {
        if (condition.endsWith('?')) return match;
        fileFixCount++;
        return `${condition}\n${indent}? t('${key}', ${vars})\n${indent2}:`;
    });

    if (fileFixCount > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        fixCount += fileFixCount;
        console.log(`✅ ${filename}: ${fileFixCount} fixes`);
    }
}

// Process all files
console.log('🔧 Repairing broken files...\n');

const files = fs.readdirSync(MERCHANT_DIR)
    .filter(f => f.endsWith('.tsx'));

files.forEach(file => {
    fixFile(path.join(MERCHANT_DIR, file));
});

console.log(`\n✅ Done! Applied ${fixCount} fixes.`);
