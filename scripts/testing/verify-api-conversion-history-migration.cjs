const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use owned synthetic MySQL');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.ok(['0147_api_conversion_history','0148_byaan_sales_operations'].includes(journal.entries.at(-1).tag));assert.equal(journal.entries[147].tag,'0147_api_conversion_history');
  const dir=path.resolve('.tmp/api-conversion-history-migration-'+Date.now()),output=path.resolve(process.env.SARI_CONVERSION_HISTORY_MIGRATION_OUTPUT||'.tmp/api-conversion-history-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync('.tmp/isolated-tests',{recursive:true});fs.writeFileSync('.tmp/isolated-tests/empty.env','# Synthetic migration only\n');
  const prior=journal.entries.filter(e=>e.idx<147);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),ddl=fs.readFileSync('drizzle/0147_api_conversion_history.sql','utf8').split('--> statement-breakpoint'),cases=[],created=[];
  const replayDdl=async()=>{for(const s of ddl)if(s.trim())await db.query(s);};
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);
    assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve('C:/Users/ingaz/Herd/sari/.tmp/staff-migration-mysql/data').toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_conversion_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created.push(name);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations'),[[a]]=await db.query('SELECT COUNT(*) AS n FROM api_conversion_observations');assert.equal(n.n,journal.entries.length);assert.equal(a.n,0);cases.push({mode,migrations:n.n,emptyHistory:true,passed:true});continue;}
      run(name,dir);
      const [u]=await db.query("INSERT INTO users(openId,name,role,account_status) VALUES ('synthetic-history-upgrade','Synthetic','admin','active')");
      const [m]=await db.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')",[u.insertId]);
      const [conversion]=await db.execute("INSERT INTO sari_conversions(merchant_id,customer_phone,action_type,product_name,amount,external_ref,idempotency_key,source,status) VALUES (?,'+966500000000','payment','Synthetic',12.50,'legacy','legacy','api','completed')",[m.insertId]);
      const fields='id,merchant_id,customer_phone,customer_name,action_type,product_name,amount,external_ref,idempotency_key,source,status,created_at';
      const snapshot=async()=>JSON.stringify((await db.query('SELECT '+fields+' FROM sari_conversions'))[0]);const before=await snapshot();
      await replayDdl();run(name);assert.equal(await snapshot(),before);assert.deepEqual((await db.query('SELECT history_digest FROM sari_conversions'))[0],[{history_digest:null}]);assert.equal((await db.query('SELECT * FROM api_conversion_observations'))[0].length,0);
      const insert="INSERT INTO api_conversion_observations(merchant_id,conversion_id,observed_state,source_kind,api_key_id,payload_digest,previous_digest,observation_digest,observed_at) VALUES (?,?,'completed','api_key_report',1,REPEAT('a',64),NULL,REPEAT('b',64),UTC_TIMESTAMP(3))";
      await db.execute(insert,[m.insertId,conversion.insertId]);await assert.rejects(()=>db.execute(insert,[m.insertId,conversion.insertId]),e=>e.code==='ER_DUP_ENTRY');
      const invalid=["observed_state='paid'","source_kind='provider_verified'","api_key_id=NULL","source_kind='internal_unverified'","api_key_id=0","payload_digest=REPEAT('Z',64)","previous_digest=REPEAT('Z',64)","observation_digest=REPEAT('Z',64)"];
      for(const change of invalid)await assert.rejects(()=>db.query('UPDATE api_conversion_observations SET '+change),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      const history=JSON.stringify((await db.query('SELECT * FROM api_conversion_observations'))[0]);run(name);await replayDdl();assert.equal(JSON.stringify((await db.query('SELECT * FROM api_conversion_observations'))[0]),history);assert.equal(await snapshot(),before);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');assert.equal(n.n,journal.entries.length);
      cases.push({mode:'0146-to-0147',migrations:n.n,preservedLegacyLedger:true,noBackfill:true,uniqueState:true,constraints:invalid.length,unrecordedDdlReplay:true,replaySafe:true,passed:true});
    }
    run(url.pathname.slice(1));const result={generatedAt:new Date().toISOString(),scope:'Owned synthetic MySQL only; no production',cases,passed:true};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{try{for(const name of created){assert.match(name,/^sari_conversion_(fresh|upgrade)_\d+_test$/);assert.notEqual('/'+name,url.pathname);await db.query('DROP DATABASE '+name);}}finally{await db.end();}}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
