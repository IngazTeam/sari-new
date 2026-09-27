const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use owned synthetic MySQL');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.equal(journal.entries.at(-1).tag,'0141_salla_effect_reviews');
  const dir=path.resolve('.tmp/salla-effect-review-migration-'+Date.now()),output=path.resolve(process.env.SARI_SALLA_EFFECT_REVIEW_MIGRATION_OUTPUT||'.tmp/salla-effect-review-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  const prior=journal.entries.filter(e=>e.idx<141);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),ddl=fs.readFileSync('drizzle/0141_salla_effect_reviews.sql','utf8'),cases=[];
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);assert.equal(path.resolve(identity.directory).toLowerCase(),fs.realpathSync(path.resolve('.tmp/staff-migration-mysql/data')).toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_effect_review_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM salla_effect_reviews');assert.equal(n.n,142);assert.equal(a.n,0);cases.push({mode,migrations:n.n,emptyHistory:true,passed:true});continue;}
      run(name,dir);
      const [u]=await db.query("INSERT INTO users(openId,name,role,account_status) VALUES ('synthetic-salla-review','Synthetic','admin','active')");
      const [m]=await db.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')",[u.insertId]);
      const [o]=await db.execute("INSERT INTO orders(merchantId,orderNumber,customerName,customerPhone,items,totalAmount,status) VALUES (?,'456','Synthetic','966500000000','[]',12345,'pending')",[m.insertId]);
      const [e]=await db.execute(`INSERT INTO salla_creation_effects(merchant_id,creation_id,local_order_id,kind,context_hash,state,attempts,claim_token,dispatch_started_at,last_error,available_at,created_at,updated_at)
        VALUES (?,1,?,'sheets',REPEAT('a',64),'review',1,'32345678-1234-4234-8234-123456789abc',UTC_TIMESTAMP(3),'transport_unconfirmed',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[m.insertId,o.insertId]);
      const tables=['orders','salla_connections','salla_order_projections','salla_order_creations','salla_creation_effects','salla_product_projections','salla_webhook_receipts','ai_budget_policies'];
      const state=async()=>{const v={};for(const t of tables)v[t]=(await db.query(`SELECT * FROM ${t}`))[0];return JSON.stringify(v);};
      const before=await state();await db.query(ddl);run(name);assert.equal(await state(),before);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM salla_effect_reviews');assert.equal(n.n,142);assert.equal(a.n,0);
      const insert=`INSERT INTO salla_effect_reviews(merchant_id,reviewer_user_id,effect_id,order_id,request_id,request_digest,snapshot,snapshot_digest)
        VALUES (?,?,?,?,'12345678-1234-4234-8234-123456789abc',REPEAT('a',64),JSON_OBJECT('synthetic',true),REPEAT('b',64))`,args=[m.insertId,u.insertId,e.insertId,o.insertId];
      await db.execute(insert,args);await assert.rejects(()=>db.execute(insert,args),x=>x.code==='ER_DUP_ENTRY');
      const audits=JSON.stringify((await db.query('SELECT * FROM salla_effect_reviews'))[0]);run(name);await db.query(ddl);assert.equal(await state(),before);assert.equal(JSON.stringify((await db.query('SELECT * FROM salla_effect_reviews'))[0]),audits);
      await db.execute('DELETE FROM salla_creation_effects WHERE id=?',[e.insertId]);await db.execute('DELETE FROM orders WHERE id=?',[o.insertId]);assert.equal(JSON.stringify((await db.query('SELECT * FROM salla_effect_reviews'))[0]),audits);
      cases.push({mode:'0140-to-0141',migrations:n.n,preservedTables:tables,noBackfill:true,uniqueRequest:true,unrecordedDdlReplay:true,replaySafe:true,historySurvivesSourceDeletion:true,passed:true});
    }
    const result={generatedAt:new Date().toISOString(),scope:'Owned synthetic MySQL only; no production',cases,passed:true};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
