const fs = require('fs');
const path = require('path');

const clientSrc = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src';
const pagesDir = path.join(clientSrc, 'pages');
const compDir = path.join(clientSrc, 'components');
const publicPages = ['Home.tsx', 'Pricing.tsx', 'ProductAI.tsx', 'ProductChatbot.tsx', 'ProductWhatsApp.tsx', 'ProductBroadcasts.tsx', 'SolutionsSales.tsx', 'SolutionsMarketing.tsx', 'SolutionsSupport.tsx', 'CompanyAbout.tsx'];

// Find all TSX files
function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      // Don't recurse into company/resources as they are public landing pages
      if (file === 'company' || file === 'resources' || file === 'ui') continue;
      results = results.concat(getFiles(filePath));
    } else if (file.endsWith('.tsx') && !publicPages.includes(file)) {
      results.push(filePath);
    }
  }
  return results;
}

const allFiles = [...getFiles(pagesDir), ...getFiles(compDir)];

let allKeysAr = {};
let allKeysEn = {};
const arabicRegex = /[\u0600-\u06FF]/;

for (const filePath of allFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!arabicRegex.test(content)) continue; // skip if no arabic
  
  const pageName = path.basename(filePath, '.tsx');
  const pageKeyPrefix = pageName.charAt(0).toLowerCase() + pageName.slice(1);
  
  if (!allKeysAr[pageKeyPrefix]) {
      allKeysAr[pageKeyPrefix] = {};
      allKeysEn[pageKeyPrefix] = {};
  }

  let counter = 0;
  let modified = false;

  // 1. Text between tags >Arabic Text<
  content = content.replace(/>([^<]*[\u0600-\u06FF][^<]*)</g, (match, p1) => {
    const text = p1.trim();
    if (!text || match.includes('{') || match.includes('}')) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text; // Just fallback to Arabic for now
    modified = true;
    return match.replace(p1, `{t('${pageKeyPrefix}.${keyName}')}`);
  });

  // 2. Attributes like placeholder="Text"
  const attrs = ['placeholder', 'title', 'label', 'description'];
  for (const attr of attrs) {
    const regex = new RegExp(`${attr}="([^"]*[\\u0600-\\u06FF][^"]*)"`, 'g');
    content = content.replace(regex, (match, p1) => {
      const text = p1.trim();
      if (!text || match.includes('{') || match.includes('}')) return match;
      const keyName = `auto_${counter++}`;
      allKeysAr[pageKeyPrefix][keyName] = text;
      allKeysEn[pageKeyPrefix][keyName] = text;
      modified = true;
      return `${attr}={t('${pageKeyPrefix}.${keyName}')}`;
    });
    
    // Single quotes
    const regexSq = new RegExp(`${attr}='([^']*[\\u0600-\\u06FF][^']*)'`, 'g');
    content = content.replace(regexSq, (match, p1) => {
      const text = p1.trim();
      if (!text || match.includes('{') || match.includes('}')) return match;
      const keyName = `auto_${counter++}`;
      allKeysAr[pageKeyPrefix][keyName] = text;
      allKeysEn[pageKeyPrefix][keyName] = text;
      modified = true;
      return `${attr}={t('${pageKeyPrefix}.${keyName}')}`;
    });
  }
  
  // 3. String literals returning Arabic in JSX curly braces (e.g. {'Arabic'})
  content = content.replace(/\{'([^']*[\\u0600-\\u06FF][^']*)'\}/g, (match, p1) => {
    const text = p1.trim();
    if (!text) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text;
    modified = true;
    return `{t('${pageKeyPrefix}.${keyName}')}`;
  });
  
  content = content.replace(/\{"([^"]*[\\u0600-\\u06FF][^"]*)"\}/g, (match, p1) => {
    const text = p1.trim();
    if (!text) return match;
    const keyName = `auto_${counter++}`;
    allKeysAr[pageKeyPrefix][keyName] = text;
    allKeysEn[pageKeyPrefix][keyName] = text;
    modified = true;
    return `{t('${pageKeyPrefix}.${keyName}')}`;
  });

  if (modified) {
    // Add import
    if (!content.includes('useTranslation')) {
      content = content.replace(/(import .*?;)\n(?=export|const|function|let)/s, "$1\nimport { useTranslation } from 'react-i18next';\n");
    }
    
    // Attempt to inject t hook into the main component
    if (!content.includes('const { t } = useTranslation()') && !content.includes('const { t }')) {
        // Find default export function or first exported component
        const compRegex = /(export default function [^(]*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{|export function [^(]*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{|const [A-Z][a-zA-Z0-9_]*\s*=\s*(?:<[^>]*>\s*)?\([^)]*\)(?:\s*:\s*[^{]+)?\s*=>\s*\{|function [A-Z][a-zA-Z0-9_]*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{)/;
        content = content.replace(compRegex, match => match + "\n  const { t } = useTranslation();");
    }

    fs.writeFileSync(filePath, content, 'utf8');
  }
}

const arPath = path.join(__dirname, '../client/src/locales/ar.json');
const enPath = path.join(__dirname, '../client/src/locales/en.json');

const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

Object.assign(arData, allKeysAr);
Object.assign(enData, allKeysEn);

fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');

console.log("Dashboard Extraction completed!");
