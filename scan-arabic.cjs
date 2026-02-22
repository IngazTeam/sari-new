const fs = require('fs');
const path = require('path');

const dirs = [
    'client/src/pages/admin',
    'client/src/pages/merchant',
    'client/src/pages/setup-wizard',
    'client/src/pages',
    'client/src/components',
];

let grand = 0;

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
    let total = 0;
    const results = [];

    files.forEach(f => {
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        const lines = content.split('\n');
        let count = 0;

        lines.forEach((l, i) => {
            const t = l.trim();
            if (/[\u0600-\u06FF]/.test(l) &&
                !t.startsWith('//') &&
                !t.startsWith('/*') &&
                !t.startsWith('*') &&
                !t.startsWith('{/*') &&
                !t.startsWith('import') &&
                !/t\(['"]/.test(l)) {  // Skip lines already using t()
                count++;
            }
        });

        if (count > 0) results.push({ file: f, count });
        total += count;
    });

    if (total > 0) {
        console.log(`\n📁 ${dir}: ${total} lines`);
        results.sort((a, b) => b.count - a.count);
        results.forEach(r => console.log(`  ${r.count}\t${r.file}`));
    }
    grand += total;
});

console.log(`\n📊 Grand Total: ${grand} Arabic lines still untranslated`);
