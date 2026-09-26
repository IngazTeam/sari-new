const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),mysql=require('mysql2/promise'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.argv[2]||'.'),config=JSON.parse(fs.readFileSync(process.env.SARI_TEST_ADMIN_CONFIG || '.tmp/brain-db-admin.json','utf8'));
 if(config.host!=='127.0.0.1'||config.port!==33087)throw Error('Non-disposable host');
 const database=`sari_sales_reply_delivery_${Date.now()}_test`,c=await mysql.createConnection(config),dir=path.resolve(`.tmp/${database}`),out='docs/audits/sales-brain-implementation-2026-09-23/sales-reply-delivery';
 fs.mkdirSync(out,{recursive:true});
 try{
  await c.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.query(`GRANT ALL PRIVILEGES ON ${database}.* TO 'sari_brain_test'@'localhost'`);
  fs.mkdirSync(path.join(dir,'drizzle/meta'),{recursive:true});
  const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.at(-1).tag!=='0119_sales_reply_deliveries')throw Error('Unexpected migration');
  for(const row of journal.entries.slice(0,-1))fs.copyFileSync(path.join(root,`drizzle/${row.tag}.sql`),path.join(dir,`drizzle/${row.tag}.sql`));
  fs.writeFileSync(path.join(dir,'drizzle/meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,-1)}));
  const env={...process.env,NODE_ENV:'test',SARI_ENV_FILE:path.join(root,'.tmp/empty.env'),DOTENV_CONFIG_PATH:path.join(root,'.tmp/empty.env')};
  const logs=[],run=(cwd,db)=>{const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/mysql-drizzle-migrate.mjs')],{cwd,env:{...env,DATABASE_URL:`mysql://sari_brain_test:disposable-brain-only@127.0.0.1:33087/${db}`},encoding:'utf8',windowsHide:true});logs.push((r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('Migration failed');};
  run(dir,database);await c.query(`USE ${database}`);
  const [u]=await c.execute("INSERT INTO users (openId,name,role) VALUES ('sales-protocol-migration','Migration fixture','user')");
  const [m]=await c.execute("INSERT INTO merchants (userId,businessName) VALUES (?,'Migration fixture')",[u.insertId]);
  const [p]=await c.execute("INSERT INTO ai_learning_proposals (merchant_id,generation,dimension,insight,content_hash,evidence_count,confidence,status) VALUES (?,1,'objection_handling','Historical',SHA2('Historical',256),3,0.5,'proposed')",[m.insertId]);
  const [review]=await c.execute("INSERT INTO ai_learning_policy_reviews (merchant_id,proposal_id,revision,request_id,payload_digest,source_digest,suite_digest,actor_user_id,proposal_snapshot,assessment,outcome,passed_cases,regressions) VALUES (?,?,1,?,?,?,?,?,'{}','{}','passed',8,0)",[m.insertId,p.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),u.insertId]);
  const [candidate]=await c.execute("INSERT INTO ai_learning_policy_candidates (merchant_id,proposal_id,review_id,version,request_id,payload_digest,source_digest,baseline_digest,artifact_digest,actor_user_id,bundle) VALUES (?,?,?,1,?,?,?,?,?,?,'{}')",[m.insertId,p.insertId,review.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64),u.insertId]);
  const [runRow]=await c.execute("INSERT INTO ai_learning_policy_evaluations (merchant_id,candidate_id,request_id,payload_digest,artifact_digest,route_digest,provider,model,recipe,state) VALUES (?,?,?,?,?,?,'openai','migration-fixture','{}','completed')",[m.insertId,candidate.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]);
  await c.execute("INSERT INTO ai_learning_policy_output_reviews (merchant_id,run_id,revision,request_id,payload_digest,run_digest,rubric_digest,review_digest,review,outcome) VALUES (?,?,1,?,?,?,?,?,'{}','passed')",[m.insertId,runRow.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64)]);

  const [protocol]=await c.execute("INSERT INTO ai_sales_experiment_protocols (merchant_id,candidate_id,request_id,payload_digest,artifact_digest,protocol_digest,protocol) VALUES (?,?,?,?,?,?,'{}')",[m.insertId,candidate.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]);

  await c.execute("INSERT INTO ai_sales_experiment_cohorts (merchant_id,protocol_id,request_id,payload_digest,protocol_digest,cohort_digest,snapshot) VALUES (?,?,?,?,?,?,'{}')",[m.insertId,protocol.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]);

  const [planning]=await c.execute("INSERT INTO ai_sales_experiment_reviews (merchant_id,protocol_id,revision,request_id,payload_digest,basis_digest,review_digest,snapshot,verdict,actor_user_id) VALUES (?,?,1,?,?,?,?,'{}','approved',?)",[m.insertId,protocol.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),u.insertId]);
  const [launch]=await c.execute("INSERT INTO ai_sales_experiment_launches (merchant_id,protocol_id,request_id,payload_digest,basis_digest,review_id,review_digest,launch_digest,snapshot,actor_user_id) VALUES (?,?,?,?,?,?,?,?,'{}',?)",[m.insertId,protocol.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),planning.insertId,'c'.repeat(64),'d'.repeat(64),u.insertId]);
  await c.execute("INSERT INTO ai_sales_experiment_launch_revocations (merchant_id,launch_id,request_id,payload_digest,revocation_digest,snapshot,actor_user_id) VALUES (?,?,?,?,?,'{}',?)",[m.insertId,launch.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),u.insertId]);
  await c.execute("UPDATE ai_sales_experiment_launches SET state='revoked' WHERE id=?",[launch.insertId]);
  const [assignment]=await c.execute("INSERT INTO ai_sales_experiment_assignments (merchant_id,protocol_id,launch_id,customer_key,arm,conversation_reference,message_reference,observation_ends_at,assignment_digest,snapshot) VALUES (?,?,?,?,'baseline',123,456,'2027-01-01',?,'{}')",[m.insertId,protocol.insertId,launch.insertId,'a'.repeat(64),'b'.repeat(64)]);
  await c.execute("INSERT INTO ai_sales_experiment_assignment_conversations (merchant_id,protocol_id,conversation_reference,customer_key,assignment_id) VALUES (?,?,123,?,?)",[m.insertId,protocol.insertId,'a'.repeat(64),assignment.insertId]);
  const turnSql="INSERT INTO ai_sales_experiment_turns (merchant_id,protocol_id,assignment_id,conversation_reference,message_reference,request_id,payload_digest,turn_digest,snapshot) VALUES (?,?,?,?,?,?,?,?,'{}')";
  const [turn]=await c.execute(turnSql,[m.insertId,protocol.insertId,assignment.insertId,123,456,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64)]);
  const [otherTurn]=await c.execute(turnSql,[m.insertId,protocol.insertId,assignment.insertId,123,457,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64)]);
  const preserved=['ai_learning_proposals','ai_learning_policy_reviews','ai_learning_policy_candidates','ai_learning_policy_evaluations','ai_learning_policy_output_reviews','ai_sales_experiment_protocols','ai_sales_experiment_cohorts','ai_sales_experiment_reviews','ai_sales_experiment_launches','ai_sales_experiment_launch_revocations','ai_sales_experiment_assignments','ai_sales_experiment_assignment_conversations','ai_sales_experiment_turns','ai_budget_policies','ai_price_cards','ai_sales_experiment_generations'];
  const read=async table=>(await c.query('SELECT * FROM '+table+' ORDER BY 1'))[0];
  const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async table=>[table,JSON.stringify(await read(table))])));
  const insert="INSERT INTO ai_sales_experiment_generations (merchant_id,turn_id,actor_user_id,request_id,payload_digest,authorization_digest,snapshot,state,claim_token,reservation_key) VALUES (?,?,?,?,?,?,'{}','uncertain',?,?)";
  const args=[m.insertId,turn.insertId,u.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),crypto.randomUUID(),'c'.repeat(64)];await c.execute(insert,args);
  const [generations]=await c.execute('SELECT id FROM ai_sales_experiment_generations');
  await c.execute("INSERT INTO ai_sales_generation_output_reviews (merchant_id,generation_id,actor_user_id,revision,request_id,payload_digest,basis_digest,review_digest,snapshot,outcome) VALUES (?,?,?,1,?,?,?,?,'{}','approved')",[m.insertId,generations[0].id,u.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]);
  preserved.push('ai_sales_generation_output_reviews');
  const before=await snapshot();run(root,database);const after=await snapshot();
  const noAutomaticAuthorization=(await read('ai_sales_reply_deliveries')).length===0;
  const insertDelivery="INSERT INTO ai_sales_reply_deliveries (merchant_id,generation_id,message_reference,actor_user_id,request_id,payload_digest,basis_digest,authorization_digest,snapshot,state,dispatch_started_at) VALUES (?,?,?,?,?,?,?,?,'{}',?,?)";
  const deliveryArgs=[m.insertId,generations[0].id,456,u.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'authorized',null];
  await c.execute(insertDelivery,deliveryArgs);
  const [second]=await c.execute(insert,[m.insertId,otherTurn.insertId,u.insertId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64),crypto.randomUUID(),'d'.repeat(64)]);
  const rejected=[];
  for(const kind of ['request','generation','source','zero','state','dispatch-time','generation-fk']){
    const values=[...deliveryArgs];values[1]=second.insertId;values[2]=457;values[4]=crypto.randomUUID();
    if(kind==='request')values[4]=deliveryArgs[4];if(kind==='generation')values[1]=deliveryArgs[1];if(kind==='source')values[2]=456;
    if(kind==='zero')values[2]=0;if(kind==='state')values[8]='sent';if(kind==='dispatch-time')values[8]='dispatching';if(kind==='generation-fk')values[1]=0;
    try{await c.execute(insertDelivery,values);}catch(e){if(['ER_DUP_ENTRY','ER_CHECK_CONSTRAINT_VIOLATED','ER_NO_REFERENCED_ROW_2'].includes(e.code))rejected.push(kind);else throw e;}
  }
  const finalBefore=await snapshot(),deliveryBefore=JSON.stringify(await read('ai_sales_reply_deliveries'));run(root,database);
  const [[count]]=await c.query('SELECT COUNT(*) AS count FROM __drizzle_migrations'),[[policy]]=await c.query("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
  const report={verifiedAt:new Date().toISOString(),database,scope:'Actual updater applies 0000–0118 in a fresh isolated database, seeds generation and review history, applies 0119 and reruns.',migrations:Number(count.count),
    preservedTables:preserved.filter(table=>before[table]===after[table]),noAutomaticAuthorization,rejectedConstraints:rejected,
    rerunUnchanged:JSON.stringify(finalBefore)===JSON.stringify(await snapshot())&&deliveryBefore===JSON.stringify(await read('ai_sales_reply_deliveries')),
    globalDailyMicroUsd:String(policy.daily_limit_micro_usd),migrationSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'drizzle/0119_sales_reply_deliveries.sql'))).digest('hex')};
  report.passed=report.migrations===120&&report.preservedTables.length===preserved.length&&report.noAutomaticAuthorization&&rejected.length===7&&report.rerunUnchanged&&report.globalDailyMicroUsd==='100000000';
  fs.writeFileSync(out+'/migration.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('.tmp/sales-reply-delivery-migration.log',logs.join('\n'));console.log(JSON.stringify(report));
  if(!report.passed)throw Error('Migration verification failed');
  run(root,'sari_brain_test');console.log('Disposable acceptance database upgraded to 0119');
 }finally{await c.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
