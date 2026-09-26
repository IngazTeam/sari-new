const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
  const accept=d=>d.accept();page.on('dialog',accept);
  const add=(mode,width=390,lang='ar')=>results.push({mode:`reply_send_${mode}`,width,lang,passed:true});
  async function open(mode='ready',lang='ar',select=true){
    await page.goto(`${origin}/?case=reply-send-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.click('[data-send-open]');
    if(select){await page.waitForSelector('[data-send-account]');await page.select('[data-send-account]','5');}
  }
  async function confirm(){await page.waitForSelector('[data-send-preview]');assert.equal(await page.$eval('[data-send-submit]',n=>n.disabled),true);
    await page.type('[data-send-reason]','I checked the recipient, business facts and the complete original reply.');await page.click('[data-send-verify]');await page.click('[data-send-authorize]');
    assert.equal(await page.$eval('[data-send-submit]',n=>n.disabled),false);}
  async function layout(){const s=await page.$eval('[data-send-panel]',n=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:n.innerText.includes('merchantUx.'),
    heights:[...n.querySelectorAll('button,select')].filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect().height),
    fields:[...n.querySelectorAll('textarea,select')].map(b=>parseFloat(getComputedStyle(b).fontSize))}));assert.equal(s.overflow,false);assert.equal(s.raw,false);assert.ok(s.heights.every(h=>h>=44));assert.ok(s.fields.every(v=>v>=16));}
  try{
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?844:1000});await open('ready',lang);await confirm();await layout();
      if([375,1440].includes(width))await page.screenshot({path:path.join(output,`reply-send-${lang}-${width}.png`),fullPage:true});
      await page.$eval('[data-send-submit]',n=>{n.click();n.click();});await page.waitForSelector('[data-send-receipt]');await layout();
      const writes=await page.evaluate(()=>window.__sendWrites);assert.equal(writes.length,1);for(const f of ['merchantId','actorUserId','recipient','responseText','token','authorizationDigest'])assert.equal(f in writes[0],false);
      assert.equal(await page.$('[data-send-submit]'),null);add('responsive_explicit_send',width,lang);
    }
    await page.setViewport({width:390,height:844});
    for(const mode of ['unknown','mismatch-actorUserId','mismatch-requestId','mismatch-recipient','mismatch-responseText']){
      await open(mode);await confirm();await page.click('[data-send-submit]');await page.waitForSelector('[data-send-unknown]');
      assert.equal(await page.$('[data-send-receipt]'),null);assert.equal(await page.$('[data-send-submit]'),null);
      await page.click('[data-send-refresh]');await page.waitForSelector('[data-send-receipt]');assert.equal((await page.evaluate(()=>window.__sendWrites)).length,1);add(`${mode}_read_only_recovery`);
    }
    await open('outage');await confirm();await page.click('[data-send-submit]');await page.waitForSelector('[data-send-unknown]');
    await page.click('[data-send-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-send-refresh]').disabled);
    assert.equal(await page.$('[data-send-submit]'),null);assert.equal(await page.$eval('[data-send-locked]',n=>n.dataset.sendLocked),'true');
    assert.equal((await page.evaluate(()=>window.__sendWrites)).length,1);assert.equal(await page.$eval('[data-send-panel]',n=>n.innerText.includes('private')),false);add('absent_receipt_does_not_disprove_inflight_request');
    for(const mode of ['not_attempted','unknown-status','suppressed','rejected','delivered','read','failed','slow']){
      await open(mode);await confirm();await page.click('[data-send-submit]');await page.waitForSelector('[data-send-receipt]');
      await page.click('[data-send-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-send-refresh]').disabled);
      assert.equal((await page.evaluate(()=>window.__sendWrites)).length,1);assert.equal(await page.$('[data-send-submit]'),null);add(`${mode}_never_resends`);
    }
    for(const mode of ['actor','basis','permission','error']){
      await open();await confirm();await page.evaluate(k=>window.__sendChange(k),mode);
      await page.waitForFunction(()=>!document.querySelector('[data-send-submit]')||document.querySelector('[data-send-submit]').disabled);
      const checked=await page.$$eval('[data-send-verify],[data-send-authorize]',nodes=>nodes.some(n=>n.checked));assert.equal(checked,false);add(`${mode}_locks_confirmation`);
    }
    for(const mode of ['expired','quota','unavailable','no-account','loading','read-error','fetching','foreign','malformed']){
      await open(mode,'en',!['no-account','loading','read-error','fetching','foreign','malformed'].includes(mode));await layout();
      assert.equal(await page.evaluate(()=>window.__sendWrites),undefined);assert.equal(await page.$eval('[data-send-panel]',n=>!!n.querySelector('[data-send-submit]:not(:disabled)')),false);add(`${mode}_no_send`,390,'en');
    }
    await open();await confirm();await page.select('[data-send-account]','6');await page.waitForFunction(()=>!document.querySelector('[data-send-verify]').checked);
    assert.equal(await page.$eval('[data-send-submit]',n=>n.disabled),true);await page.click('[data-send-open]');await page.click('[data-send-open]');
    assert.equal(await page.$eval('[data-send-authorize]',n=>n.checked),false);assert.ok((await page.$eval('[data-send-reason]',n=>n.value)).includes('checked'));add('account_change_and_hide_reset_confirmation');
    await open('xss');await confirm();await layout();assert.equal(await page.$('[data-send-original] img'),null);assert.equal(await page.evaluate(()=>window.__sendXss),undefined);
    await page.click('[data-send-submit]');await page.waitForSelector('[data-send-receipt]');await layout();assert.equal(await page.evaluate(()=>window.__sendXss),undefined);add('escaped_recipient_and_message');
    await open('ready','en',false);await page.focus('[data-send-account]');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForSelector('[data-send-preview]');
    await page.focus('[data-send-reason]');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-send-verify')),true);add('keyboard_and_explicit_checks');
  }finally{page.off('dialog',accept);}
};
