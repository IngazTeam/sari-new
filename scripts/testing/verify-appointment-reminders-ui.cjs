const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
  for(const width of [320,375,390,768,1440]) for(const lang of ['ar','en']){
    await page.setViewport({width,height:width<500?812:900});
    await page.goto(`${origin}/?case=appointment-reminders-pending&lang=${lang}`,{waitUntil:'networkidle0'});
    await page.waitForSelector('[data-reminder-row]');
    const view=await page.$eval('[data-appointment-reminders]',n=>({overflow:document.documentElement.scrollWidth>innerWidth,text:n.innerText,buttons:n.querySelectorAll('button').length,height:n.querySelector('button').getBoundingClientRect().height}));
    assert.equal(view.overflow,false);assert.equal(view.text.includes('merchantUx.'),false);assert.equal(view.buttons,1);assert.ok(view.height>=44);
    await page.focus('[data-appointment-reminders] button');await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-appointment-reminders] button',n=>n.disabled),true);
    await page.click('[data-appointment-reminders] button');assert.equal(await page.evaluate(()=>window.__reminderRefreshCount),1);
    await page.waitForFunction(()=>!document.querySelector('[data-appointment-reminders] button').disabled);
    await page.focus('[data-appointment-reminders] summary');await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-appointment-reminders] details',n=>n.open),true);
    if(lang==='ar'&&[375,1440].includes(width))await(await page.$('[data-appointment-reminders]')).screenshot({path:path.join(output,`appointment-reminders-${width}.png`)});
    results.push({width,lang,mode:'appointment_reminder_read_only_keyboard_refresh_layout',passed:true});
  }
  for(const lang of ['ar','en'])for(const state of ['empty','loading','error','fetching','refresh-error','dispatching','unknown','accepted','failed','suppressed','delivered','read','cancelled']){
    await page.setViewport({width:320,height:812});await page.goto(`${origin}/?case=appointment-reminders-${state}&lang=${lang}`,{waitUntil:'networkidle0'});
    await page.waitForSelector('[data-appointment-reminders]');
    assert.equal(await page.$eval('[data-appointment-reminders]',n=>n.innerText.includes('merchantUx.')),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(state==='empty')assert.ok(await page.$('[data-reminder-empty]'));
    if(state==='loading')assert.equal(await page.$('[data-reminder-row]'),null);
    if(state==='error'){assert.ok(await page.$('[role=alert]'));assert.equal(await page.$('[data-reminder-row]'),null);await page.click('[data-appointment-reminders] button');await page.waitForSelector('[data-reminder-row]');}
    if(state==='fetching')assert.equal(await page.$eval('[data-appointment-reminders] button',n=>n.disabled),true);
    if(state==='refresh-error'){await page.click('[data-appointment-reminders] button');await page.waitForSelector('[role=alert]');assert.equal(await page.$('[data-reminder-row]'),null);}
    if(state==='accepted')assert.match(await page.$eval('[data-reminder-state]',n=>n.innerText),lang==='ar'?/لا يعني وصولها/:/not implied/);
    if(state==='unknown')assert.match(await page.$eval('[data-reminder-state]',n=>n.innerText),lang==='ar'?/لا إعادة إرسال/:/No automatic resend/);
    results.push({width:320,lang,mode:`appointment_reminder_${state}`,passed:true});
  }
  await page.goto(`${origin}/?case=appointment-reminders-xss&lang=en`,{waitUntil:'networkidle0'});await page.click('[data-appointment-reminders] summary');
  assert.equal(await page.evaluate(()=>window.__reminderXss),undefined);assert.equal(await page.$('[data-appointment-reminders] img'),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({width:320,lang:'en',mode:'appointment_reminder_untrusted_source_inert',passed:true});
};
