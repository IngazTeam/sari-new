const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
  const visit=async(state,lang='en')=>{await page.goto(`${origin}/?case=learning-review-${state}&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-policy-review]');};
  const accept=dialog=>dialog.accept();page.on('dialog',accept);
  async function layout(){
    const result=await page.$eval('[data-policy-review]',n=>({overflow:document.documentElement.scrollWidth>innerWidth,keys:n.innerText.includes('merchantUx.'),
      wideIntro:innerWidth>=640||n.querySelector('[data-policy-intro]').getBoundingClientRect().width>n.getBoundingClientRect().width*0.8,
      controls:[...n.querySelectorAll('button,select')].filter(x=>x.getClientRects().length).map(x=>({height:x.getBoundingClientRect().height,type:x.tagName==='BUTTON'?x.type:'select'})),
      areas:[...n.querySelectorAll('textarea')].map(x=>({font:parseFloat(getComputedStyle(x).fontSize),label:!!document.querySelector(`label[for="${CSS.escape(x.id)}"]`)}))}));
    assert.equal(result.overflow,false);assert.equal(result.keys,false);assert.equal(result.wideIntro,true);assert.ok(result.controls.every(x=>x.height>=44&&x.type!=='submit'));assert.ok(result.areas.every(x=>x.font>=16&&x.label));
  }
  async function fill(fail=false){
    await page.click('[data-policy-start]');await page.waitForSelector('[data-policy-editor]');
    for(let index=0;index<8;index++){
      assert.equal(await page.$eval('[data-policy-verdict=candidate]',n=>n.value),'');
      await page.type('[data-policy-response=baseline]',`Observed baseline response for case ${index+1}.`);
      await page.type('[data-policy-response=candidate]',`Observed candidate response for case ${index+1}.`);
      await page.select('[data-policy-verdict=baseline]','pass');await page.select('[data-policy-verdict=candidate]',fail&&index===7?'fail':'pass');
      await page.type('[data-policy-reason]',`The inspected answers support this synthetic assessment for case ${index+1}.`);
      if(index<7)await page.click('[data-policy-next]');
    }
    assert.equal(await page.$eval('[data-policy-save]',n=>n.disabled),true);
    await page.focus('[data-policy-attestation]');await page.keyboard.press('Space');
    assert.equal(await page.$eval('[data-policy-save]',n=>n.disabled),false);
  }
  try{
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit('ready',lang);
      assert.equal(await page.evaluate(()=>window.__policyInputs),undefined);const fail=width===320&&lang==='en';await fill(fail);await layout();
      await page.click('[data-policy-step="0"]');assert.match(await page.$eval('[data-policy-response=baseline]',n=>n.value),/case 1/);
      assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H4');await page.click('[data-policy-step="7"]');
      await page.type('[data-policy-reason]',' Additional observation.');assert.equal(await page.$eval('[data-policy-attestation]',n=>n.checked),false);
      await page.click('[data-policy-attestation]');
      if([375,1440].includes(width))await(await page.$('[data-policy-review]')).screenshot({path:path.join(output,`learning-policy-review-${lang}-${width}.png`)});
      await page.$eval('[data-policy-save]',n=>{n.click();n.click();});
      await page.waitForSelector('[data-policy-saved]');await page.waitForFunction(()=>!document.querySelector('[data-policy-refresh]').disabled);
      const inputs=await page.evaluate(()=>window.__policyInputs);assert.equal(inputs.length,1);assert.equal(inputs[0].cases.length,8);assert.match(inputs[0].requestId,/^[a-f0-9-]{36}$/);
      assert.equal(inputs[0].sourceDigest,'a'.repeat(64));assert.equal(inputs[0].suiteDigest,'5765aa2a99a71aebc4b5fbacd1d50c438b149037a9ea11c6ce382c277b0ea7e7');assert.equal(inputs[0].expectedRevision,0);assert.equal(inputs[0].styleOnly,true);
      assert.equal('merchantId'in inputs[0],false);assert.equal('actorUserId'in inputs[0],false);assert.equal('activate'in inputs[0],false);
      assert.equal(await page.$eval('[data-policy-stage]',n=>n.dataset.policyStage),`offline_review_${fail?'failed':'passed'}`);
      assert.equal(await page.$('[data-policy-editor]'),null);await page.click('[data-policy-audit] > summary');await layout();
      results.push({width,lang,mode:'policy_review_eight_cases_keyboard_attestation_single_save_audit',passed:true});
    }
    for(const state of ['readonly','ineligible','loading','error','fetching','passed','failed','stale','xss','unsupported','changed-suite'])for(const lang of ['ar','en']){
      await page.setViewport({width:375,height:812});await visit(state,lang);
      if(state==='readonly')assert.equal(await page.$('[data-policy-start]'),null);
      if(['ineligible','fetching','unsupported','changed-suite'].includes(state))assert.equal(await page.$eval('[data-policy-start]',n=>n.disabled),true);
      if(['error','loading'].includes(state))assert.equal(await page.$('[data-policy-stage]'),null);
      if(state==='error'){await page.click('[data-policy-refresh]');await page.waitForSelector('[data-policy-start]');}
      if(['passed','failed','stale','xss'].includes(state)){await page.click('[data-policy-history] > summary');await page.click('[data-policy-audit] > summary');}
      if(state==='xss'){await page.click('[data-policy-audit] details > summary');await page.click('[data-policy-evidence] > summary');assert.equal(await page.$('[data-policy-review] img'),null);assert.equal(await page.evaluate(()=>window.__policyXss),undefined);}
      await layout();assert.equal(await page.evaluate(()=>window.__policyInputs),undefined);
      results.push({width:375,lang,mode:`policy_review_${state}`,passed:true});
    }
    for(const state of ['write-unknown','write-outage']){
      await visit(state);await fill();await page.click('[data-policy-save]');await page.waitForSelector('[data-policy-uncertain]');await page.waitForFunction(()=>!document.querySelector('[data-policy-retry]').disabled);
      assert.equal(await page.$eval('[data-policy-fields]',n=>n.disabled),true);assert.equal(await page.$('[data-policy-restart]'),null);
      await page.click('[data-policy-retry]');await page.waitForSelector('[data-policy-saved]');await page.waitForFunction(()=>!document.querySelector('[data-policy-refresh]').disabled);
      const inputs=await page.evaluate(()=>window.__policyInputs);assert.equal(inputs.length,2);assert.deepEqual(inputs[0],inputs[1]);
      assert.equal(await page.$eval('[data-policy-review]',n=>n.innerText.includes('private')),false);results.push({width:375,mode:`policy_review_${state}_same_request`,passed:true});
    }
    await visit('write-conflict');await fill();await page.click('[data-policy-save]');await page.waitForSelector('[data-policy-changed]');await page.waitForFunction(()=>!document.querySelector('[data-policy-refresh]').disabled);
    assert.equal(await page.$('[data-policy-retry]'),null);assert.equal(await page.$eval('[data-policy-fields]',n=>n.disabled),true);
    await page.click('[data-policy-restart]');assert.equal(await page.$eval('[data-policy-response=baseline]',n=>n.value),'');assert.equal(await page.evaluate(()=>window.__policyInputs.length),1);
    results.push({width:375,mode:'policy_review_conflict_requires_explicit_new_draft',passed:true});
    await visit('refresh-error');await fill();await page.click('[data-policy-save]');await page.waitForSelector('[data-policy-saved]');await page.waitForSelector('[data-policy-error]');
    assert.equal(await page.$('[data-policy-start]'),null);assert.equal(await page.evaluate(()=>window.__policyInputs.length),1);results.push({width:375,mode:'policy_review_saved_receipt_survives_refresh_error',passed:true});
    await visit('refresh-stale');await fill();await page.click('[data-policy-save]');await page.waitForSelector('[data-policy-saved]');await page.waitForFunction(()=>!document.querySelector('[data-policy-refresh]').disabled);
    assert.equal(await page.$eval('[data-policy-start]',n=>n.disabled),true);results.push({width:375,mode:'policy_review_stale_read_after_save_cannot_start_new_review',passed:true});
    await visit('ready');await fill();await page.click('[data-policy-refresh]');assert.equal(await page.$eval('[data-policy-fields]',n=>n.disabled),true);
    await page.waitForFunction(()=>!document.querySelector('[data-policy-refresh]').disabled);assert.equal(await page.$eval('[data-policy-attestation]',n=>n.checked),false);
    assert.match(await page.$eval('[data-policy-response=candidate]',n=>n.value),/Observed candidate/);results.push({width:375,mode:'policy_review_refresh_preserves_answers_requires_reconfirmation',passed:true});
    for(const event of ['source','role']){
      await visit('ready');await fill();await page.evaluate(event=>event==='source'?window.__changePolicySource():window.__revokePolicyRole(),event);
      await page.waitForFunction(()=>document.querySelector('[data-policy-fields]').disabled);assert.equal(await page.$eval('[data-policy-attestation]',n=>n.checked),false);
      assert.match(await page.$eval('[data-policy-response=candidate]',n=>n.value),/Observed candidate/);assert.equal(await page.evaluate(()=>window.__policyInputs),undefined);
      if(event==='source'){await page.click('[data-policy-restart]');assert.equal(await page.$eval('[data-policy-response=baseline]',n=>n.value),'');}
      else assert.equal(await page.$('[data-policy-restart]'),null);
      results.push({width:375,mode:`policy_review_${event}_changes_preserve_and_lock_draft`,passed:true});
    }
    await page.goto(`${origin}/?case=learning-review-card&lang=ar`,{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>window.__policyReads),undefined);
    await page.click('details > summary');await page.click('[data-policy-review-open]');await page.waitForSelector('[data-policy-start]');await page.click('[data-policy-start]');await page.type('[data-policy-response=baseline]','Keep this draft.');
    await page.click('[data-policy-review-open]');await page.click('[data-policy-review-open]');assert.equal(await page.$eval('[data-policy-response=baseline]',n=>n.value),'Keep this draft.');
    assert.equal(await page.evaluate(()=>window.__policyReads),1);results.push({width:375,lang:'ar',mode:'policy_review_lazy_entry_preserves_collapsed_draft',passed:true});
    await page.goto('about:blank');
  }finally{page.off('dialog',accept);}
};
