/**
 * Admin Pages i18n - Second Pass
 * Handles remaining Arabic patterns that the first pass missed:
 * - toast.error/success with template literals using ' + error.message'
 * - Single-quoted Arabic strings
 * - onError callback Arabic strings
 * - Mixed lines with t() + remaining Arabic
 * - Arabic in SelectItem values (not translatable data keys)
 * - toLocaleString("ar-SA") patterns
 * - Remaining JSX text patterns
 */

const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, 'client', 'src', 'pages', 'admin');
const LOCALES_DIR = path.join(__dirname, 'client', 'src', 'locales');
const LOCALE_FILES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

const newKeys = {};
LOCALE_FILES.forEach(l => newKeys[l] = {});

let totalReplacements = 0;
let patchedFiles = 0;

function getPageKey(filename) {
    const base = filename.replace('.tsx', '');
    return `admin${base}Page`;
}

/**
 * Get the next available key index for a page
 */
function getNextKeyIndex(content, pageKey) {
    const regex = new RegExp(`${pageKey}\\.text(\\d+)`, 'g');
    let maxIndex = -1;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const idx = parseInt(match[1]);
        if (idx > maxIndex) maxIndex = idx;
    }
    return maxIndex + 1;
}

function processFile(filePath, filename) {
    let content = fs.readFileSync(filePath, 'utf8');
    const pageKey = getPageKey(filename);
    let keyCounter = getNextKeyIndex(content, pageKey);
    let replacements = 0;

    const lines = content.split('\n');
    const newLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            newLines.push(line);
            continue;
        }

        // Skip console.log
        if (trimmed.startsWith('console.')) {
            newLines.push(line);
            continue;
        }

        // Skip if no Arabic
        if (!/[\u0600-\u06FF]/.test(line)) {
            newLines.push(line);
            continue;
        }

        // Check if remaining Arabic is outside of t() calls
        const withoutT = line.replace(/t\('[^']*'\)/g, '').replace(/t\('[^']*',\s*\{[^}]*\}\)/g, '');
        if (!/[\u0600-\u06FF]/.test(withoutT)) {
            newLines.push(line);
            continue;
        }

        let modified = line;
        let lineReplaced = false;

        // === Pattern: toast/error with Arabic + error.message ===
        // toast.error('Arabic: ' + error.message)
        modified = modified.replace(/(toast(?:\.success|\.error|\.warning|\.info)?)\('([^']*[\u0600-\u06FF][^']*)'\s*\+\s*([^)]+)\)/g, (match, fn, text, expr) => {
            const key = `${pageKey}.text${keyCounter++}`;
            const template = text + '{{var0}}';
            newKeys['ar'][key] = template;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = template);
            lineReplaced = true;
            return `${fn}(t('${key}', { var0: ${expr.trim()} }))`;
        });

        // toast.error("Arabic: " + error.message)
        modified = modified.replace(/(toast(?:\.success|\.error|\.warning|\.info)?)\("([^"]*[\u0600-\u06FF][^"]*)"\s*\+\s*([^)]+)\)/g, (match, fn, text, expr) => {
            const key = `${pageKey}.text${keyCounter++}`;
            const template = text + '{{var0}}';
            newKeys['ar'][key] = template;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = template);
            lineReplaced = true;
            return `${fn}(t('${key}', { var0: ${expr.trim()} }))`;
        });

        // === Pattern: Single-quoted Arabic strings ===
        // 'Arabic text'
        modified = modified.replace(/((?:title|placeholder|label|description|alt|content)=)'([^']*[\u0600-\u06FF][^']*)'/g, (match, attr, text) => {
            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);
            lineReplaced = true;
            return `${attr}{t('${key}')}`;
        });

        // === Pattern: Arabic in error callbacks ===
        // onError: (error) => toast.error('Arabic' + error.message)
        // Already handled above

        // === Pattern: Remaining "Arabic text" anywhere ===  
        // Match standalone "Arabic text" that's not already in t() and not in comments
        modified = modified.replace(/(?<!=)\s*"([^"]{3,}[\u0600-\u06FF][^"]{0,})"(?!\s*\+)/g, (match, text, offset) => {
            // Don't replace if it's already in a t() call context
            const before = modified.substring(0, offset);
            if (before.endsWith("t('") || before.endsWith("t(\"")) return match;
            // Don't replace className values  
            if (before.match(/className=$/)) return match;
            // Don't replace attribute values that are data
            if (before.match(/(?:type|variant|size|key|id|name|value|dir|href|src|method|encoding)=$/)) return match;
            // Don't replace key properties
            if (before.match(/\bkey:\s*$/)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);
            lineReplaced = true;

            // Check if inside JSX expression
            const trimBefore = before.trimEnd();
            if (trimBefore.endsWith('{') || trimBefore.endsWith('(') || trimBefore.endsWith(',') || trimBefore.endsWith(':')) {
                return match.replace(`"${text}"`, `t('${key}')`);
            }
            return match.replace(`"${text}"`, `t('${key}')`);
        });

        // === Pattern: Remaining JSX > Arabic text < ===
        // Check if there's Arabic in the line that's inside a JSX text node
        modified = modified.replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, (match, text) => {
            // Already has t() call
            if (/t\('/.test(text)) return match;
            const cleanText = text.trim();
            if (!cleanText || cleanText.length < 2) return match;

            // Check for expressions
            const hasExpressions = /\{[^}]+\}/.test(cleanText);
            if (hasExpressions) {
                // Too complex for automated replacement, skip
                return match;
            }

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = cleanText;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = cleanText);
            lineReplaced = true;
            return `>{t('${key}')}<`;
        });

        // === Pattern: 'Arabic text' in toast ===
        modified = modified.replace(/(toast(?:\.success|\.error|\.warning|\.info)?)\('([^']*[\u0600-\u06FF][^']*)'\)/g, (match, fn, text) => {
            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);
            lineReplaced = true;
            return `${fn}(t('${key}'))`;
        });

        // === Pattern: confirm('Arabic...') ===
        modified = modified.replace(/confirm\('([^']*[\u0600-\u06FF][^']*)'\)/g, (match, text) => {
            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);
            lineReplaced = true;
            return `confirm(t('${key}'))`;
        });

        if (lineReplaced) replacements++;
        newLines.push(modified);
    }

    if (replacements > 0) {
        fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
        patchedFiles++;
        totalReplacements += replacements;
        console.log(`✅ ${filename}: ${replacements} additional replacements (keys ${getNextKeyIndex(content, pageKey)}-${keyCounter - 1})`);
    }

    return replacements;
}

