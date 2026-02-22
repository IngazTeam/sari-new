/**
 * Admin Pages i18n Automation Script
 * Scans admin page TSX files for Arabic strings and replaces them with t() calls.
 * Updates all 8 locale files with the new keys.
 * 
 * Combines all 4 phases from merchant scripts into one comprehensive pass.
 */

const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, 'client', 'src', 'pages', 'admin');
const LOCALES_DIR = path.join(__dirname, 'client', 'public', 'locales');
const LOCALE_FILES = ['ar', 'en', 'fr', 'de', 'es', 'it', 'tr', 'zh'];

// Track all new keys per locale
const newKeys = {};
LOCALE_FILES.forEach(l => newKeys[l] = {});

let totalReplacements = 0;
let patchedFiles = 0;

/**
 * Generate a page key from file name
 * e.g., "Settings.tsx" -> "adminSettingsPage"
 * e.g., "SMTPSettings.tsx" -> "adminSMTPSettingsPage"
 */
function getPageKey(filename) {
    const base = filename.replace('.tsx', '');
    // Convert PascalCase to camelCase for the key
    const camel = base.charAt(0).toLowerCase() + base.slice(1);
    return `admin${base}Page`;
}

/**
 * Check if a line already uses t() for the Arabic string
 */
function isAlreadyTranslated(line) {
    const trimmed = line.trim();
    // If the line has t('...') and no standalone Arabic outside t(), skip
    const withoutT = line.replace(/t\('[^']*'\)/g, '').replace(/t\('[^']*',\s*\{[^}]*\}\)/g, '');
    return !/[\u0600-\u06FF]/.test(withoutT);
}

/**
 * Extract Arabic text from various patterns
 */
