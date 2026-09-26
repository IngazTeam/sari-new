const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
  const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG||'.tmp/brain-db-admin.json','utf8'));
  if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
  const database=`sari_ordinary_usage_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`);
  const out='docs/audits/sales-brain-implementation-2026-09-23/ordinary-reply-usage';fs.mkdirSync(out,{recursive:true});
  try {
    await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
    fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});
    const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
    if(journal.entries.at(-1).tag!=='0123_ordinary_reply_usage')throw Error('Unexpected migration');
    for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
    fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
    const env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env')};
    const logs=[],run=cwd=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,
      env:{...env,DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${database}`},encoding:'utf8',windowsHide:true});
      logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
    run(dir);await c.query(`USE ${database}`);
    const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('ordinary-migration-fixture','Migration','user')");
    const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Migration')",[u.insertId]);
    const [cv]=await c.execute("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000981','active')",[m.insertId]);
    const [p]=await c.execute("INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Historical','Historical',1,10,100,50)");
    const [s]=await c.execute("INSERT INTO merchant_subscriptions (merchant_id,plan_id,status,billing_cycle,start_date,end_date,messages_used) VALUES (?,?,'active','monthly','2026-09-01','2026-10-01',9)",[m.insertId,p.insertId]);
    await c.execute('UPDATE merchants SET current_subscription_id=? WHERE id=?',[s.insertId,m.insertId]);
    for(const [origin,state] of [['ordinary','waiting_delivery'],['ordinary','completed'],['legacy','pending'],['reviewed','reviewed_reserved']]) {
      const [msg]=await c.execute("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','Historical')",[cv.insertId]);
      await c.execute(`INSERT INTO ai_interaction_jobs (merchant_id,conversation_id,incoming_message_id,reply_text,reply_origin,state,reply_digest,reply_plan,sales_delivery_id)
        VALUES (?,?,?,'Historical',?,?,?,?,?)`,[m.insertId,cv.insertId,msg.insertId,origin,state,origin==='legacy'?null:'a'.repeat(64),origin==='ordinary'?'{}':null,origin==='reviewed'?123:null]);
    }
    const tables=['users','merchants','conversations','messages','merchant_subscriptions','subscription_plans','ai_interaction_jobs',
      'ai_sales_reply_deliveries','ai_sales_experiment_generations','whatsapp_message_deliveries','ai_budget_policies','ai_price_cards'];
    const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,JSON.stringify(await read(table))])));
    const before=await snapshot(),oldJobs=await read('ai_interaction_jobs');run(root);
    const rows=await read('ai_interaction_jobs'),after=await snapshot();
    after.ai_interaction_jobs=JSON.stringify(rows.map(row=>Object.fromEntries(Object.keys(oldJobs[0]).map(key=>[key,row[key]]))));
    const noInventedCharge=rows.every(row=>row.usage_state==='legacy'&&row.usage_units===0&&row.usage_subscription_id===null&&row.usage_outbox_id===null&&row.usage_digest===null);
    const valid={usage_state:'held',usage_units:2,usage_subscription_id:s.insertId,usage_period_start:'2026-09-01',usage_reserved_at:'2026-09-26',
      usage_digest:'a'.repeat(64),usage_outbox_id:1,usage_provider:'green_api',usage_request_digest:'b'.repeat(64),usage_attempts:0,usage_last_error:null,usage_settled_at:null};
    const rejected=[];
    for(const [name,changes] of [['state',{usage_state:'other'}],['units',{usage_units:1}],['subscription',{usage_subscription_id:null}],
      ['period',{usage_period_start:null}],['digest',{usage_digest:null}],['outbox',{usage_outbox_id:null}],['provider',{usage_provider:'other'}],
      ['request',{usage_request_digest:null}],['held-with-settlement',{usage_settled_at:'2026-09-26'}],['charged-without-settlement',{usage_state:'charged'}],
      ['attempts',{usage_attempts:9}],['error',{usage_last_error:'customer secret'}],['legacy-with-reservation',{usage_state:'legacy'}]]) {
      const value={...valid,...changes};await c.beginTransaction();
      try{await c.execute('UPDATE ai_interaction_jobs SET '+Object.keys(value).map(k=>k+'=?').join(',')+' WHERE id=?',[...Object.values(value),rows[0].id]);}
      catch(e){if(e.code!=='ER_CHECK_CONSTRAINT_VIOLATED')throw e;rejected.push(name);}finally{await c.rollback();}
    }
    const finalBefore=await snapshot();run(root);const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations');
    const [[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
    const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater applies 0000-0122, preserves historical ordinary/reviewed interaction state and subscription counters, applies 0123, and safely reruns.',
      migrations:Number(count.count),preservedTables:tables.filter(table=>before[table]===after[table]),historicalInteractions:rows.length,noInventedCharge,rejectedConstraints:rejected,
      rerunUnchanged:JSON.stringify(finalBefore)===JSON.stringify(await snapshot()),globalDailyMicroUsd:String(policy.daily_limit_micro_usd),
      migrationSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'drizzle/0123_ordinary_reply_usage.sql'))).digest('hex')};
    report.passed=report.migrations===124&&report.preservedTables.length===tables.length&&noInventedCharge&&rejected.length===13&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
    fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/ordinary-usage-migration.log',logs.join('\n'));console.log(JSON.stringify(report));
    if(!report.passed)throw Error('Migration verification failed');
  } finally {await c.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
