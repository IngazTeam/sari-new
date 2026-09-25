const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
 const accept=d=>d.accept();page.on('dialog',accept);
 const visit=async(mode,lang='en')=>{await page.goto(`${origin}/?case=launch-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.click('[data-protocol-open]');await page.click('[data-protocol-read="45"]');await page.click('[data-launch-open]');await page.waitForSelector('[data-launch-panel]');};
 const writes=()=>page.evaluate(()=>window.__launchWrites||[]);
 const check=async()=>{const r=await page.$eval('[data-launch-panel]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:node.innerText.includes('merchantUx.'),private:node.innerText.includes('private '),controls:[...node.querySelectorAll('button,textarea,summary')].filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),textarea:n.tagName==='TEXTAREA',label:n.tagName!=='TEXTAREA'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`),submit:n.type==='submit'}))}));assert.equal(r.overflow,false);assert.equal(r.keys,false);assert.equal(r.private,false);assert.ok(r.controls.every(n=>n.h>=44&&n.label&&!n.submit));assert.ok(r.controls.filter(n=>n.textarea).every(n=>n.font>=16));};
 const fill=async(kind='authorize')=>{await page.click(`[data-launch-${kind}]`);await page.waitForSelector('[data-launch-reason]');await page.waitForFunction(()=>document.querySelector('[data-protocol-record-refresh]').disabled);
  await page.$eval('[data-launch-reason]',n=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'A documented operator decision after reviewing the plan, evidence and operational constraints.');n.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),true);for(const i of kind==='authorize'?[0,1]:[0]){await page.focus(`[data-launch-consent="${i}"]`);await page.keyboard.press('Space');}await page.waitForFunction(()=>!document.querySelector('[data-launch-save]').disabled);
 };
 const settle=async()=>{await page.waitForSelector('[data-launch-saved]');await page.waitForFunction(()=>!document.querySelector('[data-launch-refresh]').disabled);};
 const discard=async()=>{await page.click('[data-launch-discard-consent]');await page.click('[data-launch-discard]');await page.waitForFunction(()=>!document.querySelector('[data-launch-editor]'));};
 try{
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
   await page.setViewport({width,height:width<500?812:900});await visit('ready',lang);assert.equal((await writes()).length,0);await fill();await check();
   await page.focus('[data-launch-plan] > summary');await page.keyboard.press('Enter');assert.equal(await page.$eval('[data-launch-plan]',n=>n.open),true);await check();await page.keyboard.press('Enter');
   if([375,1440].includes(width))await(await page.$('[data-launch-panel]')).screenshot({path:path.join(output,`sales-launch-authorization-${lang}-${width}.png`)});
   await page.click('[data-launch-save]');await settle();assert.ok(await page.$('[data-launch-status="scheduled"]'));await fill('revoke');await check();await page.click('[data-launch-save]');await settle();
   assert.ok(await page.$('[data-launch-status="revoked"]'));assert.equal(await page.$('[data-launch-authorize]'),null);assert.equal(await page.$('[data-launch-revoke]'),null);
   await page.click('[data-launch-saved] > details > summary');await check();if([375,1440].includes(width))await(await page.$('[data-launch-panel]')).screenshot({path:path.join(output,`sales-launch-revocation-${lang}-${width}.png`)});
   const w=await writes();assert.equal(w.length,2);assert.equal(w[0].input.protocolId,45);assert.equal(w[1].input.launchId,12);assert.notEqual(w[0].input.requestId,w[1].input.requestId);
   for(const row of w)for(const field of ['actorUserId','operatorUserId','merchantId','activationAllowed','winner'])assert.equal(field in row.input,false);
   results.push({width,lang,mode:'launch_authorize_then_revoke_explicit_keyboard_and_receipts',passed:true});
  }
  await page.setViewport({width:375,height:812});
  for(const mode of ['loading','fetching','read-error','bad-status','no-approval','foreign','unsupported','mismatch-actor','expired']){
   await visit(mode);const button=await page.$('[data-launch-authorize]');if(button)assert.equal(await button.evaluate(n=>n.disabled),true);assert.equal((await writes()).length,0);await check();results.push({width:375,mode:`launch_${mode}_fails_closed`,passed:true});
  }
  for(const mode of ['scheduled','enrollment_open','enrollment_closed','revoked','stale','unavailable','removed-actor']){
   await visit(mode);assert.equal(await page.$('[data-launch-authorize]'),null);assert.ok(await page.$('[data-launch-record]'));await check();
   if(mode!=='revoked'){await fill('revoke');await page.click('[data-launch-save]');await settle();assert.ok(await page.$('[data-launch-status="revoked"]'));}
   results.push({width:375,mode:`launch_${mode}_historical_status_and_revocation`,passed:true});
  }
  for(const kind of ['authorize','revoke'])for(const suffix of ['unknown','mismatch','outage']){
   await visit(kind==='revoke'?`revoke-${suffix}`:suffix);await fill(kind);await page.click('[data-launch-save]');await page.waitForSelector('[data-launch-unknown]');await page.waitForFunction(()=>!document.querySelector('[data-launch-retry]').disabled);
   assert.equal(await page.$('[data-launch-discard]'),null);assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),true);await page.click('[data-launch-open]');await page.click('[data-launch-open]');await page.click('[data-launch-retry]');await settle();
   const w=await writes();assert.equal(w.length,2);assert.deepEqual(w[0],w[1]);await check();results.push({width:375,mode:`launch_${kind}_${suffix}_same_request_recovery`,passed:true});
  }
  for(const mode of ['retry-forbidden','revoked-recovery']){
   await visit(mode);await fill();await page.click('[data-launch-save]');await page.waitForSelector('[data-launch-unknown]');await page.waitForFunction(()=>!document.querySelector('[data-launch-retry]').disabled);await page.click('[data-launch-retry]');
   if(mode==='retry-forbidden'){await page.waitForFunction(()=>!document.querySelector('[data-launch-retry]').disabled);assert.ok(await page.$('[data-launch-unknown]'));assert.equal(await page.$('[data-launch-discard]'),null);await page.click('[data-launch-retry]');}
   await settle();const w=await writes();assert.equal(w.length,mode==='retry-forbidden'?3:2);for(const row of w)assert.deepEqual(row,w[0]);if(mode==='revoked-recovery')assert.ok(await page.$('[data-launch-status="revoked"]'));
   results.push({width:375,mode:`launch_${mode}_keeps_original_request`,passed:true});
  }
  for(const kind of ['authorize','revoke'])for(const suffix of ['conflict','refresh-error','slow']){
   await visit(kind==='revoke'?`revoke-${suffix}`:suffix);await fill(kind);await page.click('[data-launch-save]');
   if(suffix==='conflict'){await page.waitForSelector('[data-launch-changed]');await page.waitForFunction(()=>!document.querySelector('[data-launch-discard-consent]').disabled);assert.equal(await page.$eval('[data-launch-reason]',n=>n.value.length>30),true);assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),true);await discard();}
   else {if(suffix==='slow'){await page.click('[data-launch-save]');assert.equal(await page.$eval('[data-protocol-read="45"]',n=>n.disabled),true);}await settle();if(suffix==='refresh-error')await page.waitForSelector('[data-launch-refresh-error]');}
   assert.equal((await writes()).length,1);await check();results.push({width:375,mode:`launch_${kind}_${suffix}_preserves_state`,passed:true});
  }
  for(const kind of ['basis','actor','review','authorization']){
   await visit('ready');await fill();await page.evaluate(kind=>window.__launchChange(kind),kind);await page.waitForSelector('[data-launch-changed]');assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-launch-consent="0"]',n=>n.checked),false);assert.equal(await page.$eval('[data-launch-reason]',n=>n.value.length>30),true);assert.equal((await writes()).length,0);await discard();results.push({width:375,mode:`launch_changed_${kind}_invalidates_consent`,passed:true});
  }
  await visit('scheduled');await fill('revoke');await page.evaluate(()=>window.__launchChange('stale'));assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),false);await page.click('[data-launch-save]');await settle();results.push({width:375,mode:'launch_drift_does_not_prevent_revocation',passed:true});
  await visit('scheduled');await fill('revoke');await page.evaluate(()=>window.__launchChange('revocation'));await page.waitForSelector('[data-launch-changed]');assert.equal(await page.$eval('[data-launch-save]',n=>n.disabled),true);await discard();results.push({width:375,mode:'launch_external_revocation_preserves_draft',passed:true});
  await visit('ready');await fill();await page.click('[data-launch-open]');await page.click('[data-launch-open]');assert.equal(await page.$eval('[data-launch-consent="0"]',n=>n.checked),false);assert.equal(await page.$eval('[data-launch-reason]',n=>n.value.length>30),true);
  await page.evaluate(()=>window.__protocolRevoke());await page.waitForFunction(()=>document.querySelector('[data-launch-reason]').matches(':disabled'));await page.evaluate(()=>window.__protocolRestore());await page.waitForFunction(()=>!document.querySelector('[data-launch-reason]').matches(':disabled'));await discard();assert.equal(await page.$eval('[data-protocol-record-refresh]',n=>n.disabled),false);results.push({width:375,mode:'launch_hide_permission_loss_restore_and_discard',passed:true});
  await visit('xss');await page.click('[data-launch-record] > summary');await check();assert.equal(await page.$('[data-launch-panel] img'),null);assert.equal(await page.evaluate(()=>window.__launchXss),undefined);results.push({width:375,mode:'launch_untrusted_history_is_wrapped_text',passed:true});
 }catch(error){console.error(error.stack);console.error(JSON.stringify({launchCompleted:results.filter(r=>r.mode.startsWith('launch_')).map(r=>r.mode),state:await page.evaluate(()=>({url:location.href,body:document.querySelector('[data-launch-panel]')?.innerText,writes:window.__launchWrites}))}));throw error;}
 finally{page.off('dialog',accept);}
};
