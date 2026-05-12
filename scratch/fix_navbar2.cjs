const fs = require('fs');
const file = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src\\\\components\\\\Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('  const { t } = useTranslation();\n  const [isMenuOpen, setIsMenuOpen] = useState(false);\n  const { t, i18n } = useTranslation();', '  const [isMenuOpen, setIsMenuOpen] = useState(false);\n  const { t, i18n } = useTranslation();');

fs.writeFileSync(file, content);
console.log("Navbar fixed accurately!");
