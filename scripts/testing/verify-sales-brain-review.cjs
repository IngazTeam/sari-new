// Full local review of implemented sales-brain stages. Checkpoints survive an interrupted terminal,
// but are reusable only for the identical source manifest, command, database and output hashes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),output=path.resolve(process.env.SALES_BRAIN_REVIEW_OUTPUT||'.tmp/sales-brain-review'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(output,{recursive:true});
const sourceFiles=()=>cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(p=>/^(server|client|shared|scripts|drizzle)\//.test(p)||/^[^/]+\.(json|yaml|ts|mjs|cjs)$/.test(p));
const manifest=()=>Object.fromEntries([...new Set(sourceFiles())].filter(p=>fs.existsSync(p)&&fs.statSync(p).isFile()).sort().map(p=>[p,sha(fs.readFileSync(p))]));
const baseEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
baseEnv.PATH=path.dirname(process.execPath)+path.delimiter+baseEnv.PATH;
Object.assign(baseEnv,{SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
function filesInArray(source,name){const start=source.indexOf(`const ${name} = [`),end=source.indexOf('\n];',start);assert.ok(start>=0&&end>start);return [...new Set([...source.slice(start,end).matchAll(/'([^']+\.test\.ts)'/g)].map(m=>m[1]))];}
const runner=fs.readFileSync('scripts/testing/run-sales-brain.mjs','utf8'),pkg=JSON.parse(fs.readFileSync('package.json'));
const regression=[...new Set(['test:remediation','pretest:release','test:zahypi'].flatMap(key=>pkg.scripts[key].split(/\s+/).filter(p=>p.endsWith('.test.ts'))).concat([
  'server/central-interactions.test.ts','server/central-landing.test.ts','server/merchant-semantic-i18n-pentest.test.ts','server/customer-profile-canonical-pentest.test.ts','server/sales-conversion-pentest.test.ts','server/tap-payment-idempotency-pentest.test.ts','server/tap-payment-ownership-pentest.test.ts','server/coaching-bugfix-pentest.test.ts','server/context-intelligence-pentest.test.ts']))];
const security=[...new Set(sourceFiles().filter(p=>p.startsWith('server/')&&p.endsWith('-pentest.test.ts')).concat(['server/core-team-access.test.ts','server/merchant-access.test.ts','server/products-access.test.ts','server/ai-settings-budget-access.test.ts','server/security/download-media.test.ts','server/whatsapp-delivery-safety.test.ts','server/ai/budget-boundaries.test.ts','server/messaging/ingress.test.ts','server/integrations/zahypi-connector/routes.test.ts','server/ai/task-validation.test.ts']))].sort();
const groups={security,unit:filesInArray(runner,'units'),regression,'legacy-sales':['server/sales-hardening-pentest.test.ts','server/sales-engine-pentest.test.ts','server/conversation-order-payment-link-pentest.test.ts'],budget:['server/aiBudgetLedger.mysql.test.ts'],database:filesInArray(runner,'database')};
try{
  const url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use an owned loopback review test database');
  Object.assign(baseEnv,{DATABASE_URL:url.toString(),SARI_TEST_DATABASE_URL:url.toString()});
  const before=manifest(),sourceDigest=sha(JSON.stringify(before)),baseCommit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
  const checkpointsFile=path.join(output,'checkpoints.json');
  let checkpoints=fs.existsSync(checkpointsFile)?JSON.parse(fs.readFileSync(checkpointsFile)):{};
  const persist=()=>fs.writeFileSync(checkpointsFile,JSON.stringify(checkpoints,null,2)+'\n');
  const checks=[];
  const expandArtifacts=p=>fs.statSync(p).isDirectory()?fs.readdirSync(p).flatMap(n=>expandArtifacts(path.join(p,n))):[p];
  const artifactHashes=paths=>Object.fromEntries(paths.flatMap(expandArtifacts).sort().map(p=>[path.relative(output,p).replaceAll('\\','/'),sha(fs.readFileSync(p))]));
  function run(name,args,extra={},artifacts=[]){
    assert.deepEqual(manifest(),before,'Source changed during verification');
    const key=sha(JSON.stringify({sourceDigest,runtime:process.version,args,url:url.toString(),extra})),prior=checkpoints[name];
    if(prior?.key===key&&artifacts.every(p=>fs.existsSync(p))&&JSON.stringify(prior.artifacts)===JSON.stringify(artifactHashes(artifacts))&&fs.existsSync(path.join(output,name+'.log'))&&sha(fs.readFileSync(path.join(output,name+'.log')))===prior.logSha256){checks.push({...prior,name,reused:true});console.log(name+': verified checkpoint');return;}
    const log=path.join(output,name+'.log'),fd=fs.openSync(log,'w'),startedAt=new Date().toISOString();let r;
    console.log(name+': running');
    try{r=cp.spawnSync(process.execPath,args,{env:{...baseEnv,...extra},stdio:['ignore',fd,fd],windowsHide:true});}finally{fs.closeSync(fd);}
    assert.deepEqual(manifest(),before,'Source changed during verification');
    if(r.error||r.status!==0)throw Error(name+' failed; see '+path.relative(root,log));
    const entry={key,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,logSha256:sha(fs.readFileSync(log)),artifacts:artifactHashes(artifacts)};
    checkpoints[name]=entry;persist();checks.push({...entry,name,reused:false});console.log(name+': passed');
  }
  for(const [name,files] of Object.entries(groups))run(name,['scripts/testing/run-isolated.mjs',...(['database','budget'].includes(name)?['--with-database','--no-file-parallelism']:[]),...files,'--reporter=default','--reporter=json',`--outputFile.json=${path.join(output,name+'.json')}`],{},[path.join(output,name+'.json')]);
  run('types',['node_modules/typescript/bin/tsc','--noEmit']);
  run('translations',['--import','tsx','scripts/check-translation-keys.ts']);
  run('schema',['node_modules/drizzle-kit/bin.cjs','check']);
  run('tooling',['--test',...pkg.scripts['test:tooling'].split(/\s+/).filter(p=>p.endsWith('.test.mjs')),'scripts/zid-order-release.test.mjs']);
  run('build',[process.env.SARI_TEST_PNPM_CLI||'.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs','run','build'],{},[path.resolve('dist')]);
  run('migration',['scripts/testing/verify-ai-price-migration.cjs'],{SARI_PRICE_MIGRATION_OUTPUT:path.join(output,'migration.json')},[path.join(output,'migration.json')]);
  run('prior-migrations',['scripts/testing/verify-staff-team-review-migration.cjs'],{SARI_STAFF_MIGRATION_OUTPUT:path.join(output,'prior-migrations.json')},[path.join(output,'prior-migrations.json')]);
  const browserSpecs=[['brain','scripts/testing/verify-sales-brain-ui.cjs','SALES_BRAIN_UI_OUTPUT'],['prices','scripts/testing/verify-ai-price-ui.cjs','SARI_PRICE_UI_OUTPUT'],
    ['readout','scripts/testing/verify-sales-experiment-readout-ui.cjs','SALES_READOUT_UI_OUTPUT'],['orders','scripts/testing/verify-sales-order-report-ui.cjs','SALES_ORDER_REPORT_UI_OUTPUT'],
    ['staff-text','scripts/testing/verify-staff-dashboard-ui.cjs','STAFF_DASHBOARD_UI_OUTPUT'],['staff-voice','scripts/testing/verify-staff-voice-ui.cjs','STAFF_VOICE_UI_OUTPUT'],
    ['staff-review','scripts/testing/verify-staff-team-review-ui.cjs','STAFF_TEAM_REVIEW_UI_OUTPUT'],['staff-attempts','scripts/testing/verify-staff-attempt-review-ui.cjs','STAFF_ATTEMPT_REVIEW_UI_OUTPUT']];
  const browsers=[];
  for(const [name,script,variable]of browserSpecs){const dir=path.join(output,'ui',name);run('ui-'+name,[script],{[variable]:dir},[dir]);const report=JSON.parse(fs.readFileSync(path.join(dir,'results.json')));assert.equal(report.errors.length,0);assert.ok(report.results.length&&report.results.every(r=>r.passed));browsers.push({name,...report});}
  const suites=Object.entries(groups).map(([name,files])=>{const r=JSON.parse(fs.readFileSync(path.join(output,name+'.json')));assert.equal(r.success,true);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert.equal(r.numTodoTests,0);
    assert.deepEqual(r.testResults.map(f=>path.relative(root,f.name).replaceAll('\\','/')).sort(),[...files].sort());
    return {name,passed:r.numPassedTests,skipped:r.numPendingTests,tests:r.testResults.flatMap(f=>f.assertionResults.map(t=>({file:path.relative(root,f.name).replaceAll('\\','/'),name:t.fullName,status:t.status})))};});
  const matrix=JSON.parse(fs.readFileSync('docs/audits/sales-brain-implementation-2026-09-23/acceptance-matrix.json'));assert.equal(matrix.records.length,71);
  const plan=fs.readFileSync('docs/SARI_SALES_BRAIN_10_OF_10_PLAN_2026-09-23.md','utf8'),items=[...plan.matchAll(/^- \[([ x])\] \*\*(B\d{3}) —/gm)];assert.equal(items.length,71);
  for(const item of items){const r=matrix.records.find(r=>r.id===item[2]);assert.ok(r);assert.equal(item[1]==='x',r.status==='complete');for(const ref of r.verification)assert.ok(fs.existsSync(ref)||fs.existsSync(path.join('docs/audits/sales-brain-implementation-2026-09-23',ref)),'Missing evidence '+ref);}
  const translations=JSON.parse(fs.readFileSync(path.join(output,'translations.log')));assert.deepEqual(translations.missing,[]);assert.deepEqual(translations.unresolvedDynamicCalls,[]);assert.deepEqual(translations.interpolationErrors,[]);
  const migrations=['migration','prior-migrations'].map(name=>JSON.parse(fs.readFileSync(path.join(output,name+'.json'))));assert.ok(migrations.every(r=>r.passed&&r.cases.every(c=>c.passed)));
  assert.deepEqual(manifest(),before);
  const uniqueTests=new Set(suites.flatMap(s=>s.tests.map(t=>t.file+'\0'+t.name)));
  const report={version:'sales-brain-all-stages-review.v1',verifiedAt:new Date().toISOString(),baseCommit,sourceSha256:before,sourceStableBeforeAndAfter:true,
    scope:'All selected implemented-stage, regression and security suites and eight UI groups. Local fixtures only; not live provider acceptance or a 10/10 business score.',checks,suites,totalExecutions:suites.reduce((n,s)=>n+s.passed,0),uniqueTests:uniqueTests.size,
    browsers,browserScenarios:browsers.reduce((n,b)=>n+b.results.length,0),translations,migrations,migrationCount:journal.entries.length,planItems:matrix.records.map(r=>({id:r.id,title:r.title,status:r.status,remaining:r.remaining})),productionAccess:false,externalNetworkBlocked:true};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({tests:report.totalExecutions,uniqueTests:report.uniqueTests,browserScenarios:report.browserScenarios}));
}catch(e){console.error(e.message);process.exitCode=1;}
