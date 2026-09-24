const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function verifyCalendarUI(page,origin,output,results){
 const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});};
 const form='[data-calendar-review-form]';
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
  await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit('calendar-review-ready',lang);await page.waitForSelector(form);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$eval('[data-appointment-review]',n=>n.innerText.includes('merchantUx.')),false);
  assert.ok((await page.$$eval('[data-appointment-review] button,[data-appointment-review] select',nodes=>nodes.map(n=>n.getBoundingClientRect().height))).every(h=>h>=44));
  assert.equal(await page.$eval('[data-calendar-review-submit]',n=>n.disabled),true);
  await page.type('[data-calendar-review-reason]','Reviewed the appointment and calendar');await page.focus('[data-calendar-review-attest]');await page.keyboard.press('Space');
  await page.evaluate(()=>window.__changeCalendarEvidence());await page.waitForFunction(()=>document.querySelector('[data-calendar-review-reason]').value==='');
  assert.equal(await page.$eval('[data-calendar-review-attest]',n=>n.checked),false);
  await page.type('[data-calendar-review-reason]','Reviewed the appointment and calendar');await page.click('[data-calendar-review-attest]');
  if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-appointment-review]')).screenshot({path:path.join(output,`calendar-review-${width}.png`)});
  await page.click('[data-calendar-review-submit]');assert.equal(await page.$eval('[data-calendar-review-refresh]',n=>n.disabled),true);
  await page.waitForFunction(()=>window.__calendarParentRefreshed===true);await page.waitForSelector('[data-calendar-review-outcome]');
  const input=await page.evaluate(()=>window.__calendarReviewInput);assert.equal(input.appointmentId,501);assert.equal(input.evidence,'b'.repeat(64));assert.equal(input.reviewed,true);assert.equal(input.bindingReviewed,false);assert.match(input.requestId,/^[a-f0-9-]{36}$/);assert.equal(await page.evaluate(()=>window.__calendarReviewCount),1);
  results.push({width,lang,mode:'calendar_review_attestation_evidence_single_submit',passed:true});
 }
 for(const state of ['legacy','cancel','unverified','write-error','refresh-error','parent-error']){
  await page.setViewport({width:375,height:812});await visit(`calendar-review-${state}`);await page.waitForSelector(form);
  if(state==='legacy')await page.type('[data-calendar-review-event]','legacy-event');
  await page.type('[data-calendar-review-reason]','Reviewed the appointment and calendar');await page.click('[data-calendar-review-attest]');
  if(state==='legacy'){assert.equal(await page.$eval('[data-calendar-review-submit]',n=>n.disabled),true);await page.click('[data-calendar-review-binding]');}
  await page.click('[data-calendar-review-submit]');await page.waitForFunction(()=>window.__calendarReviewCount===1&&!document.querySelector('[data-calendar-review-refresh]').disabled);
  if(state.includes('error')){await page.waitForSelector('[role=alert]');assert.equal(await page.$eval('[data-appointment-review]',n=>n.innerText.includes('private')),false);}
  if(state==='legacy')assert.equal(await page.evaluate(()=>window.__calendarReviewInput.bindingReviewed),true);
  if(state==='cancel')assert.equal(await page.evaluate(()=>window.__calendarReviewInput.action),'confirm_cancellation');
  assert.equal(await page.$eval('[data-calendar-review-attest]',n=>n.checked).catch(()=>false),false);
  results.push({width:375,mode:`calendar_review_${state}`,passed:true});
 }
 for(const state of ['legacy-denied','waiting','target','complete','loading','error','fetching','xss']){
  await visit(`calendar-review-${state}`);await page.waitForSelector('[data-appointment-review]');
  if(['legacy-denied','waiting','target','complete','loading'].includes(state))assert.equal(await page.$(form),null);
  if(state==='error'){await page.waitForSelector('[role=alert]');await page.click('[data-calendar-review-refresh]');await page.waitForFunction(()=>!document.querySelector('[role=alert]'));}
  if(state==='fetching')assert.equal(await page.$eval('[data-calendar-review-submit]',n=>n.disabled),true);
  if(state==='xss'){assert.equal(await page.$('[data-appointment-review] img'),null);assert.equal(await page.evaluate(()=>window.__calendarXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  results.push({width:375,mode:`calendar_review_${state}`,passed:true});
 }
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
  await page.setViewport({width,height:width<500?812:900});await visit('calendar-page-ready',lang);await page.waitForSelector('[data-calendar-open="501"]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$eval('[data-calendar-page]',n=>n.innerText.includes('merchantUx.')||n.innerText.includes('Invalid Date')),false);
  const range=await page.evaluate(()=>window.__calendarListInput);assert.match(range.startDate,/^\d{4}-\d{2}-\d{2}$/);assert.match(range.endDate,/^\d{4}-\d{2}-\d{2}$/);
  if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-calendar-page]')).screenshot({path:path.join(output,`calendar-page-${width}.png`)});
  await page.click('[data-calendar-open="501"]');await page.waitForSelector('[data-calendar-cancel]');assert.equal(await page.$eval('[data-calendar-cancel]',n=>n.disabled),true);
  await page.click('[data-calendar-cancel-attest]');await page.click('[data-calendar-cancel]');await page.waitForFunction(()=>window.__calendarCancelled===true);await page.waitForFunction(()=>!document.querySelector('[data-calendar-cancel]'));
  assert.deepEqual(await page.evaluate(()=>window.__calendarCancelInput),{appointmentId:501});assert.equal(await page.evaluate(()=>window.__calendarCancelCount),1);
  results.push({width,lang,mode:'calendar_page_dates_and_explicit_cancellation',passed:true});
 }
 for(const state of ['viewer','disconnected','empty','loading','error','truncated','write-error']){
  await page.setViewport({width:375,height:812});await visit(`calendar-page-${state}`);await page.waitForSelector('[data-calendar-page]');
  if(state==='viewer'){await page.click('[data-calendar-open="501"]');assert.equal(await page.$('[data-calendar-cancel]'),null);assert.equal(await page.$('[data-appointment-review]'),null);}
  if(state==='disconnected')await page.waitForSelector('[data-calendar-open="501"]');
  if(state==='loading')await page.waitForSelector('[role=status]');
  if(state==='error'||state==='truncated')await page.waitForSelector('[role=alert]');
  if(state==='empty')assert.equal(await page.$('[data-calendar-open]'),null);
  if(state==='write-error'){await page.click('[data-calendar-open="501"]');await page.click('[data-calendar-cancel-attest]');await page.click('[data-calendar-cancel]');await page.waitForSelector('[role=alert]');assert.equal(await page.evaluate(()=>window.__calendarCancelled),undefined);assert.equal(await page.$eval('[data-calendar-cancel]',n=>n.disabled),true);}
  results.push({width:375,mode:`calendar_page_${state}`,passed:true});
 }
};
