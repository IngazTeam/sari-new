/**
 * Ultra-conservative i18n — ONLY handles these patterns:
 * 1. JSX text: >Arabic text< → >{t('key')}<
 * 2. JSX attributes: label="Arabic" → label={t('key')}
 * 3. toast("Arabic") → toast(t('key'))
 * 
 * DOES NOT touch:
 * - Object keys/values
 * - Variable assignments
 * - Template literals
 * - Ternaries
 * - Array elements
 */

const fs = require('fs');
const path = require('path');

const TARGET_DIRS = [
    'client/src/pages',
    'client/src/pages/setup-wizard',
    'client/src/components',
    'client/src/pages/merchant',
    'client/src/pages/admin',
];

function hasArabic(line) { return /[\u0600-\u06FF]/.test(line); }
function hasT(line) { return /\bt\s*\(\s*['"]/.test(line); }
function shouldSkip(line) {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') ||
        t.startsWith('{/*') || t.startsWith('import ') || t === '';
}

function getPrefix(file, dir) {
    const base = file.replace(/\.tsx$/, '');
    if (dir.includes('setup-wizard')) return `wizard${base}Page`;
    if (dir.includes('components')) return `comp${base}Page`;
    if (dir.includes('merchant')) return `merchant${base}Page`;
    if (dir.includes('admin')) return `admin${base}Page`;
    return `${base.charAt(0).toLowerCase() + base.slice(1)}Page`;
}

let totalReplacements = 0;
let totalFiles = 0;
const allKeys = {};

for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

    for (const file of files) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        const arabicCount = lines.filter(l => hasArabic(l) && !shouldSkip(l) && !hasT(l)).length;
        if (arabicCount === 0) continue;

        const prefix = getPrefix(file, dir);
        let keyNum = 0;

        // Find existing max key
        const existingRegex = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.text(\\d+)`, 'g');
        let m;
        while ((m = existingRegex.exec(content)) !== null) {
            const num = parseInt(m[1]);
            if (num >= keyNum) keyNum = num + 1;
        }

        let fileReplacements = 0;

        const newLines = lines.map((line, idx) => {
            if (!hasArabic(line) || shouldSkip(line) || hasT(line)) return line;

            const key = `${prefix}.text${keyNum}`;
            let newLine = line;
            let replaced = false;
            let originalText = '';

            // PATTERN 1: Pure JSX text content (NO interpolation, NO curly braces)
            // Match: >Some Arabic text< but NOT >Arabic {var} text< or >{ something }< 
            const jsxMatch = line.match(/>([^<{}>]*[\u0600-\u06FF][^<{}>]*)<\//);
            if (jsxMatch && jsxMatch[1].trim().length > 1) {
                originalText = jsxMatch[1].trim();
                // Make sure we're replacing the exact occurrence
                const before = `>${jsxMatch[1]}</`;
                const after = `>{t('${key}')}</`;
                const idx = newLine.indexOf(before);
                if (idx !== -1) {
                    newLine = newLine.substring(0, idx) + after + newLine.substring(idx + before.length);
                    replaced = true;
                }
            }

            // PATTERN 2: JSX attributes with "=" sign (not ":" which could be object)
            // Match: label="Arabic" / placeholder="Arabic" / title="Arabic"
            if (!replaced) {
                const attrMatch = line.match(/((?:label|placeholder|title|alt|aria-label)\s*=\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/);
                if (attrMatch) {
                    originalText = attrMatch[2];
                    newLine = line.replace(attrMatch[0], `${attrMatch[1]}{t('${key}')}`);
                    replaced = true;
                }
            }

            // PATTERN 3: toast messages
            if (!replaced) {
                const toastMatch = line.match(/(toast\.\w+|toast)\(\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*\)/);
                if (toastMatch) {
                    originalText = toastMatch[2];
                    newLine = line.replace(toastMatch[0], `${toastMatch[1]}(t('${key}'))`);
                    replaced = true;
                }
            }

            // PATTERN 4: JSX text at END of line (before closing tag that's on next line)
            // Match: >Arabic text (no closing tag on same line)
            if (!replaced) {
                // Look for ">Arabic text" that doesn't have a closing < on the same line after the text
                const endMatch = line.match(/>([^<{}>]*[\u0600-\u06FF][^<{}>]*)$/);
                if (endMatch && endMatch[1].trim().length > 1) {
                    // Make sure the next line has </
                    if (idx < lines.length - 1 && lines[idx + 1].trim().startsWith('</')) {
                        originalText = endMatch[1].trim();
                        const before = `>${endMatch[1]}`;
                        const after = `>{t('${key}')}`;
                        const pos = newLine.lastIndexOf(before);
                        if (pos !== -1) {
                            newLine = newLine.substring(0, pos) + after + newLine.substring(pos + before.length);
                            replaced = true;
                        }
                    }
                }
            }

            if (replaced) {
                allKeys[key] = originalText;
                keyNum++;
                fileReplacements++;
                return newLine;
            }

            return line;
        });

        if (fileReplacements > 0) {
            content = newLines.join('\n');

            // Add useTranslation import + hook if needed
            if (!/useTranslation/.test(content)) {
                const importLines = content.split('\n');
                let lastImportIdx = 0;
                for (let i = 0; i < importLines.length; i++) {
                    if (importLines[i].trim().startsWith('import ') || importLines[i].trim().startsWith('} from ')) {
                        lastImportIdx = i;
                    }
                }
                importLines.splice(lastImportIdx + 1, 0, "import { useTranslation } from 'react-i18next';");
                content = importLines.join('\n');
            }

            if (!/const\s*\{\s*t\s*\}\s*=\s*useTranslation/.test(content)) {
                // Find component function
                const funcRegex = /(?:export\s+(?:default\s+)?)?function\s+\w+\s*\([^)]*\)\s*(?::\s*[^{]*?)?\{/;
                const funcMatch = content.match(funcRegex);
                if (funcMatch) {
                    const idx = content.indexOf(funcMatch[0]) + funcMatch[0].length;
                    content = content.slice(0, idx) + '\n  const { t } = useTranslation();' + content.slice(idx);
                }
            }

            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`  ✅ ${file}: ${fileReplacements} replacements`);
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
        const fp = path.join(localeDir, `${locale}.json`);
        if (!fs.existsSync(fp)) continue;
        const existing = JSON.parse(fs.readFileSync(fp, 'utf8'));
        let added = 0;
        for (const [key, value] of Object.entries(allKeys)) {
            const parts = key.split('.');
            let obj = existing;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) obj[parts[i]] = {};
                obj = obj[parts[i]];
            }
            if (!obj[parts[parts.length - 1]]) {
                obj[parts[parts.length - 1]] = value;
                added++;
            }
        }
        fs.writeFileSync(fp, JSON.stringify(existing, null, 2) + '\n', 'utf8');
        console.log(`  ✅ ${locale}.json: +${added} new keys`);
    }
}

console.log(`\n🎉 Done! ${totalReplacements} safe replacements in ${totalFiles} files`);
