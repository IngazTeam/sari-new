const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
 if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the owned synthetic migration server');
 const root=process.cwd(),journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
 if(!['0133_staff_team_reviews','0134_ai_price_revisions','0135_ai_budget_alerts','0136_salla_sales_observations','0137_salla_order_projections','0138_salla_order_creations','0139_salla_product_projections','0140_salla_creation_effects'].includes(journal.entries.at(-1).tag))throw Error('Unexpected migration head');
 const dir=path.resolve('.tmp/team-review-migration-'+Date.now()),output=path.resolve(process.env.SARI_STAFF_MIGRATION_OUTPUT||'.tmp/team-review-migration/migration.json');
 fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
 const prior=journal.entries.filter(e=>e.idx<133);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
 fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
 const voiceOutput=path.join(dir,'voice-migration.json');
 const voice=cp.spawnSync(process.execPath,['scripts/testing/verify-staff-voice-migration.cjs'],{env:{...process.env,SARI_STAFF_MIGRATION_OUTPUT:voiceOutput},encoding:'utf8',windowsHide:true});
 if(voice.status!==0)throw Error('Prior voice migration verification failed: '+voice.stderr);
 const earlier=JSON.parse(fs.readFileSync(voiceOutput));if(!earlier.passed)throw Error('Prior migration cases failed');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
 Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
 const c=await mysql.createConnection(url.toString()),name=`sari_review_upgrade_${Date.now()}_test`,migration=fs.readFileSync('drizzle/0133_staff_team_reviews.sql','utf8');
 const run=(cwd=root)=>{const target=new URL(url);target.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:target.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('Synthetic migration failed');};
 try{
  await c.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.query(`USE ${name}`);run(dir);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('team-review-migration','Synthetic','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic team review')",[u.insertId]);
  const [v]=await c.execute("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500001234')",[m.insertId]);
  await c.execute("INSERT INTO messages (conversationId,direction,content) VALUES (?,'outgoing','Preserve message')",[v.insertId]);
  const tables=['messages','conversations','ai_sales_staff_replies','ai_sales_staff_voices','ai_sales_staff_acceptances','whatsapp_message_deliveries','ai_budget_policies'];
  const states=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,JSON.stringify((await c.query(`SELECT * FROM ${t} ORDER BY 1`))[0])])));
  const before=await states();await c.query(migration);run();const after=await states();
  // Structural fixtures only: not application-valid review snapshots.
  const insert="INSERT INTO ai_sales_staff_reviews (merchant_id,reviewer_user_id,author_user_id,conversation_id,source_kind,source_id,request_id,request_digest,snapshot,snapshot_digest) VALUES (?,?,999999,?,'text',999999,?,?,'{}',?)";
  const args=[m.insertId,u.insertId,v.insertId,'00000000-0000-4000-8000-000000000001','a'.repeat(64),'b'.repeat(64)];await c.execute(insert,args);
  let duplicate=false;try{await c.execute(insert,args);}catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;duplicate=true;}
  await c.execute('DELETE FROM conversations WHERE id=?',[v.insertId]);const [[retained]]=await c.query('SELECT COUNT(*) AS n FROM ai_sales_staff_reviews');
  const saved=JSON.stringify((await c.query('SELECT * FROM ai_sales_staff_reviews'))[0]);run();await c.query(migration);
  const [[count]]=await c.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[budget]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const test={mode:'0132-to-0133-review-upgrade',migrations:count.n,preservedTables:tables.filter(t=>before[t]===after[t]),duplicateRequestRejected:duplicate,
   sourceDeletionPreservesAudit:retained.n===1,rerunUnchanged:saved===JSON.stringify((await c.query('SELECT * FROM ai_sales_staff_reviews'))[0]),globalDailyMicroUsd:String(budget.daily_limit_micro_usd)};
  const cases=[...earlier.cases,{...test,passed:test.migrations===journal.entries.length&&test.preservedTables.length===tables.length&&duplicate&&test.sourceDeletionPreservesAudit&&test.rerunUnchanged&&test.globalDailyMicroUsd==='100000000'}];
  const report={verifiedAt:new Date().toISOString(),scope:'Synthetic fresh head, prior voice upgrade, 0132-to-0133 review upgrade, unrecorded DDL replay and retained audit; no production.',
   migrationSha256:crypto.createHash('sha256').update(migration).digest('hex'),cases,passed:cases.length===3&&cases.every(t=>t.passed)};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration cases failed');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
