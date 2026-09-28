import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const inventory = JSON.parse(fs.readFileSync('docs/audits/tenant-pages-2026-09-27/inventory.json', 'utf8'));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('prototypes/tenant-dashboard/site/page-designs.js', 'utf8'), context);
const specs = {};
for (const row of context.window.PAGE_DESIGN_ROWS.split('\n')) {
  const [routes, kind, action, labels, sample] = row.split('|');
  for (const route of routes.split(',')) specs[`/merchant/${route}`] = { kind, action, labels: labels.split('،'), sample };
}
const current = ts.createSourceFile('App.tsx', fs.readFileSync('client/src/App.tsx','utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const redirects = new Map();
function walk(n) {
  if(ts.isJsxElement(n) && n.openingElement.tagName.getText(current)==='Route') {
    const path=n.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(current)==='path')?.initializer;
    const redirect=n.children.find(c=>ts.isJsxSelfClosingElement(c)&&c.tagName.getText(current)==='Redirect');
    const to=redirect?.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(current)==='to')?.initializer;
    if(path&&to&&ts.isStringLiteral(path)&&ts.isStringLiteral(to))redirects.set(path.text,to.text);
  }
  ts.forEachChild(n,walk);
}
walk(current);
const pages = inventory.routes.map(original => {
  const item={...original,redirect:redirects.get(original.route)};
  const spec = specs[item.route] || specs[item.redirect];
  if (!spec) throw Error(`Missing page design: ${item.route}`);
  return { route: item.route, title: item.route === '/merchant/tools' ? 'جميع الأدوات' : item.route === '/merchant/sari-brain' ? 'عقل ساري' : item.title, group: item.group, file: item.file, redirect: item.redirect, note: item.note, ...spec };
});
const states = ['missing', 'error', 'offline', 'forbidden', 'session', 'loading', 'empty'];
for (const state of states) pages.push({ route: `/merchant/preview-state/${state}`, title: { missing: 'صفحة غير موجودة', error: 'تعذّر تحميل الصفحة', offline: 'انقطاع الاتصال', forbidden: 'صلاحية غير كافية', session: 'تسجيل الدخول', loading: 'تحميل البيانات', empty: 'بداية جديدة' }[state], group: 'overview', kind: 'state', state, action: 'إعادة المحاولة', labels: [], sample: '', note: 'حالة واضحة، سبب مختصر، وإجراء متابعة.' });
fs.writeFileSync('prototypes/tenant-dashboard/site/page-catalog.js', `window.TENANT_PAGES = ${JSON.stringify(pages, null, 2)};\n`);
console.log(JSON.stringify({ routeDesigns: inventory.routeCount, stateDesigns: states.length, layouts: [...new Set(pages.map(p=>p.kind))].length }));
