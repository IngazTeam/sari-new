const fs = require('fs');
const file = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src\\\\components\\\\Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove the injected `const { t } = useTranslation();`
content = content.replace('  const { t } = useTranslation();\n', '');

fs.writeFileSync(file, content);
console.log("Navbar fixed!");
