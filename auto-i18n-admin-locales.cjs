/**
 * Admin Pages i18n - Locale File Update Only
 * Re-scans the patched admin files to extract all t() keys and updates locale files.
 */

const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, 'client', 'src', 'pages', 'admin');
const LOCALES_DIR = path.join(__dirname, 'client', 'src', 'locales');
const LOCALE_FILES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

// Collect all keys from the patched admin files
const allKeys = {};

function getPageKey(filename) {
    const base = filename.replace('.tsx', '');
    return `admin${base}Page`;
}

console.log('🔍 Scanning patched admin files for t() keys...\n');

const files = fs.readdirSync(ADMIN_DIR).filter(f => f.endsWith('.tsx'));
let totalKeys = 0;

files.forEach(file => {
    const filePath = path.join(ADMIN_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const pageKey = getPageKey(file);

    // Find all t('pageKey.textN') patterns
    const regex = /t\('(admin\w+Page\.text\d+)'\)/g;
    let match;
    const fileKeys = new Set();

    while ((match = regex.exec(content)) !== null) {
        fileKeys.add(match[1]);
    }

    // Also find t('pageKey.textN', { ... }) patterns
    const regex2 = /t\('(admin\w+Page\.text\d+)',/g;
    while ((match = regex2.exec(content)) !== null) {
        fileKeys.add(match[1]);
    }

    if (fileKeys.size > 0) {
        console.log(`  ${file}: ${fileKeys.size} keys`);
        totalKeys += fileKeys.size;

        fileKeys.forEach(key => {
            allKeys[key] = true;
        });
    }
});

console.log(`\n📊 Total unique keys: ${totalKeys}`);

// Now we need to find the Arabic text for each key
// We'll re-scan the original files to match
// But since the script already replaced them, we need to use Git to get originals
// OR we can read from git diff... 
// Better approach: read the CURRENT content and extract what's in the t() calls

// Actually, since the script has ALREADY replaced the text, we need another approach.
// Let's look at git to get the original Arabic text

console.log('\n🔧 Extracting original Arabic text from git...\n');

const { execSync } = require('child_process');

// Get the git diff for each admin file
const adminKeys = {};

files.forEach(file => {
    const filePath = path.join('client', 'src', 'pages', 'admin', file);

    try {
        // Get the diff to see what was replaced
        const diff = execSync(`git diff "${filePath}"`, {
            encoding: 'utf8',
            cwd: __dirname,
            maxBuffer: 1024 * 1024 * 10
        });

        if (!diff) return;

        // Parse the diff to extract old text → new key mapping
        const diffLines = diff.split('\n');

        for (let i = 0; i < diffLines.length; i++) {
            const removedLine = diffLines[i];
            const addedLine = diffLines[i + 1];

            if (!removedLine || !addedLine) continue;
            if (!removedLine.startsWith('-') || !addedLine.startsWith('+')) continue;
            if (removedLine.startsWith('---') || addedLine.startsWith('+++')) continue;

            // Find the key in the added line
            const keyMatch = addedLine.match(/t\('(admin\w+Page\.text\d+)'\)/);
            const keyMatchWithVars = addedLine.match(/t\('(admin\w+Page\.text\d+)',/);
            const key = keyMatch?.[1] || keyMatchWithVars?.[1];

            if (!key) continue;

            // Extract Arabic text from the removed line
            const arabicMatch = removedLine.match(/"([^"]*[\u0600-\u06FF][^"]*)"/);
            const arabicMatchBT = removedLine.match(/`([^`]*[\u0600-\u06FF][^`]*)`/);
            const arabicMatchJSX = removedLine.match(/>([^<]*[\u0600-\u06FF][^<]*)</);

            let arabicText = null;

            if (arabicMatch) {
                arabicText = arabicMatch[1];
            } else if (arabicMatchBT) {
                // Convert ${expr} to {{varN}} format
                let text = arabicMatchBT[1];
                let varIdx = 0;
                text = text.replace(/\$\{([^}]+)\}/g, () => `{{var${varIdx++}}}`);
                arabicText = text;
            } else if (arabicMatchJSX) {
                arabicText = arabicMatchJSX[1].trim();
            }

            if (arabicText && arabicText.length > 1) {
                adminKeys[key] = arabicText;
            }
        }
    } catch (e) {
        // File may not be tracked by git
    }
});

console.log(`📝 Extracted ${Object.keys(adminKeys).length} key-value pairs from git diff\n`);

// Now update locale files
console.log('📝 Updating locale files...\n');

LOCALE_FILES.forEach(locale => {
    const localePath = path.join(LOCALES_DIR, `${locale}.json`);

    if (!fs.existsSync(localePath)) {
        console.log(`⚠️  ${locale}.json not found at ${localePath}`);
        return;
    }

    const existing = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    let added = 0;

    Object.entries(adminKeys).forEach(([key, value]) => {
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

console.log('\n🎉 Locale files updated!');
