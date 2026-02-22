/**
 * Auto-i18n batch script for merchant pages
 * 
 * This script:
 * 1. Scans each merchant page for Arabic strings
 * 2. Generates translation keys automatically
 * 3. Patches the source files with t() calls
 * 4. Updates all 8 locale files with new keys
 */

const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.join(__dirname, 'client', 'src', 'locales');
const MERCHANT_DIR = path.join(__dirname, 'client', 'src', 'pages', 'merchant');
const LOCALES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

// Files already translated
const DONE = [
    'Dashboard', 'Orders', 'Products', 'Campaigns', 'Conversations', 'Settings',
    'Payments', 'BotSettings', 'AnalyticsDashboard', 'TestSari', 'GreenAPISetupGuide',
    'UploadProducts'
];

// Helper: convert PascalCase filename to camelCase page key
function fileToPageKey(filename) {
    const base = filename.replace('.tsx', '');
    return base.charAt(0).toLowerCase() + base.slice(1) + 'Page';
}

// Helper: generate a key name from Arabic text
function generateKeyName(arabic, index) {
    // Use a simple numbered approach with a semantic prefix
    return `text${index}`;
}

// Regex to find Arabic strings in JSX/TSX
// Matches strings containing Arabic characters in common patterns:
// 1. >Arabic text< (JSX text content)
// 2. "Arabic text" or 'Arabic text' (string literals)
// 3. `template with ${var} and Arabic`
const ARABIC_REGEX = /[\u0600-\u06FF]/;

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const filename = path.basename(filePath);
    const pageKey = fileToPageKey(filename);

    // Check if useTranslation is already imported
    const hasTranslation = content.includes('useTranslation');

    // Collect all Arabic strings and their replacements
    const translations = {};
    let keyIndex = 0;
    let newContent = content;

    // Track replacements to avoid double-replacing
    const replacements = [];

    lines.forEach((line, lineIdx) => {
        if (!ARABIC_REGEX.test(line)) return;

        // Skip import lines, comments
        const trimmed = line.trim();
        if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

        // Pattern 1: JSX text content between tags: >Arabic text<
        const jsxTextPattern = />([^<]*[\u0600-\u06FF][^<]*)</g;
        let match;
        while ((match = jsxTextPattern.exec(line)) !== null) {
            const arabicText = match[1].trim();
            if (!arabicText || arabicText.length < 2) continue;

            // Check if it's already a t() call
            if (match[0].includes("t('") || match[0].includes('t("') || match[0].includes('t(`')) continue;

            const key = `text${keyIndex++}`;
            translations[key] = arabicText;

            // Check if the text contains JSX expressions {expr}
            if (arabicText.includes('{') && arabicText.includes('}')) {
                // Complex JSX expression, skip auto-replacement
                continue;
            }

            replacements.push({
                original: `>${match[1]}<`,
                replacement: `>{t('${pageKey}.${key}')}<`,
                arabicText: arabicText
            });
        }

        // Pattern 2: String literals with Arabic - in attributes like placeholder="Arabic"
        const attrPattern = /(\w+)="([^"]*[\u0600-\u06FF][^"]*)"/g;
        while ((match = attrPattern.exec(line)) !== null) {
            const attrName = match[1];
            const arabicText = match[2].trim();
            if (!arabicText || arabicText.length < 2) continue;
            if (['className', 'id', 'key', 'type', 'value', 'name', 'href', 'src'].includes(attrName)) continue;

            const key = `text${keyIndex++}`;
            translations[key] = arabicText;
            replacements.push({
                original: `${attrName}="${match[2]}"`,
                replacement: `${attrName}={t('${pageKey}.${key}')}`,
                arabicText: arabicText
            });
        }

        // Pattern 3: toast.success('Arabic') or toast.error('Arabic')
        const toastPattern = /toast\.(success|error|info|warning)\(['"`]([^'"`]*[\u0600-\u06FF][^'"`]*)['"`]\)/g;
        while ((match = toastPattern.exec(line)) !== null) {
            const arabicText = match[2].trim();
            if (!arabicText || arabicText.length < 2) continue;

            const key = `text${keyIndex++}`;
            translations[key] = arabicText;
            replacements.push({
                original: match[0],
                replacement: `toast.${match[1]}(t('${pageKey}.${key}'))`,
                arabicText: arabicText
            });
        }

        // Pattern 4: Toast with template literal toast.success(`Arabic ${var}`)
        const toastTemplatePattern = /toast\.(success|error|info|warning)\(`([^`]*[\u0600-\u06FF][^`]*)`\)/g;
        while ((match = toastTemplatePattern.exec(line)) !== null) {
            const templateText = match[2];
            // Extract variable references
            const vars = [];
            const varPattern = /\$\{([^}]+)\}/g;
            let varMatch;
            let cleanText = templateText;
            while ((varMatch = varPattern.exec(templateText)) !== null) {
                vars.push(varMatch[1]);
                cleanText = cleanText.replace(varMatch[0], `{{var${vars.length - 1}}}`);
            }

            const key = `text${keyIndex++}`;
            translations[key] = cleanText;

            if (vars.length > 0) {
                const varObj = vars.map((v, i) => `var${i}: ${v}`).join(', ');
                replacements.push({
                    original: match[0],
                    replacement: `toast.${match[1]}(t('${pageKey}.${key}', { ${varObj} }))`,
                    arabicText: cleanText
                });
            } else {
                replacements.push({
                    original: match[0],
                    replacement: `toast.${match[1]}(t('${pageKey}.${key}'))`,
                    arabicText: cleanText
                });
            }
        }

        // Pattern 5: Single-quoted strings in JSX: title='Arabic'
        const singleQuoteAttrPattern = /(\w+)='([^']*[\u0600-\u06FF][^']*)'/g;
        while ((match = singleQuoteAttrPattern.exec(line)) !== null) {
            const attrName = match[1];
            const arabicText = match[2].trim();
            if (!arabicText || arabicText.length < 2) continue;
            if (['className', 'id', 'key', 'type', 'value', 'name', 'href', 'src'].includes(attrName)) continue;

            const key = `text${keyIndex++}`;
            translations[key] = arabicText;
            replacements.push({
                original: `${attrName}='${match[2]}'`,
                replacement: `${attrName}={t('${pageKey}.${key}')}`,
                arabicText: arabicText
            });
        }
    });

    // Apply replacements (reverse order to preserve positions)
    for (const r of replacements) {
        // Only replace first occurrence to avoid issues
        const idx = newContent.indexOf(r.original);
        if (idx >= 0) {
            newContent = newContent.substring(0, idx) + r.replacement + newContent.substring(idx + r.original.length);
        }
    }

    // Add useTranslation import if not present
    if (!hasTranslation && Object.keys(translations).length > 0) {
        // Add import after last import line
        const importLines = newContent.split('\n');
        let lastImportIdx = 0;
        importLines.forEach((l, i) => {
            if (l.trim().startsWith('import ')) lastImportIdx = i;
        });
        importLines.splice(lastImportIdx + 1, 0, "import { useTranslation } from 'react-i18next';");
        newContent = importLines.join('\n');

        // Add useTranslation hook after the first function/component declaration
        // Look for patterns like "export default function Name() {" or "function Name() {"
        const hookPattern = /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)/;
        const hookMatch = newContent.match(hookPattern);
        if (hookMatch) {
            newContent = newContent.replace(hookMatch[0], hookMatch[0] + "\n  const { t } = useTranslation();");
        } else {
            // Try arrow function pattern
            const arrowPattern = /(export\s+default\s+(?:function\s+)?\w+\s*=\s*\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*\{)/;
            const arrowMatch = newContent.match(arrowPattern);
            if (arrowMatch) {
                newContent = newContent.replace(arrowMatch[0], arrowMatch[0] + "\n  const { t } = useTranslation();");
            }
        }
    }

    return { translations, newContent, pageKey, replacementCount: replacements.length };
}

