const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'
    ||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the separate synthetic migration server');
  const c=await mysql.createConnection(url.toString()),journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
  if(journal.entries.at(-1).tag!=='0131_staff_dashboard_replies')throw Error('Unexpected migration head');
  const dir=path.resolve('.tmp/dashboard-staff-migration-'+Date.now()),output=path.resolve(process.env.SARI_STAFF_MIGRATION_OUTPUT||'.tmp/dashboard-staff-migration/migration.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  for(const e of journal.entries.slice(0,-1))fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const migration=fs.readFileSync('drizzle/0131_staff_dashboard_replies.sql','utf8'),statements=migration.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean),logs=[];
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),
    NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(database,cwd=root)=>{const u=new URL(url);u.pathname='/'+database;
    const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});
    logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  const cases=[];
  try{for(const mode of ['fresh','upgrade']){
    const name=`sari_dashboard_${mode}_${Date.now()}_test`;await c.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.query(`USE ${name}`);
    if(mode==='fresh'){run(name);const [[n]]=await c.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[r]]=await c.query('SELECT COUNT(*) AS n FROM ai_sales_staff_replies');
      cases.push({mode,migrations:n.n,empty:r.n===0,passed:n.n===132&&r.n===0});continue;}
    run(name,dir);
    const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('staff-dashboard-migration','Synthetic','user')");
    const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic dashboard staff')",[u.insertId]);
    const [v]=await c.execute("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500001234')",[m.insertId]);
    await c.execute("INSERT INTO messages (conversationId,direction,content) VALUES (?,'outgoing','Legacy staff reply')",[v.insertId]);
    // Structural SQL fixture only: this object is deliberately not presented as an application-valid acceptance.
    const fact="INSERT INTO ai_sales_staff_acceptances (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at) VALUES (?,?,?,?,?,?,?,'{}','2026-09-27 00:00:00.123')";
    await c.execute(fact,[m.insertId,'escalation_relay',1,'a'.repeat(64),10,'b'.repeat(64),'c'.repeat(64)]);
    const tables=['sales_escalation_relays','sari_escalation_queue','messages','whatsapp_message_deliveries','ai_budget_policies','ai_sales_staff_acceptances'];
    const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>{const [r]=await c.query(`SELECT * FROM ${t} ORDER BY 1`);return [t,JSON.stringify(r)];})));
    const before=await snapshot();await c.query(statements[0]);run(name);const after=await snapshot(),[[empty]]=await c.query('SELECT COUNT(*) AS n FROM ai_sales_staff_replies');
    const insert="INSERT INTO ai_sales_staff_replies (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,reply_text) VALUES (?,?,?,'00000000-0000-4000-8000-000000000001',1,1,'966500001234','Synthetic')";
    await c.execute(insert,[m.insertId,u.insertId,v.insertId]);let duplicate=false,invalid=false;
    try{await c.execute(insert,[m.insertId,u.insertId,v.insertId]);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;duplicate=true;}
    await c.execute(fact,[m.insertId,'dashboard_text',1,'a'.repeat(64),11,'d'.repeat(64),'e'.repeat(64)]);
    try{await c.execute(fact,[m.insertId,'unverified_manual',2,'a'.repeat(64),12,'f'.repeat(64),'a'.repeat(64)]);}catch(e){if(e.code!=='ER_CHECK_CONSTRAINT_VIOLATED')throw e;invalid=true;}
    await c.execute('DELETE FROM conversations WHERE id=?',[v.insertId]);const [[retained]]=await c.query('SELECT COUNT(*) AS n FROM ai_sales_staff_acceptances'),[[attempt]]=await c.query('SELECT COUNT(*) AS n FROM ai_sales_staff_replies');
    const prior=await snapshot(),[attemptsBefore]=await c.query('SELECT * FROM ai_sales_staff_replies');run(name);for(const s of statements)await c.query(s);
    const [attemptsAfter]=await c.query('SELECT * FROM ai_sales_staff_replies'),[[n]]=await c.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[budget]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
    const r={mode,migrations:n.n,preservedTables:tables.filter(t=>before[t]===after[t]),initiallyEmpty:empty.n===0,duplicateRequestRejected:duplicate,unsupportedSourceRejected:invalid,
      sourceDeletionPreservesEvidence:retained.n===2&&attempt.n===1,rerunUnchanged:JSON.stringify(prior)===JSON.stringify(await snapshot())&&JSON.stringify(attemptsBefore)===JSON.stringify(attemptsAfter),globalDailyMicroUsd:String(budget.daily_limit_micro_usd)};
    cases.push({...r,passed:r.migrations===132&&r.preservedTables.length===tables.length&&r.initiallyEmpty&&duplicate&&invalid&&r.sourceDeletionPreservesEvidence&&r.rerunUnchanged&&r.globalDailyMicroUsd==='100000000'});
  }
    const report={verifiedAt:new Date().toISOString(),scope:'Synthetic fresh database and 0130-to-0131 upgrade, partial DDL, preservation, constraints, deletion and full replay. No production access.',
      migrationSha256:crypto.createHash('sha256').update(migration).digest('hex'),cases,passed:cases.length===2&&cases.every(r=>r.passed)};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(dir,'migration.log'),logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration acceptance failed');
  }finally{await c.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
