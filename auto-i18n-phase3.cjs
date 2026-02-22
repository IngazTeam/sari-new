/**
 * Phase 3 i18n cleanup — handles remaining patterns:
 * 1. toast.success('Arabic', { options }) 
 * 2. Mixed Arabic+English JSX text lines
 * 3. confirm('Arabic') calls
 * 4. Lines with Arabic text + embedded JSX expressions (e.g., {var} دقيقة)
 */

const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.join(__dirname, 'client', 'src', 'locales');
const MERCHANT_DIR = path.join(__dirname, 'client', 'src', 'pages', 'merchant');
const LOCALES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];
const ARABIC_REGEX = /[\u0600-\u06FF]/;

function fileToPageKey(filename) {
    const base = filename.replace('.tsx', '');
    return base.charAt(0).toLowerCase() + base.slice(1) + 'Page';
}

function getNextKeyIndex(content, pageKey) {
    const pattern = new RegExp(`t\\('${pageKey}\\.text(\\d+)'`, 'g');
    let maxKey = -1;
    let m;
    while ((m = pattern.exec(content)) !== null) {
        const num = parseInt(m[1]);
        if (num > maxKey) maxKey = num;
    }
    return maxKey + 1;
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const pageKey = fileToPageKey(filename);
    let nextKey = getNextKeyIndex(content, pageKey);
    const translations = {};
    let replacementCount = 0;
    const hasTranslation = content.includes('useTranslation');

    // === Pattern 1: toast with Arabic and options: toast.success('Arabic', { ===
    const toastWithOptsPattern = /toast\.(success|error|info|warning)\(\s*'([^']*[\u0600-\u06FF][^']*)'\s*,\s*\{/g;
    let m;
    while ((m = toastWithOptsPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[2];
        const key = `text${nextKey++}`;
        translations[key] = text;
        const original = `toast.${m[1]}('${text}',`;
        const replacement = `toast.${m[1]}(t('${pageKey}.${key}'),`;
        if (content.includes(original)) {
            content = content.replace(original, replacement);
            replacementCount++;
        }
    }

    // Same with double quotes
    const toastWithOptsPattern2 = /toast\.(success|error|info|warning)\(\s*"([^"]*[\u0600-\u06FF][^"]*)"\s*,\s*\{/g;
    while ((m = toastWithOptsPattern2.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[2];
        const key = `text${nextKey++}`;
        translations[key] = text;
        const original = `toast.${m[1]}("${text}",`;
        const replacement = `toast.${m[1]}(t('${pageKey}.${key}'),`;
        if (content.includes(original)) {
            content = content.replace(original, replacement);
            replacementCount++;
        }
    }

    // === Pattern 2: confirm('Arabic') ===
    const confirmPattern = /confirm\(\s*'([^']*[\u0600-\u06FF][^']*)'\s*\)/g;
    while ((m = confirmPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[1];
        const key = `text${nextKey++}`;
        translations[key] = text;
        content = content.replace(m[0], `confirm(t('${pageKey}.${key}'))`);
        replacementCount++;
    }

    // === Pattern 3: Mixed Arabic+English JSX text that wasn't caught before ===
    // Process line by line
    const lines = content.split('\n');
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!ARABIC_REGEX.test(trimmed)) { newLines.push(line); continue; }
        if (trimmed.includes("t('") || trimmed.includes('t("')) { newLines.push(line); continue; }
        if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) { newLines.push(line); continue; }

        // Skip lines with JSX tags or code
        if (trimmed.includes('<') && trimmed.includes('>')) { newLines.push(line); continue; }
        if (trimmed.includes('=>') || trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('return ')) { newLines.push(line); continue; }
        if (trimmed.includes('toast.') || trimmed.includes('confirm(')) { newLines.push(line); continue; }
        if (trimmed.includes('className') || trimmed.includes('onClick')) { newLines.push(line); continue; }

        // Check if the line is a pure text content (Arabic + optional English + punctuation)
        // Allow mixed Arabic+English text but no code
        if (/^[^{}<>=;]*[\u0600-\u06FF][^{}<>=;]*$/.test(trimmed) && trimmed.length >= 3) {
            const key = `text${nextKey++}`;
            translations[key] = trimmed;
            const indent = line.match(/^(\s*)/)[1];
            newLines.push(`${indent}{t('${pageKey}.${key}')}`);
            replacementCount++;
            continue;
        }

        // Lines with Arabic + embedded JSX expressions like: {var} دقيقة
        // or: الرقم المربوط: {requestStatus.fullNumber}
        if (/[\u0600-\u06FF].*\{[^}]+\}|{[^}]+\}.*[\u0600-\u06FF]/.test(trimmed) && !trimmed.includes('className')) {
            // Extract the Arabic parts and variables
            const parts = trimmed.split(/(\{[^}]+\})/);
            let hasArabic = false;
            let templateStr = '';
            const vars = {};
            let varIdx = 0;

            for (const part of parts) {
                if (part.startsWith('{') && part.endsWith('}')) {
                    const varName = part.slice(1, -1).trim();
                    const varKey = `var${varIdx++}`;
                    vars[varKey] = varName;
                    templateStr += `{{${varKey}}}`;
                } else {
                    if (ARABIC_REGEX.test(part)) hasArabic = true;
                    templateStr += part;
                }
            }

            if (hasArabic && Object.keys(vars).length > 0) {
                const key = `text${nextKey++}`;
                translations[key] = templateStr;
                const varEntries = Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join(', ');
                const indent = line.match(/^(\s*)/)[1];
                newLines.push(`${indent}{t('${pageKey}.${key}', { ${varEntries} })}`);
                replacementCount++;
                continue;
            }
        }

        newLines.push(line);
    }
    content = newLines.join('\n');

    // Add useTranslation if not present
    if (!hasTranslation && replacementCount > 0) {
        const importLines = content.split('\n');
        let lastImportIdx = 0;
        importLines.forEach((l, i) => {
            if (l.trim().startsWith('import ')) lastImportIdx = i;
        });
        importLines.splice(lastImportIdx + 1, 0, "import { useTranslation } from 'react-i18next';");
        content = importLines.join('\n');

        const hookPattern = /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)/;
        const hookMatch = content.match(hookPattern);
        if (hookMatch) {
            content = content.replace(hookMatch[0], hookMatch[0] + "\n  const { t } = useTranslation();");
        }
    }

    return { translations, newContent: content, pageKey, replacementCount };
}

// Main
console.log('🔍 Phase 3: Final cleanup pass...\n');

const files = fs.readdirSync(MERCHANT_DIR).filter(f => f.endsWith('.tsx'));
const allTranslations = {};
let totalReplacements = 0;
let patchedFiles = 0;

files.forEach(file => {
    const filePath = path.join(MERCHANT_DIR, file);
    const result = processFile(filePath);

    if (result.replacementCount === 0) return;

    fs.writeFileSync(filePath, result.newContent, 'utf8');
    if (!allTranslations[result.pageKey]) allTranslations[result.pageKey] = {};
    Object.assign(allTranslations[result.pageKey], result.translations);
    totalReplacements += result.replacementCount;
    patchedFiles++;
    console.log(`✅ ${file}: ${result.replacementCount} replacements`);
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
                data[pageKey][key] = allTranslations[pageKey][key];
            }
        });
    });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ ${locale}.json updated`);
});

console.log(`\n🎉 Phase 3 Done! Patched ${patchedFiles} files with ${totalReplacements} additional replacements.`);
