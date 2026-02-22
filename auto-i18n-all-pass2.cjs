/**
 * Pass 2: Handle complex remaining Arabic patterns
 * - Template literals with interpolation
 * - JSX with embedded {variables}
 * - Ternary expressions with Arabic
 * - String concatenation with Arabic
 * - Array/object values
 * - Function arguments
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

// Get or create prefix for file
function getPrefix(file, dir) {
    const base = file.replace(/\.tsx$/, '');
    if (dir.includes('setup-wizard')) return `wizard${base}Page`;
    if (dir.includes('components')) return `comp${base}Page`;
    if (dir.includes('merchant')) return `merchant${base}Page`;
    if (dir.includes('admin')) return `admin${base}Page`;
    return `${base.charAt(0).toLowerCase() + base.slice(1)}Page`;
}

// Find highest existing key number
function getNextKeyNum(content, prefix) {
    const regex = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.text(\\d+)`, 'g');
    let max = -1;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const num = parseInt(match[1]);
        if (num > max) max = num;
    }
    return max + 1;
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

        // Count eligible Arabic lines
        const arabicCount = lines.filter(l => hasArabic(l) && !shouldSkip(l) && !hasTranslation(l)).length;
        if (arabicCount === 0) continue;

        const prefix = getPrefix(file, dir);
        let keyNum = getNextKeyNum(content, prefix);
        let fileReplacements = 0;

        const newLines = lines.map(line => {
            if (!hasArabic(line) || shouldSkip(line) || hasTranslation(line)) return line;

            const key = `${prefix}.text${keyNum}`;
            let newLine = line;
            let replaced = false;
            let originalText = '';
            let match;

            // P1: Template literal with interpolation: `Arabic ${var} text`
            match = line.match(/([:=]\s*)`([^`]*[\u0600-\u06FF][^`]*)`/);
            if (match && !replaced) {
                originalText = match[2];
                // Replace ${xxx} with {{xxx}} for i18n
                const cleanText = originalText.replace(/\$\{([^}]+)\}/g, '{{$1}}');
                // Build t() call with variables
                const vars = [];
                const varRegex = /\$\{([^}]+)\}/g;
                let varMatch;
                while ((varMatch = varRegex.exec(originalText)) !== null) {
                    vars.push(varMatch[1].trim());
                }

                if (vars.length > 0) {
                    const varObj = vars.map(v => `${v.replace(/[^a-zA-Z0-9_]/g, '_')}: ${v}`).join(', ');
                    newLine = line.replace(match[0], `${match[1]}t('${key}', { ${varObj} })`);
                } else {
                    newLine = line.replace(match[0], `${match[1]}t('${key}')`);
                }
                originalText = cleanText;
                replaced = true;
            }

            // P2: JSX with mixed content: >Arabic {var} text<
            if (!replaced) {
                match = line.match(/>([^<]*[\u0600-\u06FF][^<]*\{[^<]*)<\//);
                if (match) {
                    // Complex JSX with interpolation — extract just the Arabic parts
                    const fullText = match[1].trim();
                    // Only handle simple cases like: Arabic text {count} more text
                    const parts = fullText.split(/(\{[^}]+\})/);
                    const hasOnlySimpleVars = parts.every(p => !p.includes('{') || /^\{[a-zA-Z0-9_.]+\}$/.test(p));

                    if (hasOnlySimpleVars && parts.length <= 5) {
                        const cleanText = fullText.replace(/\{([^}]+)\}/g, '{{$1}}');
                        const vars = [];
                        const varRegex = /\{([^}]+)\}/g;
                        let varMatch;
                        while ((varMatch = varRegex.exec(fullText)) !== null) {
                            vars.push(varMatch[1].trim());
                        }
                        const varObj = vars.map(v => `${v}: ${v}`).join(', ');
                        newLine = line.replace(`>${match[1]}<`, `>{t('${key}', { ${varObj} })}<`);
                        originalText = cleanText;
                        replaced = true;
                    }
                }
            }

            // P3: Ternary with Arabic: condition ? "Arabic1" : "Arabic2"  
            if (!replaced) {
                match = line.match(/\?\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*:\s*["']([^"']*[\u0600-\u06FF][^"']*)["']/);
                if (match) {
                    const key2 = `${prefix}.text${keyNum + 1}`;
                    newLine = line.replace(match[0], `? t('${key}') : t('${key2}')`);
                    allKeys[key] = match[1];
                    allKeys[key2] = match[2];
                    keyNum += 2;
                    fileReplacements++;
                    return newLine; // Already handled both keys
                }
            }

            // P4: Single ternary: condition ? "Arabic" : something
            if (!replaced) {
                match = line.match(/\?\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*:/);
                if (match) {
                    newLine = line.replace(`"${match[1]}"`, `t('${key}')`).replace(`'${match[1]}'`, `t('${key}')`);
                    originalText = match[1];
                    replaced = true;
                }
            }

            // P5: : "Arabic"  (ternary else)
            if (!replaced) {
                match = line.match(/:\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*[,;}\)]/);
                if (match) {
                    newLine = line.replace(`"${match[1]}"`, `t('${key}')`).replace(`'${match[1]}'`, `t('${key}')`);
                    originalText = match[1];
                    replaced = true;
                }
            }

            // P6: String concatenation: "Arabic" + variable
            if (!replaced) {
                match = line.match(/["']([^"']*[\u0600-\u06FF][^"']*)["']\s*\+/);
                if (match) {
                    // Simple case — just replace the Arabic part
                    newLine = line.replace(`"${match[1]}"`, `t('${key}')`).replace(`'${match[1]}'`, `t('${key}')`);
                    originalText = match[1];
                    replaced = true;
                }
            }

            // P7: Function argument: fn("Arabic")
            if (!replaced) {
                match = line.match(/\(\s*["']([^"']*[\u0600-\u06FF][^"']*)["']\s*[,\)]/);
                if (match && !line.includes("t('") && !line.includes('t("')) {
                    newLine = line.replace(`"${match[1]}"`, `t('${key}')`).replace(`'${match[1]}'`, `t('${key}')`);
                    originalText = match[1];
                    replaced = true;
                }
            }

            // P8: Bare Arabic in JSX (no interpolation): >Arabic text<
            if (!replaced) {
                match = line.match(/>([^<{]*[\u0600-\u06FF][^<{]*)</);
                if (match) {
                    const text = match[1].trim();
                    if (text.length > 1 && !text.includes('{')) {
                        newLine = line.replace(`>${match[1]}<`, `>{t('${key}')}<`);
                        originalText = text;
                        replaced = true;
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
            const newContent = newLines.join('\n');
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`  ✅ ${file}: ${fileReplacements} more replacements`);
            totalReplacements += fileReplacements;
            totalFiles++;
        }
    }
}

console.log(`\n📊 Pass 2 Total: ${totalFiles} files, ${totalReplacements} replacements`);

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
        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
        console.log(`  ✅ ${locale}.json: +${added} new keys`);
    }
}

console.log(`\n🎉 Pass 2 done! ${totalReplacements} more replacements, ${Object.keys(allKeys).length} new keys`);
