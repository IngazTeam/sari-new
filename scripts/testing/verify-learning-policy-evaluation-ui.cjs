const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
 const accept=dialog=>dialog.accept();page.on('dialog',accept);
 const visit=async(mode,lang='en')=>{await page.goto(`${origin}/?case=evaluation-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});if(mode==='close')await page.click('[data-evaluation-open]');await page.waitForSelector('[data-evaluation-panel]');};
 const selectRun=async()=>{await page.select('[data-evaluation-select]','5');await page.waitForSelector('[data-evaluation-run]');};
 const check=async()=>{
  const layout=await page.$eval('[data-evaluation-panel]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:node.innerText.includes('merchantUx.'),private:node.innerText.includes('private'),
   controls:[...node.querySelectorAll('button,select')].filter(x=>x.getClientRects().length).map(x=>({h:x.getBoundingClientRect().height,type:x.tagName==='BUTTON'?x.type:'select'})),
   textareas:[...node.querySelectorAll('textarea')].map(x=>({font:parseFloat(getComputedStyle(x).fontSize),label:!!document.querySelector(`label[for="${CSS.escape(x.id)}"]`)}))}));
  assert.equal(layout.overflow,false);assert.equal(layout.keys,false);assert.equal(layout.private,false);assert.ok(layout.controls.every(x=>x.h>=44&&x.type!=='submit'));assert.ok(layout.textareas.every(x=>x.font>=16&&x.label));
 };
 const count=async(name)=>page.evaluate(name=>(window[`__eval${name}Inputs`]||[]).length,name);
 async function fillReview(){
  await page.click('[data-output-start]');await page.waitForSelector('[data-output-editor]');
  for(let i=0;i<32;i++){
   await page.evaluate(()=>{for(const arm of ['baseline','candidate'])for(const field of ['quote','reason']){
    const input=document.querySelector(`[data-output-${field}=${arm}]`),value=field==='quote'?document.querySelector(`[data-output-response=${arm}]`).textContent.slice(0,150):'The saved reply meets the stated criterion in this synthetic fixture.';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
   }});
   await page.select('[data-output-verdict=baseline]','pass');await page.select('[data-output-verdict=candidate]','pass');await page.select('[data-output-preference]','tie');
   if(i<31)await page.click('[data-output-next]');
  }
  await page.waitForFunction(()=>!document.querySelector('[data-output-attestation]').disabled);await page.focus('[data-output-attestation]');await page.keyboard.press('Space');
  assert.equal(await page.$eval('[data-output-save]',n=>n.disabled),false);
 }
 try{
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
   await page.setViewport({width,height:width<500?812:900});await visit('review-ready',lang);await selectRun();
   assert.equal(await count('Advance'),0);assert.equal(await count('Review'),0);await page.click('[data-output-start]');await page.waitForSelector('[data-output-editor]');await check();
   assert.equal(await page.$eval('[data-evaluation-select]',n=>n.disabled),true);assert.equal(await page.$eval('[data-output-save]',n=>n.disabled),true);
   if([375,1440].includes(width))await(await page.$('[data-evaluation-panel]')).screenshot({path:path.join(output,`policy-evaluation-review-${lang}-${width}.png`)});
   results.push({width,lang,mode:'evaluation_review_responsive_keyboard_targets_no_automatic_calls',passed:true});
  }
  for(const [width,lang]of [[375,'ar'],[1440,'en']]){
   await page.setViewport({width,height:900});await visit('ready',lang);await selectRun();
   assert.equal(await page.$eval('[data-evaluation-generate]',n=>n.disabled),true);await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');
   await page.waitForSelector('[data-evaluation-state=completed]',{timeout:30000});await page.waitForFunction(()=>!document.querySelector('[data-output-start]').disabled);
   const inputs=await page.evaluate(()=>window.__evalAdvanceInputs);assert.equal(inputs.length,64);assert.deepEqual(inputs.map(x=>x.expectedOrdinal),Array.from({length:64},(_,i)=>i));assert.ok(inputs.every(x=>Object.keys(x).sort().join(',')==='expectedOrdinal,runId'));
   await fillReview();await check();await page.click('[data-output-save]');await page.waitForSelector('[data-output-saved]');await page.waitForFunction(()=>!document.querySelector('[data-output-refresh]').disabled);
   assert.equal(await count('Review'),1);const review=await page.evaluate(()=>window.__evalReviewInputs[0]);assert.equal(review.cases.length,32);assert.equal(review.expectedRevision,0);assert.equal(review.reviewedAllOutputs,true);assert.equal('responses'in review,false);assert.equal('activate'in review,false);assert.equal('merchantId'in review,false);
   await page.click('[data-output-history] summary');await check();await(await page.$('[data-evaluation-panel]')).screenshot({path:path.join(output,`policy-evaluation-saved-${lang}-${width}.png`)});
   results.push({width,lang,mode:'evaluation_full_64_outputs_32_pair_review_and_audit',passed:true});
  }
  await page.setViewport({width:375,height:812});
  for(const mode of ['prepare','prepare-unknown','prepare-start-unknown']){
   await visit(mode);await page.click('[data-candidate-create]');
   if(mode==='prepare-unknown'){await page.waitForSelector('[data-candidate-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-candidate-retry]').disabled);await page.click('[data-candidate-retry]');}
   await page.waitForFunction(()=>!document.querySelector('[data-evaluation-create]').disabled);await page.click('[data-evaluation-create]');
   if(mode==='prepare-start-unknown'){await page.waitForSelector('[data-candidate-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-candidate-retry]').disabled);await page.click('[data-candidate-retry]');}
   await page.waitForSelector('[data-evaluation-run]');assert.equal(await count('Advance'),0);
   const name=mode==='prepare-unknown'?'Candidate':mode==='prepare-start-unknown'?'Start':null;if(name){const inputs=await page.evaluate(name=>window[`__eval${name}Inputs`],name);assert.equal(inputs.length,2);assert.deepEqual(inputs[0],inputs[1]);}
   await check();results.push({width:375,mode:`evaluation_${mode}_explicit_creation_idempotency`,passed:true});
  }
  for(const mode of ['advance-unknown','advance-outage']){
   await visit(mode);await selectRun();await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForSelector('[data-evaluation-uncertain]');
   assert.equal(await count('Advance'),1);assert.equal(await page.$eval('[data-evaluation-select]',n=>n.disabled),true);await page.click('[data-evaluation-retry]');await page.waitForFunction(()=>!document.querySelector('[data-evaluation-refresh]').disabled);
   const inputs=await page.evaluate(()=>window.__evalAdvanceInputs);assert.equal(inputs.length,2);assert.deepEqual(inputs[0],inputs[1]);assert.equal(await page.$eval('[data-evaluation-cost-consent]',n=>n.checked),false);await check();
   results.push({width:375,mode:`evaluation_${mode}_same_ordinal_without_auto_continuation`,passed:true});
  }
  for(const mode of ['pause','close']){
   await visit(mode);await selectRun();await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForFunction(()=>window.__evalAdvanceInputs?.length===1);
   await page.click(mode==='pause'?'[data-evaluation-pause]':'[data-evaluation-open]');await new Promise(r=>setTimeout(r,450));assert.equal(await count('Advance'),1);
   if(mode==='close')await page.click('[data-evaluation-open]');await page.waitForFunction(()=>!document.querySelector('[data-evaluation-refresh]').disabled);await check();
   results.push({width:375,mode:`evaluation_${mode}_stops_after_inflight_sample`,passed:true});
  }
  await visit('cancel-unknown');await selectRun();
  await page.$eval('[data-evaluation-cancel-consent]',n=>n.closest('details').open=true);await page.click('[data-evaluation-cancel-consent]');await page.click('[data-evaluation-cancel]');await page.waitForSelector('[data-evaluation-uncertain]');await page.click('[data-evaluation-retry]');await page.waitForSelector('[data-evaluation-state=cancelled]');
  assert.equal(await count('Advance'),0);assert.equal(await count('Cancel'),2);results.push({width:375,mode:'evaluation_cancel_unknown_idempotent_no_generation',passed:true});
  for(const mode of ['unsupported','waiting','halt-after-one','advance-conflict','generation-read-error','halted','cancelled','run-error','run-loading','candidate-stale','prepare-ineligible','candidate-error','candidate-loading']){
   await visit(mode);if(!mode.startsWith('candidate-')||mode==='candidate-stale'){
    if(mode==='prepare-ineligible')assert.equal(await page.$eval('[data-candidate-create]',n=>n.disabled),true);
    else{await selectRun();if(['waiting','halt-after-one','advance-conflict','generation-read-error'].includes(mode)){await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForFunction(()=>!document.querySelector('[data-evaluation-refresh]').disabled);assert.equal(await count('Advance'),1);}
    if(mode==='unsupported')assert.equal(await page.$eval('[data-evaluation-generate]',n=>n.disabled),true);}
   }
   await check();results.push({width:375,mode:`evaluation_${mode}_fails_closed`,passed:true});
  }
  for(const mode of ['review-unknown','review-outage','review-conflict','review-refresh-stale']){
   await visit(mode);await selectRun();await fillReview();await page.click('[data-output-save]');
   if(['review-unknown','review-outage'].includes(mode)){await page.waitForSelector('[data-output-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-output-retry]').disabled);assert.equal(await page.$('[data-output-discard]'),null);await page.click('[data-output-retry]');await page.waitForSelector('[data-output-saved]');const inputs=await page.evaluate(()=>window.__evalReviewInputs);assert.equal(inputs.length,2);assert.deepEqual(inputs[0],inputs[1]);}
   else if(mode==='review-conflict'){await page.waitForSelector('[data-output-changed]');assert.equal(await page.$eval('[data-output-save]',n=>n.disabled),true);}
   else{await page.waitForSelector('[data-output-saved]');await page.waitForFunction(()=>!document.querySelector('[data-output-refresh]').disabled);assert.equal(await page.$eval('[data-output-start]',n=>n.disabled),true);}
   await check();results.push({width:375,mode:`evaluation_${mode}_draft_authority`,passed:true});
  }
  for(const mode of ['review-unsupported','review-stale']){await visit(mode);await selectRun();assert.equal(await page.$eval('[data-output-start]',n=>n.disabled),true);results.push({width:375,mode:`evaluation_${mode}_blocked`,passed:true});}
  for(const event of ['source','role']){
   await visit('review-ready');await selectRun();await page.click('[data-output-start]');await page.type('[data-output-reason=baseline]','Keep this existing draft');
   await page.evaluate(event=>event==='source'?window.__changeEvaluationSource():window.__revokeEvaluationRole(),event);
   await page.waitForFunction(()=>{const fields=document.querySelector('[data-output-fields]');return !fields||fields.disabled;},{timeout:3000});
   const fields=await page.$('[data-output-fields]');assert.ok(!fields||await fields.evaluate(n=>n.disabled));assert.equal(await count('Review'),0);
   if(event==='source'){assert.equal(await page.$eval('[data-output-reason=baseline]',n=>n.value),'Keep this existing draft');await page.click('[data-output-discard-consent]');await page.click('[data-output-discard]');assert.equal(await page.$('[data-output-editor]'),null);}
   results.push({width:375,mode:`evaluation_changed_${event}_locks_draft`,passed:true});
  }
  await visit('xss');await selectRun();await page.click('[data-output-start]');await check();assert.equal(await page.$('[data-evaluation-panel] img'),null);assert.equal(await page.evaluate(()=>window.__evaluationXss),undefined);
  await page.type('[data-output-quote=baseline]','not in answer');assert.equal(await page.$eval('[data-output-save]',n=>n.disabled),true);results.push({width:375,mode:'evaluation_untrusted_text_escaped_and_invalid_quote_blocked',passed:true});
  for(const collapse of ['review','proposal']){
   await page.goto(`${origin}/?case=learning-review-card&lang=ar`,{waitUntil:'networkidle0'});await page.click('details > summary');await page.click('[data-policy-review-open]');await page.click('[data-evaluation-open]');await selectRun();
   await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForFunction(()=>window.__evalAdvanceInputs?.length>=1);
   const atClose=await page.evaluate(selector=>{const count=window.__evalAdvanceInputs.length;document.querySelector(selector).click();return count;},collapse==='review'?'[data-policy-review-open]':'details > summary');
   await new Promise(r=>setTimeout(r,450));assert.equal(await count('Advance'),atClose);results.push({width:375,mode:`evaluation_integrated_card_${collapse}_disclosure_stops_batch`,passed:true});
  }
  await page.goto(`${origin}/?case=learning-review-readonly`,{waitUntil:'networkidle0'});assert.equal(await page.$('[data-evaluation-open]'),null);results.push({width:375,mode:'evaluation_management_controls_hidden_for_readonly_role',passed:true});
  await visit('revoke');await selectRun();await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForFunction(()=>window.__evalAdvanceInputs?.length===1);
  await page.evaluate(()=>window.__revokeEvaluationRole());await new Promise(r=>setTimeout(r,450));assert.equal(await count('Advance'),1);results.push({width:375,mode:'evaluation_revoked_access_stops_batch_after_current_reply',passed:true});
  await visit('pause');await selectRun();await page.click('[data-evaluation-cost-consent]');await page.click('[data-evaluation-generate]');await page.waitForFunction(()=>window.__evalAdvanceInputs?.length===1);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await new Promise(r=>setTimeout(r,450));assert.equal(await count('Advance'),1);results.push({width:375,mode:'evaluation_simulated_background_tab_stops_batch',passed:true});
 }finally{page.off('dialog',accept);}
};
