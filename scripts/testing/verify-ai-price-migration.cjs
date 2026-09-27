const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the owned synthetic migration server');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.ok(['0134_ai_price_revisions','0135_ai_budget_alerts','0136_salla_sales_observations','0137_salla_order_projections','0138_salla_order_creations'].includes(journal.entries.at(-1).tag));
  const dir=path.resolve('.tmp/price-migration-'+Date.now()),output=path.resolve(process.env.SARI_PRICE_MIGRATION_OUTPUT||'.tmp/price-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const prior=journal.entries.filter(e=>e.idx<134);
  for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),migration=fs.readFileSync('drizzle/0134_ai_price_revisions.sql','utf8'),cases=[];
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');
    assert.equal(Number(identity.port),33089);assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve('.tmp/staff-migration-mysql/data').toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_price_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[r]]=await db.query('SELECT COUNT(*) AS n FROM ai_price_card_revisions');assert.equal(n.n,journal.entries.length);assert.equal(r.n,0);cases.push({mode,migrations:n.n,emptyAudit:true,passed:true});continue;}
      run(name,dir);
      await db.query("INSERT INTO ai_price_cards (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens) VALUES ('openai','synthetic','v0',1,2,3,100)");
      await db.query("INSERT INTO ai_budget_periods (scope_key,period_start,policy_version,limit_micro_usd,reserved_micro_usd) VALUES ('platform:synthetic',UTC_DATE(),'v0',100000000,100)");
      await db.query("INSERT INTO ai_usage_reservations (reservation_key,request_id,scope_key,period_start,fingerprint,provider,model,task_type,price_version,input_rate,output_rate,flat_micro_usd,reserved_micro_usd) VALUES (REPEAT('a',64),'fixture','platform:synthetic',UTC_DATE(),REPEAT('b',64),'openai','synthetic','fixture','v0',1,2,3,100)");
      const tables=['ai_budget_policies','ai_budget_periods','ai_price_cards','ai_usage_reservations','ai_sales_staff_reviews'];
      const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,JSON.stringify((await db.query(`SELECT * FROM ${table} ORDER BY 1`))[0])])));
      const before=await snapshot();await db.query(migration);run(name);assert.deepEqual(await snapshot(),before);
      const [[initial]]=await db.query('SELECT COUNT(*) AS n FROM ai_price_card_revisions');assert.equal(initial.n,0);
      // SQL structure fixtures only, intentionally not valid application snapshots.
      const insert="INSERT INTO ai_price_card_revisions (provider,model,version,origin,actor_id,reference,request_id,request_digest,snapshot,snapshot_digest) VALUES ('openai','synthetic',?,'admin',999999,'fixture-reference',?,REPEAT('c',64),'{}',REPEAT('d',64))";
      const uuid='00000000-0000-4000-8000-000000000001';await db.execute(insert,['v1',uuid]);
      await assert.rejects(()=>db.execute(insert,['v1','00000000-0000-4000-8000-000000000002']),e=>e.code==='ER_DUP_ENTRY');
      await assert.rejects(()=>db.execute(insert,['v2',uuid]),e=>e.code==='ER_DUP_ENTRY');
      await assert.rejects(()=>db.query("INSERT INTO ai_price_card_revisions (provider,model,version,origin,snapshot,snapshot_digest) VALUES ('openai','synthetic','invalid','admin','{}',REPEAT('e',64))"),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      const audit=JSON.stringify((await db.query('SELECT * FROM ai_price_card_revisions'))[0]);run(name);await db.query(migration);
      assert.equal(JSON.stringify((await db.query('SELECT * FROM ai_price_card_revisions'))[0]),audit);assert.deepEqual(await snapshot(),before);
      await db.query("DELETE FROM ai_price_cards WHERE model='synthetic'");assert.equal(JSON.stringify((await db.query('SELECT * FROM ai_price_card_revisions'))[0]),audit);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[budget]]=await db.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
      assert.equal(n.n,journal.entries.length);assert.equal(Number(budget.daily_limit_micro_usd),100000000);
      cases.push({mode:'0133-to-0134',migrations:n.n,preservedTables:tables,legacyDataUnchanged:true,unrecordedDdlReplay:true,duplicateRequestAndVersionRejected:true,invalidOriginRejected:true,auditSurvivesCardDeletion:true,globalDailyLimitUsd:100,passed:true});
    }
    const report={generatedAt:new Date().toISOString(),scope:'Synthetic owned MySQL only; fresh schema and additive upgrade, no production.',cases,passed:cases.every(c=>c.passed)};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
