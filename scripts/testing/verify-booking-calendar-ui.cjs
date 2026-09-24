const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,origin,output,results){
 const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=booking-calendar-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-booking-calendar]');};
 const fill=async()=>{await page.type('[data-calendar-reason]','Operator reviewed calendar and consent');await page.focus('[data-calendar-attest]');await page.keyboard.press('Space');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en'])for(const mode of ['ready','unknown']){
  await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit(mode,lang);
  const button=mode==='ready'?'[data-calendar-create]':'[data-calendar-verify]';
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.$eval('[data-booking-calendar]',n=>n.innerText.includes('merchantUx.')),false);
  assert.equal(await page.$eval(button,n=>n.disabled),true);await fill();
  await page.evaluate(()=>window.__changeBookingCalendar());await page.waitForFunction(()=>!document.querySelector('[data-calendar-attest]').checked);
  assert.equal(await page.$eval('[data-calendar-reason]',n=>n.value),'');await fill();
  if(mode==='ready'&&lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-calendar]')).screenshot({path:path.join(output,`booking-calendar-${width}.png`)});
  await page.$eval(button,n=>{n.click();n.click();});await page.waitForFunction(()=>window.__bookingCalendarParentRefreshed===true);
  assert.equal(await page.evaluate(()=>window.__bookingCalendarCalls),1);
  const input=await page.evaluate(()=>window.__bookingCalendarInput);assert.equal(input.action,mode==='ready'?'create':'verify');assert.equal(input.evidence,'b'.repeat(64));assert.equal(input.reviewed,true);assert.equal('eventId' in input,false);
  assert.equal(await page.$eval('[data-calendar-verify]',n=>n.disabled),true);
  assert.equal(await page.$eval('[data-booking-calendar]',n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),true);
  results.push({width,lang,mode:`booking_calendar_${mode}_review_and_single_submit`,passed:true});
 }
 for(const mode of ['account','binding','in_flight','legacy','consent','loading','error','fetching']){
  await visit(mode);const buttons=await page.$$eval('[data-calendar-create],[data-calendar-verify]',ns=>ns.every(n=>n.disabled));assert.equal(buttons,true);
  if(mode==='error'){await page.click('[data-calendar-refresh]');await page.waitForSelector('[data-calendar-attest]');assert.equal(await page.$eval('[data-calendar-attest]',n=>n.checked),false);}
  results.push({width:1440,mode:`booking_calendar_blocked_${mode}`,passed:true});
 }
 for(const mode of ['write-error','refresh-error','parent-error']){
  await visit(mode);await fill();await page.click('[data-calendar-create]');await page.waitForFunction(()=>window.__bookingCalendarCalls===1&&!document.querySelector('[data-calendar-refresh]').disabled);
  await page.waitForSelector('[data-booking-calendar] [role=alert]');assert.equal(await page.$eval('[data-booking-calendar]',n=>n.innerText.includes('private')),false);
  assert.equal(await page.$$eval('[data-calendar-create],[data-calendar-verify]',ns=>ns.every(n=>n.disabled)),true);assert.equal(await page.evaluate(()=>window.__bookingCalendarCalls),1);
  results.push({width:1440,mode:`booking_calendar_${mode}_no_blind_retry`,passed:true});
 }
 for(const state of ['unknown','synced','ended']){
  await page.goto(origin+'/?case=booking-ops-calendar-'+state,{waitUntil:'networkidle0'});
  const options=await page.$$eval('[data-booking-operations] select option',ns=>ns.map(n=>n.value));
  assert.equal(options.includes('cancelled'),false);assert.equal(options.includes('no_show'),state==='ended');
  assert.equal(options.includes('in_progress'),state!=='unknown');
  assert.equal(await page.$eval('[data-booking-operations] select',n=>n.disabled),state==='unknown');
  results.push({width:1440,mode:'booking_calendar_operation_guards_'+state,passed:true});
 }
 for(const lang of ['ar','en']){await visit('reschedule-history',lang);await page.click('[data-booking-calendar] summary');const content=await page.$eval('[data-booking-calendar] ul',n=>n.innerText);for(const label of lang==='ar'?['اكتمل نقل الموعد','أُغلق طلب النقل','تحقق من نتيجة النقل']:['Appointment moved and booking updated','Request closed before dispatch','Verify move outcome'])assert.ok(content.includes(label));results.push({width:1440,lang,mode:'booking_calendar_reschedule_history_labels',passed:true});}
 await page.setViewport({width:375,height:812});await visit('xss');await page.click('[data-booking-calendar] summary');
 assert.equal(await page.$('[data-booking-calendar] img'),null);assert.equal(await page.evaluate(()=>window.__calendarXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:375,mode:'booking_calendar_untrusted_text_inert',passed:true});
};
