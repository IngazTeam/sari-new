const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),mysql=require('mysql2/promise'),assert=require('node:assert/strict');
(async()=>{
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||url.username!=='sari_brain_test'||url.password!=='disposable-brain-only'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use owned synthetic MySQL');
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));assert.equal(journal.entries.at(-1).tag,'0148_byaan_sales_operations');
  const dir=path.resolve('.tmp/byaan-operation-migration-'+Date.now()),output=path.resolve(process.env.SARI_BYAAN_OPERATIONS_MIGRATION_OUTPUT||'.tmp/byaan-operations-migration/results.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync('.tmp/isolated-tests',{recursive:true});fs.writeFileSync('.tmp/isolated-tests/empty.env','# Synthetic migration only\n');
  const prior=journal.entries.filter(e=>e.idx<148);for(const e of prior)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(dir,`drizzle/${e.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:prior}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(name,cwd=root)=>{const u=new URL(url);u.pathname='/'+name;const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:u.toString()},encoding:'utf8',windowsHide:true});if(r.status!==0){fs.writeFileSync(path.join(dir,'failure.log'),r.stdout+r.stderr);throw Error('Migration failed');}};
  const db=await mysql.createConnection(url.toString()),ddl=fs.readFileSync('drizzle/0148_byaan_sales_operations.sql','utf8'),cases=[],created=[];
  try{
    const [[identity]]=await db.query('SELECT @@port AS port,@@datadir AS directory');assert.equal(Number(identity.port),33089);
    assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve('C:/Users/ingaz/Herd/sari/.tmp/staff-migration-mysql/data').toLowerCase());
    for(const mode of ['fresh','upgrade']){
      const name=`sari_byaan_${mode}_${Date.now()}_test`;await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created.push(name);await db.query(`USE ${name}`);
      if(mode==='fresh'){run(name);const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');assert.equal(n.n,journal.entries.length);assert.equal((await db.query('SELECT * FROM byaan_sales_operations'))[0].length,0);cases.push({mode,migrations:n.n,passed:true});continue;}
      run(name,dir);
      const [u]=await db.query("INSERT INTO users(openId,name,role,account_status) VALUES ('synthetic-byaan-upgrade','Synthetic','admin','active')");
      const [m]=await db.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')",[u.insertId]);
      await db.execute("INSERT INTO sari_conversions(merchant_id,customer_phone,action_type,product_name,external_ref,idempotency_key,source,status) VALUES (?,'+966500000000','enrollment','Synthetic','legacy','legacy','api','completed')",[m.insertId]);
      const snapshot=async()=>JSON.stringify((await db.query('SELECT * FROM sari_conversions'))[0]),before=await snapshot();
      await db.query(ddl);run(name);assert.equal(await snapshot(),before);assert.equal((await db.query('SELECT * FROM byaan_sales_operations'))[0].length,0);
      const insert="INSERT INTO byaan_sales_operations(merchant_id,request_id,request_hash,operation_kind,authority_hash,attempt_token,state) VALUES (?,'7e8a9936-68db-4e69-8290-06f4e0b05b66',REPEAT('a',64),'enrollment',REPEAT('b',64),'e84b12f4-24e1-48d4-a29e-bc55adf44ca9','preparing')";
      await db.execute(insert,[m.insertId]);await assert.rejects(()=>db.execute(insert,[m.insertId]),e=>e.code==='ER_DUP_ENTRY');
      const invalid=["operation_kind='unknown'","state='paid'","state='reported'","request_hash=REPEAT('Z',64)","authority_hash=REPEAT('Z',64)","request_id='invalid'","attempt_token='invalid'","result_json=JSON_OBJECT()"];
      for(const change of invalid)await assert.rejects(()=>db.query('UPDATE byaan_sales_operations SET '+change),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
      const operations=JSON.stringify((await db.query('SELECT * FROM byaan_sales_operations'))[0]);await db.query(ddl);run(name);
      assert.equal(JSON.stringify((await db.query('SELECT * FROM byaan_sales_operations'))[0]),operations);assert.equal(await snapshot(),before);
      const [[n]]=await db.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');assert.equal(n.n,journal.entries.length);
      cases.push({mode,migrations:n.n,preservedConversions:true,noBackfill:true,uniqueRequest:true,constraints:invalid.length,unrecordedDdlReplay:true,replaySafe:true,passed:true});
    }
    run(url.pathname.slice(1));const result={generatedAt:new Date().toISOString(),scope:'Owned synthetic MySQL only',cases,passed:true};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{try{for(const name of created){assert.match(name,/^sari_byaan_(fresh|upgrade)_\d+_test$/);assert.notEqual('/'+name,url.pathname);await db.query('DROP DATABASE '+name);}}finally{await db.end();}}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