function extractAndReplace(content, pageKey) {
    let keyCounter = 0;
    let replacements = 0;
    const lines = content.split('\n');
    const newLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')) {
            newLines.push(line);
            continue;
        }

        // Skip console.log lines
        if (trimmed.startsWith('console.')) {
            newLines.push(line);
            continue;
        }

        // Skip if no Arabic
        if (!/[\u0600-\u06FF]/.test(line)) {
            newLines.push(line);
            continue;
        }

        // Skip if already fully translated
        if (isAlreadyTranslated(line)) {
            newLines.push(line);
            continue;
        }

        let modified = line;
        let lineReplaced = false;

        // === Pattern 1: JSX text content ===
        // >Arabic text<  or  >Arabic text with {var}<
        modified = modified.replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, (match, text) => {
            // Skip if already has t()
            if (/t\('/.test(text)) return match;

            const cleanText = text.trim();
            if (!cleanText || cleanText.length < 2) return match;

            // Check for embedded expressions like {var}
            const hasExpressions = /\{[^}]+\}/.test(cleanText);

            if (hasExpressions) {
                // Extract variables
                const vars = [];
                let template = cleanText.replace(/\{([^}]+)\}/g, (m, expr) => {
                    vars.push(expr);
                    return `{{var${vars.length - 1}}}`;
                });

                const key = `${pageKey}.text${keyCounter++}`;
                const varObj = vars.map((v, idx) => `var${idx}: ${v}`).join(', ');

                newKeys['ar'][key] = template;
                LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = template);

                lineReplaced = true;
                return `>{t('${key}', { ${varObj} })}<`;
            } else {
                const key = `${pageKey}.text${keyCounter++}`;

                newKeys['ar'][key] = cleanText;
                LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = cleanText);

                lineReplaced = true;
                return `>{t('${key}')}<`;
            }
        });

        // === Pattern 2: String attributes with Arabic ===
        // title="Arabic" placeholder="Arabic" label="Arabic" description="Arabic"
        modified = modified.replace(/((?:title|placeholder|label|description|alt|aria-label|content)=)"([^"]*[\u0600-\u06FF][^"]*)">/g, (match, attr, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `${attr}{t('${key}')}>`;
        });

        // Without closing >
        modified = modified.replace(/((?:title|placeholder|label|description|alt|aria-label|content)=)"([^"]*[\u0600-\u06FF][^"]*)"/g, (match, attr, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `${attr}{t('${key}')}`;
        });

        // === Pattern 3: Standalone string literals with Arabic ===
        // "Arabic text" in JSX expressions like {"Arabic text"}
        modified = modified.replace(/\{"([^"]*[\u0600-\u06FF][^"]*)"\}/g, (match, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `{t('${key}')}`;
        });

        // === Pattern 4: toast/confirm calls with Arabic strings ===
        // toast.success("Arabic")  toast.error("Arabic")  toast("Arabic")
        modified = modified.replace(/(toast(?:\.success|\.error|\.warning|\.info)?)\("([^"]*[\u0600-\u06FF][^"]*)"\)/g, (match, fn, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `${fn}(t('${key}'))`;
        });

        // toast with template literal
        modified = modified.replace(/(toast(?:\.success|\.error|\.warning|\.info)?)\(`([^`]*[\u0600-\u06FF][^`]*)`\)/g, (match, fn, text) => {
            if (/t\('/.test(text)) return match;

            // Extract ${expressions}
            const vars = [];
            let template = text.replace(/\$\{([^}]+)\}/g, (m, expr) => {
                vars.push(expr);
                return `{{var${vars.length - 1}}}`;
            });

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = template;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = template);

            if (vars.length > 0) {
                const varObj = vars.map((v, idx) => `var${idx}: ${v}`).join(', ');
                lineReplaced = true;
                return `${fn}(t('${key}', { ${varObj} }))`;
            } else {
                lineReplaced = true;
                return `${fn}(t('${key}'))`;
            }
        });

        // confirm("Arabic")
        modified = modified.replace(/confirm\("([^"]*[\u0600-\u06FF][^"]*)"\)/g, (match, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `confirm(t('${key}'))`;
        });

        // === Pattern 5: Object property values ===
        // { key: "Arabic text" }
        modified = modified.replace(/(\w+):\s*"([^"]*[\u0600-\u06FF][^"]*)"/g, (match, prop, text) => {
            if (/t\('/.test(text)) return match;
            // Skip if it's a CSS class or non-translatable prop
            if (['className', 'style', 'key', 'id', 'type', 'name', 'value', 'htmlFor', 'href', 'src', 'dir', 'variant', 'size'].includes(prop)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `${prop}: t('${key}')`;
        });

        // === Pattern 6: Ternary with Arabic ===
        // condition ? "Arabic1" : "Arabic2"
        modified = modified.replace(/\?\s*"([^"]*[\u0600-\u06FF][^"]*)"\s*:\s*"([^"]*[\u0600-\u06FF][^"]*)"/g, (match, text1, text2) => {
            const key1 = `${pageKey}.text${keyCounter++}`;
            const key2 = `${pageKey}.text${keyCounter++}`;

            newKeys['ar'][key1] = text1;
            newKeys['ar'][key2] = text2;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => {
                newKeys[l][key1] = text1;
                newKeys[l][key2] = text2;
            });

            lineReplaced = true;
            return `? t('${key1}') : t('${key2}')`;
        });

        // Single ternary branch: ? "Arabic" :
        modified = modified.replace(/\?\s*"([^"]*[\u0600-\u06FF][^"]*)"\s*:/g, (match, text) => {
            if (/t\('/.test(match)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `? t('${key}') :`;
        });

        // : "Arabic"} or : "Arabic")
        modified = modified.replace(/:\s*"([^"]*[\u0600-\u06FF][^"]*)"([}\)])/g, (match, text, closing) => {
            if (/t\('/.test(match)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `: t('${key}')${closing}`;
        });

        // === Pattern 7: Fallback with || "Arabic" ===
        modified = modified.replace(/\|\|\s*"([^"]*[\u0600-\u06FF][^"]*)"/g, (match, text) => {
            if (/t\('/.test(text)) return match;

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = text;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = text);

            lineReplaced = true;
            return `|| t('${key}')`;
        });

        // === Pattern 8: Template literals with Arabic ===
        modified = modified.replace(/`([^`]*[\u0600-\u06FF][^`]*)`/g, (match, text) => {
            if (/t\('/.test(text)) return match;

            // Check for ${} expressions
            const vars = [];
            let template = text.replace(/\$\{([^}]+)\}/g, (m, expr) => {
                vars.push(expr);
                return `{{var${vars.length - 1}}}`;
            });

            const key = `${pageKey}.text${keyCounter++}`;
            newKeys['ar'][key] = template;
            LOCALE_FILES.filter(l => l !== 'ar').forEach(l => newKeys[l][key] = template);

            if (vars.length > 0) {
                const varObj = vars.map((v, idx) => `var${idx}: ${v}`).join(', ');
                lineReplaced = true;
                return `t('${key}', { ${varObj} })`;
            } else {
                lineReplaced = true;
                return `t('${key}')`;
            }
        });

        if (lineReplaced) {
            replacements++;
        }

        newLines.push(modified);
    }

    return { content: newLines.join('\n'), replacements, keyCount: keyCounter };
}

/**
 * Ensure useTranslation is imported and hook is initialized
 */
function ensureTranslationImport(content) {
    // Check if already imported
    if (/import\s*\{\s*useTranslation\s*\}\s*from\s*'react-i18next'/.test(content)) {
        return content;
    }

    // Find the first import line
    const lines = content.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
            lastImportIndex = i;
        }
        // Multi-line imports — find the closing line
        if (lines[i].includes('} from ')) {
            lastImportIndex = i;
        }
    }

    if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, "import { useTranslation } from 'react-i18next';");
    }

    content = lines.join('\n');

    // Add the hook call after the component function declaration
    // Look for "export default function XXX() {" or "function XXX() {"
    if (!/const\s*\{\s*t\s*\}\s*=\s*useTranslation/.test(content)) {
        content = content.replace(
            /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{[\r\n]+)/,
            '$1  const { t } = useTranslation();\n'
        );
    }

    return content;
}

