const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
 if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
 const database=`sari_order_links_migration_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`);
 const out='docs/audits/sales-brain-implementation-2026-09-23/zid-link';fs.mkdirSync(out,{recursive:true});
 try{
  await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.at(-1).tag!=='0128_sales_order_projection_links')throw Error('Unexpected migration');
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const logs=[],env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env'),DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`};
  const run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env,encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  run(dir);await c.query(`USE ${database}`);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('order-link-migration','Synthetic','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic migration')",[u.insertId]);
  const [o]=await c.execute("INSERT INTO orders (merchantId,sallaOrderId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'zid:991','966500008324','Synthetic','[]',23000,'SAR')",[m.insertId]);
  await c.execute("INSERT INTO zid_orders (merchant_id,zid_order_id,sari_order_id,total_amount,items) VALUES (?,'991',?,230,'[]')",[m.insertId,o.insertId]);
  await c.execute("INSERT INTO ai_sales_order_facts (merchant_id,quotation_id,provider,order_key,fact_digest,snapshot) VALUES (?,1,'zid',?,?,'{}')",[m.insertId,'a'.repeat(64),'b'.repeat(64)]);
  const preserved=['orders','zid_orders','zid_order_notification_outbox','sales_quotations','ai_sales_order_facts','ai_sales_payment_facts','order_payments','ai_budget_policies'];
  const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
  const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async t=>[t,JSON.stringify(await read(t))])));
  const before=await snapshot();run(root);const after=await snapshot(),initiallyEmpty=(await read('ai_sales_order_links')).length===0;
  const sql="INSERT INTO ai_sales_order_links (merchant_id,order_fact_id,order_fact_digest,order_key,source_row_id,local_order_id,link_digest,snapshot) VALUES (?,? ,?,?,1,?,?,'{}')";
  const args=[m.insertId,1,'b'.repeat(64),'a'.repeat(64),o.insertId,'c'.repeat(64)];await c.execute(sql,args);const rejected=[];
  for(const [name,values]of [['fact',args],['order-key',[m.insertId,2,args[2],args[3],o.insertId+1,args[5]]],['local-target',[m.insertId,2,args[2],'d'.repeat(64),o.insertId,args[5]]]]){
   try{await c.execute(sql,values);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;rejected.push(name);}
  }
  preserved.push('ai_sales_order_links');const beforeRerun=await snapshot();run(root);
  const migration=fs.readFileSync(path.join(root,'drizzle/0128_sales_order_projection_links.sql'),'utf8');await c.query(migration);
  const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater 0127 to 0128 with legacy source and creation evidence preserved; no link backfill; updater and SQL replay.',
   migrations:Number(count.count),preservedTables:Object.keys(before).filter(t=>before[t]===after[t]),initiallyEmpty,rejectedConstraints:rejected,
   rerunUnchanged:JSON.stringify(beforeRerun)===JSON.stringify(await snapshot()),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),migrationSha256:crypto.createHash('sha256').update(migration).digest('hex')};
  report.passed=report.migrations===129&&report.preservedTables.length===8&&initiallyEmpty&&rejected.length===3&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
  fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/zid-link-migration.log',logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration verification failed');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code?`${e.code}: ${e.sqlMessage||e.message}`:e.message);process.exitCode=1;});
