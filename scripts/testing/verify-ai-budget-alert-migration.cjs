const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the owned synthetic migration server');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.ok(['0135_ai_budget_alerts','0136_salla_sales_observations','0137_salla_order_projections'].includes(journal.entries.at(-1).tag));
  const dir=path.resolve('.tmp/budget-alert-migration-'+Date.now()),output=path.resolve(process.env.SARI_ALERT_MIGRATION_OUTPUT||'.tmp/budget-alert-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const prior=journal.entries.filter(e=>e.idx<135);
  for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),migration=fs.readFileSync('drizzle/0135_ai_budget_alerts.sql','utf8'),cases=[];
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve('.tmp/staff-migration-mysql/data').toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_alert_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM ai_budget_alerts');assert.equal(n.n,journal.entries.length);assert.equal(a.n,0);cases.push({mode,migrations:n.n,emptyHistory:true,passed:true});continue;}
      run(name,dir);
      await db.query("INSERT INTO ai_budget_periods(scope_key,period_start,policy_version,limit_micro_usd,spent_micro_usd,reserved_micro_usd) VALUES ('global',UTC_DATE(),'fixture',100000000,40000000,50000000)");
      const snapshot=async()=>JSON.stringify((await db.query("SELECT * FROM ai_budget_periods WHERE scope_key='global'"))[0]);
      const before=await snapshot();await db.query(migration);run(name);assert.equal(await snapshot(),before);
      const insert="INSERT INTO ai_budget_alerts(period_start,threshold_percent,limit_micro_usd,spent_micro_usd,reserved_micro_usd,observed_at) VALUES (UTC_DATE(),?,100000000,40000000,50000000,UTC_TIMESTAMP(3))";
      await db.execute(insert,[70]);await db.execute(insert,[90]);
      await assert.rejects(()=>db.execute(insert,[70]),e=>e.code==='ER_DUP_ENTRY');
      await assert.rejects(()=>db.execute(insert,[80]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      await assert.rejects(()=>db.query("INSERT INTO ai_budget_alerts VALUES (DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),70,0,0,0,UTC_TIMESTAMP(3))"),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      const history=JSON.stringify((await db.query('SELECT * FROM ai_budget_alerts ORDER BY threshold_percent'))[0]);
      run(name);await db.query(migration);assert.equal(JSON.stringify((await db.query('SELECT * FROM ai_budget_alerts ORDER BY threshold_percent'))[0]),history);assert.equal(await snapshot(),before);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[policy]]=await db.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");assert.equal(n.n,journal.entries.length);assert.equal(Number(policy.daily_limit_micro_usd),100000000);
      cases.push({mode:'0134-to-0135',migrations:n.n,budgetPreserved:true,unrecordedDdlReplay:true,duplicateThresholdRejected:true,invalidThresholdAndZeroLimitRejected:true,historyPreserved:true,globalDailyLimitUsd:100,passed:true});
    }
    const result={generatedAt:new Date().toISOString(),scope:'Synthetic owned MySQL only; no production',cases,passed:cases.every(c=>c.passed)};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
