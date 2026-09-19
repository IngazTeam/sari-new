import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { createInstance } from 'i18next';
import ar from '../client/src/locales/ar.json';
import merchantUx from '../client/src/locales/merchant-ux.ar';
import authUx from '../client/src/locales/auth-ux.ar';
import publicUx from '../client/src/locales/public-ux.ar';

const catalogue = { ...ar, merchantUx, authUx, publicUx };
const i18n = createInstance();
await i18n.init({ lng: 'ar', fallbackLng: 'ar', initAsync: false, showSupportNotice: false, resources: { ar: { translation: catalogue } } });
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.(tsx?|jsx?)$/.test(file) ? [file] : [];
  });
}
function lookup(key: string): unknown {
  return i18n.exists(key) ? i18n.t(key, { returnObjects: true }) : undefined;
}
let checked = 0;
const dynamic: Array<{ file: string; line: number; expression: string }> = [];
const missing: Array<{ file: string; line: number; key: string; defaultValue?: string }> = [];
const interpolationErrors: Array<{ file: string; line: number; key: string; missing: string[] }> = [];
let dynamicKeysChecked = 0;
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: check-translation-keys.ts [--root source-directory]');
for (const file of files(resolve(args[1] || 'client/src'))) {
  if (file.replaceAll('\\', '/').includes('/locales/')) continue;
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const fileName = relative(process.cwd(), file).replaceAll('\\', '/');
  const sourceText = source.text;
  function finiteKeys(node: ts.Expression): string[] | null {
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isConditionalExpression(node)) {
      const yes = finiteKeys(node.whenTrue), no = finiteKeys(node.whenFalse);
      return yes && no ? [...yes, ...no] : null;
    }
    const expression = node.getText(source);
    if (fileName.endsWith('/botTemplates.ts') && /^def\.(?:nameKey|descriptionKey|settings\.(?:welcomeMessageKey|outOfHoursMessageKey))$/.test(expression)) {
      return [...sourceText.matchAll(/(?:nameKey|descriptionKey|welcomeMessageKey|outOfHoursMessageKey):\s*'([^']+)'/g)].map(match => match[1]);
    }
    if (fileName.endsWith('/DiscountCodes.tsx') && /^tmpl\.(?:labelKey|descriptionKey)$/.test(expression)) {
      return [...sourceText.matchAll(/(?:labelKey|descriptionKey):\s*'([^']+)'/g)].map(match => match[1]);
    }
    if (fileName.endsWith('/phone-input.tsx') && expression === '`authUx.signup.${country.nameKey}`') {
      return [...sourceText.matchAll(/nameKey:\s*'([^']+)'/g)].map(match => `authUx.signup.${match[1]}`);
    }
    if (fileName.endsWith('/Orders.tsx') && expression === '`ordersPage.status${status[0].toUpperCase()}${status.slice(1)}`') {
      return ['Pending', 'Paid', 'Processing', 'Shipped', 'Delivered'].map(status => `ordersPage.status${status}`);
    }
    if (fileName.endsWith('/Support.tsx') && /^`publicUx\.support\.\$\{(?:question|answer)\}`$/.test(expression)) {
      return [...sourceText.matchAll(/'(faq[A-Za-z]+(?:Question|Answer))'/g)].map(match => `publicUx.support.${match[1]}`);
    }
    return null;
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === 't'
      || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't')) {
      const key = node.arguments[0];
      const keys = key ? finiteKeys(key) : null;
      if (keys?.length) {
        checked++;
        if (!ts.isStringLiteralLike(key)) dynamicKeysChecked += keys.length;
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        for (const text of keys) {
        const translated = lookup(text);
        if (translated === undefined) {
          const options = node.arguments[1];
          const fallback = options && ts.isObjectLiteralExpression(options)
            ? options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'defaultValue') : undefined;
          const value = fallback && ts.isPropertyAssignment(fallback) ? fallback.initializer : options;
          missing.push({ file: fileName, line, key: text,
            defaultValue: value && ts.isStringLiteralLike(value) ? value.text : undefined });
        } else if (typeof translated === 'string') {
          const required = [...new Set([...translated.matchAll(/\{\{\s*-?\s*([A-Za-z0-9_]+)(?:\s*[,}])/g)].map(match => match[1]))];
          const options = node.arguments.find((argument, index) => index > 0 && ts.isObjectLiteralExpression(argument));
          const literalTemplate = options && ts.isObjectLiteralExpression(options) && options.properties.some(property =>
            ts.isPropertyAssignment(property) && property.name.getText(source) === 'skipInterpolation' && property.initializer.kind === ts.SyntaxKind.TrueKeyword);
          if (!literalTemplate && required.length && (!options || ts.isObjectLiteralExpression(options) && !options.properties.some(ts.isSpreadAssignment))) {
            const supplied = options && ts.isObjectLiteralExpression(options) ? options.properties.flatMap(property => property.name ? [property.name.getText(source).replace(/^['"]|['"]$/g, '')] : []) : [];
            const absent = required.filter(name => !supplied.includes(name));
            if (absent.length) interpolationErrors.push({ file: fileName, line, key: text, missing: absent });
          }
        }
        }
      } else dynamic.push({ file: relative(process.cwd(), file).replaceAll('\\', '/'),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, expression: key?.getText(source) || '' });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log(JSON.stringify({ advertisedLocale: 'ar', callsChecked: checked, dynamicKeysChecked, unresolvedDynamicCalls: dynamic, missing, interpolationErrors }, null, 2));
if (missing.length || dynamic.length || interpolationErrors.length) process.exitCode = 1;
