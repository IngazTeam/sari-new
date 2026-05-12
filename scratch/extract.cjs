const fs = require('fs');
const path = require('path');

const pagesDir = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src\\\\pages';
const filesToProcess = ['ProductAI.tsx', 'SolutionsSales.tsx', 'SolutionsMarketing.tsx', 'SolutionsSupport.tsx', 'CompanyAbout.tsx'];

let allKeysAr = {};
let allKeysEn = {}; // We'll just put empty string or a placeholder

for (const file of filesToProcess) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const pageName = file.replace('.tsx', '');
  const pageKeyPrefix = pageName.charAt(0).toLowerCase() + pageName.slice(1);
  
  allKeysAr[pageKeyPrefix] = {};
  allKeysEn[pageKeyPrefix] = {};

  let counter = 0;

  // 1. Replace text between > and <
  content = content.replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, (match, p1) => {
    const text = p1.trim();
    if (!text) return match;
    
    // Check if it's already wrapped in {}
    if (match.includes('{') || match.includes('}')) return match; // skip complex JSX expressions for safety

    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text + " (EN)"; // Placeholder for EN
    
    // Replace the matched text but keep the surrounding spaces if any
    return match.replace(p1, `{t('${pageKeyPrefix}.${keyName}')}`);
  });

  // 2. Replace placeholder text in input/textarea (if any)
  content = content.replace(/placeholder="([^"]*[\u0600-\u06FF][^"]*)"/g, (match, p1) => {
    const text = p1.trim();
    if (!text) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text + " (EN)";
    return `placeholder={t('${pageKeyPrefix}.${keyName}')}`;
  });
  
  // Make sure SeoHead is imported and used
  if (!content.includes('SeoHead')) {
    // Add import
    content = content.replace('import { useTranslation } from \'react-i18next\';', 'import { useTranslation } from \'react-i18next\';\nimport { SeoHead, useSeoConfig } from \'@/components/SeoHead\';');
    // Inject SeoHead
    const seoKeyMap = {
      'ProductAI': 'productAI',
      'SolutionsSales': 'solutionsSales',
      'SolutionsMarketing': 'solutionsMarketing',
      'SolutionsSupport': 'solutionsSupport',
      'CompanyAbout': 'companyAbout'
    };
    
    // Find the first <div className="min-h-screen...
    content = content.replace(/(<div className="min-h-screen[^>]*>)/, `$1\n      <SeoHead {...useSeoConfig('${seoKeyMap[pageName]}')} />`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

// Inject into ar.json and en.json
const arPath = path.join(__dirname, '../client/src/locales/ar.json');
const enPath = path.join(__dirname, '../client/src/locales/en.json');

const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

Object.assign(arData, allKeysAr);
Object.assign(enData, allKeysEn);

fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');

console.log("Extraction and injection completed!");
