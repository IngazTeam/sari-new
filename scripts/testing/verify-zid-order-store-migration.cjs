const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
 if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
 const database=`sari_zid_store_migration_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`);
 const out='docs/audits/sales-brain-implementation-2026-09-23/zid-store';fs.mkdirSync(out,{recursive:true});
 try{
  await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.at(-1).tag!=='0127_zid_order_store_identity')throw Error('Unexpected migration');
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const logs=[],env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env'),DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`};
  const run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env,encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  run(dir);await c.query(`USE ${database}`);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('zid-store-migration','Synthetic','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic migration')",[u.insertId]);
  const [o]=await c.execute("INSERT INTO orders (merchantId,sallaOrderId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'zid:991','966500008323','Synthetic','[]',23000,'SAR')",[m.insertId]);
  await c.execute("INSERT INTO zid_orders (merchant_id,zid_order_id,sari_order_id,total_amount,items) VALUES (?,'991',?,230,'[]')",[m.insertId,o.insertId]);
  await c.execute("INSERT INTO zid_order_notification_outbox (merchant_id,zid_order_id,event_key) VALUES (?,'991',?)",[m.insertId,'a'.repeat(64)]);
  const preserved=['orders','zid_orders','zid_order_notification_outbox','sales_quotations','order_payments','ai_sales_order_facts','ai_budget_policies'];
  const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
  // Compare existing columns exactly; a new empty identity is tested separately.
  const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async t=>[t,JSON.stringify((await read(t)).map(({zid_store_id,...r})=>r))])));
  const before=await snapshot(),migration=fs.readFileSync(path.join(root,'drizzle/0127_zid_order_store_identity.sql'),'utf8');
  const statements=migration.split('--> statement-breakpoint').map(s=>s.trim()).filter(s=>s&&!s.startsWith('-- Historical'));
  // Interrupt after each additive DDL boundary; replay the prefix exactly as a
  // restarted updater does. Then finish using the actual production migrator.
  for(const prefix of [4,8,12])for(const statement of statements.slice(0,prefix))await c.query(statement);
  run(root);const after=await snapshot();
  const unknownHistory=(await read('zid_orders'))[0].zid_store_id===''&&(await read('zid_order_notification_outbox'))[0].zid_store_id==='';
  for(const store of ['11','22'])await c.execute("INSERT INTO zid_orders (merchant_id,zid_store_id,zid_order_id,total_amount,items) VALUES (?,?,'991',230,'[]')",[m.insertId,store]);
  let duplicateRejected=false;try{await c.execute("INSERT INTO zid_orders (merchant_id,zid_store_id,zid_order_id,total_amount,items) VALUES (?,'11','991',230,'[]')",[m.insertId]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;duplicateRejected=true;}
  const beforeRerun=await snapshot();run(root);for(const statement of statements)await c.query(statement);
  const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const [indexes]=await c.query("SELECT INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_orders' AND NON_UNIQUE=0 GROUP BY INDEX_NAME");
  const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater 0126 to 0127 with populated legacy orders/outbox; interrupted additive DDL replay, updater and complete SQL replay.',
   migrations:Number(count.count),preservedTables:Object.keys(before).filter(t=>before[t]===after[t]),unknownHistory,duplicateRejected,
   sourceRows:(await read('zid_orders')).length,uniqueIndexes:indexes,partialDdlPrefixes:[4,8,12],rerunUnchanged:JSON.stringify(beforeRerun)===JSON.stringify(await snapshot()),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),
   migrationSha256:crypto.createHash('sha256').update(migration).digest('hex')};
  report.passed=report.migrations===128&&report.preservedTables.length===7&&unknownHistory&&duplicateRejected&&report.sourceRows===3&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000'
    &&indexes.some(r=>r.INDEX_NAME==='zid_orders_merchant_store_order_unique'&&r.columns_list==='merchant_id,zid_store_id,zid_order_id')&&!indexes.some(r=>r.INDEX_NAME==='zid_orders_merchant_order_unique');
  fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/zid-store-migration.log',logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration verification failed');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code?`${e.code}: ${e.sqlMessage||e.message}`:e.message);process.exitCode=1;});