// ===== MAIN =====
console.log('🔍 Admin Pages i18n Automation\n');
console.log('Scanning', ADMIN_DIR, '\n');

const files = fs.readdirSync(ADMIN_DIR).filter(f => f.endsWith('.tsx'));

files.forEach(file => {
    const filePath = path.join(ADMIN_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if file has Arabic
    if (!/[\u0600-\u06FF]/.test(content)) {
        return;
    }

    const pageKey = getPageKey(file);
    const { content: newContent, replacements, keyCount } = extractAndReplace(content, pageKey);

    if (replacements > 0) {
        // Ensure imports
        const finalContent = ensureTranslationImport(newContent);
        fs.writeFileSync(filePath, finalContent, 'utf8');
        patchedFiles++;
        totalReplacements += replacements;
        console.log(`✅ ${file}: ${replacements} replacements (${keyCount} keys) → ${pageKey}`);
    }
});

// Update locale files
console.log('\n📝 Updating locale files...\n');

LOCALE_FILES.forEach(locale => {
    const localePath = path.join(LOCALES_DIR, locale, 'translation.json');

    if (!fs.existsSync(localePath)) {
        console.log(`⚠️  ${locale}/translation.json not found, skipping`);
        return;
    }

    const existing = JSON.parse(fs.readFileSync(localePath, 'utf8'));

    // Merge new keys
    const keys = newKeys[locale];
    let added = 0;

    Object.entries(keys).forEach(([key, value]) => {
        // Split key into parts: "adminSettingsPage.text0" → ["adminSettingsPage", "text0"]
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
    console.log(`✅ ${locale}.json updated (+${added} keys)`);
});

console.log(`\n🎉 Done! Patched ${patchedFiles} files with ${totalReplacements} replacements.`);
