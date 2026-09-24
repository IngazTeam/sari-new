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
 for(const width of [375,1440])for(const lang of ['ar','en'])for(const state of ['pending','dispatching','sent','delivered','read','unknown','failed','suppressed','manual_review']){
  await page.setViewport({width,height:812});await visit(`notice-${state}`,lang);await page.waitForSelector('[data-booking-notification]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const text=await page.$eval('[data-booking-notification]',n=>n.innerText);
  assert.equal(text.includes('merchantUx.'),false);assert.ok(text.includes(lang==='ar'?'بتأكيد الحجز':'booking confirmation'));
  assert.equal(await page.$eval('[data-booking-notification] summary',n=>n.textContent),lang==='ar'?'نص إشعار تأكيد الحجز':'Booking confirmation notification text');
  assert.equal(await page.$('[data-calendar-create],[data-calendar-verify]'),null);
  if(['pending','dispatching'].includes(state))assert.equal(await page.$('[data-notice-submit]'),null);
  if(state==='sent')assert.ok(text.includes(lang==='ar'?'لا يثبت وصول':'does not prove delivery'));
  if(state==='read')assert.ok(text.includes(lang==='ar'?'بقراءة الرسالة':'message read'));
  await page.click('[data-booking-notification] summary');assert.ok((await page.$eval('[data-booking-notification]',n=>n.innerText)).includes('تم تأكيد حجزك #321'));
  await page.click('[data-calendar-refresh]');assert.equal(await page.evaluate(()=>window.__noticeCalls),undefined);assert.equal(await page.evaluate(()=>window.__bookingCalendarCalls),undefined);
  results.push({width,lang,mode:`booking_confirmation_notice_${state}_truthful_without_resend`,passed:true});
 }
 const noticeFill=async()=>{await page.type('[data-notice-reason]','Reviewed the confirmation receipt');await page.focus('[data-notice-attest]');await page.keyboard.press('Space');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
  await page.setViewport({width,height:812});await visit('notice-sent',lang);assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);await noticeFill();
  await page.evaluate(()=>window.__changeBookingCalendar());await page.waitForFunction(()=>document.querySelector('[data-notice-reason]').value==='');assert.equal(await page.$eval('[data-notice-attest]',n=>n.checked),false);await noticeFill();
  assert.equal(await page.$eval('[data-notice-review]',n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-notification]')).screenshot({path:path.join(output,`booking-confirm-notice-${width}.png`)});
  await page.$eval('[data-notice-submit]',n=>{n.click();n.click();});await page.waitForSelector('[data-notice-done]');assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  const input=await page.evaluate(()=>window.__noticeInput);assert.equal(input.notificationId,51);assert.equal(input.bookingId,321);assert.equal(input.evidence,'d'.repeat(64));assert.equal(input.reviewed,true);assert.match(input.requestId,/^[a-f0-9-]{36}$/);
  assert.deepEqual(Object.keys(input).sort(),['notificationId','bookingId','evidence','reviewed','requestId','reason'].sort());assert.equal(await page.evaluate(()=>window.__bookingCalendarCalls),undefined);
  await page.click('[data-notice-history] summary');assert.ok((await page.$eval('[data-notice-history]',n=>n.innerText)).includes('Reviewed confirmation receipt'));
  assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);await page.click('[data-notice-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-notice-reason]').disabled);assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  results.push({width,lang,mode:'booking_confirmation_notice_audited_review_single_submit',passed:true});
 }
 for(const mode of ['write-error','refresh-error']){
  await visit(`notice-${mode}`);await noticeFill();await page.click('[data-notice-submit]');await page.waitForSelector('[data-notice-review] [role=alert]');
  assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);assert.equal(await page.$eval('[data-notice-review]',n=>n.innerText.includes('private')),false);assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  results.push({width:1440,mode:`booking_confirmation_notice_${mode}_no_automatic_retry`,passed:true});
 }
 await page.setViewport({width:320,height:812});await visit('notice-xss');await page.click('[data-booking-notification] summary');await page.click('[data-notice-history] summary');
 assert.equal(await page.$('[data-booking-notification] img'),null);assert.equal(await page.evaluate(()=>window.__noticeXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:320,mode:'booking_confirmation_notice_untrusted_text_inert',passed:true});
};
