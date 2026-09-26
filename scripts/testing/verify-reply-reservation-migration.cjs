const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
 if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
 const database=`sari_reply_reservation_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`),out='docs/audits/sales-brain-implementation-2026-09-23/reply-reservation';
 fs.mkdirSync(out,{recursive:true});
 try{
  await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});
  const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.at(-1).tag!=='0120_reply_reservations')throw Error('Unexpected migration');
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env')};
  const logs=[],run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`},encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  run(dir);await c.query(`USE ${database}`);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('reservation-migration','Synthetic migration','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic migration')",[u.insertId]);
  const [conv]=await c.execute("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000987','active')",[m.insertId]);
  for(const state of ['waiting_delivery','pending','processing','completed','suppressed','failed']){
   const [msg]=await c.execute("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','Historical fixture')",[conv.insertId]);
   await c.execute('INSERT INTO ai_interaction_jobs (merchant_id,conversation_id,incoming_message_id,reply_text,state) VALUES (?,?,?,?,?)',[m.insertId,conv.insertId,msg.insertId,'Historical answer',state]);
  }
  const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
  const before=await read('ai_interaction_jobs'),tables=['users','merchants','conversations','messages','ai_budget_policies','ai_price_cards','ai_sales_reply_deliveries'];
  const saved=Object.fromEntries(await Promise.all(tables.map(async t=>[t,JSON.stringify(await read(t))])));
  run(root);const after=await read('ai_interaction_jobs');
  const originalFields=Object.keys(before[0]);
  const legacyUnchanged=JSON.stringify(before)===JSON.stringify(after.map(row=>Object.fromEntries(originalFields.map(k=>[k,row[k]]))));
  const noAutomaticAuthority=after.every(r=>r.reply_origin==='legacy'&&r.reply_digest===null&&r.reply_plan===null&&r.sales_delivery_id===null&&r.outgoing_message_reference===null);
  const rejected=[];
  for(const [name,sql] of [
   ['unknown-origin',"reply_origin='other'"],['legacy-digest',"reply_digest=REPEAT('a',64)"],
   ['ordinary-missing-plan',"reply_origin='ordinary',reply_digest=REPEAT('a',64)"],
   ['reviewed-missing-delivery',"reply_origin='reviewed',reply_digest=REPEAT('a',64),state='reviewed_reserved'"],
   ['reviewed-learning',"reply_origin='reviewed',reply_digest=REPEAT('a',64),sales_delivery_id=1,state='pending'"],
   ['negative-projection',"reply_origin='reviewed',reply_digest=REPEAT('a',64),sales_delivery_id=1,state='reviewed_reserved',outgoing_message_reference=-1"],
  ]){try{await c.query('UPDATE ai_interaction_jobs SET '+sql+' WHERE id=?',[before[0].id]);}catch(e){if(e.code!=='ER_CHECK_CONSTRAINT_VIOLATED')throw e;rejected.push(name);}}
  const preservedTables=[];for(const t of tables)if(saved[t]===JSON.stringify(await read(t)))preservedTables.push(t);
  const final=JSON.stringify(await read('ai_interaction_jobs'));run(root);
  const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater applies 0000–0119; six legacy interaction states are seeded; 0120 adds reservations without granting historical authority; updater reruns.',
   migrations:Number(count.count),legacyRows:before.length,legacyUnchanged,noAutomaticAuthority,preservedTables,rejectedConstraints:rejected,
   rerunUnchanged:final===JSON.stringify(await read('ai_interaction_jobs')),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),
   migrationSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'drizzle/0120_reply_reservations.sql'))).digest('hex')};
  report.passed=report.migrations===121&&legacyUnchanged&&noAutomaticAuthority&&preservedTables.length===tables.length&&rejected.length===6&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
  fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/reply-reservation-migration.log',logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration verification failed');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
