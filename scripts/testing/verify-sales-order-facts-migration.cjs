const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
 if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
 const database=`sari_order_migration_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`);
 const out='docs/audits/sales-brain-implementation-2026-09-23/order-facts';fs.mkdirSync(out,{recursive:true});
 try{
  await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.at(-1).tag!=='0126_sales_order_facts')throw Error('Unexpected migration');
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const logs=[],env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env'),DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`};
  const run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env,encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  run(dir);await c.query(`USE ${database}`);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('order-migration','Synthetic','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic migration')",[u.insertId]);
  const [o]=await c.execute("INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'966500008322','Synthetic','[]',23000,'SAR')",[m.insertId]);
  const [q]=await c.execute("INSERT INTO sales_quotations (merchant_id,customer_phone,customer_name,quotation_number,items,subtotal,total,currency,status,order_id,source_message_id,consent_message_id,checkout_snapshot) VALUES (?,'966500008322','Synthetic','LEGACY-1','[]',230,230,'SAR','accepted',?,1,2,'{}')",[m.insertId,o.insertId]);
  const preserved=['orders','sales_quotations','zid_orders','order_payments','ai_sales_payment_facts','ai_budget_policies','ai_price_cards','ai_sales_experiment_assignments'];
  const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
  const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async t=>[t,JSON.stringify(await read(t))])));
  const before=await snapshot();run(root);const after=await snapshot(),initiallyEmpty=(await read('ai_sales_order_facts')).length===0;
  const sql="INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,local_order_id,order_key,customer_key,fact_digest,snapshot) VALUES (?,?,'local',?,?,?,?,'{}')";
  const args=[m.insertId,q.insertId,o.insertId,'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];await c.execute(sql,args);
  const rejected=[];
  for(const [name,values]of [['quote',[...args]],['identity',[m.insertId,q.insertId+1,o.insertId+1,...args.slice(3)]],['local-order',[m.insertId,q.insertId+1,o.insertId,'d'.repeat(64),...args.slice(4)]]]){
   try{await c.execute(sql,values);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;rejected.push(name);}
  }
  for(const [name,update]of [['missing-attribution',"attribution_state='attributed',next_at=NULL"],['attempt-limit','attempts=9']]){
   try{await c.execute(`UPDATE ai_sales_order_facts SET ${update}`);}catch(e){if(e.code!=='ER_CHECK_CONSTRAINT_VIOLATED')throw e;rejected.push(name);}
  }
  preserved.push('ai_sales_order_facts');const beforeRerun=await snapshot();run(root);
  const migration=fs.readFileSync(path.join(root,'drizzle/0126_sales_order_facts.sql'),'utf8');await c.query(migration);
  const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater 0125 to 0126; legacy accepted quote/order preserved; no backfill; updater and SQL replay.',
   migrations:Number(count.count),preservedTables:Object.keys(before).filter(t=>before[t]===after[t]),initiallyEmpty,rejectedConstraints:rejected,
   rerunUnchanged:JSON.stringify(beforeRerun)===JSON.stringify(await snapshot()),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),
   migrationSha256:crypto.createHash('sha256').update(migration).digest('hex')};
  report.passed=report.migrations===127&&report.preservedTables.length===8&&initiallyEmpty&&rejected.length===5&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
  fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/order-facts-migration.log',logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration verification failed');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code?`${e.code}: ${e.sqlMessage||e.message}`:e.message);process.exitCode=1;});
