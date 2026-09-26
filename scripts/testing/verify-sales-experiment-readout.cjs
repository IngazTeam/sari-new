const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const withUi=process.argv.includes('--with-ui');
const withStaffAcceptance=process.argv.includes('--staff-acceptance');
const root=process.cwd(),output=path.resolve(withStaffAcceptance?'.tmp/sales-staff-acceptance-verification':withUi?'.tmp/sales-experiment-readout-ui-verification':'.tmp/sales-experiment-readout-verification');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output,{recursive:true});
const unit=[
  'server/ai/sales-experiment-readout-staff-pentest.test.ts',
  'server/ai/sales-experiment-readout-outcomes-pentest.test.ts','server/sales-experiment-sample-pentest.test.ts',
  'server/ai/sales-experiment-readout-exposures-pentest.test.ts','server/ai/sales-experiment-exposure-pentest.test.ts',
  'server/ai/sales-experiment-readout-pentest.test.ts','server/sales-experiment-readout-access-pentest.test.ts',
  'server/ai/sales-experiment-protocol-pentest.test.ts','server/ai/sales-experiment-assignment-pentest.test.ts',
  'server/ai/sales-payment-fact-pentest.test.ts','server/ai/sales-payment-timeline-pentest.test.ts',
  'server/ai/sales-order-report-pentest.test.ts','server/sales-order-report-access-pentest.test.ts',
  'server/sales-order-settlement-access-pentest.test.ts','server/sales-payment-timeline-access-pentest.test.ts',
  'server/sales-payment-attribution-access-pentest.test.ts','server/sales-order-attribution-access-pentest.test.ts',
  'server/sales-reply-recovery-access-pentest.test.ts',
];
const database=[
  'server/ai/sales-experiment-generation.mysql.test.ts',
  'server/ai/sales-experiment-readout.mysql.test.ts','server/ai/sales-payment-attribution.mysql.test.ts',
  'server/ai/sales-experiment-assignment.mysql.test.ts','server/ai/sales-experiment-protocol.mysql.test.ts',
  'server/ai/sales-order-report.mysql.test.ts',
];
if(withUi)unit.push('server/sales-experiment-readout-ui-pentest.test.ts','server/sales-order-report-ui-pentest.test.ts','server/mobile-navigation-soft404-pentest.test.ts');
if(withStaffAcceptance){
  unit.push('server/ai/sales-staff-acceptance-pentest.test.ts','server/core-team-access.test.ts',
    'server/webhooks/greenapi-escalation.test.ts','server/ai/escalation-routing.test.ts','server/whatsapp-delivery-safety.test.ts');
  database.push('server/ai/escalation-relay.mysql.test.ts','server/ai/escalation-reconciliation.mysql.test.ts',
    'server/ai/conversation-handoff.mysql.test.ts','server/whatsappDeliverySafety.mysql.test.ts');
}
const extra=['server/ai/sales-experiment-readout-contract.ts','server/ai/sales-experiment-readout.ts','server/tests/helpers/sales-readout.ts',
  'server/ai/sales-experiment-readout-exposures.ts','shared/sales-experiment-exposure-readout.ts',
  'server/ai/sales-experiment-readout-outcomes.ts','shared/sales-experiment-outcome-readout.ts',
  'server/ai/sales-experiment-readout-staff.ts','shared/sales-experiment-staff-readout.ts',
  'scripts/testing/verify-sales-experiment-readout.cjs',...unit,...database];
if(withStaffAcceptance)extra.push('server/ai/sales-staff-acceptance-contract.ts','server/ai/sales-staff-acceptance.ts',
  'drizzle/0130_sales_staff_acceptances.sql','scripts/testing/verify-sales-staff-acceptance-migration.cjs');
if(withUi)extra.push('client/src/lib/sales-experiment-readout-view.ts','client/src/pages/admin/SalesExperimentEvidence.tsx',
  'scripts/testing/verify-sales-experiment-readout-ui.cjs','scripts/testing/fixtures/sales-experiment-readout-ui-entry.tsx','scripts/testing/fixtures/sales-experiment-readout-data.ts');
