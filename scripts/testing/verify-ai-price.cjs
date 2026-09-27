const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),output=path.resolve('.tmp/price-verification'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(output,{recursive:true});
const units=['server/ai-settings-budget-access.test.ts','server/ai/budget-boundaries.test.ts','server/ai/budget-settlement-pentest.test.ts','server/ai/deployment-preflight.test.ts',
  'server/ai-settings-provider-routing.test.ts','server/ai-settings-singleton-pentest.test.ts','server/ai-settings-secrets-pentest.test.ts','server/ai/zahypi-client.test.ts',
  'server/ai/zahypi-runtime-config.test.ts','server/ai/openai-zahypi.test.ts','server/_core/llm-zahypi.test.ts','server/ops-load-restore-pentest.test.ts',
  'server/runtime-schema-pentest.test.ts','server/deployment-release-pentest.test.ts','server/db/connection.test.ts','server/dependency-contracts.test.ts'];
const database=['server/aiBudgetLedger.mysql.test.ts','server/ai/price-admin.mysql.test.ts','server/ai/budget-settlement.mysql.test.ts','server/ai/ordinary-reply-usage.mysql.test.ts'];
function manifest(){
  const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
  return Object.fromEntries([...new Set(files)].filter(p=>/^(server|client|shared|scripts|drizzle)\//.test(p)||/^[^/]+\.(json|yaml|ts|mjs|cjs)$/.test(p)).sort().filter(p=>fs.existsSync(p)&&fs.statSync(p).isFile()).map(p=>[p,sha(fs.readFileSync(p))]));
}
const inherited=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
const env={...inherited,PATH:path.dirname(process.execPath)+path.delimiter+inherited.PATH,SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),
  NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`};
function run(name,args,overrides={}){const log=path.join(output,name+'.log'),fd=fs.openSync(log,'w');let r;
  try{r=cp.spawnSync(process.execPath,args,{env:{...env,...overrides},stdio:['ignore',fd,fd],windowsHide:true});}finally{fs.closeSync(fd);}
  console.log(name+': '+r.status);if(r.error||r.status!==0)throw Error(`${name} failed; see ${path.relative(root,log)}`);
  return {name,exitCode:r.status,logSha256:sha(fs.readFileSync(log))};
}
try{
  const url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use a loopback disposable database');
  env.DATABASE_URL=url.toString();
  const before=manifest(),startedAt=new Date().toISOString(),baseCommit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks=[];
  checks.push(run('migration',['scripts/testing/verify-ai-price-migration.cjs'],{SARI_TEST_DATABASE_URL:process.env.SARI_STAFF_MIGRATION_DATABASE_URL,SARI_PRICE_MIGRATION_OUTPUT:path.join(output,'migration.json')}));
  checks.push(run('prior-migrations',['scripts/testing/verify-staff-team-review-migration.cjs'],{SARI_TEST_DATABASE_URL:process.env.SARI_STAFF_MIGRATION_DATABASE_URL,SARI_STAFF_MIGRATION_OUTPUT:path.join(output,'prior-migrations.json')}));
  for(const [name,files]of [['unit-security',units],['database',database]])checks.push(run(name,['scripts/testing/run-isolated.mjs',...(name==='database'?['--with-database','--no-file-parallelism']:[]),...files,'--reporter=default','--reporter=json',`--outputFile.json=${path.join(output,name+'.json')}`],{SARI_TEST_DATABASE_URL:url.toString()}));
  checks.push(run('types',['node_modules/typescript/bin/tsc','--noEmit']));
  checks.push(run('translations',['--import','tsx','scripts/check-translation-keys.ts']));
  checks.push(run('schema',['node_modules/drizzle-kit/bin.cjs','check']));
  checks.push(run('deployment',['--test','scripts/zid-order-release.test.mjs','scripts/sary-update-ops.test.mjs']));
  checks.push(run('build',[process.env.SARI_TEST_PNPM_CLI||'.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs','run','build']));
  const uiOutput=path.join(output,'ui');checks.push(run('browser',['scripts/testing/verify-ai-price-ui.cjs'],{SARI_PRICE_UI_OUTPUT:uiOutput}));
  if(JSON.stringify(before)!==JSON.stringify(manifest()))throw Error('Source changed during verification');
  const suites=['unit-security','database'].map(name=>{const bytes=fs.readFileSync(path.join(output,name+'.json')),r=JSON.parse(bytes);
    if(!r.success||r.numFailedTests||r.numPendingTests||r.numTodoTests)throw Error('Incomplete test report '+name);
    const tested=r.testResults.map(f=>path.relative(root,f.name).replaceAll('\\','/')).sort();
    if(JSON.stringify(tested)!==JSON.stringify([...(name==='database'?database:units)].sort()))throw Error('Unexpected test selection '+name);
    return {name,passed:r.numPassedTests,failed:r.numFailedTests,skipped:r.numPendingTests,reportSha256:sha(bytes),tests:r.testResults.flatMap(f=>f.assertionResults.map(t=>({file:path.relative(root,f.name).replaceAll('\\','/'),name:t.fullName,status:t.status})))};});
  const browser=JSON.parse(fs.readFileSync(path.join(uiOutput,'results.json')));
  if(browser.errors.length||!browser.results.length||browser.results.some(r=>r.passed!==true))throw Error('Incomplete browser report');
  const migrations=['migration','prior-migrations'].map(name=>JSON.parse(fs.readFileSync(path.join(output,name+'.json'))));
  if(migrations.some(r=>!r.passed||r.cases.some(c=>!c.passed)))throw Error('Incomplete migration report');
  const report={version:'ai-price-revision-verification.v1',startedAt,finishedAt:new Date().toISOString(),baseCommit,scope:'Price revision integrity and affected regressions; not full project or live release acceptance.',sourceStableBeforeAndAfter:true,sourceSha256:before,checks,suites,totalTests:suites.reduce((n,s)=>n+s.passed,0),migrations,browser,
    browserArtifacts:Object.fromEntries(fs.readdirSync(uiOutput).map(file=>[file,sha(fs.readFileSync(path.join(uiOutput,file)))])),productionAccess:false,externalNetworkBlocked:true};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({tests:report.totalTests,browserScenarios:browser.results.length,checks:checks.length}));
}catch(e){console.error(e.message);process.exitCode=1;}
