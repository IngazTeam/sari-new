const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,origin,output,results){
 const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=booking-cancellation-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});if(mode!=='empty')await page.waitForSelector('[data-booking-cancellation]');};
 const fill=async()=>{await page.type('[data-cancellation-reason]','Reviewed the exact customer cancellation request');await page.focus('[data-cancellation-attest]');await page.keyboard.press('Space');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en'])for(const mode of ['ready','unknown']){
  await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit(mode,lang);
  const button=mode==='ready'?'[data-cancellation-cancel]':'[data-cancellation-verify]';
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.$eval('[data-booking-cancellation]',n=>n.innerText.includes('merchantUx.')),false);
  assert.equal(await page.$eval(button,n=>n.disabled),true);await fill();await page.evaluate(()=>window.__changeCancellation());
  await page.waitForFunction(()=>!document.querySelector('[data-cancellation-attest]').checked);assert.equal(await page.$eval('[data-cancellation-reason]',n=>n.value),'');await fill();
  if(mode==='ready'&&lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-cancellation]')).screenshot({path:path.join(output,`booking-cancellation-${width}.png`)});
  await page.$eval(button,n=>{n.click();n.click();});await page.waitForFunction(()=>window.__cancellationParentRefreshed===true);
  assert.equal(await page.evaluate(()=>window.__cancellationCalls),1);assert.equal(await page.$('[data-cancellation-cancel],[data-cancellation-verify]'),null);
  const input=await page.evaluate(()=>window.__cancellationInput);assert.equal(input.action,mode==='ready'?'cancel':'verify');assert.equal(input.evidence,'b'.repeat(64));assert.equal(input.reviewed,true);
  for(const key of ['merchantId','eventId','messageId','etag'])assert.equal(key in input,false);
  assert.equal(await page.$eval('[data-booking-cancellation]',n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),true);
  results.push({width,lang,mode:`booking_cancellation_${mode}_review_and_single_submit`,passed:true});
 }
 for(const mode of ['binding','financial','changed','request','booking','inFlight','loading','error','fetching','cancelled','empty']){
  await visit(mode);assert.equal(await page.$$eval('[data-cancellation-cancel],[data-cancellation-verify]',ns=>ns.every(n=>n.disabled)),true);
  if(mode==='error'){await page.click('[data-cancellation-refresh]');await page.waitForSelector('[data-cancellation-attest]');assert.equal(await page.$eval('[data-cancellation-attest]',n=>n.checked),false);}
  if(mode==='empty')assert.equal(await page.$('[data-booking-cancellation]'),null);
  results.push({width:1440,mode:`booking_cancellation_blocked_${mode}`,passed:true});
 }
 for(const mode of ['write-error','refresh-error','parent-error']){
  await visit(mode);await fill();await page.click('[data-cancellation-cancel]');await page.waitForFunction(()=>window.__cancellationCalls===1&&!document.querySelector('[data-cancellation-refresh]').disabled);
  await page.waitForSelector('[data-booking-cancellation] [role=alert]');assert.equal(await page.$eval('[data-booking-cancellation]',n=>n.innerText.includes('private')),false);
  assert.equal(await page.$$eval('[data-cancellation-cancel],[data-cancellation-verify]',ns=>ns.every(n=>n.disabled)),true);assert.equal(await page.evaluate(()=>window.__cancellationCalls),1);
  results.push({width:1440,mode:`booking_cancellation_${mode}_no_blind_retry`,passed:true});
 }
 for(const state of ['cancelling','cancel-unknown','cancelled']){
  await page.goto(`${origin}/?case=booking-ops-calendar-${state}`,{waitUntil:'networkidle0'});
  assert.equal(await page.$eval('[data-booking-operations] select',n=>n.disabled),true);
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);
  results.push({width:1440,mode:`booking_cancellation_parent_guard_${state}`,passed:true});
 }
 await page.setViewport({width:375,height:812});await visit('xss');await page.click('[data-booking-cancellation] summary');
 assert.equal(await page.$('[data-booking-cancellation] img'),null);assert.equal(await page.evaluate(()=>window.__cancellationXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:375,mode:'booking_cancellation_untrusted_text_inert',passed:true});
};
