const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
  // Use only an explicitly supplied disposable test URL. Never read local credential files.
  const root=process.cwd(),url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||!['33087','33089'].includes(url.port)
    ||decodeURIComponent(url.username)!=='sari_brain_test'||decodeURIComponent(url.password)!=='disposable-brain-only'
    ||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Non-disposable test connection');
  const c=await mysql.createConnection(url.toString()),journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
  if(journal.entries.at(-1).tag!=='0130_sales_staff_acceptances')throw Error('Unexpected migration head');
  const dir=path.resolve('.tmp/staff-migration-'+Date.now()),output=path.resolve(process.env.SARI_STAFF_MIGRATION_OUTPUT||'.tmp/staff-acceptance-migration/migration.json');
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(`drizzle/${row.tag}.sql`,path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const migration=fs.readFileSync('drizzle/0130_sales_staff_acceptances.sql','utf8'),statements=migration.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean),logs=[];
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',SARI_ENV_FILE:path.resolve('.tmp/isolated-tests/empty.env'),DOTENV_CONFIG_PATH:path.resolve('.tmp/isolated-tests/empty.env'),
    NODE_OPTIONS:`--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\','/')}"`});
  const run=(database,cwd=root)=>{
    const destination=new URL(url);destination.pathname='/'+database;
    const result=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:destination.toString()},encoding:'utf8',windowsHide:true});
    logs.push((result.stdout||'')+(result.stderr||''));if(result.status!==0)throw Error('Disposable migration failed');
  };
  const cases=[];
  try{
    for(const mode of ['fresh','upgrade']){
      const database=`sari_staff_${mode}_${Date.now()}_test`;
      await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await c.query(`USE ${database}`);
      if(mode==='fresh'){
        run(database);const [[n]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations');
        const [[e]]=await c.query('SELECT COUNT(*) AS count FROM ai_sales_staff_acceptances');cases.push({mode,migrations:Number(n.count),initiallyEmpty:e.count===0,passed:n.count===131&&e.count===0});continue;
      }
      run(database,dir);
      const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('staff-migration','Synthetic','user')");
      const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Synthetic staff migration')",[u.insertId]);
      const [conv]=await c.execute("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500001234')",[m.insertId]);
      const [msg]=await c.execute("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','Synthetic')",[conv.insertId]);
      const [esc]=await c.execute("INSERT INTO sari_escalation_queue (merchant_id,conversation_id,customer_phone,question,source_message_id,expires_at) VALUES (?,?,'966500001234','Synthetic',?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP()))",[m.insertId,conv.insertId,msg.insertId]);
      const [relay]=await c.execute("INSERT INTO sales_escalation_relays (merchant_id,escalation_id,instance_id,author_phone,quoted_message_id,reply_text,ownership_version,status,provider_message_id) VALUES (?,?,1,'966500001235','synthetic-quote','Synthetic reply',1,'accepted','synthetic-receipt')",[m.insertId,esc.insertId]);
      const tables=['sales_escalation_relays','sari_escalation_queue','messages','whatsapp_message_deliveries','ai_budget_policies'];
      const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{
        const [rows]=await c.query(`SELECT * FROM ${table} ORDER BY 1`);
        return [table,JSON.stringify(rows.map(({staff_basis,staff_basis_digest,...row})=>row))];
      })));
      const before=await snapshot();
      for(const prefix of [4,8])for(const statement of statements.slice(0,prefix))await c.query(statement);
      run(database);const after=await snapshot(),[[legacy]]=await c.query('SELECT staff_basis,staff_basis_digest FROM sales_escalation_relays');
      const [[empty]]=await c.query('SELECT COUNT(*) AS count FROM ai_sales_staff_acceptances');
      const insert="INSERT INTO ai_sales_staff_acceptances (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at) VALUES (?,?,?,?,?,?,?,'{}','2026-09-26 12:00:00.123')";
      const args=[m.insertId,'escalation_relay',relay.insertId,'a'.repeat(64),10,'b'.repeat(64),'c'.repeat(64)];await c.execute(insert,args);
      const rejected=[];
      for(const kind of ['source','outbox','receipt','kind']){
        const values=[...args];values[2]=Number(relay.insertId)+1;values[4]=11;values[5]='d'.repeat(64);
        if(kind==='source')values[2]=relay.insertId;if(kind==='outbox')values[4]=10;if(kind==='receipt')values[5]=args[5];if(kind==='kind')values[1]='unverified_manual';
        try{await c.execute(insert,values);}catch(error){if(!['ER_DUP_ENTRY','ER_CHECK_CONSTRAINT_VIOLATED'].includes(error.code))throw error;rejected.push(kind);}
      }
      await c.execute('DELETE FROM conversations WHERE id=?',[conv.insertId]);
      const [[retained]]=await c.query('SELECT COUNT(*) AS count FROM ai_sales_staff_acceptances');
      const rerunBefore=await snapshot(),[ledgerBefore]=await c.query('SELECT * FROM ai_sales_staff_acceptances');run(database);for(const statement of statements)await c.query(statement);
      const [[n]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[budget]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
      const [ledgerAfter]=await c.query('SELECT * FROM ai_sales_staff_acceptances');
      const result={mode,migrations:Number(n.count),preservedTables:tables.filter(t=>before[t]===after[t]),legacyUnmeasured:legacy.staff_basis===null&&legacy.staff_basis_digest===null,
        initiallyEmpty:empty.count===0,rejectedConstraints:rejected,sourceDeletionPreservesAcceptance:retained.count===1,
        rerunUnchanged:JSON.stringify(rerunBefore)===JSON.stringify(await snapshot())&&JSON.stringify(ledgerBefore)===JSON.stringify(ledgerAfter),globalDailyMicroUsd:String(budget.daily_limit_micro_usd)};
      cases.push({...result,passed:result.migrations===131&&result.preservedTables.length===tables.length&&result.legacyUnmeasured&&result.initiallyEmpty
        &&rejected.length===4&&result.sourceDeletionPreservesAcceptance&&result.rerunUnchanged&&result.globalDailyMicroUsd==='100000000'});
    }
    const report={verifiedAt:new Date().toISOString(),scope:'Isolated fresh migration and 0129-to-0130 upgrade, interrupted DDL, legacy preservation and complete replay. No production access.',
      migrationSha256:crypto.createHash('sha256').update(migration).digest('hex'),cases,passed:cases.length===2&&cases.every(c=>c.passed)};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(dir,'migration.log'),logs.join('\n'));console.log(JSON.stringify(report));if(!report.passed)throw Error('Migration acceptance failed');
  }finally{await c.end();}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
