/**
 * Phase 4 i18n cleanup — Final pass for remaining specific patterns:
 * 1. {condition && "Arabic text"} — conditional rendering
 * 2. <Tag>Arabic after {t()} call</Tag> — mixed translated + untranslated
 * 3. name="Arabic" in chart components (Bar, Line, Area, etc.)
 * 4. console.log('Arabic') — debug strings
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

    // === Pattern 1: {condition && "Arabic text"} ===
    const condAndPattern = /\{([^}]+)\s*&&\s*"([^"]*[\u0600-\u06FF][^"]*)"\}/g;
    let m;
    while ((m = condAndPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[2];
        const key = `text${nextKey++}`;
        translations[key] = text;
        const original = m[0];
        const replacement = `{${m[1]} && t('${pageKey}.${key}')}`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // Same with single quotes
    const condAndPatternSQ = /\{([^}]+)\s*&&\s*'([^']*[\u0600-\u06FF][^']*)'\}/g;
    while ((m = condAndPatternSQ.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[2];
        const key = `text${nextKey++}`;
        translations[key] = text;
        const original = m[0];
        const replacement = `{${m[1]} && t('${pageKey}.${key}')}`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // === Pattern 2: name="Arabic" in chart components ===
    const chartNamePattern = /name=["']([^"']*[\u0600-\u06FF][^"']*)["']/g;
    while ((m = chartNamePattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[1];
        const key = `text${nextKey++}`;
        translations[key] = text;
        const original = m[0];
        const replacement = `name={t('${pageKey}.${key}')}`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // === Pattern 3: Lines with <strong>{t('key')}</strong> followed by Arabic text ===
    // e.g. <strong>{t('key')}</strong> إذا كان أقل من 20%...
    const lines = content.split('\n');
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!ARABIC_REGEX.test(trimmed)) { newLines.push(line); continue; }
        if (trimmed.startsWith('{/*') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) { newLines.push(line); continue; }

        // Check for pattern: <strong>...</strong> Arabic text
        const strongAfterPattern = /<\/strong>\s+([\u0600-\u06FF][^<]*)/;
        const strongMatch = trimmed.match(strongAfterPattern);
        if (strongMatch && !strongMatch[1].includes("t('")) {
            const arabicText = strongMatch[1].trim();
            if (arabicText.length >= 3) {
                const key = `text${nextKey++}`;
                translations[key] = arabicText;
                const indent = line.match(/^(\s*)/)[1];
                const newLine = line.replace(strongMatch[1], `{t('${pageKey}.${key}')}`);
                newLines.push(newLine);
                replacementCount++;
                continue;
            }
        }

        // Check for lines containing Arabic after a {t()} call
        const afterTPattern = /\}\s+([\u0600-\u06FF][^<{]*)/;
        const afterTMatch = trimmed.match(afterTPattern);
        if (afterTMatch && trimmed.includes("t('") && !afterTMatch[0].includes("t('", 1)) {
            const arabicText = afterTMatch[1].trim();
            if (arabicText.length >= 3 && !arabicText.includes('{')) {
                const key = `text${nextKey++}`;
                translations[key] = arabicText;
                const newLine = line.replace(afterTMatch[1], `{t('${pageKey}.${key}')}`);
                newLines.push(newLine);
                replacementCount++;
                continue;
            }
        }

        // console.log('Arabic')
        const consolePattern = /console\.(log|warn|error)\(['"]([^'"]*[\u0600-\u06FF][^'"]*)['"]\)/;
        const consoleMatch = trimmed.match(consolePattern);
        if (consoleMatch) {
            // Leave console strings as is (they're debug-only)
            newLines.push(line);
            continue;
        }

        newLines.push(line);
    }
    content = newLines.join('\n');

    return { translations, newContent: content, pageKey, replacementCount };
}

// Main
console.log('🔍 Phase 4: Final targeted pass...\n');

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

console.log(`\n🎉 Phase 4 Done! Patched ${patchedFiles} files with ${totalReplacements} additional replacements.`);
