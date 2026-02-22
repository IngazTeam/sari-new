/**
 * Smart Revert + Reapply: Fix TSC errors by reverting broken files,
 * then carefully re-applying only safe translation patterns.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Step 1: Find files with errors
console.log('📊 Running TSC to find broken files...');
let tscOutput;
try {
    tscOutput = execSync('npx tsc --noEmit 2>&1', {
        encoding: 'utf8',
        cwd: __dirname,
        maxBuffer: 10 * 1024 * 1024
    });
} catch (e) {
    tscOutput = e.stdout || e.output?.join('') || '';
}

// Parse error files
const errorCounts = new Map();
const lines = tscOutput.split('\n');
for (const line of lines) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error TS/);
    if (match && match[1].includes('client/src/')) {
        const file = match[1].trim();
        errorCounts.set(file, (errorCounts.get(file) || 0) + 1);
    }
}

console.log(`\n📊 ${errorCounts.size} files with TSC errors:`);
const sortedFiles = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [file, count] of sortedFiles) {
    console.log(`  ${count}\t${path.basename(file)}`);
}

// Step 2: Revert ALL broken files from git
console.log('\n🔧 Reverting broken files from git...');
let reverted = 0;
for (const [file] of errorCounts) {
    try {
        // Use Windows-friendly path separator
        const normalizedFile = file.replace(/\\/g, '/');
        execSync(`git checkout HEAD -- "${normalizedFile}"`, {
            cwd: __dirname,
            encoding: 'utf8',
            stdio: 'pipe'
        });
        console.log(`  ✅ Reverted: ${path.basename(file)}`);
        reverted++;
    } catch (e) {
        console.log(`  ❌ Failed: ${path.basename(file)} - ${e.message.split('\n')[0]}`);
    }
}

console.log(`\n📊 Reverted ${reverted} files`);

// Step 3: Re-apply SAFE translations only
// Safe = JSX text content, string attributes, toast messages
// NOT safe = object keys, variable assignments in complex positions, template literals

console.log('\n🔄 Re-applying safe translations to reverted files...');

function getPrefix(file, dir) {
    const base = path.basename(file, '.tsx');
    if (dir.includes('setup-wizard')) return `wizard${base}Page`;
    if (dir.includes('components')) return `comp${base}Page`;
    if (dir.includes('merchant')) return `merchant${base}Page`;
    if (dir.includes('admin')) return `admin${base}Page`;
    return `${base.charAt(0).toLowerCase() + base.slice(1)}Page`;
}

function hasArabic(line) {
    return /[\u0600-\u06FF]/.test(line);
}

function hasTranslation(line) {
    return /\bt\s*\(\s*['"]/.test(line);
}

function shouldSkip(line) {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') ||
        t.startsWith('{/*') || t.startsWith('import ');
}

function isObjectKeyLine(line) {
    // Lines like: key: "Arabic" or key: 'Arabic'
    // The key part should NOT be translated, only the value
    return /^\s*\w+\s*:\s*["']/.test(line) ||
        /^\s*["']\w+["']\s*:\s*["']/.test(line);
}

function isInsideObjectLiteral(lines, lineIndex) {
    // Check if we're inside a const xxx = { ... } or similar
    for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 10); i--) {
        if (/(?:const|let|var)\s+\w+\s*=\s*\{/.test(lines[i])) return true;
        if (/(?:const|let|var)\s+\w+\s*=\s*\[/.test(lines[i])) return true;
        if (lines[i].trim() === '{' || lines[i].trim().endsWith('{')) return true;
    }
    return false;
}

let safeReplacements = 0;
const newKeys = {};

for (const [file] of errorCounts) {
    const filePath = path.resolve(__dirname, file);
    if (!fs.existsSync(filePath)) continue;

    const dir = path.dirname(file);
    const prefix = getPrefix(file, dir);

    let content = fs.readFileSync(filePath, 'utf8');
    const contentLines = content.split('\n');
    let keyNum = 0;
    let fileReplacements = 0;

    // Check existing keys to avoid collision
    const existingKeyRegex = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.text(\\d+)`, 'g');
    let m;
    while ((m = existingKeyRegex.exec(content)) !== null) {
        const num = parseInt(m[1]);
        if (num >= keyNum) keyNum = num + 1;
    }

    const newLines = contentLines.map((line, idx) => {
        if (!hasArabic(line) || shouldSkip(line) || hasTranslation(line)) return line;

        const key = `${prefix}.text${keyNum}`;
        let newLine = line;
        let replaced = false;
        let originalText = '';

        // SAFE Pattern 1: JSX text content without interpolation: >Arabic text<
        // But NOT if it's inside an object literal
        if (!replaced) {
            const match = line.match(/>([^<{]*[\u0600-\u06FF][^<{]*)</);
            if (match && match[1].trim().length > 1) {
                originalText = match[1].trim();
                newLine = line.replace(`>${match[1]}<`, `>{t('${key}')}<`);
                replaced = true;
            }
        }

        // SAFE Pattern 2: String attributes (NOT object keys)
        if (!replaced) {
            const attrMatch = line.match(/((?:label|placeholder|title|description|alt|aria-label)\s*=\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/);
            if (attrMatch) {
                originalText = attrMatch[2];
                newLine = line.replace(attrMatch[0], `${attrMatch[1]}{t('${key}')}`);
                replaced = true;
            }
        }

        // SAFE Pattern 3: Toast/alert messages
        if (!replaced) {
            const toastMatch = line.match(/(toast(?:\.\w+)?|alert)\(\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*\)/);
            if (toastMatch) {
                originalText = toastMatch[2];
                newLine = line.replace(toastMatch[0], `${toastMatch[1]}(t('${key}'))`);
                replaced = true;
            }
        }

        // SAFE Pattern 4: Object VALUE (not key): { key: "Arabic" }
        // Must distinguish from key position — only replace the VALUE part
        if (!replaced && isObjectKeyLine(line)) {
            const objValMatch = line.match(/(\w+\s*:\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/);
            if (objValMatch) {
                originalText = objValMatch[2];
                // Replace ONLY the value, keep the key
                newLine = line.replace(`"${objValMatch[2]}"`, `t('${key}')`);
                if (newLine === line) {
                    newLine = line.replace(`'${objValMatch[2]}'`, `t('${key}')`);
                }
                if (newLine !== line) {
                    replaced = true;
                }
            }
        }

        // SAFE Pattern 5: Simple string assignment: const x = "Arabic"
        if (!replaced && !isObjectKeyLine(line)) {
            const assignMatch = line.match(/(=\s*)["']([^"']*[\u0600-\u06FF][^"']*)["']/);
            if (assignMatch && !line.includes('test(') && !line.includes('RegExp')) {
                originalText = assignMatch[2];
                newLine = line.replace(assignMatch[0], `${assignMatch[1]}t('${key}')`);
                replaced = true;
            }
        }

        if (replaced) {
            newKeys[key] = originalText;
            keyNum++;
            fileReplacements++;
            return newLine;
        }

        return line;
    });

    if (fileReplacements > 0) {
        content = newLines.join('\n');

        // Add useTranslation if needed
        if (!/useTranslation/.test(content)) {
            // Add import
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

        // Add hook if needed
        if (!/const\s*\{\s*t\s*\}\s*=\s*useTranslation/.test(content)) {
            const funcMatch = content.match(/(?:export\s+(?:default\s+)?)?function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/);
            if (funcMatch) {
                const idx = content.indexOf(funcMatch[0]) + funcMatch[0].length;
                content = content.slice(0, idx) + '\n  const { t } = useTranslation();\n' + content.slice(idx);
            }
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  ✅ ${path.basename(file)}: ${fileReplacements} safe replacements`);
        safeReplacements += fileReplacements;
    }
}

// Step 4: Update locale files
const localeDir = path.join(__dirname, 'client', 'src', 'locales');
const locales = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

if (fs.existsSync(localeDir) && Object.keys(newKeys).length > 0) {
    console.log('\n📝 Updating locale files...');
    for (const locale of locales) {
        const localePath = path.join(localeDir, `${locale}.json`);
        if (!fs.existsSync(localePath)) continue;
        const existing = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        let added = 0;
        for (const [key, value] of Object.entries(newKeys)) {
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
        fs.writeFileSync(localePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
        console.log(`  ✅ ${locale}.json: +${added} new keys`);
    }
}

console.log(`\n🎉 Done! Reverted ${reverted} files, re-applied ${safeReplacements} safe translations`);
console.log(`📦 ${Object.keys(newKeys).length} new keys added`);
