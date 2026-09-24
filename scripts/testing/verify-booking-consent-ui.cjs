const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function verifyBookingConsentUI(page,origin,output,results){
 const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=booking-ops-consent-${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-booking-consent]');};
 for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
  await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await visit('ready',lang);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.$eval('[data-booking-consent]',n=>n.innerText.includes('merchantUx.')),false);
  await page.select('[data-booking-operations] select','confirmed');
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);
  await page.focus('[data-booking-consent-attest]');await page.keyboard.press('Space');
  await page.evaluate(()=>window.__changeBookingConsent());
  await page.waitForFunction(()=>!document.querySelector('[data-booking-consent-attest]').checked);
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);
  await page.click('[data-booking-consent] summary');
  await page.focus('[data-booking-consent-attest]');await page.keyboard.press('Space');
  if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-booking-consent]')).screenshot({path:path.join(output,`booking-consent-${width}.png`)});
  await page.evaluate(()=>{document.querySelector('[data-booking-operation-save]').click();document.querySelector('[data-booking-operation-save]').click();});
  await page.waitForFunction(()=>window.__operationParentRefreshed===true);
  await page.waitForSelector('[data-booking-consent-audit]');
  const input=await page.evaluate(()=>window.__operationInput);
  assert.deepEqual(input.consentReview,{agreementId:91,evidence:'b'.repeat(64),reviewed:true});
  assert.equal(await page.evaluate(()=>window.__operationCount),1);
  results.push({width,lang,mode:'booking_consent_explicit_review_fresh_evidence_and_audit',passed:true});
 }
 for(const state of ['missing','integrity','source','terms','refused','unavailable','truncated','loading','error','fetching']){
  await page.setViewport({width:375,height:812});await visit(state);await page.select('[data-booking-operations] select','confirmed');
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);
  if(state==='error'){await page.click('[data-booking-consent-refresh]');await page.waitForSelector('[data-booking-consent-attest]');assert.equal(await page.$eval('[data-booking-consent-attest]',n=>n.checked),false);}
  if(state==='refused'){await page.select('[data-booking-operations] select','cancelled');assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),false);}
  results.push({width:375,mode:`booking_consent_${state}`,passed:true});
 }
 for(const state of ['write-error','refresh-error','parent-error']){
  await visit(state);await page.select('[data-booking-operations] select','confirmed');await page.click('[data-booking-consent-attest]');await page.click('[data-booking-operation-save]');
  await page.waitForFunction(()=>window.__operationCount===1&&!document.querySelector('[data-booking-operation-refresh]').disabled);
  await page.waitForSelector('[data-booking-operations] [role=alert]');
  assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);
  assert.equal(await page.$eval('[data-booking-consent-attest]',n=>n.checked),false);
  assert.equal(await page.$eval('[data-booking-operations]',n=>n.innerText.includes('private')),false);
  results.push({width:375,mode:`booking_consent_${state}`,passed:true});
 }
 await visit('xss');await page.click('[data-booking-consent] summary');
 assert.equal(await page.$('[data-booking-consent] img'),null);assert.equal(await page.evaluate(()=>window.__consentXss),undefined);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 results.push({width:375,mode:'booking_consent_untrusted_text_stays_inert',passed:true});
 await visit('ready');await page.select('[data-booking-operations] select','confirmed');await page.click('[data-booking-consent-attest]');
 await page.evaluate(()=>window.__changeOperationalBooking());await page.waitForFunction(()=>document.querySelector('[data-booking-operations] select').value==='cancelled');
 assert.equal(await page.$('[data-booking-consent-attest]'),null);
 results.push({width:375,mode:'booking_consent_resets_on_booking_change',passed:true});
};