// ===== MAIN =====
console.log('🔍 Admin Pages i18n - Second Pass\n');

const files = fs.readdirSync(ADMIN_DIR).filter(f => f.endsWith('.tsx'));

files.forEach(file => {
    const filePath = path.join(ADMIN_DIR, file);
    processFile(filePath, file);
});

console.log(`\n📊 Second pass: ${patchedFiles} files, ${totalReplacements} replacements\n`);

// Update locale files
console.log('📝 Updating locale files...\n');

LOCALE_FILES.forEach(locale => {
    const localePath = path.join(LOCALES_DIR, `${locale}.json`);

    if (!fs.existsSync(localePath)) {
        console.log(`⚠️  ${locale}.json not found`);
        return;
    }

    const existing = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    let added = 0;

    Object.entries(newKeys[locale]).forEach(([key, value]) => {
        const parts = key.split('.');
        let obj = existing;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }

        const lastKey = parts[parts.length - 1];
        if (!obj[lastKey]) {
            obj[lastKey] = value;
            added++;
        }
    });

    fs.writeFileSync(localePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    console.log(`✅ ${locale}.json: +${added} new keys`);
});

// ALSO: Fill any missing keys from the first pass that weren't captured by git diff
console.log('\n🔧 Filling missing keys from first pass...\n');

// Scan all admin TSX files for t('adminXXXPage.textN') patterns
// and check if they exist in locale files
const arLocalePath = path.join(LOCALES_DIR, 'ar.json');
const arLocale = JSON.parse(fs.readFileSync(arLocalePath, 'utf8'));

let missingKeys = 0;
files.forEach(file => {
    const filePath = path.join(ADMIN_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const regex = /t\('(admin\w+Page\.text\d+)'/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const fullKey = match[1];
        const parts = fullKey.split('.');

        let obj = arLocale;
        let found = true;
        for (const part of parts) {
            if (!obj[part]) {
                found = false;
                break;
            }
            obj = obj[part];
        }

        if (!found) {
            missingKeys++;
        }
    }
});

console.log(`📊 ${missingKeys} keys still missing from locale files`);
console.log(`\n🎉 Second pass complete!`);
