/**
 * Automated i18n extraction script for Sari dashboard pages.
 * Extracts hardcoded Arabic strings from TSX files and replaces them with t() calls.
 * Also generates the corresponding translation keys for all 8 locales.
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client', 'src', 'locales');
const arabicRe = /[\u0600-\u06FF]/;

// Load existing locale files
function loadLocales() {
    const locales = {};
    for (const lang of ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh']) {
        locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, lang + '.json'), 'utf8'));
    }
    return locales;
}

// Save locale files
function saveLocales(locales) {
    for (const [lang, content] of Object.entries(locales)) {
        fs.writeFileSync(path.join(localesDir, lang + '.json'), JSON.stringify(content, null, 2) + '\n', 'utf8');
    }
}

// Extract Arabic strings from a TSX file and return a map of {arabicString -> suggestedKey}
function extractArabicStrings(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const strings = new Map();

    // Patterns to match Arabic strings in JSX
    const patterns = [
        // >Arabic text< (JSX text content)
        />\s*([\u0600-\u06FF][\u0600-\u06FF\s\d\.\,\!\?\:\;\-\(\)\/\%\*\+\=\#\@\&\"\']+)\s*</g,
        // "Arabic text" or 'Arabic text' in attributes/props
        /['"]([\u0600-\u06FF][\u0600-\u06FF\s\d\.\,\!\?\:\;\-\(\)\/\%\*\+\=\#\@\&]*)['"]/g,
        // title: 'Arabic text' or label: 'Arabic text' etc
        /(?:title|label|description|message|placeholder|name|text|header|content|alert|error|success|info|warning|buttonText|confirmText|cancelText|heading|subheading|subtitle):\s*['"]([\u0600-\u06FF][\u0600-\u06FF\s\d\.\,\!\?\:\;\-\(\)\/\%\*\+\=\#\@\&]*)['"]/g,
    ];

    for (const line of lines) {
        if (!arabicRe.test(line)) continue;
        if (line.includes('import ') || line.includes('// ') || line.includes('ar-SA')) continue;

        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(line)) !== null) {
                const str = match[1].trim();
                if (str.length >= 2 && !strings.has(str)) {
                    strings.set(str, str);
                }
            }
        }
    }

    return strings;
}

// Process a directory
function processDirectory(dirPath, prefix) {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.tsx'));
    const allStrings = new Map();

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const strings = extractArabicStrings(filePath);
        const pageName = file.replace('.tsx', '');

        if (strings.size > 0) {
            console.log(`${prefix}/${file}: ${strings.size} Arabic strings found`);
            for (const [str] of strings) {
                allStrings.set(str, { page: pageName, prefix });
            }
        }
    }

    return allStrings;
}

// Main
const merchantDir = path.join(__dirname, 'client', 'src', 'pages', 'merchant');
const adminDir = path.join(__dirname, 'client', 'src', 'pages', 'admin');

console.log('=== Scanning Merchant Pages ===');
const merchantStrings = processDirectory(merchantDir, 'merchant');

console.log('\n=== Scanning Admin Pages ===');
const adminStrings = processDirectory(adminDir, 'admin');

console.log(`\nTotal unique Arabic strings: ${merchantStrings.size + adminStrings.size}`);
console.log(`Merchant: ${merchantStrings.size}, Admin: ${adminStrings.size}`);
