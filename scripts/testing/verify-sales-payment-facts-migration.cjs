const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
  const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
  if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
  const database=`sari_payment_migration_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`);
  const out='docs/audits/sales-brain-implementation-2026-09-23/payment-attribution';fs.mkdirSync(out,{recursive:true});
  try{
    await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
    fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});
    const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
    if(journal.entries.at(-1).tag!=='0125_sales_payment_facts')throw Error('Unexpected migration');
    for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
    fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
    const logs=[],env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env'),DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`};
    const run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env,encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
    run(dir);await c.query(`USE ${database}`);
    const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('payment-migration','Synthetic','user')");
    const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic migration')",[u.insertId]);
    const [o]=await c.execute("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,payment_status) VALUES (?,'966500008321','Synthetic','[]',23000,'SAR','paid')",[m.insertId]);
    const [p]=await c.execute("INSERT INTO order_payments (merchant_id,order_id,customer_phone,amount,currency,status,tap_charge_id,captured_at) VALUES (?,?,'966500008321',23000,'SAR','captured','chg_migration_fixture',UTC_TIMESTAMP())",[m.insertId,o.insertId]);
    const [profile]=await c.execute("INSERT INTO customer_profiles (merchant_id,customer_phone,total_spent,verified_purchase_count) VALUES (?,'966500008321',230,1)",[m.insertId]);
    await c.execute("INSERT INTO ai_purchase_outcomes (merchant_id,profile_id,payment_id,outcome_type) VALUES (?,?,?,'purchase_completed')",[m.insertId,profile.insertId,p.insertId]);
    const preserved=['orders','order_payments','customer_profiles','ai_purchase_outcomes','ai_budget_policies','ai_price_cards','ai_sales_experiment_assignments','ai_sales_experiment_exposures'];
    const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
    const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async table=>[table,JSON.stringify(await read(table))])));
    const before=await snapshot();run(root);const after=await snapshot(),initiallyEmpty=(await read('ai_sales_payment_facts')).length===0;
    const sql="INSERT INTO ai_sales_payment_facts (merchant_id,payment_id,event_type,target_kind,target_id,customer_key,fact_digest,snapshot) VALUES (?,?,'captured','order',?,?,?,'{}')";
    const args=[m.insertId,p.insertId,o.insertId,'a'.repeat(64),'b'.repeat(64)];await c.execute(sql,args);
    const rejected=[];
    for(const [name,values] of [['payment',args],['target',[m.insertId,p.insertId+10000,o.insertId,'a'.repeat(64),'b'.repeat(64)]]]){
      try{await c.execute(sql,values);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;rejected.push(name);}
    }
    for(const [name,update] of [['missing-attribution',"attribution_state='attributed',next_at=NULL"],['attempt-limit','attempts=9']]){
      try{await c.execute(`UPDATE ai_sales_payment_facts SET ${update}`);}catch(e){if(e.code!=='ER_CHECK_CONSTRAINT_VIOLATED')throw e;rejected.push(name);}
    }
    preserved.push('ai_sales_payment_facts');const beforeRerun=await snapshot();run(root);
    // The SQL is itself safe to rerun, in addition to journal replay protection.
    const migration=fs.readFileSync(path.join(root,'drizzle/0125_sales_payment_facts.sql'),'utf8');await c.query(migration);
    const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations');
    const [[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
    const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater through 0124, historical captured payment/memory fixture, upgrade to 0125 and two idempotency checks; no historical facts invented.',
      migrations:Number(count.count),preservedTables:Object.keys(before).filter(t=>before[t]===after[t]),initiallyEmpty,rejectedConstraints:rejected,
      rerunUnchanged:JSON.stringify(beforeRerun)===JSON.stringify(await snapshot()),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),
      migrationSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'drizzle/0125_sales_payment_facts.sql'))).digest('hex')};
    report.passed=report.migrations===126&&report.preservedTables.length===Object.keys(before).length&&initiallyEmpty&&rejected.length===4&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
    fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/payment-facts-migration.log',logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration verification failed');
  }finally{await c.end();}
})().catch(e=>{console.error(e.code ? `${e.code}: ${e.sqlMessage || e.message}` : e.message);process.exitCode=1;});
