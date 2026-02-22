/**
 * Enhanced auto-i18n batch script — Phase 2
 * Handles complex patterns that the first pass missed:
 * 1. Ternary expressions with Arabic
 * 2. Concatenated error messages (error.message || 'Arabic')
 * 3. Multi-line JSX text (Arabic text as standalone JSX child)
 * 4. Template literal strings in toasts
 * 5. String literals in object constants (name: 'Arabic')
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

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const pageKey = fileToPageKey(filename);

    // Check existing keys to compute next index
    const existingKeyPattern = new RegExp(`t\\('${pageKey}\\.text(\\d+)'`, 'g');
    let maxKey = -1;
    let m;
    while ((m = existingKeyPattern.exec(content)) !== null) {
        const num = parseInt(m[1]);
        if (num > maxKey) maxKey = num;
    }
    let nextKey = maxKey + 1;

    const translations = {};
    let replacementCount = 0;

    // Check if useTranslation is already there
    const hasTranslation = content.includes('useTranslation');

    // === Pattern 1: Ternary with Arabic strings ===
    // e.g. isPending ? "جاري..." : "إرسال"
    // Match: ? "Arabic" : "Arabic" or ? 'Arabic' : 'Arabic'
    const ternaryPattern = /\?\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*:\s*["']([^"']*[\u0600-\u06FF][^"']*)["']/g;
    while ((m = ternaryPattern.exec(content)) !== null) {
        const text1 = m[1];
        const text2 = m[2];
        const key1 = `text${nextKey++}`;
        const key2 = `text${nextKey++}`;
        translations[key1] = text1;
        translations[key2] = text2;

        // Build replacement - need to determine quote style
        const original = m[0];
        const replacement = `? t('${pageKey}.${key1}') : t('${pageKey}.${key2}')`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // === Pattern 2: Single Arabic string in ternary (second branch only) ===
    // e.g. ? something : "Arabic"
    const ternarySinglePattern = /\?\s*[^:]+:\s*["']([^"']*[\u0600-\u06FF][^"']*)["']/g;
    while ((m = ternarySinglePattern.exec(content)) !== null) {
        // Skip if already replaced (contains t(' ))
        if (m[0].includes("t('")) continue;
        const text = m[1];
        const key = `text${nextKey++}`;
        translations[key] = text;

        const q = m[0].includes(`"${text}"`) ? '"' : "'";
        const original = `${q}${text}${q}`;
        const replacement = `t('${pageKey}.${key}')`;
        // Only replace within the scope of this ternary
        const idx = content.indexOf(m[0]);
        if (idx >= 0) {
            const segment = content.substring(idx, idx + m[0].length);
            const newSegment = segment.replace(original, replacement);
            content = content.substring(0, idx) + newSegment + content.substring(idx + m[0].length);
            replacementCount++;
        }
    }

    // === Pattern 3: Fallback error messages: || 'Arabic' or || "Arabic" ===
    const fallbackPattern = /\|\|\s*['"]([^'"]*[\u0600-\u06FF][^'"]*)['"](?:\))/g;
    while ((m = fallbackPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[1];
        const key = `text${nextKey++}`;
        translations[key] = text;

        const q = m[0].includes(`"${text}"`) ? '"' : "'";
        const original = `${q}${text}${q}`;
        const replacement = `t('${pageKey}.${key}')`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // === Pattern 4: Standalone Arabic lines in JSX (whitespace + Arabic + \r?\n) ===
    // Lines that are just Arabic text inside JSX tags, not caught by first pass
    // These are lines like "            الروبوت نشط" which need wrapping
    const lines = content.split('\n');
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip if already has t() call, or is import/comment, or has JSX tags
        if (!ARABIC_REGEX.test(trimmed)) { newLines.push(line); continue; }
        if (trimmed.includes("t('") || trimmed.includes('t("')) { newLines.push(line); continue; }
        if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) { newLines.push(line); continue; }

        // Pure Arabic text line (no JSX tags, no code)
        // Must be JSX text content
        if (/^[\u0600-\u06FF\s\d\.\,\:\;\!\?\-\(\)\//\u060C\u061B\u061F\u2026\u00AB\u00BB]*$/.test(trimmed) && trimmed.length >= 3) {
            const key = `text${nextKey++}`;
            translations[key] = trimmed;
            const indent = line.match(/^(\s*)/)[1];
            newLines.push(`${indent}{t('${pageKey}.${key}')}`);
            replacementCount++;
            continue;
        }

        // Arabic text with simple prefix like emoji or icon
        // Check if it looks like JSX text content (has Arabic and minimal code)
        if (/^[\u0600-\u06FF\s\d\.\,\:\;\!\?\-\(\)👋🎉💡🚀✅❌📊📝💼😊\/\u060C\u061B\u061F\u2026]*$/.test(trimmed) && trimmed.length >= 3) {
            const key = `text${nextKey++}`;
            translations[key] = trimmed;
            const indent = line.match(/^(\s*)/)[1];
            newLines.push(`${indent}{t('${pageKey}.${key}')}`);
            replacementCount++;
            continue;
        }

        // Line with mixed Arabic and JSX expressions: "Arabic text {expr} more Arabic"
        // These need careful handling — check if it's just text with embedded vars
        if (/^[^<>]*[\u0600-\u06FF][^<>]*\{[^}]+\}/.test(trimmed) && !trimmed.includes('className') && !trimmed.includes('onClick') && !trimmed.includes('=>')) {
            // This is text with embedded expressions — needs Trans component or manual work
            // For now, just replace the Arabic parts around the expressions
            // Skip for safety
            newLines.push(line);
            continue;
        }

        newLines.push(line);
    }
    content = newLines.join('\n');

    // === Pattern 5: Arabic strings in object properties outside components ===
    // e.g. { name: 'السعودية', ... }
    const objPropPattern = /(\w+):\s*['"]([^'"]*[\u0600-\u06FF][^'"]*)['"](\s*[,}])/g;
    let prevContent = '';
    // Multiple passes since regex may overlap
    for (let pass = 0; pass < 3; pass++) {
        prevContent = content;
        content = content.replace(objPropPattern, (match, prop, text, suffix) => {
            // Skip className, key, type, etc.
            if (['className', 'id', 'key', 'type', 'value', 'href', 'src', 'content'].includes(prop)) return match;
            // Skip if already translated
            if (match.includes("t('")) return match;

            const key = `text${nextKey++}`;
            translations[key] = text;
            replacementCount++;
            return `${prop}: t('${pageKey}.${key}')${suffix}`;
        });
        if (content === prevContent) break;
    }

    // === Pattern 6: toast.error(error.message||'Arabic') without spaces ===
    const toastFallbackPattern = /toast\.(success|error|info|warning)\(([^)]+)\|\|\s*['"]([^'"]*[\u0600-\u06FF][^'"]*)['"](\s*)\)/g;
    while ((m = toastFallbackPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const text = m[3];
        const key = `text${nextKey++}`;
        translations[key] = text;

        const q = m[0].includes(`"${text}"`) ? '"' : "'";
        const original = `${q}${text}${q}`;
        const replacement = `t('${pageKey}.${key}')`;
        content = content.replace(original, replacement);
        replacementCount++;
    }

    // === Pattern 7: Inline Arabic strings in backtick template literals ===
    const backtickPattern = /`([^`]*[\u0600-\u06FF][^`]*)`/g;
    while ((m = backtickPattern.exec(content)) !== null) {
        if (m[0].includes("t('")) continue;
        const templateText = m[1];
        // Check if it has ${} expressions
        if (/\$\{/.test(templateText)) {
            // Template literal with expressions - extract and build interpolated key
            const vars = [];
            let cleanText = templateText;
            const varPattern = /\$\{([^}]+)\}/g;
            let varMatch;
            while ((varMatch = varPattern.exec(templateText)) !== null) {
                vars.push(varMatch[1]);
                cleanText = cleanText.replace(varMatch[0], `{{var${vars.length - 1}}}`);
            }
            const key = `text${nextKey++}`;
            translations[key] = cleanText;
            const varObj = vars.map((v, i) => `var${i}: ${v}`).join(', ');
            const original = m[0];
            const replacement = `t('${pageKey}.${key}', { ${varObj} })`;
            content = content.replace(original, replacement);
            replacementCount++;
        } else {
            // Simple backtick string
            const key = `text${nextKey++}`;
            translations[key] = templateText;
            const original = m[0];
            const replacement = `t('${pageKey}.${key}')`;
            content = content.replace(original, replacement);
            replacementCount++;
        }
    }

    // Add useTranslation if not present and we made changes
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
console.log('🔍 Phase 2: Scanning for complex Arabic patterns...\n');

const files = fs.readdirSync(MERCHANT_DIR)
    .filter(f => f.endsWith('.tsx'));

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

    console.log(`✅ ${file}: ${result.replacementCount} replacements (${Object.keys(result.translations).length} new keys)`);
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

console.log(`\n🎉 Phase 2 Done! Patched ${patchedFiles} files with ${totalReplacements} additional replacements.`);
