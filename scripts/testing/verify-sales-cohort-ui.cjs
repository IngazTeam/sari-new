const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async (page, origin, output, results) => {
 const accept = dialog => dialog.accept(); page.on('dialog', accept);
 const writes = () => page.evaluate(() => window.__cohortWrites || []);
 const visit = async (mode='ready', lang='ar') => {
  await page.goto(`${origin}/?case=cohort-${mode}&lang=${lang}`, { waitUntil:'networkidle0' });
  await page.click('[data-protocol-open]'); await page.click('[data-protocol-read="45"]'); await page.waitForSelector('[data-protocol-record]');
  assert.equal(await page.evaluate(()=>window.__cohortReads),undefined,'Rules query must be lazy');
  await page.click('[data-cohort-open]'); await page.waitForSelector('[data-cohort-panel]');
 };
 const check = async () => {
  const state=await page.$eval('[data-cohort-panel]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:node.innerText.includes('merchantUx.'),private:node.innerText.includes('private'),
   controls:[...node.querySelectorAll('button,input:not([type=checkbox]),textarea')].filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),button:n.tagName==='BUTTON',label:n.tagName==='BUTTON'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`),submit:n.tagName==='BUTTON'&&n.type==='submit'})),
   checkboxes:[...node.querySelectorAll('input[type=checkbox]')].filter(n=>n.getClientRects().length).map(n=>n.closest('label')?.getBoundingClientRect().height)}));
  assert.equal(state.overflow,false);assert.equal(state.keys,false);assert.equal(state.private,false);
  assert.ok(state.controls.every(n=>n.height>=44&&n.label&&!n.submit));assert.ok(state.controls.filter(n=>!n.button).every(n=>n.font>=16));assert.ok(state.checkboxes.every(height=>height>=44));
 };
 const set = values => page.evaluate(values => {for(const [key,value]of Object.entries(values)){const node=document.querySelector(`[data-cohort-field="${key}"]`);Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}},values);
 const fill = async () => {
  await page.click('[data-cohort-start]');await page.waitForSelector('[data-cohort-editor]');assert.equal(await page.$eval('[data-cohort-next]',n=>n.disabled),true);
  await set({minimum:'٢',maximum:'۴۰۰۰',terms:' OFFER \noffer',phones:'+966500000201\n966500000201',review:'These explicit rules match the registered qualification and exclusions.'});
  await page.focus('[data-cohort-stage=new]');await page.keyboard.press('Space');await check();
  assert.equal(await page.$eval('[data-protocol-withdraw-reason]',n=>n.disabled),true);assert.equal(await page.$eval('[data-protocol-read="45"]',n=>n.disabled),true);
  await page.click('[data-cohort-next]');await page.waitForSelector('[data-cohort-summary]');assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);
  await page.focus('[data-cohort-consent]');await page.keyboard.press('Space');assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),false);
 };
 const save = async () => {await page.click('[data-cohort-save]');await page.waitForSelector('[data-cohort-saved]');await page.waitForSelector('[data-cohort-audit]');await page.waitForFunction(()=>!document.querySelector('[data-cohort-refresh]').disabled);};
 const push = mode => results.push({width:375,mode:`cohort_${mode}`,passed:true});
 try {
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']) {
   await page.setViewport({width,height:width<500?812:900});await visit('ready',lang);assert.equal((await writes()).length,0);await fill();await check();
   if([375,1440].includes(width))await(await page.$('[data-cohort-panel]')).screenshot({path:path.join(output,`sales-cohort-review-${lang}-${width}.png`)});
   await save();await check();const attempts=await writes();assert.equal(attempts.length,1);assert.deepEqual(attempts[0].rules.requiredAnyTerms,['offer']);assert.deepEqual(attempts[0].rules.excludedPhones,['966500000201']);assert.equal(attempts[0].rules.minimumCharacters,2);assert.equal(attempts[0].rules.maximumCharacters,4000);
   assert.equal('merchantId'in attempts[0],false);assert.equal('activate'in attempts[0],false);assert.match(attempts[0].requestId,/^[a-f0-9-]{36}$/);assert.equal(await page.$('[data-cohort-start]'),null);
   assert.equal(await page.$eval('[data-protocol-withdraw-reason]',n=>n.disabled),false);
   results.push({width,lang,mode:'cohort_keyboard_normalized_review_explicit_freeze_immutable_receipt',passed:true});
  }
  await page.setViewport({width:375,height:812});
  for(const mode of ['unknown','outage','receipt-mismatch']) {
   await visit(mode);await fill();await page.click('[data-cohort-save]');await page.waitForSelector('[data-cohort-unknown]');await page.waitForFunction(()=>!document.querySelector('[data-cohort-retry]').disabled);
   assert.equal(await page.$('[data-cohort-discard]'),null);assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-protocol-read="45"]',n=>n.disabled),true);
   await page.click('[data-cohort-open]');await page.click('[data-cohort-open]');await page.click('[data-cohort-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-cohort-retry]').disabled);
   assert.equal((await writes()).length,1);await page.click('[data-cohort-retry]');await page.waitForSelector('[data-cohort-saved]');const attempts=await writes();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await check();push(`${mode}_identical_request_recovery`);
  }
  for(const mode of ['loading','fetching','read-error','unsupported','withdrawn','window_started','source_changed']) {
   await visit(mode);const start=await page.$('[data-cohort-start]');if(start)assert.equal(await start.evaluate(n=>n.disabled),true);assert.equal((await writes()).length,0);await check();push(`${mode}_no_write`);
  }
  await visit('read-error');await page.click('[data-cohort-refresh]');await page.waitForFunction(()=>document.querySelector('[data-cohort-start]')&&!document.querySelector('[data-cohort-start]').disabled);assert.equal((await writes()).length,0);push('read_recovery_without_write');
  for(const mode of ['frozen','deleted-actor','xss']) {
   await visit(mode);await page.waitForSelector('[data-cohort-audit]');assert.equal(await page.$('[data-cohort-start]'),null);assert.equal(await page.$('[data-cohort-panel] img'),null);assert.equal(await page.evaluate(()=>window.__cohortXss),undefined);assert.equal((await writes()).length,0);await check();push(`${mode}_safe_historical_record`);
  }
  await visit('conflict');await fill();await page.click('[data-cohort-save]');await page.waitForSelector('[data-cohort-changed]');assert.equal(await page.$('[data-cohort-unknown]'),null);assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);await check();push('definite_rejection_preserves_draft');
  await visit('refresh-error');await fill();await save();await page.waitForSelector('[data-cohort-read-error]');assert.equal(await page.$('[data-cohort-unknown]'),null);assert.equal((await writes()).length,1);push('committed_receipt_survives_refresh_failure');
  await visit('slow');await fill();await page.$eval('[data-cohort-save]',n=>{n.click();n.click();});await page.waitForSelector('[data-cohort-saved]');assert.equal((await writes()).length,1);push('same_tick_double_click_once');
  await visit();await fill();await page.click('[data-cohort-back]');await page.waitForSelector('[data-cohort-field=minimum]');await page.click('[data-cohort-next]');assert.equal(await page.$eval('[data-cohort-consent]',n=>n.checked),false);push('edit_requires_new_attestation');
  await visit();await fill();await page.click('[data-cohort-open]');await page.click('[data-cohort-open]');await page.waitForSelector('[data-cohort-summary]');await page.click('[data-protocol-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-refresh]').disabled);await page.waitForSelector('[data-cohort-summary]');assert.equal(await page.$eval('[data-cohort-consent]',n=>n.checked),false);assert.equal((await writes()).length,0);push('collapse_and_parent_refresh_preserve_locked_draft');
  await page.evaluate(()=>window.__cohortBlock());await page.waitForSelector('[data-cohort-stale]');assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);await page.click('[data-cohort-discard-consent]');await page.click('[data-cohort-discard]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-read="45"]').disabled);assert.equal(await page.$('[data-cohort-editor]'),null);push('changed_source_requires_explicit_discard');
  await visit();await fill();await page.evaluate(()=>window.__protocolRevoke());await page.waitForSelector('[data-protocol-error]');assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);await page.evaluate(()=>window.__protocolRestore());await page.click('[data-protocol-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-protocol-refresh]').disabled);await page.waitForSelector('[data-cohort-summary]');assert.equal(await page.$eval('[data-cohort-consent]',n=>n.checked),false);assert.equal((await writes()).length,0);push('revoked_access_keeps_draft_and_clears_consent');
  await visit();await fill();await page.evaluate(()=>window.__cohortReadError());await page.waitForSelector('[data-cohort-read-error]');assert.equal(await page.$eval('[data-cohort-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-cohort-consent]',n=>n.checked),false);assert.equal((await writes()).length,0);push('failed_read_never_reuses_old_authority');
  await visit();await page.type('[data-protocol-withdraw-reason]','A reason drafted for withdrawal must lock cohort changes.');assert.equal(await page.$eval('[data-cohort-start]',n=>n.disabled),true);push('withdrawal_draft_blocks_cohort_editor');
 } finally {page.off('dialog',accept);}
};
