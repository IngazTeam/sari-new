const fs = require('fs');
const path = require('path');

const pagesDir = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src\\\\pages';
const filesToProcess = ['company\\\\Contact.tsx', 'company\\\\Terms.tsx', 'company\\\\Privacy.tsx', 'resources\\\\Blog.tsx', 'resources\\\\HelpCenter.tsx', 'resources\\\\SuccessStories.tsx'];

let allKeysAr = {};
let allKeysEn = {};

for (const file of filesToProcess) {
  const filePath = path.join(pagesDir, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Extract base filename without extension for the prefix
  const pageName = path.basename(file, '.tsx');
  const pageKeyPrefix = pageName.charAt(0).toLowerCase() + pageName.slice(1);
  
  allKeysAr[pageKeyPrefix] = {};
  allKeysEn[pageKeyPrefix] = {};

  let counter = 0;

  content = content.replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, (match, p1) => {
    const text = p1.trim();
    if (!text || match.includes('{') || match.includes('}')) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text + " (EN)";
    return match.replace(p1, `{t('${pageKeyPrefix}.${keyName}')}`);
  });

  content = content.replace(/placeholder="([^"]*[\u0600-\u06FF][^"]*)"/g, (match, p1) => {
    const text = p1.trim();
    if (!text) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text + " (EN)";
    return `placeholder={t('${pageKeyPrefix}.${keyName}')}`;
  });
  
  if (!content.includes('SeoHead')) {
    if (!content.includes('useTranslation')) {
      content = content.replace(/(import .*?;)\n(?=export)/s, "$1\nimport { useTranslation } from 'react-i18next';\nimport { SeoHead, useSeoConfig } from '@/components/SeoHead';\n");
    } else {
      content = content.replace('import { useTranslation } from \'react-i18next\';', 'import { useTranslation } from \'react-i18next\';\nimport { SeoHead, useSeoConfig } from \'@/components/SeoHead\';');
    }
    
    // Add t hook if missing
    if (!content.includes('const { t } = useTranslation()')) {
        content = content.replace(/export default function [^)]*\(\) \{/, match => match + "\n  const { t } = useTranslation();");
    }

    const seoKeyMap = {
      'Contact': 'contact',
      'Terms': 'companyTerms',
      'Privacy': 'companyPrivacy',
      'Blog': 'blog',
      'HelpCenter': 'resourcesHelpCenter',
      'SuccessStories': 'resourcesSuccessStories'
    };
    
    content = content.replace(/(<div className="min-h-screen[^>]*>)/, `$1\n      <SeoHead {...useSeoConfig('${seoKeyMap[pageName]}')} />`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

const arPath = path.join(__dirname, '../client/src/locales/ar.json');
const enPath = path.join(__dirname, '../client/src/locales/en.json');

const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

Object.assign(arData, allKeysAr);
Object.assign(enData, allKeysEn);

fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');

console.log("Extraction Phase 2 completed!");
