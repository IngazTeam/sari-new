const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
 const accept=dialog=>dialog.accept();page.on('dialog',accept);
 const visit=async(mode,lang='en')=>{await page.goto(`${origin}/?case=plan-review-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.click('[data-protocol-open]');await page.click('[data-protocol-read="45"]');await page.click('[data-plan-review-open]');await page.waitForSelector('[data-plan-review-panel]');};
 const writes=()=>page.evaluate(()=>window.__reviewWrites||[]);
 const check=async()=>{const r=await page.$eval('[data-plan-review-panel]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:node.innerText.includes('merchantUx.'),private:node.innerText.includes('private '),controls:[...node.querySelectorAll('button,textarea,select')].filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),button:n.tagName==='BUTTON',label:n.tagName==='BUTTON'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`),submit:n.type==='submit'}))}));assert.equal(r.overflow,false);assert.equal(r.keys,false);assert.equal(r.private,false);assert.ok(r.controls.every(n=>n.h>=44&&n.label&&!n.submit));assert.ok(r.controls.filter(n=>!n.button).every(n=>n.font>=16));};
 const set=async()=>page.evaluate(()=>{for(const node of document.querySelectorAll('[data-plan-review-field]')){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,'Reviewed the complete evidence, assumptions and operational constraints for this planning decision.');node.dispatchEvent(new Event('input',{bubbles:true}));}});
 const start=async()=>{await page.click('[data-plan-review-start]');await page.waitForSelector('[data-plan-review-step="0"]');assert.equal(await page.$eval('[data-protocol-withdraw-reason]',n=>n.disabled),true);};
 const comparisons=async()=>{await page.click('[data-plan-review-next]');await page.waitForSelector('[data-plan-review-step="1"]');assert.equal(await page.$eval('[data-plan-review-next]',n=>n.disabled),true);
  for(let i=0;i<32;i++){await page.waitForSelector(`[data-plan-review-comparison="${i}"]`);await page.focus('[data-plan-review-mark]');await page.keyboard.press('Enter');if(i<31)await page.click('[data-plan-review-case-next]');}
  assert.equal(await page.$eval('[data-plan-review-next]',n=>n.disabled),false);
 };
 const fill=async(verdict='approved')=>{await start();await comparisons();await page.click('[data-plan-review-next]');await page.waitForSelector('[data-plan-review-step="2"]');await set();await page.select('[data-plan-review-verdict]',verdict);
  assert.equal(await page.$eval('[data-plan-review-save]',n=>n.disabled),true);for(const i of [0,1]){await page.focus(`[data-plan-review-consent="${i}"]`);await page.keyboard.press('Space');}assert.equal(await page.$eval('[data-plan-review-save]',n=>n.disabled),false);
 };
 try{
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
   await page.setViewport({width,height:width<500?812:900});await visit('ready',lang);assert.equal((await writes()).length,0);await start();await check();
   if([375,1440].includes(width))await(await page.$('[data-plan-review-panel]')).screenshot({path:path.join(output,`sales-planning-evidence-${lang}-${width}.png`)});
   await comparisons();await check();if([375,1440].includes(width))await(await page.$('[data-plan-review-panel]')).screenshot({path:path.join(output,`sales-planning-comparisons-${lang}-${width}.png`)});
   await page.click('[data-plan-review-next]');await set();await page.select('[data-plan-review-verdict]',lang==='ar'?'approved':'rejected');for(const i of [0,1])await page.click(`[data-plan-review-consent="${i}"]`);await check();
   if([375,1440].includes(width))await(await page.$('[data-plan-review-panel]')).screenshot({path:path.join(output,`sales-planning-decision-${lang}-${width}.png`)});
   await page.click('[data-plan-review-save]');await page.waitForSelector('[data-plan-review-saved]');await page.waitForFunction(()=>!document.querySelector('[data-plan-review-refresh]').disabled);await check();
   const w=await writes();assert.equal(w.length,1);assert.equal(w[0].protocolId,45);assert.equal(w[0].runId,9);assert.equal(w[0].expectedRevision,0);assert.equal(w[0].verdict,lang==='ar'?'approved':'rejected');assert.equal('actorUserId' in w[0],false);assert.equal('activate' in w[0],false);
   results.push({width,lang,mode:'planning_review_complete_evidence_32_comparisons_keyboard_and_saved_decision',passed:true});
  }
  await page.setViewport({width:375,height:812});
  for(const state of ['self','unavailable','loading','fetching','unsupported','wrong-protocol','missing-pair']){
   await visit(state);const startButton=await page.$('[data-plan-review-start]');if(startButton)assert.equal(await startButton.evaluate(n=>n.disabled),true);assert.equal((await writes()).length,0);await check();results.push({width:375,mode:`planning_review_${state}_blocks_new_decision`,passed:true});
  }
  for(const mode of ['unknown','mismatch','outage']){
   await visit(mode);await fill();await page.click('[data-plan-review-save]');await page.waitForSelector('[data-plan-review-unknown]');await page.waitForFunction(()=>!document.querySelector('[data-plan-review-retry]').disabled);
   assert.equal(await page.$('[data-plan-review-discard]'),null);assert.equal(await page.$eval('[data-plan-review-save]',n=>n.disabled),true);await page.click('[data-plan-review-open]');await page.click('[data-plan-review-open]');await page.click('[data-plan-review-retry]');await page.waitForSelector('[data-plan-review-saved]');
   const w=await writes();assert.equal(w.length,2);assert.deepEqual(w[0],w[1]);await check();results.push({width:375,mode:`planning_review_${mode}_same_request_recovery`,passed:true});
  }
  for(const mode of ['conflict','refresh-error','slow']){
   await visit(mode);await fill();await page.click('[data-plan-review-save]');
   if(mode==='conflict'){await page.waitForSelector('[data-plan-review-changed]');assert.equal(await page.$eval('[data-plan-review-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-plan-review-field="baselineAndSample"]',n=>n.value.length>30),true);}
   else {if(mode==='slow'){await page.click('[data-plan-review-save]');assert.equal(await page.$eval('[data-protocol-withdraw]',n=>n.disabled),true);}await page.waitForSelector('[data-plan-review-saved]');}
   if(mode==='refresh-error')await page.waitForSelector('[data-plan-review-refresh-error]');assert.equal((await writes()).length,1);await check();results.push({width:375,mode:`planning_review_${mode}_retains_confirmed_state`,passed:true});
  }
  for(const kind of ['basis','decision']){
   await visit('ready');await fill();await page.evaluate(kind=>kind==='basis'?window.__reviewChangeBasis():window.__reviewNewDecision(),kind);await page.waitForSelector('[data-plan-review-changed]');assert.equal(await page.$eval('[data-plan-review-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-plan-review-consent="0"]',n=>n.checked),false);assert.equal(await page.$eval('[data-plan-review-field="baselineAndSample"]',n=>n.value.length>30),true);assert.equal((await writes()).length,0);results.push({width:375,mode:`planning_review_changed_${kind}_preserves_draft_and_revokes_consent`,passed:true});
  }
  await visit('ready');await fill();await page.click('[data-plan-review-open]');await page.click('[data-plan-review-open]');assert.equal(await page.$eval('[data-plan-review-field="baselineAndSample"]',n=>n.value.length>30),true);assert.equal(await page.$eval('[data-plan-review-consent="0"]',n=>n.checked),false);
  await page.evaluate(()=>window.__protocolRevoke());await page.waitForFunction(()=>document.querySelector('[data-plan-review-field="baselineAndSample"]').matches(':disabled'));await page.evaluate(()=>window.__protocolRestore());await page.waitForFunction(()=>!document.querySelector('[data-plan-review-field="baselineAndSample"]').matches(':disabled'));
  await page.click('[data-plan-review-discard-consent]');await page.click('[data-plan-review-discard]');await page.waitForFunction(()=>!document.querySelector('[data-plan-review-editor]'));assert.equal(await page.$eval('[data-protocol-withdraw-reason]',n=>n.disabled),false);results.push({width:375,mode:'planning_review_hide_permission_loss_restore_and_explicit_discard',passed:true});
  for(const mode of ['history','history-error','historical-unavailable']){
   await visit(mode);assert.equal(await page.$$eval('[data-plan-review-history] [data-plan-review-record]',nodes=>nodes.length),20);await page.click('[data-plan-review-history-next]');
   if(mode==='history-error'){await page.waitForSelector('[data-plan-review-history] [role=alert]');await page.click('[data-plan-review-refresh]');}
   await page.waitForFunction(()=>document.querySelector('[data-plan-review-history] [data-plan-review-record]')?.getAttribute('data-plan-review-record')==='125');await page.click('[data-plan-review-history-back]');await page.waitForFunction(()=>document.querySelector('[data-plan-review-history] [data-plan-review-record]')?.getAttribute('data-plan-review-record')==='145');
   assert.equal((await writes()).length,0);results.push({width:375,mode:`planning_review_${mode}_bounded_history_without_current_approval`,passed:true});
  }
  await visit('xss');await start();await page.click('[data-plan-review-next]');await check();assert.equal(await page.$('[data-plan-review-panel] img'),null);assert.equal(await page.evaluate(()=>window.__reviewXss),undefined);
  // Finish the last draft through the UI before removing the dialog handler;
  // otherwise its real beforeunload guard blocks the next component suite.
  await page.click('[data-plan-review-discard-consent]');await page.click('[data-plan-review-discard]');await page.waitForFunction(()=>!document.querySelector('[data-plan-review-editor]'));
  results.push({width:375,mode:'planning_review_untrusted_evidence_is_text_and_wraps',passed:true});
 }catch(error){console.error(error.stack);console.error(JSON.stringify({planningCompleted:results.filter(r=>r.mode.startsWith('planning_review_')).map(r=>r.mode),state:await page.evaluate(()=>({url:location.href,body:document.querySelector('[data-plan-review-panel]')?.innerText,fields:[...document.querySelectorAll('[data-plan-review-field]')].map(n=>({field:n.dataset.planReviewField,disabled:n.disabled})),writes:(window.__reviewWrites||[]).length}))}));throw error;}
 finally{page.off('dialog',accept);}
};
