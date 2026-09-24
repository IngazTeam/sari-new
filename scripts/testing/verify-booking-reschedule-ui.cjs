const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,origin,output,results){
 const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=booking-reschedule-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});if(mode!=='empty')await page.waitForSelector('[data-booking-reschedule]');};
 const fill=async()=>{await page.type('[data-reschedule-reason]','Reviewed the exact customer reschedule request');await page.focus('[data-reschedule-attest]');await page.keyboard.press('Space');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en'])for(const mode of ['ready','unknown']){
  await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit(mode,lang);
  const button=mode==='ready'?'[data-reschedule-action="move"]':'[data-reschedule-action="verify"]';
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.$eval('[data-booking-reschedule]',n=>n.innerText.includes('merchantUx.')),false);
  assert.equal(await page.$eval(button,n=>n.disabled),true);await fill();await page.evaluate(()=>window.__changeReschedule());
  await page.waitForFunction(()=>!document.querySelector('[data-reschedule-attest]').checked);assert.equal(await page.$eval('[data-reschedule-reason]',n=>n.value),'');await fill();
  if(mode==='ready'&&lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-reschedule]')).screenshot({path:path.join(output,`booking-reschedule-${width}.png`)});
  await page.$eval(button,n=>{n.click();n.click();});await page.waitForFunction(()=>window.__rescheduleParentRefreshed===true);
  assert.equal(await page.evaluate(()=>window.__rescheduleCalls),1);assert.equal(await page.$('[data-reschedule-action="move"],[data-reschedule-action="verify"]'),null);
  const input=await page.evaluate(()=>window.__rescheduleInput);assert.equal(input.action,mode==='ready'?'move':'verify');assert.equal(input.evidence,'b'.repeat(64));assert.equal(input.reviewed,true);
  for(const key of ['merchantId','eventId','messageId','etag'])assert.equal(key in input,false);
  assert.equal(await page.$eval('[data-booking-reschedule]',n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),true);
  results.push({width,lang,mode:`booking_reschedule_${mode}_review_and_single_submit`,passed:true});
 }
 await page.setViewport({width:375,height:812});await visit('ready');await fill();await page.click('[data-reschedule-action="abandon"]');await page.waitForFunction(()=>window.__rescheduleParentRefreshed===true);assert.equal(await page.evaluate(()=>window.__rescheduleInput.action),'abandon');results.push({width:375,mode:'booking_reschedule_abandon_before_dispatch',passed:true});
 for(const mode of ['binding','financial','changed','consent','booking','inFlight','loading','error','fetching','applied','empty']){
  await visit(mode);assert.equal(await page.$$eval('[data-reschedule-action="move"],[data-reschedule-action="verify"]',ns=>ns.every(n=>n.disabled)),true);
  if(mode==='error'){await page.click('[data-reschedule-refresh]');await page.waitForSelector('[data-reschedule-attest]');assert.equal(await page.$eval('[data-reschedule-attest]',n=>n.checked),false);}
  if(mode==='empty')assert.equal(await page.$('[data-booking-reschedule]'),null);
  results.push({width:1440,mode:`booking_reschedule_blocked_${mode}`,passed:true});
 }
 for(const mode of ['write-error','refresh-error','parent-error']){
  await visit(mode);await fill();await page.click('[data-reschedule-action="move"]');await page.waitForFunction(()=>window.__rescheduleCalls===1&&!document.querySelector('[data-reschedule-refresh]').disabled);
  await page.waitForSelector('[data-booking-reschedule] [role=alert]');assert.equal(await page.$eval('[data-booking-reschedule]',n=>n.innerText.includes('private')),false);
  assert.equal(await page.$$eval('[data-reschedule-action="move"],[data-reschedule-action="verify"]',ns=>ns.every(n=>n.disabled)),true);assert.equal(await page.evaluate(()=>window.__rescheduleCalls),1);
  results.push({width:1440,mode:`booking_reschedule_${mode}_no_blind_retry`,passed:true});
 }
 for(const state of ['moving','move-unknown','reschedule-pending']){
  await page.goto(`${origin}/?case=booking-ops-calendar-${state}`,{waitUntil:'networkidle0'});
  assert.equal(await page.$eval('[data-booking-operations] select',n=>n.disabled),true);
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);
  results.push({width:1440,mode:`booking_reschedule_parent_guard_${state}`,passed:true});
 }
 await page.setViewport({width:375,height:812});await visit('xss');await page.click('[data-booking-reschedule] details:last-of-type summary');
 assert.equal(await page.$('[data-booking-reschedule] img'),null);assert.equal(await page.evaluate(()=>window.__rescheduleXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:375,mode:'booking_reschedule_untrusted_text_inert',passed:true});
};
