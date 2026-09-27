import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const imports = Object.fromEntries([...app.matchAll(/const (\w+) = lazyLoad\(\(\) => import\("(.*?)"\)\)/g)].map(m => [m[1], `client/src/${m[2].replace(/^\.\//, '')}.tsx`]));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('prototypes/tenant-dashboard/site/features.js', 'utf8'), context);
const features = context.window.FEATURES;
const locale = JSON.parse(fs.readFileSync('client/src/locales/ar.json', 'utf8'));
const translate = key => key.split('.').reduce((obj, k) => obj?.[k], locale);
const routes = [];
const syntax = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function visit(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (opening.tagName.getText(syntax) === 'Route') {
      const attr = opening.attributes.properties.find(p => p.name?.getText(syntax) === 'path');
      const route = attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : null;
      if (route?.startsWith('/merchant')) {
        const body = node.getText(syntax);
        const redirect = body.match(/<Redirect\s+to="([^"]+)"/)?.[1];
        const name = body.match(/component=\{(\w+)\}/)?.[1] || [...body.matchAll(/<(\w+)[\s/>]/g)].map(m=>m[1]).find(n=>imports[n]);
        const file = imports[name];
        const source = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        const feature = features.find(f=>f.routes.includes(route)) || features.find(f=>f.file === file);
        const labels = [...new Set([...source.matchAll(/<(?:Label|label|TableHead|CardTitle)[\s>][\s\S]*?<\/(?:Label|label|TableHead|CardTitle)>/g)].flatMap(m => [...m[0].matchAll(/t\(['"]([^'"]+)['"]/g)].map(k=>translate(k[1]))).filter(s=>typeof s === 'string' && s.length < 95))];
        const queries = [...new Set([...source.matchAll(/trpc\.([\w.]+)\.useQuery/g)].map(m=>m[1]))];
        const mutations = [...new Set([...source.matchAll(/trpc\.([\w.]+)\.useMutation/g)].map(m=>m[1]))];
        const legacy = [...new Set(source.match(/(?:dark:|hover:)?(?:bg-gradient-to-\w+|from-(?:blue|purple|violet|indigo|pink|slate)-[\w/]+|via-[\w/-]+|to-(?:blue|purple|violet|indigo|pink|slate)-[\w/]+|shadow-2xl)/g) || [])];
        routes.push({ route, title: feature?.title || name || 'مدخل لوحة التاجر', group: feature?.group || 'settings', component: name, file, redirect, layout: body.includes('<DashboardLayout') ? 'workspace' : 'standalone', labels, queries, mutations, legacy, hasErrorHandling: /isError|\.error|error:|ErrorState|WorkspaceState/.test(source), note: feature?.note || 'مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.' });
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
const output = { generatedAt: new Date().toISOString(), routeCount: routes.length, pageFiles: new Set(routes.map(r=>r.file).filter(Boolean)).size, routes };
fs.mkdirSync('docs/audits/tenant-pages-2026-09-27', { recursive: true });
fs.writeFileSync('docs/audits/tenant-pages-2026-09-27/inventory.json', JSON.stringify(output, null, 2)+'\n');
console.log(JSON.stringify({ routes: output.routeCount, files: output.pageFiles, legacyFiles: new Set(routes.filter(r=>r.legacy.length).map(r=>r.file)).size }));
for (const r of routes.filter(r=>!r.redirect)) console.log(`${r.route} | ${r.title} | ${r.layout} | ${r.legacy.length ? 'legacy' : 'tokens'} | ${r.labels.slice(0, 7).join('، ')}`);
