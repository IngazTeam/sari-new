/**
 * Universal i18n Script — Translates ALL remaining Arabic strings across the entire client
 * Handles: pages/*, components/*, pages/setup-wizard/*
 * Uses same proven patterns from admin/merchant scripts
 */

const fs = require('fs');
const path = require('path');

// Directories to process (in order)
const TARGET_DIRS = [
    { dir: 'client/src/pages', prefix: '', recursive: false },  // root pages only (not subdirs)
    { dir: 'client/src/pages/setup-wizard', prefix: 'wizard', recursive: false },
    { dir: 'client/src/components', prefix: 'comp', recursive: false },
    // Also catch remaining in merchant/admin from lines that had t() already
    { dir: 'client/src/pages/merchant', prefix: 'merchant', recursive: false },
    { dir: 'client/src/pages/admin', prefix: 'admin', recursive: false },
];

// Convert filename to camelCase key prefix
function fileToPrefix(filename, dirPrefix) {
    const base = filename.replace(/\.tsx$/, '');
    // camelCase: first char lowercase, rest as-is
    const camel = base.charAt(0).toLowerCase() + base.slice(1);
    if (dirPrefix) {
        return `${dirPrefix}${base}Page`;
    }
    return `${camel}Page`;
}

// Check if line already has t() translation
function hasTranslation(line) {
    return /\bt\s*\(\s*['"]/.test(line);
}

// Check if line has Arabic
function hasArabic(line) {
    return /[\u0600-\u06FF]/.test(line);
}

// Check if line should be skipped
function shouldSkip(line) {
    const t = line.trim();
    return t.startsWith('//') ||
        t.startsWith('/*') ||
        t.startsWith('*') ||
        t.startsWith('{/*') ||
        t.startsWith('import ') ||
        t.startsWith('export type') ||
        t.startsWith('export interface');
}

// Extract Arabic string from various patterns
function extractAndReplace(line, prefix, keyNum) {
    const key = `${prefix}.text${keyNum}`;
    let newLine = line;
    let replaced = false;

    // Skip lines that already use t()
    if (hasTranslation(line)) return { line, replaced: false };

    // Skip lines without Arabic
    if (!hasArabic(line)) return { line, replaced: false };

    // Skip comments/imports
    if (shouldSkip(line)) return { line, replaced: false };

    // Pattern 1: JSX text content: >Arabic text<
    // Handle: <tag>Arabic text</tag> or <tag>Arabic text with {var}</tag>
    const jsxTextRegex = />([^<]*[\u0600-\u06FF][^<]*)</g;
    let match;
    while ((match = jsxTextRegex.exec(line)) !== null) {
        const arabicText = match[1].trim();
        if (arabicText && !arabicText.includes('{t(') && !arabicText.includes('{t (')) {
            // Check if it contains interpolation
            if (arabicText.includes('{') && arabicText.includes('}')) {
                // Complex JSX with interpolation — skip for safety
                continue;
            }
            newLine = newLine.replace(`>${match[1]}<`, `>{t('${key}')}<`);
            replaced = true;
            break;
        }
    }

    if (replaced) return { line: newLine, replaced, key, original: match[1].trim() };

    // Pattern 2: String attributes: label="Arabic" / placeholder="Arabic" / title="Arabic" etc.
    const attrRegex = /((?:label|placeholder|title|description|message|text|content|alt|header|buttonText|name|heading|subheading|emptyText|loadingText|errorText|successText|confirmText|cancelText|submitText|helperText|tooltip|hint|aria-label)\s*[=:]\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/g;
    while ((match = attrRegex.exec(line)) !== null) {
        const arabicText = match[2];
        newLine = newLine.replace(match[0], `${match[1]}{t('${key}')}`);
        replaced = true;
        break;
    }

    if (replaced) return { line: newLine, replaced, key, original: match[2] };

    // Pattern 3: Toast/alert messages: toast.success("Arabic") / toast.error("Arabic") / toast("Arabic")
    const toastRegex = /(toast(?:\.\w+)?|alert|confirm)\(\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*\)/g;
    while ((match = toastRegex.exec(line)) !== null) {
        newLine = newLine.replace(match[0], `${match[1]}(t('${key}'))`);
        replaced = true;
        break;
    }

    if (replaced) return { line: newLine, replaced, key, original: match[2] };

    // Pattern 4: Standalone string assignments: const x = "Arabic" / : "Arabic"
    const assignRegex = /([:=]\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/g;
    while ((match = assignRegex.exec(line)) !== null) {
        const arabicText = match[2];
        // Don't replace regex patterns or CSS
        if (match[0].includes('\\u') || match[0].includes('rgb')) continue;
        newLine = newLine.replace(match[0], `${match[1]}t('${key}')`);
        replaced = true;
        break;
    }

    if (replaced) return { line: newLine, replaced, key, original: match[2] };

    // Pattern 5: Template literals: `Arabic text ${var}`
    const templateRegex = /([:=]\s*)`([^`]*[\u0600-\u06FF][^`]*)`/g;
    while ((match = templateRegex.exec(line)) !== null) {
        const arabicText = match[2];
        // Extract interpolation vars
        const vars = [];
        const varRegex = /\$\{([^}]+)\}/g;
        let varMatch;
        while ((varMatch = varRegex.exec(arabicText)) !== null) {
            vars.push(varMatch[1]);
        }

        if (vars.length === 0) {
            newLine = newLine.replace(match[0], `${match[1]}t('${key}')`);
        } else {
            // Skip complex template literals for safety
            continue;
        }
        replaced = true;
        break;
    }

    if (replaced) return { line: newLine, replaced, key, original: match[2] };

    // Pattern 6: Array/object string values: "Arabic",
    const arrayValRegex = /^(\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']\s*[,\]}\)]/;
    match = line.match(arrayValRegex);
    if (match) {
        newLine = line.replace(`"${match[2]}"`, `t('${key}')`).replace(`'${match[2]}'`, `t('${key}')`);
        replaced = true;
        return { line: newLine, replaced, key, original: match[2] };
    }

    return { line: newLine, replaced: false };
}

// Check if file already has useTranslation import
function hasUseTranslationImport(content) {
    return /useTranslation/.test(content);
}

// Add useTranslation import and hook to file
function addTranslationSupport(content) {
    if (hasUseTranslationImport(content)) return content;

    // Add import
    const importLine = "import { useTranslation } from 'react-i18next';\n";

    // Find where to add import (after last import)
    const lines = content.split('\n');
    let lastImportIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ') || lines[i].trim().startsWith('} from ')) {
            lastImportIdx = i;
        }
    }

    lines.splice(lastImportIdx + 1, 0, importLine.trimEnd());
    content = lines.join('\n');

    // Add const { t } = useTranslation(); after first line of function body
    // Find the main component function
    const funcRegex = /(?:export\s+(?:default\s+)?)?function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/;
    const arrowRegex = /(?:export\s+(?:default\s+)?)?(?:const|let)\s+\w+\s*=\s*(?:\([^)]*\)|[^=]*)\s*=>\s*\{/;

    const funcMatch = content.match(funcRegex);
    const arrowMatch = content.match(arrowRegex);

    const matchToUse = funcMatch || arrowMatch;
    if (matchToUse) {
        const idx = content.indexOf(matchToUse[0]) + matchToUse[0].length;
        const hookLine = "\n  const { t } = useTranslation();\n";

        // Check if { t } is already declared
        if (!/const\s*\{\s*t\s*\}\s*=\s*useTranslation/.test(content)) {
            content = content.slice(0, idx) + hookLine + content.slice(idx);
        }
    }

    return content;
}

// Main processing
let totalReplacements = 0;
let totalFiles = 0;
const allKeys = {}; // key -> arabic value

for (const { dir, prefix, recursive } of TARGET_DIRS) {
    if (!fs.existsSync(dir)) continue;

    let files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
    if (files.length === 0) continue;

    console.log(`\n📁 Processing ${dir}...`);

    for (const file of files) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // Count Arabic lines (excluding those with t() already)
        const arabicLines = lines.filter((l, i) => {
            return hasArabic(l) && !shouldSkip(l) && !hasTranslation(l);
        });

        if (arabicLines.length === 0) continue;

        const pagePrefix = fileToPrefix(file, prefix);
        let keyNum = 0;
        let fileReplacements = 0;

        // Find highest existing key number for this prefix
        const existingKeyRegex = new RegExp(`${pagePrefix}\\.text(\\d+)`, 'g');
        let existingMatch;
        while ((existingMatch = existingKeyRegex.exec(content)) !== null) {
            const num = parseInt(existingMatch[1]);
            if (num >= keyNum) keyNum = num + 1;
        }

        const newLines = [];
        for (let i = 0; i < lines.length; i++) {
            const result = extractAndReplace(lines[i], pagePrefix, keyNum);
            if (result.replaced) {
                newLines.push(result.line);
                allKeys[result.key] = result.original;
                keyNum++;
                fileReplacements++;
            } else {
                newLines.push(lines[i]);
            }
        }

        if (fileReplacements > 0) {
            content = newLines.join('\n');
            // Add translation support if needed
            content = addTranslationSupport(content);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`  ✅ ${file}: ${fileReplacements} replacements (keys ${pagePrefix}.text0-${keyNum - 1})`);
            totalReplacements += fileReplacements;
            totalFiles++;
        }
    }
}

console.log(`\n📊 Total: ${totalFiles} files, ${totalReplacements} replacements`);

// Update locale files
const localeDir = path.join(__dirname, 'client', 'src', 'locales');
const locales = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

if (fs.existsSync(localeDir)) {
    console.log('\n📝 Updating locale files...');

    for (const locale of locales) {
        const filePath = path.join(localeDir, `${locale}.json`);
        if (!fs.existsSync(filePath)) continue;

        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let added = 0;

        for (const [key, value] of Object.entries(allKeys)) {
            // Parse key: "prefix.text0" -> nested
            const parts = key.split('.');
            let obj = existing;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) obj[parts[i]] = {};
                obj = obj[parts[i]];
            }
            const lastPart = parts[parts.length - 1];
            if (!obj[lastPart]) {
                obj[lastPart] = value;
                added++;
            }
        }

        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
        console.log(`  ✅ ${locale}.json: +${added} new keys`);
    }
}

console.log(`\n🎉 Done! ${totalReplacements} replacements across ${totalFiles} files`);
console.log(`📦 ${Object.keys(allKeys).length} new translation keys`);