function manifest(){
  const tracked=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
  const paths=Array.from(new Set([...tracked.filter(p=>/^(server|client|shared|scripts|drizzle)\//.test(p)||/^[^/]+\.(json|yaml|ts|mjs|cjs)$/.test(p)),...extra])).sort();
  return Object.fromEntries(paths.filter(p=>fs.existsSync(p)&&fs.statSync(p).isFile()).map(p=>[p,sha(fs.readFileSync(p))]));
}
function run(name,args,env=process.env){
  const log=path.join(output,name+'.log'),fd=fs.openSync(log,'w');let result;
  try{result=cp.spawnSync(process.execPath,args,{env,stdio:['ignore',fd,fd],windowsHide:true});}finally{fs.closeSync(fd);}
  console.log(`${name}: ${result.status}`);
  if(result.error||result.status!==0)throw Error(`${name} failed; see ${path.relative(root,log)}`);
  return {name,exitCode:result.status,logSha256:sha(fs.readFileSync(log))};
}
try{
  const databaseUrl=new URL(process.env.SARI_TEST_DATABASE_URL || '');
  if(!['mysql:','mysql2:'].includes(databaseUrl.protocol)||!['127.0.0.1','localhost','[::1]'].includes(databaseUrl.hostname)
    ||!/^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(databaseUrl.pathname)||databaseUrl.search||databaseUrl.hash)
    throw Error('SARI_TEST_DATABASE_URL must identify a loopback disposable test database');
  for(const file of [...unit,...database])if(!fs.existsSync(file))throw Error('Missing test '+file);
  const before=manifest(),startedAt=new Date().toISOString(),baseCommit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const checks=[];
  let migrationReport;
  if(withStaffAcceptance){
    const migrationOutput=path.join(output,'migration.json');
    checks.push(run('staff-migration',['scripts/testing/verify-sales-staff-acceptance-migration.cjs'],{...process.env,
      SARI_TEST_DATABASE_URL:process.env.SARI_STAFF_MIGRATION_DATABASE_URL,SARI_STAFF_MIGRATION_OUTPUT:migrationOutput}));
    const bytes=fs.readFileSync(migrationOutput),report=JSON.parse(bytes);
    if(!report.passed||!report.cases.length||report.cases.some(c=>!c.passed))throw Error('Incomplete staff migration report');
    migrationReport={...report,reportSha256:sha(bytes)};
  }
  for(const [name,files]of [['unit-security',unit],['database',database]]){
    checks.push(run(name,['scripts/testing/run-isolated.mjs',...(name==='database'?['--with-database','--no-file-parallelism']:[]),...files,
      '--reporter=default','--reporter=json',`--outputFile.json=${path.join(output,name+'.json')}`]));
  }
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  env.PATH=path.dirname(process.execPath)+path.delimiter+env.PATH;
  Object.assign(env,{SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),
    DATABASE_URL:databaseUrl.toString(),
    NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  checks.push(run('types',['node_modules/typescript/bin/tsc','--noEmit'],env));
  checks.push(run('translations',['--import','tsx','scripts/check-translation-keys.ts'],env));
  checks.push(run('schema',['node_modules/drizzle-kit/bin.cjs','check'],env));
  const pnpm=process.env.SARI_TEST_PNPM_CLI || '.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs';
  if(!fs.existsSync(pnpm))throw Error('Set SARI_TEST_PNPM_CLI to the installed pnpm CLI path');
  checks.push(run('build',[pnpm,'run','build'],env));
  const browserReports=[];
  if(withUi){
    for(const [name,script,variable]of [['readout-ui','scripts/testing/verify-sales-experiment-readout-ui.cjs','SALES_READOUT_UI_OUTPUT'],
      ['order-report-ui','scripts/testing/verify-sales-order-report-ui.cjs','SALES_ORDER_REPORT_UI_OUTPUT']]){
      const destination=path.join(output,name);checks.push(run(name,[script],{...env,[variable]:destination}));
      const report=JSON.parse(fs.readFileSync(path.join(destination,'results.json')));
      if(report.errors.length||!report.results.length||report.results.some(r=>r.passed!==true))throw Error('Incomplete browser report '+name);
      browserReports.push({name,...report,artifacts:Object.fromEntries(fs.readdirSync(destination).map(file=>[file,sha(fs.readFileSync(path.join(destination,file)))]))});
    }
  }
  const after=manifest();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source changed during verification');
  const suites=['unit-security','database'].map(name=>{
    const bytes=fs.readFileSync(path.join(output,name+'.json')),r=JSON.parse(bytes);
    if(!r.success||r.numFailedTests||r.numPendingTests||r.numTodoTests)throw Error('Incomplete test report '+name);
    const tested=r.testResults.map(f=>path.relative(root,f.name).replaceAll('\\','/')).sort();
    if(JSON.stringify(tested)!==JSON.stringify([...(name==='database'?database:unit)].sort()))throw Error('Test file selection differs: '+name);
    return {name,passed:r.numPassedTests,failed:r.numFailedTests,skipped:r.numPendingTests,reportSha256:sha(bytes),
      tests:r.testResults.flatMap(f=>f.assertionResults.map(t=>({file:path.relative(root,f.name).replaceAll('\\','/'),name:t.fullName,status:t.status})))};
  });
  const result={version:'sales-experiment-readout-verification.v1',startedAt,finishedAt:new Date().toISOString(),baseCommit,
    scope:withStaffAcceptance?'staff_transport_acceptance_and_affected_regression_not_full_release_acceptance':'targeted_readout_and_affected_regression_not_full_release_acceptance',sourceStableBeforeAndAfter:true,sourceSha256:before,
    checks,suites,totalTests:suites.reduce((n,s)=>n+s.passed,0),browserReports,browserScenariosRun:browserReports.reduce((n,r)=>n+r.results.length,0),migrationReport,productionAccess:false,network:'external_network_blocked'};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({tests:result.totalTests,sourceFiles:Object.keys(before).length,checks:checks.length}));
}catch(error){console.error(error.message);process.exitCode=1;}
