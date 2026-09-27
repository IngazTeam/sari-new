const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the owned synthetic migration server');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.ok(['0140_salla_creation_effects','0141_salla_effect_reviews','0142_salla_sheet_receipts'].includes(journal.entries.at(-1).tag));
  const dir=path.resolve('.tmp/salla-effects-migration-'+Date.now()),output=path.resolve(process.env.SARI_SALLA_EFFECTS_MIGRATION_OUTPUT||'.tmp/salla-effects-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const prior=journal.entries.filter(e=>e.idx<140);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),ddl=fs.readFileSync('drizzle/0140_salla_creation_effects.sql','utf8'),cases=[];
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);assert.equal(path.resolve(identity.directory).toLowerCase(),fs.realpathSync(path.resolve('.tmp/staff-migration-mysql/data')).toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_effects_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM salla_creation_effects');assert.equal(n.n,journal.entries.length);assert.equal(a.n,0);cases.push({mode,migrations:n.n,emptyHistory:true,passed:true});continue;}
      run(name,dir);
      const [u]=await db.query("INSERT INTO users(openId,name,role,account_status) VALUES ('synthetic-salla-effects','Synthetic','admin','active')");
      const [m]=await db.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')",[u.insertId]);
      const [c]=await db.execute("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,'123','https://synthetic.example.test','synthetic-only','active')",[m.insertId]);
      const [o]=await db.execute("INSERT INTO orders(merchantId,sallaOrderId,orderNumber,customerName,customerPhone,items,totalAmount,status) VALUES (?,'salla:123:456','456','Synthetic','966500000000','[]',12345,'shipped')",[m.insertId]);
      await db.execute("INSERT INTO salla_order_projections(merchant_id,store_id,external_order_id,local_order_id,connection_id,created_at) VALUES (?,'123','456',?,?,UTC_TIMESTAMP(3))",[m.insertId,o.insertId,c.insertId]);
      const [a]=await db.execute(`INSERT INTO salla_order_creations(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,store_id,connection_id,local_order_id,result_json,created_at,updated_at)
        VALUES (?,?,'12345678-1234-4234-8234-123456789abc',REPEAT('a',64),'22345678-1234-4234-8234-123456789abc','completed','123',?,?,JSON_OBJECT('orderId',?,'orderNumber','456','paymentUrl',NULL),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[m.insertId,u.insertId,c.insertId,o.insertId,o.insertId]);
      const tables=['orders','salla_connections','salla_order_projections','salla_order_creations','salla_product_projections','salla_webhook_receipts','ai_budget_policies'];
      const snapshot=async()=>{const v={};for(const t of tables)v[t]=(await db.query(`SELECT * FROM ${t}`))[0];return JSON.stringify(v);};
      const before=await snapshot();await db.query(ddl);run(name);assert.equal(await snapshot(),before);
      const [[empty]]=await db.query('SELECT COUNT(*) AS n FROM salla_creation_effects');assert.equal(empty.n,0);
      const insert=`INSERT INTO salla_creation_effects(merchant_id,creation_id,local_order_id,kind,context_hash,state,available_at,created_at,updated_at)
        VALUES (?,?,?,'owner_notice',REPEAT('a',64),'pending',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`;
      await db.execute(insert,[m.insertId,a.insertId,o.insertId]);await assert.rejects(()=>db.execute(insert,[m.insertId,a.insertId,o.insertId]),e=>e.code==='ER_DUP_ENTRY');
      const violations=["state='accepted'","state='dispatching'","state='processing'","state='review'","claim_token='bad'","context_hash='bad'","attempts=9","attempts=-1","creation_id=0","local_order_id=0","accepted_at=UTC_TIMESTAMP(3)","dispatch_started_at=UTC_TIMESTAMP(3)"];
      for(const change of violations)await assert.rejects(()=>db.query('UPDATE salla_creation_effects SET '+change),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      await db.query("UPDATE salla_creation_effects SET state='processing',attempts=1,claim_token='32345678-1234-4234-8234-123456789abc',lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)");
      await db.query("UPDATE salla_creation_effects SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3)");
      await db.query("UPDATE salla_creation_effects SET state='review',lease_until=NULL,last_error='transport_unconfirmed'");
      const history=JSON.stringify((await db.query('SELECT * FROM salla_creation_effects'))[0]);run(name);await db.query(ddl);assert.equal(await snapshot(),before);assert.equal(JSON.stringify((await db.query('SELECT * FROM salla_creation_effects'))[0]),history);
      await db.execute('DELETE FROM orders WHERE id=?',[o.insertId]);await db.execute('DELETE FROM salla_order_creations WHERE id=?',[a.insertId]);assert.equal(JSON.stringify((await db.query('SELECT * FROM salla_creation_effects'))[0]),history);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');assert.equal(n.n,journal.entries.length);
      cases.push({mode:'0139-to-0140',migrations:n.n,preservedTables:tables,noLegacyNotificationBackfill:true,unrecordedDdlReplay:true,replaySafe:true,uniqueEffect:true,stateConstraints:violations.length,historySurvivesSourceDeletion:true,passed:true});
    }
    const report={generatedAt:new Date().toISOString(),scope:'Owned synthetic MySQL only; no production',cases,passed:true};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