// Main execution
console.log('🔍 Scanning merchant pages...\n');

const files = fs.readdirSync(MERCHANT_DIR)
    .filter(f => f.endsWith('.tsx'))
    .filter(f => !DONE.includes(f.replace('.tsx', '')));

const allTranslations = {};
let totalReplacements = 0;
let patchedFiles = 0;

files.forEach(file => {
    const filePath = path.join(MERCHANT_DIR, file);
    const result = processFile(filePath);

    if (result.replacementCount === 0) {
        return;
    }

    // Write patched file
    fs.writeFileSync(filePath, result.newContent, 'utf8');

    allTranslations[result.pageKey] = result.translations;
    totalReplacements += result.replacementCount;
    patchedFiles++;

    console.log(`✅ ${file}: ${result.replacementCount} replacements (${Object.keys(result.translations).length} keys)`);
});

// Update locale files
console.log('\n📝 Updating locale files...\n');

LOCALES.forEach(locale => {
    const filePath = path.join(LOCALE_DIR, `${locale}.json`);
    let data = {};

    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`Error reading ${locale}.json:`, err.message);
        return;
    }

    Object.keys(allTranslations).forEach(pageKey => {
        if (!data[pageKey]) data[pageKey] = {};

        Object.keys(allTranslations[pageKey]).forEach(key => {
            if (!data[pageKey][key]) {
                // Arabic locale gets original text, others get Arabic too as fallback
                // (can be professionally translated later)
                data[pageKey][key] = allTranslations[pageKey][key];
            }
        });
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ ${locale}.json updated`);
});

console.log(`\n🎉 Done! Patched ${patchedFiles} files with ${totalReplacements} total replacements.`);
console.log(`📊 Generated keys for ${Object.keys(allTranslations).length} page sections.`);
