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
 for(const width of [375,1440])for(const lang of ['ar','en'])for(const state of ['pending','dispatching','sent','delivered','read','unknown','failed','suppressed','manual_review']){
  await page.setViewport({width,height:812});await visit(`notice-${state}`,lang);await page.waitForSelector('[data-booking-notification]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const text=await page.$eval('[data-booking-notification]',n=>n.innerText);
  assert.equal(text.includes('merchantUx.'),false);assert.ok(text.includes(lang==='ar'?'نتيجة الإلغاء':'cancellation notification'));
  assert.equal(await page.$eval('[data-booking-notification] summary',n=>n.textContent),lang==='ar'?'نص إشعار إلغاء الحجز':'Booking cancellation notification text');
  assert.equal(await page.$('[data-cancellation-cancel],[data-cancellation-verify]'),null);
  if(['pending','dispatching'].includes(state))assert.equal(await page.$('[data-notice-submit]'),null);
  if(state==='sent')assert.ok(text.includes(lang==='ar'?'لا يثبت وصول':'does not prove delivery'));
  if(state==='read')assert.ok(text.includes(lang==='ar'?'بقراءة الرسالة':'message read'));
  await page.click('[data-booking-notification] summary');assert.ok((await page.$eval('[data-booking-notification]',n=>n.innerText)).includes('تم إلغاء حجزك #321'));
  await page.click('[data-cancellation-refresh]');assert.equal(await page.evaluate(()=>window.__noticeCalls),undefined);assert.equal(await page.evaluate(()=>window.__cancellationCalls),undefined);
  results.push({width,lang,mode:`booking_cancel_notice_${state}_truthful_without_resend`,passed:true});
 }
 const noticeFill=async()=>{await page.type('[data-notice-reason]','Reviewed the cancellation receipt');await page.focus('[data-notice-attest]');await page.keyboard.press('Space');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
  await page.setViewport({width,height:812});await visit('notice-sent',lang);assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);await noticeFill();
  await page.evaluate(()=>window.__changeCancellation());await page.waitForFunction(()=>document.querySelector('[data-notice-reason]').value==='');assert.equal(await page.$eval('[data-notice-attest]',n=>n.checked),false);await noticeFill();
  assert.equal(await page.$eval('[data-notice-review]',n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-notification]')).screenshot({path:path.join(output,`booking-cancel-notice-${width}.png`)});
  await page.$eval('[data-notice-submit]',n=>{n.click();n.click();});await page.waitForSelector('[data-notice-done]');assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  const input=await page.evaluate(()=>window.__noticeInput);assert.equal(input.notificationId,49);assert.equal(input.bookingId,321);assert.equal(input.evidence,'d'.repeat(64));assert.equal(input.reviewed,true);assert.match(input.requestId,/^[a-f0-9-]{36}$/);
  assert.deepEqual(Object.keys(input).sort(),['notificationId','bookingId','evidence','reviewed','requestId','reason'].sort());assert.equal(await page.evaluate(()=>window.__cancellationCalls),undefined);
  await page.click('[data-notice-history] summary');assert.ok((await page.$eval('[data-notice-history]',n=>n.innerText)).includes('Reviewed cancellation receipt'));
  assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);await page.click('[data-notice-refresh]');await page.waitForFunction(()=>!document.querySelector('[data-notice-reason]').disabled);assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  results.push({width,lang,mode:'booking_cancel_notice_audited_review_single_submit',passed:true});
 }
 for(const mode of ['write-error','refresh-error']){
  await visit(`notice-${mode}`);await noticeFill();await page.click('[data-notice-submit]');await page.waitForSelector('[data-notice-review] [role=alert]');
  assert.equal(await page.$eval('[data-notice-submit]',n=>n.disabled),true);assert.equal(await page.$eval('[data-notice-review]',n=>n.innerText.includes('private')),false);assert.equal(await page.evaluate(()=>window.__noticeCalls),1);
  results.push({width:1440,mode:`booking_cancel_notice_${mode}_no_automatic_retry`,passed:true});
 }
 await page.setViewport({width:320,height:812});await visit('notice-xss');await page.click('[data-booking-notification] summary');await page.click('[data-notice-history] summary');
 assert.equal(await page.$('[data-booking-notification] img'),null);assert.equal(await page.evaluate(()=>window.__noticeXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:320,mode:'booking_cancel_notice_untrusted_text_inert',passed:true});
};
