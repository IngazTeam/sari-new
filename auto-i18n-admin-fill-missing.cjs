/**
 * Fill missing locale keys by using git show to access original files
 * and extracting Arabic text from the original content at matching positions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ADMIN_DIR = path.join(__dirname, 'client', 'src', 'pages', 'admin');
const LOCALES_DIR = path.join(__dirname, 'client', 'src', 'locales');
const LOCALE_FILES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

const arLocalePath = path.join(LOCALES_DIR, 'ar.json');
const arLocale = JSON.parse(fs.readFileSync(arLocalePath, 'utf8'));

// Find all missing keys across all admin files
const files = fs.readdirSync(ADMIN_DIR).filter(f => f.endsWith('.tsx'));
const missingKeys = [];

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
            if (!obj || !obj[part]) {
                found = false;
                break;
            }
            obj = obj[part];
        }

        if (!found) {
            missingKeys.push({ key: fullKey, file, position: match.index });
        }
    }
});

console.log(`📊 Found ${missingKeys.length} missing keys\n`);

// For each missing key, try to find the original Arabic text
// Strategy: get the original file from git HEAD and compare line by line
const keyValues = {};
let resolved = 0;

// Group missing keys by file
const keysByFile = {};
missingKeys.forEach(({ key, file, position }) => {
    if (!keysByFile[file]) keysByFile[file] = [];
    keysByFile[file].push({ key, position });
});

Object.entries(keysByFile).forEach(([file, keys]) => {
    const relPath = `client/src/pages/admin/${file}`;

    // Get original content from git
    let originalContent;
    try {
        originalContent = execSync(`git show HEAD:"${relPath}"`, {
            encoding: 'utf8',
            cwd: __dirname,
            maxBuffer: 1024 * 1024 * 10
        });
    } catch (e) {
        console.log(`⚠️  Could not get original: ${file}`);
        return;
    }

    const currentContent = fs.readFileSync(path.join(ADMIN_DIR, file), 'utf8');
    const originalLines = originalContent.split('\n');
    const currentLines = currentContent.split('\n');

    // For each current line containing a missing key, find the corresponding original line
    keys.forEach(({ key }) => {
        // Find line number of the key in current file
        let lineNum = -1;
        for (let i = 0; i < currentLines.length; i++) {
            if (currentLines[i].includes(`t('${key}')`)) {
                lineNum = i;
                break;
            }
        }

        if (lineNum === -1) return;

        // Look at a window around the same line number in the original file
        // The line number might be slightly shifted due to added imports
        const searchStart = Math.max(0, lineNum - 5);
        const searchEnd = Math.min(originalLines.length - 1, lineNum + 5);

        // Get context from current line (non-Arabic parts)
        const currentLine = currentLines[lineNum];

        // Find the matching original line by looking for the same structure
        // but with Arabic text instead of t() call
        for (let j = searchStart; j <= searchEnd; j++) {
            const origLine = originalLines[j];
            if (!origLine || !/[\u0600-\u06FF]/.test(origLine)) continue;

            // Check if the structural content matches
            // Strip t('key') from current and Arabic from original, then compare structure
            const currentStructure = currentLine
                .replace(/t\('[^']*'\)/g, '__T__')
                .replace(/t\('[^']*',\s*\{[^}]*\}\)/g, '__T__')
                .replace(/\s+/g, ' ')
                .trim();

            const origStructure = origLine
                .replace(/"[^"]*[\u0600-\u06FF][^"]*"/g, '__T__')
                .replace(/`[^`]*[\u0600-\u06FF][^`]*`/g, '__T__')
                .replace(/'[^']*[\u0600-\u06FF][^']*'/g, '__T__')
                .replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, '>__T__<')
                .replace(/\s+/g, ' ')
                .trim();

            if (currentStructure === origStructure || currentStructure.includes(origStructure.substring(0, 30))) {
                // Found a match! Extract Arabic text
                const arabicMatches = [
                    ...origLine.matchAll(/"([^"]*[\u0600-\u06FF][^"]*)"/g),
                    ...origLine.matchAll(/`([^`]*[\u0600-\u06FF][^`]*)`/g),
                    ...origLine.matchAll(/'([^']*[\u0600-\u06FF][^']*)'/g),
                    ...origLine.matchAll(/>([^<]*[\u0600-\u06FF][^<]*)</g),
                ];

                // Find which Arabic text in this line corresponds to this key
                // Count t() calls before this key on the same line
                const beforeKey = currentLine.substring(0, currentLine.indexOf(`t('${key}')`));
                const tCallsBefore = (beforeKey.match(/t\('/g) || []).length;

                if (arabicMatches[tCallsBefore]) {
                    const arabicText = arabicMatches[tCallsBefore][1].trim();
                    if (arabicText) {
                        keyValues[key] = arabicText;
                        resolved++;
                    }
                } else if (arabicMatches[0]) {
                    // Fallback: use the first Arabic text on this line
                    const arabicText = arabicMatches[0][1].trim();
                    if (arabicText) {
                        keyValues[key] = arabicText;
                        resolved++;
                    }
                }
                break;
            }
        }
    });
});

console.log(`✅ Resolved ${resolved} / ${missingKeys.length} missing keys\n`);

// If still missing some, try a brute-force approach: 
// for each key textN, find the Nth Arabic text in the original file
const stillMissing = missingKeys.filter(({ key }) => !keyValues[key]);

if (stillMissing.length > 0) {
    console.log(`🔧 Trying brute-force approach for ${stillMissing.length} remaining keys...\n`);

    // Group by file
    const stillByFile = {};
    stillMissing.forEach(({ key, file }) => {
        if (!stillByFile[file]) stillByFile[file] = [];
        stillByFile[file].push(key);
    });

    Object.entries(stillByFile).forEach(([file, keys]) => {
        const relPath = `client/src/pages/admin/${file}`;

        let originalContent;
        try {
            originalContent = execSync(`git show HEAD:"${relPath}"`, {
                encoding: 'utf8',
                cwd: __dirname,
                maxBuffer: 1024 * 1024 * 10
            });
        } catch (e) {
            return;
        }

        // Collect ALL Arabic strings from the original file in order
        const allArabic = [];
        const origLines = originalContent.split('\n');

        origLines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

            // Extract all Arabic strings from this line
            const patterns = [
                /"([^"]*[\u0600-\u06FF][^"]*)"/g,
                /`([^`]*[\u0600-\u06FF][^`]*)`/g,
                /'([^']*[\u0600-\u06FF][^']*)'/g,
                />([^<]*[\u0600-\u06FF][^<]*)</g,
            ];

            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(line)) !== null) {
                    const text = m[1].trim();
                    if (text && text.length > 1) {
                        allArabic.push(text);
                    }
                }
            }
        });

        // For each missing key like adminXxxPage.textN, extract N and map to allArabic[N]
        const pageKey = keys[0].split('.')[0]; // e.g., adminSettingsPage

        keys.forEach(key => {
            const keyNum = parseInt(key.split('.')[1].replace('text', ''));
            if (keyNum < allArabic.length && !keyValues[key]) {
                keyValues[key] = allArabic[keyNum];
                resolved++;
            }
        });
    });

    console.log(`✅ After brute-force: resolved ${resolved} / ${missingKeys.length} keys\n`);
}

// Update locale files
console.log('📝 Updating locale files...\n');

LOCALE_FILES.forEach(locale => {
    const localePath = path.join(LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(localePath)) return;

    const existing = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    let added = 0;

    Object.entries(keyValues).forEach(([key, value]) => {
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

// Final count
const finalLocale = JSON.parse(fs.readFileSync(arLocalePath, 'utf8'));
let finalMissing = 0;
missingKeys.forEach(({ key }) => {
    const parts = key.split('.');
    let obj = finalLocale;
    let found = true;
    for (const part of parts) {
        if (!obj || !obj[part]) { found = false; break; }
        obj = obj[part];
    }
    if (!found) finalMissing++;
});

console.log(`\n📊 Final: ${finalMissing} keys still missing`);
console.log('🎉 Done!');
