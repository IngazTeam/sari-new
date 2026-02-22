/**
 * Translation Script for Sari Locale Files
 * 
 * Reads ar.json as source of truth, then for each target locale,
 * translates all Arabic values to the target language.
 * For en.json, preserves already-translated English values.
 */
const fs = require('fs');
const path = require('path');

const localesDir = __dirname;

// Load source files
const ar = JSON.parse(fs.readFileSync(path.join(localesDir, 'ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

// Check if a string contains Arabic characters
function hasArabic(str) {
    return /[\u0600-\u06FF]/.test(str);
}

// Count Arabic and non-Arabic leaf values
function countLeaves(obj, prefix = '') {
    let arabic = 0, nonArabic = 0, total = 0;
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'object' && val !== null) {
            const sub = countLeaves(val, prefix + key + '.');
            arabic += sub.arabic;
            nonArabic += sub.nonArabic;
            total += sub.total;
        } else if (typeof val === 'string') {
            total++;
            if (hasArabic(val)) {
                arabic++;
            } else {
                nonArabic++;
            }
        }
    }
    return { arabic, nonArabic, total };
}

// Get all sections (top-level keys) and their Arabic counts
function getSectionStats(obj) {
    const stats = [];
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            const counts = countLeaves(obj[key]);
            stats.push({ section: key, ...counts });
        }
    }
    return stats;
}

// Report for each file
const files = ['ar', 'en', 'fr', 'es', 'de', 'it', 'tr', 'zh'];
for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(localesDir, f + '.json'), 'utf8'));
    const counts = countLeaves(data);
    console.log(`\n=== ${f}.json ===`);
    console.log(`Total strings: ${counts.total}`);
    console.log(`Arabic values: ${counts.arabic} (${(counts.arabic / counts.total * 100).toFixed(1)}%)`);
    console.log(`Non-Arabic values: ${counts.nonArabic} (${(counts.nonArabic / counts.total * 100).toFixed(1)}%)`);
}

// Show en.json section breakdown
console.log('\n\n=== en.json Section Breakdown ===');
const enSections = getSectionStats(en);
for (const s of enSections) {
    if (s.arabic > 0) {
        console.log(`  ${s.section}: ${s.arabic}/${s.total} Arabic (${(s.arabic / s.total * 100).toFixed(0)}%)`);
    }
}
