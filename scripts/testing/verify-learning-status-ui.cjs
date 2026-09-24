const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async(page,origin,output,results)=>{
  const states=['idle','preparing','budget_wait','awaiting_result','uncertain','saved','recovering','retry_scheduled','applied','stale','invalid'];
  for(const width of [320,375,390,768,1440])for(const lang of ['ar','en'])for(const state of states){
    await page.setViewport({width,height:width<500?812:900});await page.goto(`${origin}/?case=learning-status-${state}&lang=${lang}`,{waitUntil:'networkidle0'});
    await page.waitForSelector(`[data-learning-state="${state}"]`);
    const layout=await page.$eval('[data-learning-status-card]',n=>({overflow:document.documentElement.scrollWidth>innerWidth,rawKeys:n.innerText.includes('merchantUx.'),buttons:[...n.querySelectorAll('button')].map(b=>({height:b.getBoundingClientRect().height,type:b.type}))}));
    assert.equal(layout.overflow,false);assert.equal(layout.rawKeys,false);assert.equal(layout.buttons.length,1);assert.ok(layout.buttons.every(b=>b.height>=44&&b.type==='button'));
    if(state==='applied')assert.equal(await page.$eval('[data-learning-proposal-count]',n=>n.textContent),'0');
    if(state==='uncertain'&&[375,1440].includes(width)&&lang==='ar')await(await page.$('[data-learning-status-card]')).screenshot({path:path.join(output,`learning-status-${width}.png`)});
    results.push({width,lang,mode:`learning_status_${state}_read_only`,passed:true});
  }
  for(const state of ['loading','error','fetching','refresh-error']){
    await page.setViewport({width:375,height:812});await page.goto(`${origin}/?case=learning-status-${state}&lang=en`,{waitUntil:'networkidle0'});
    if(['loading','fetching'].includes(state))assert.equal(await page.$eval('[data-learning-status-refresh]',n=>n.disabled),true);
    if(state==='loading'){await page.waitForSelector('[role=status]');assert.equal(await page.$('[data-learning-state]'),null);}
    if(state==='error'){await page.waitForSelector('[role=alert]');assert.equal(await page.$('[data-learning-state]'),null);}
    if(['error','refresh-error'].includes(state)){
      await page.focus('[data-learning-status-refresh]');await page.keyboard.press('Enter');assert.equal(await page.$eval('[data-learning-status-refresh]',n=>n.disabled),true);
      await page.waitForFunction(()=>!document.querySelector('[data-learning-status-refresh]').disabled);
      assert.equal(await page.evaluate(()=>window.__learningStatusReads),1);
      if(state==='error')await page.waitForSelector('[data-learning-state=saved]');else{await page.waitForSelector('[role=alert]');assert.equal(await page.$('[data-learning-state]'),null);}
    }
    results.push({width:375,lang:'en',mode:`learning_status_${state}_truthful_refresh`,passed:true});
  }
};
