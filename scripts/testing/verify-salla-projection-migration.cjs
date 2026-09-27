const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use the owned synthetic migration server');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.ok(['0137_salla_order_projections','0138_salla_order_creations','0139_salla_product_projections','0140_salla_creation_effects'].includes(journal.entries.at(-1).tag));
  const dir=path.resolve('.tmp/salla-projection-migration-'+Date.now()),output=path.resolve(process.env.SARI_SALLA_PROJECTION_MIGRATION_OUTPUT||'.tmp/salla-projection-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const prior=journal.entries.filter(e=>e.idx<137);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),ddl=fs.readFileSync('drizzle/0137_salla_order_projections.sql','utf8').split('--> statement-breakpoint'),cases=[];
  const apply=async()=>{for(const s of ddl)if(s.trim())await db.query(s);};
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);assert.equal(path.resolve(identity.directory).toLowerCase(),fs.realpathSync(path.resolve('.tmp/staff-migration-mysql/data')).toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_projection_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM salla_order_projections');assert.equal(n.n,journal.entries.length);assert.equal(a.n,0);cases.push({mode,migrations:n.n,emptyHistory:true,passed:true});continue;}
      run(name,dir);
      const [u]=await db.query("INSERT INTO users(openId,name,role,account_status) VALUES ('synthetic-salla-projection','Synthetic','admin','active')");
      const [m]=await db.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')",[u.insertId]);
      const [c]=await db.execute("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,'123','https://synthetic.example.test','synthetic-only','active')",[m.insertId]);
      await db.execute("INSERT INTO salla_webhook_receipts(merchant_id,salla_store_id,event_key,event_type,resource_id,status,effect_applied) VALUES (?,'123',REPEAT('a',64),'order.updated','456','completed',1)",[m.insertId]);
      await db.execute("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount,status) VALUES (?,'456','Synthetic','966500000000','[]',123,'shipped')",[m.insertId]);
      const tables=['orders','salla_connections','salla_webhook_receipts','salla_sales_observations','ai_budget_policies'];
      const snapshot=async()=>{const v={};for(const t of tables)v[t]=(await db.query(`SELECT * FROM ${t}`))[0];return JSON.stringify(v);};
      const before=await snapshot();await apply();run(name);assert.equal(await snapshot(),before);
      const [[empty]]=await db.query('SELECT COUNT(*) AS n FROM salla_order_projections');assert.equal(empty.n,0);
      const [o]=await db.execute("INSERT INTO orders(merchantId,sallaOrderId,customerName,customerPhone,items,totalAmount) VALUES (?,'salla:123:789','Synthetic','966500000000','[]',100)",[m.insertId]);
      const insert="INSERT INTO salla_order_projections(merchant_id,store_id,external_order_id,local_order_id,connection_id,created_at) VALUES (?,'123','789',?,?,UTC_TIMESTAMP(3))";
      await db.execute(insert,[m.insertId,o.insertId,c.insertId]);await assert.rejects(()=>db.execute(insert,[m.insertId,o.insertId,c.insertId]),e=>e.code==='ER_DUP_ENTRY');
      await assert.rejects(()=>db.query("UPDATE salla_order_projections SET store_id='001'"),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      await assert.rejects(()=>db.query('UPDATE salla_order_projections SET connection_id=0'),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      const preserved=await snapshot(),history=JSON.stringify((await db.query('SELECT * FROM salla_order_projections'))[0]);run(name);await apply();
      assert.equal(JSON.stringify((await db.query('SELECT * FROM salla_order_projections'))[0]),history);assert.equal(await snapshot(),preserved);
      const [indexes]=await db.query("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salla_webhook_receipts' AND INDEX_NAME='idx_salla_receipt_order_scope' ORDER BY SEQ_IN_INDEX");
      assert.deepEqual(indexes.map(i=>i.COLUMN_NAME),['merchant_id','salla_store_id','resource_id','event_type','status']);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');assert.equal(n.n,journal.entries.length);
      cases.push({mode:'0136-to-0137',migrations:n.n,preservedTables:tables,unrecordedDdlReplay:true,noLegacyBackfill:true,duplicateAndInvalidIdentityRejected:true,historyPreserved:true,scopeIndexVerified:true,passed:true});
    }
    const result={generatedAt:new Date().toISOString(),scope:'Owned synthetic MySQL only; no production',cases,passed:cases.every(c=>c.passed)};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
