import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadPreviewLocales } from './preview-locales.mjs';
const route=JSON.parse(readFileSync('docs/audits/tenant-features-2026-09-30/coverage.json','utf8')).routes.find(row=>row.route==='/merchant/conversations');
const sources=[...route.files,'client/src/components/merchant/WorkspaceState.tsx','client/src/components/QueryStateCard.tsx',...readdirSync('client/src/components/ui').filter(file=>file.endsWith('.tsx')).map(file=>'client/src/components/ui/'+file)];
const namespaces=new Set(['merchantUx','common']);for(const file of sources.filter(file=>!file.startsWith('client/src/components/ui/')))for(const match of readFileSync(file,'utf8').matchAll(/\bt\(['"]([a-zA-Z][\w]*)\./g))namespaces.add(match[1]);
const copy=await loadPreviewLocales([...namespaces]);
await build({entryPoints:['prototypes/tenant-dashboard/src/inbox-preview.tsx'],outfile:'prototypes/tenant-dashboard/site/inbox-preview.js',bundle:true,jsx:'automatic',format:'iife',platform:'browser',target:['es2022'],supported:{'template-literal':false},minify:true,legalComments:'none',
  alias:{'@/lib/trpc':path.resolve('prototypes/tenant-dashboard/src/inbox-preview-api.ts'),'@/lib/voice-recording':path.resolve('prototypes/tenant-dashboard/src/inbox-preview-voice.ts'),'react-i18next':path.resolve('prototypes/tenant-dashboard/src/inbox-preview-i18n.ts'),wouter:path.resolve('prototypes/tenant-dashboard/src/inbox-preview-router.tsx')},
  define:{INBOX_PREVIEW_COPY:JSON.stringify(copy),'process.env.NODE_ENV':'"production"'},metafile:true});
const require=createRequire(import.meta.url),tw=createRequire(require.resolve('@tailwindcss/vite')),{compile}=tw('@tailwindcss/node');
const compiler=await compile(readFileSync('client/src/index.css','utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);'),{base:path.resolve('client/src'),onDependency(){}});
const candidates=new Set();for(const file of [...sources,'prototypes/tenant-dashboard/src/inbox-preview.tsx'])for(const token of readFileSync(file,'utf8').match(/[^\s"'`<>]+/g)||[])candidates.add(token);
writeFileSync('prototypes/tenant-dashboard/site/inbox-preview.css',compiler.build([...candidates])+readFileSync('client/src/styles/merchant-workspace.css','utf8')+readFileSync('client/src/styles/merchant-mobile.css','utf8')+'\nbody.merchant-surface{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}');
writeFileSync("prototypes/tenant-dashboard/site/inbox-preview.css",readFileSync("prototypes/tenant-dashboard/site/inbox-preview.css","utf8")+readFileSync("prototypes/tenant-dashboard/src/inbox-preview.css","utf8"));
const audioBuild=await build({entryPoints:['prototypes/tenant-dashboard/src/inbox-preview-voice.ts'],bundle:true,platform:'node',format:'esm',write:false});const {silentWav}=await import('data:text/javascript;base64,'+Buffer.from(audioBuild.outputFiles[0].text).toString('base64'));
mkdirSync('prototypes/tenant-dashboard/site/uploads',{recursive:true});copyFileSync('client/public/favicon.png','prototypes/tenant-dashboard/site/uploads/inbox-preview.png');writeFileSync('prototypes/tenant-dashboard/site/uploads/inbox-preview.wav',silentWav());writeFileSync('prototypes/tenant-dashboard/site/uploads/inbox-preview.txt','Local sample attachment. No customer data.\nملف تجريبي محلي بلا بيانات عملاء.\n');
console.log('Actual inbox preview built; '+namespaces.size+' locale namespaces, synthetic recording only.');
