const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/ai-price-ui'),output=path.resolve(process.env.SARI_PRICE_UI_OUTPUT||'.tmp/ai-price-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/ai-price-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
  const publicDir=path.resolve('dist/public'),styles=fs.readdirSync(path.join(publicDir,'assets')).filter(n=>/^(?:index|App)-[\w-]+\.css$/.test(n)).sort((a,b)=>Number(b.startsWith('index-'))-Number(a.startsWith('index-'))||a.localeCompare(b));
  assert.equal(styles.filter(n=>n.startsWith('index-')).length,1);
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return;}
    const file=pathname==='/fixture.js'?path.join(dir,'fixture.js'):path.resolve(publicDir,'.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[],errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')||r.url().startsWith('blob:')?r.continue():r.abort());
    const visit=async(mode,lang='ar')=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-ai-prices]');};
    const disabled=selector=>page.$eval(selector,n=>n.matches(':disabled'));
    const fill=async()=>{await page.click('[data-price-edit]');await page.type('#budget-version','approved-v2');await page.type('#budget-price-reference','synthetic-contract-approved');};
    const check=async()=>{const state=await page.$eval('[data-ai-prices]',n=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:n.innerText.includes('aiBudget.'),private:n.innerText.includes('private SQL'),
      buttons:[...n.querySelectorAll('button,select')].map(b=>b.getBoundingClientRect().height),font:parseFloat(getComputedStyle(n.querySelector('input')).fontSize)}));assert.equal(state.overflow,false);assert.equal(state.raw,false);assert.equal(state.private,false);assert.ok(state.buttons.every(h=>h>=44));if((await page.viewport()).width<500)assert.ok(state.font>=16);assert.deepEqual(errors,[]);};
    const record=(mode,extra={})=>results.push({mode,...extra,passed:true});
    for(const lang of ['ar','en']){
      for(const width of [320,375,390,430,768,1440]){
        await page.setViewport({width,height:900});await visit('ready',lang);await fill();await check();
        await page.focus('[data-price-save]');await page.keyboard.press('Enter');await page.click('[data-price-save]');await page.waitForFunction(()=>window.__priceSaved&&!document.querySelector('[data-price-reload]').disabled);
        const writes=await page.evaluate(()=>window.__priceWrites);assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,'a'.repeat(64));assert.equal(writes[0].inputUsdPerMillion,0.000001);assert.match(writes[0].requestId,/^[0-9a-f-]{36}$/);
        assert.equal(await page.$eval('#budget-model',n=>n.value),'');await page.click('[data-price-show-history]');await page.waitForSelector('[data-price-revision]');await check();
        await page.click('[data-price-export]');await page.waitForFunction(()=>window.__priceExport);const exported=await page.evaluate(()=>window.__priceExport);assert.equal(exported.scope,'displayed-page');assert.equal(exported.entries.length,2);assert.equal(exported.entries[1].actorId,null);assert.ok(!JSON.stringify(exported).includes('requestId'));
        assert.equal(await page.$$eval('[data-ai-capability]',n=>n.length),4);
        if([375,1440].includes(width))await page.screenshot({path:path.join(output,`price-${lang}-${width}.png`),fullPage:true});record('responsive_keyboard_save_and_page_export',{lang,width});
      }
      await page.setViewport({width:375,height:900});
      for(const mode of ['save-error','lost-ack','save-conflict','refresh-error','invalid-save']){
        await visit(mode,lang);await fill();await page.click('[data-price-save]');await page.waitForSelector('[data-price-message]');await page.waitForFunction(()=>!document.querySelector('[data-price-reload]').disabled);await check();
        assert.equal(await disabled('[data-price-save]'),true);assert.equal(await disabled('#budget-version'),true);
        if(mode==='refresh-error')assert.equal(await page.$('[data-price-edit]'),null);else assert.equal(await disabled('[data-price-edit]'),true);
        if(['save-error','lost-ack','invalid-save'].includes(mode)){await page.click('[data-price-retry]');await page.waitForFunction(()=>window.__priceWrites.length===2&&!document.querySelector('[data-price-reload]').disabled);const writes=await page.evaluate(()=>window.__priceWrites);assert.deepEqual(writes[0],writes[1]);if(mode==='lost-ack'){assert.equal(await page.$eval('#budget-model',n=>n.value),'');assert.equal(await page.$eval('[data-price-message]',n=>n.getAttribute('role')),'status');}}
        else assert.equal(await page.$('[data-price-retry]'),null);
        if(mode!=='refresh-error'){await page.click('[data-price-reload]');await page.waitForFunction(()=>!document.querySelector('[data-price-save]').matches(':disabled'));assert.equal(await page.$eval('#budget-model',n=>n.value),'');}
        record(mode+'_locks_draft_and_preserves_identity',{lang});
      }
      for(const mode of ['loading','budget-error','history-error','invalid-history','empty-history','empty','xss','long','pages']){
        await visit(mode,lang);await check();
        if(mode==='loading'){assert.equal(await disabled('[data-price-save]'),true);assert.equal(await page.$('[data-price-edit]'),null);}
        else if(mode==='budget-error'){assert.equal(await disabled('[data-price-save]'),true);await page.click('[data-price-reload]');await page.waitForSelector('[data-price-edit]');}
        else if(mode==='empty')assert.equal(await page.$('[data-price-edit]'),null);
        else {await page.click('[data-price-show-history]');await page.waitForSelector('[data-price-history]');await check();
          if(['history-error','invalid-history','empty-history'].includes(mode)){assert.equal(await page.$$eval('[data-price-revision]',n=>n.length),0);assert.equal(await disabled('[data-price-export]'),true);}
          if(mode==='xss'){assert.equal(await page.$('[data-price-history] img'),null);assert.equal(await page.evaluate(()=>window.__priceXss),undefined);}
          if(mode==='pages'){assert.equal(await page.$$eval('[data-price-revision]',n=>n.length),20);await page.click('[data-price-history-next]');await page.waitForFunction(()=>document.querySelectorAll('[data-price-revision]').length===2);assert.equal(await disabled('[data-price-history-next]'),true);await page.click('[data-price-history-previous]');await page.waitForFunction(()=>document.querySelectorAll('[data-price-revision]').length===20);}
        }record('state_'+mode,{lang});
      }
      await visit('empty',lang);await page.select('#budget-provider','zahypi');
      for(const [id,value]of [['budget-model','synthetic-new-model'],['budget-version','new-v1'],['budget-max-input','32000'],['budget-input','1'],['budget-output','2'],['budget-price-reference','synthetic-approval-reference']])await page.type('#'+id,value);
      await page.click('[data-price-save]');await page.waitForFunction(()=>window.__priceSaved&&!document.querySelector('[data-price-reload]').disabled);
      assert.equal(await page.evaluate(()=>window.__priceWrites[0].expectedRevision),null);assert.equal(await page.evaluate(()=>window.__priceWrites[0].provider),'zahypi');record('create_new_card_without_existing_revision',{lang});
      await visit('ready',lang);await fill();await page.$eval('#budget-version',n=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(n,'approved-v1');n.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('[data-price-save]');await page.waitForSelector('[data-price-message]');assert.equal(await page.evaluate(()=>window.__priceWrites.length),0);record('same_version_rejected_before_mutation',{lang});
      await visit('ready',lang);await page.click('[data-price-show-history]');await page.waitForSelector('[data-price-revision]');await page.evaluate(()=>{window.__historyFailed=true;return window.__refreshPrices();});await page.waitForFunction(()=>!document.querySelector('[data-price-revision]'));assert.equal(await disabled('[data-price-export]'),true);record('stale_history_hidden_after_authority_error',{lang});
      for(const mode of ['reconcile-error','reconcile-success']){
        await visit(mode,lang);await page.select('#budget-reservation','a'.repeat(64));await page.type('#budget-billed','0.5');await page.type('#budget-reference','synthetic-provider-invoice');
        await page.$eval('#budget-reservation',n=>n.closest('form').querySelector('input[type=checkbox]').click());
        await page.$eval('#budget-reservation',n=>n.closest('form').querySelector('button[type=submit]').click());await page.waitForSelector('[data-sonner-toast]');
        const copy=JSON.parse(fs.readFileSync(`client/src/locales/${lang}.json`)).aiBudget;
        assert.ok((await page.$eval('[data-sonner-toast]',n=>n.innerText)).includes(mode==='reconcile-error'?copy.reconciliationFailed:copy.reconciliationSaved));
        assert.equal((await page.$eval('body',n=>n.innerText)).includes('private SQL'),false);assert.equal(await page.evaluate(()=>window.__reconcileWrites.length),1);record('manual_'+mode,{lang});
      }
      await visit('reconcile-success',lang);await page.waitForSelector('#budget-reservation');
      await page.evaluate(()=>{window.__budgetReadFailed=true;return window.__refreshPrices();});
      await page.waitForFunction(()=>!document.querySelector('#budget-reservation'));
      assert.equal((await page.$eval('body',n=>n.innerText)).includes('synthetic-request'),false);
      assert.equal(await page.evaluate(()=>window.__reconcileWrites.length),0);record('manual_stale_reservations_hidden_after_authority_error',{lang});
    }
    const report={generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,realReactQueryAndTrpc:true,fixtureApi:true,externalRequestsBlocked:true,scope:'Local Chromium responsive viewports, not physical iPhone/Safari or production.',results,errors};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({text:document.body.innerText,writes:window.__priceWrites})));}console.error({completed:results.length,last:results.at(-1)});throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
