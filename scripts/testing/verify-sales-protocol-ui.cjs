const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
 const accept=d=>d.accept();page.on('dialog',accept);
 const visit=async(mode,lang='en')=>{await page.goto(`${origin}/?case=protocol-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.click('[data-protocol-open]');await page.waitForSelector('[data-protocol-panel]');};
 const writes=()=>page.evaluate(()=>window.__protocolWrites||[]);
 const check=async()=>{
  const layout=await page.$eval('[data-protocol-panel]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:node.innerText.includes('merchantUx.'),private:node.innerText.includes('private '),
   controls:[...node.querySelectorAll('button,select,input:not([type=checkbox]),textarea')].filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),button:n.tagName==='BUTTON',label:n.tagName==='BUTTON'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`),submit:n.tagName==='BUTTON'&&n.type==='submit'}))}));
  assert.equal(layout.overflow,false);assert.equal(layout.keys,false);assert.equal(layout.private,false);assert.ok(layout.controls.every(n=>n.height>=44&&n.label&&!n.submit));
  assert.ok(layout.controls.filter(n=>!n.button).every(n=>n.font>=16));
 };
 const set=async(values)=>page.evaluate(values=>{for(const [key,value]of Object.entries(values)){const node=document.querySelector(`[data-protocol-field="${key}"]`);const proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}},values);
 const next=async(step)=>{await page.click('[data-protocol-next]');await page.waitForSelector(`[data-protocol-step="${step}"]`);};
 const fill=async()=>{
  await page.click('[data-protocol-start]');await page.waitForSelector('[data-protocol-editor]');
  await set({title:'Value comparison plan',hypothesis:'Explain matching offer value clearly to improve verified conversion.',qualificationRule:'Include customers with a recorded relevant need before assignment.',exclusions:'Exclude tests, refusals and opportunities already paid before assignment.'});
  await next(1);await set({minimumCustomersPerArm:'2000',baselinePercent:'١٠',liftPercentagePoints:'3',calculationReference:'Independent power calculation attached for this exact baseline and effect.'});
  await next(2);const dates=await page.evaluate(()=>{const iso=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,16);return {enrollmentStartsAt:iso(2),enrollmentEndsAt:iso(32),decisionNotBefore:iso(46)};});
  await set({...dates,observationDays:'14',safetyTriggers:'Withdraw after a factual, consent, payment or privacy safety regression.'});await next(3);
  assert.equal(await page.$eval('[data-protocol-save]',n=>n.disabled),true);await page.focus('[data-protocol-attestation]');await page.keyboard.press('Space');
  assert.equal(await page.$eval('[data-protocol-save]',n=>n.disabled),false);
 };
 const save=async()=>{await page.click('[data-protocol-save]');await page.waitForSelector('[data-protocol-saved]');await page.waitForSelector('[data-protocol-record]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-refresh]').disabled);};
 const prepareWithdrawal=async()=>{await page.click('[data-protocol-read="45"]');await page.waitForSelector('[data-protocol-withdraw-reason]');await page.type('[data-protocol-withdraw-reason]','A confirmed safety regression requires withdrawal and review.');await page.click('[data-protocol-withdraw-consent]');};
 try{
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
   await page.setViewport({width,height:width<500?812:900});await visit('ready',lang);assert.equal((await writes()).length,0);await fill();await check();
   assert.equal(await page.$eval('[data-evaluation-create]',n=>n.disabled),true);assert.equal(await page.$eval('[data-evaluation-select]',n=>n.disabled),true);
   if([375,1440].includes(width))await(await page.$('[data-protocol-panel]')).screenshot({path:path.join(output,`sales-protocol-review-${lang}-${width}.png`)});
   await save();await check();const request=(await writes())[0];assert.equal(request.kind,'register');assert.equal(request.input.candidateId,4);assert.equal(request.input.expectedSectorRevision,0);
   assert.equal(request.input.design.sample.baselineConversionBps,1000);assert.equal(request.input.design.sample.minimumAbsoluteLiftBps,300);
   assert.equal('merchantId'in request.input,false);assert.equal('activate'in request.input,false);assert.match(request.input.requestId,/^[a-f0-9-]{36}$/);
   assert.equal(await page.$eval('[data-protocol-state]',n=>n.dataset.protocolState),'registered');assert.equal((await writes()).length,1);
   results.push({width,lang,mode:'protocol_four_steps_keyboard_explicit_registration_complete_record',passed:true});
  }
  await page.setViewport({width:375,height:812});
  for(const lang of ['ar','en']) {
   await visit('ready',lang);await fill();await page.click('[data-protocol-back]');await page.click('[data-protocol-back]');
   await set({minimumCustomersPerArm:'500'});await page.waitForSelector('[data-sample-status="insufficient"]');assert.equal(await page.$eval('[data-protocol-next]',n=>n.disabled),true);
   await check();await(await page.$('[data-protocol-sample-check]')).screenshot({path:path.join(output,`sales-sample-insufficient-${lang}-375.png`)});
   await set({minimumCustomersPerArm:'1773'});assert.equal(await page.$eval('[data-protocol-next]',n=>n.disabled),true);
   await set({minimumCustomersPerArm:'١٧٧٤'});await page.waitForSelector('[data-sample-status="meets_calculated_floor"]');assert.equal(await page.$eval('[data-protocol-next]',n=>n.disabled),false);
   await set({minimumCustomersPerArm:'1000000',baselinePercent:'50',liftPercentagePoints:'0.01'});await page.waitForSelector('[data-sample-status="exceeds_platform_limit"]');assert.equal(await page.$eval('[data-protocol-next]',n=>n.disabled),true);
   await set({baselinePercent:'',liftPercentagePoints:'<script>'});await page.waitForSelector('[data-sample-status="incomplete"]');assert.equal(await page.$eval('[data-protocol-next]',n=>n.disabled),true);
   assert.equal((await writes()).length,0);await check();results.push({width:375,lang,mode:'protocol_sample_threshold_sparse_limits_and_invalid_input',passed:true});
  }
  await visit('legacy-sample');await page.click('[data-protocol-read="45"]');await page.waitForSelector('[data-sample-legacy]');await page.waitForSelector('[data-sample-status="insufficient"]');assert.equal((await writes()).length,0);await check();results.push({width:375,mode:'protocol_legacy_insufficient_sample_is_readable_and_not_rewritten',passed:true});
  for(const mode of ['unknown','outage','receipt-mismatch']){
   await visit(mode);await fill();await page.click('[data-protocol-save]');await page.waitForSelector('[data-protocol-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-retry]').disabled);
   assert.equal((await writes()).length,1);assert.equal(await page.$('[data-protocol-discard]'),null);assert.equal(await page.$eval('[data-protocol-attestation]',n=>n.disabled),true);
   await page.click('[data-protocol-retry]');await page.waitForSelector('[data-protocol-saved]');const attempts=await writes();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await check();
   results.push({width:375,mode:`protocol_${mode}_same_request_recovery`,passed:true});
  }
  for(const mode of ['withdraw-ready','withdraw-unknown']){
   await visit(mode,'ar');await prepareWithdrawal();assert.equal(await page.$eval('[data-evaluation-create]',n=>n.disabled),true);
   await page.click('[data-protocol-withdraw]');
   if(mode==='withdraw-unknown'){await page.waitForSelector('[data-protocol-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-retry]').disabled);await page.click('[data-protocol-retry]');}
   await page.waitForSelector('[data-protocol-withdrawal-audit]');await page.waitForSelector('[data-protocol-state=withdrawn]');await check();
   assert.equal(await page.$('[data-protocol-withdraw]'),null);const attempts=await writes();assert.equal(attempts.length,mode==='withdraw-unknown'?2:1);if(attempts.length===2)assert.deepEqual(attempts[0],attempts[1]);
   assert.equal('winner'in attempts[0].input,false);results.push({width:375,mode:`protocol_${mode}_immutable_reason_and_replay`,passed:true});
  }
  for(const mode of ['loading','fetching','viewer','stale','missing','candidate-error','sector-error','history-error','existing']){
   await visit(mode);await check();const start=await page.$('[data-protocol-start]');if(start)assert.equal(await start.evaluate(n=>n.disabled),true);
   assert.equal((await writes()).length,0);results.push({width:375,mode:`protocol_${mode}_no_write`,passed:true});
  }
  for(const event of ['Sector','Candidate']){
   await visit('ready');await fill();await page.evaluate(event=>window[`__protocolChange${event}`](),event);await page.waitForSelector('[data-protocol-stale]');
   assert.equal(await page.$eval('[data-protocol-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-protocol-summary-field=title]',n=>n.textContent),'Value comparison plan');
   await page.click('[data-protocol-discard-consent]');await page.click('[data-protocol-discard]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-start]').disabled);
   assert.equal((await writes()).length,0);results.push({width:375,mode:`protocol_changed_${event}_preserves_draft_and_requires_discard`,passed:true});
  }
  await visit('conflict');await fill();await page.click('[data-protocol-save]');await page.waitForSelector('[data-protocol-changed]');assert.equal(await page.$('[data-protocol-uncertain]'),null);assert.equal(await page.$eval('[data-protocol-save]',n=>n.disabled),true);await check();results.push({width:375,mode:'protocol_definite_conflict_keeps_draft_without_new_retry',passed:true});
  await visit('refresh-error');await fill();await save();await page.waitForSelector('[data-protocol-error]');assert.equal((await writes()).length,1);assert.equal(await page.$('[data-protocol-uncertain]'),null);results.push({width:375,mode:'protocol_saved_receipt_survives_read_failure_without_duplicate',passed:true});
  await visit('slow');await fill();await page.$eval('[data-protocol-save]',n=>{n.click();n.click();});await page.waitForSelector('[data-protocol-saved]');assert.equal((await writes()).length,1);results.push({width:375,mode:'protocol_double_click_sends_once',passed:true});
  await visit('close');await fill();await page.click('[data-protocol-open]');await page.click('[data-protocol-open]');assert.equal(await page.$eval('[data-protocol-summary-field=title]',n=>n.textContent),'Value comparison plan');assert.equal((await writes()).length,0);results.push({width:375,mode:'protocol_fold_preserves_draft_without_writes',passed:true});
  await visit('ready');await fill();await page.evaluate(()=>window.__protocolRevoke());await page.waitForSelector('[data-protocol-error]');assert.equal(await page.$eval('[data-protocol-save]',n=>n.disabled),true);assert.equal((await writes()).length,0);await page.evaluate(()=>window.__protocolRestore());await page.click('[data-protocol-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-refresh]').disabled);results.push({width:375,mode:'protocol_role_revocation_blocks_stale_draft',passed:true});
  await visit('withdraw-ready');await prepareWithdrawal();await page.evaluate(()=>window.__protocolRevoke());await page.waitForSelector('[data-protocol-error]');await page.evaluate(()=>window.__protocolRestore());await page.click('[data-protocol-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-refresh]').disabled);assert.equal(await page.$eval('[data-protocol-withdraw-reason]',n=>n.value),'A confirmed safety regression requires withdrawal and review.');results.push({width:375,mode:'protocol_withdrawal_draft_survives_permission_refresh',passed:true});
  await visit('history');let ids=await page.$$eval('[data-protocol-history-id]',nodes=>nodes.map(n=>Number(n.dataset.protocolHistoryId)));assert.equal(ids.length,20);await page.evaluate(()=>window.__protocolAddHistory());
  await page.click('[data-protocol-history-next]');await page.waitForSelector('[data-protocol-history-id="25"]');ids.push(...await page.$$eval('[data-protocol-history-id]',nodes=>nodes.map(n=>Number(n.dataset.protocolHistoryId))));
  await page.click('[data-protocol-history-next]');await page.waitForSelector('[data-protocol-history-id="5"]');ids.push(...await page.$$eval('[data-protocol-history-id]',nodes=>nodes.map(n=>Number(n.dataset.protocolHistoryId))));assert.deepEqual(ids,Array.from({length:45},(_,i)=>45-i));
  await page.click('[data-protocol-read="1"]');await page.waitForSelector('[data-protocol-summary]');assert.equal((await writes()).length,0);await check();results.push({width:375,mode:'protocol_history_keyset_pages_and_complete_historical_record',passed:true});
  for(const mode of ['unsupported','record-error','xss','corrupt-sample']){
   await visit(mode);await page.click('[data-protocol-read="45"]');await page.waitForSelector('[data-protocol-record]');
   if(mode==='unsupported')await page.waitForSelector('[data-protocol-unsupported]');
   if(mode==='corrupt-sample'){await page.waitForSelector('[data-protocol-unsupported]');assert.equal(await page.$('[data-protocol-summary]'),null);}
   if(mode==='record-error'){await page.waitForSelector('[data-protocol-record] [role=alert]');await page.click('[data-protocol-record-refresh]');await page.waitForSelector('[data-protocol-summary]');}
   if(mode==='xss'){await page.waitForSelector('[data-protocol-summary]');assert.equal(await page.$('[data-protocol-panel] img'),null);assert.equal(await page.evaluate(()=>window.__protocolXss),undefined);}
   assert.equal((await writes()).length,0);await check();results.push({width:375,mode:`protocol_${mode}_safe_record_display`,passed:true});
  }
  await visit('standalone');await page.click('[data-protocol-read="45"]');await page.waitForSelector('[data-protocol-summary]');
  assert.equal(await page.$('[data-protocol-start]'),null);assert.equal(await page.evaluate(()=>(window.__protocolReads||[]).some(row=>row.kind==='candidate')),false);
  assert.equal((await writes()).length,0);await check();results.push({width:375,mode:'protocol_standalone_history_without_any_current_proposal',passed:true});
 }finally{page.off('dialog',accept);}
};
