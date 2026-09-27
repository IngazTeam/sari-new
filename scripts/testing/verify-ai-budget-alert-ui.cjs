const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/budget-alert-ui'),output=path.resolve(process.env.SARI_ALERT_UI_OUTPUT||'.tmp/budget-alert-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/ai-price-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
  const publicDir=path.resolve('dist/public'),styles=fs.readdirSync(path.join(publicDir,'assets')).filter(n=>/^(?:index|App)-[\w-]+\.css$/.test(n));assert.equal(styles.filter(n=>n.startsWith('index-')).length,1);
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return;}
    const file=pathname==='/fixture.js'?path.join(dir,'fixture.js'):path.resolve(publicDir,'.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[],errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    const visit=async(mode,lang)=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-ai-prices]');};
    const record=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
    const inspect=async()=>{const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/aiBudget\./.test(document.body.innerText),secret:/private SQL|password/.test(document.body.innerText)}));assert.deepEqual(state,{overflow:false,raw:false,secret:false});assert.deepEqual(errors,[]);};
    for(const lang of ['ar','en']){
      for(const width of [320,375,390,430,768,1440])for(const level of [0,70,90,100]){
        await page.setViewport({width,height:900});await visit(level?'alerts-'+level:'alerts-empty',lang);await inspect();
        if(level){const banner='[data-alert-banner] [data-budget-alert-level]';assert.equal(await page.$eval(banner,n=>Number(n.dataset.budgetAlertLevel)),level);assert.equal(await page.$eval(banner,n=>n.getAttribute('role')),level>=90?'alert':'status');
          assert.equal(await page.$eval(banner+' a',n=>n.getAttribute('href')),'/admin/ai-settings#ai-budget');assert.ok(await page.$eval(banner+' a',n=>n.getBoundingClientRect().height)>=44);
        }else assert.equal(await page.$('[data-budget-alert-level]'),null);
        await page.click('[data-budget-alert-history] summary');await inspect();assert.equal((await page.$$('[data-budget-alert-event]')).length,level?2:0);
        if([375,1440].includes(width)&&[70,100].includes(level))await page.screenshot({path:path.join(output,`alerts-${lang}-${level}-${width}.png`),fullPage:true});
        record('responsive_current_alert_and_history',lang,{width,level});
      }
      await page.setViewport({width:375,height:900});
      for(const mode of ['alerts-loading','alerts-error','alerts-invalid']){await visit(mode,lang);await inspect();assert.equal(await page.$('[data-budget-alert-level]'),null);assert.equal(await page.$('[data-budget-alert-event]'),null);record(mode,lang);}
      await visit('alerts-90',lang);await page.evaluate(()=>{window.__budgetReadFailed=true;window.__refreshPrices();});
      await page.waitForSelector('[data-budget-alert-error]');assert.equal(await page.$('[data-budget-alert-level]'),null);assert.equal(await page.$('[data-budget-alert-event]'),null);await inspect();record('revoked_read_hides_cached_alerts',lang);
      await visit('alerts-70',lang);await page.focus('[data-budget-alert-history] summary');await page.keyboard.press('Enter');assert.equal(await page.$eval('[data-budget-alert-history]',n=>n.open),true);record('history_keyboard',lang);
      // Real polling interval; no shortened test timer. One query serves both consumers.
      await page.evaluate(()=>{window.__alertLevel=0;window.__initialAlertReads=window.__priceQueries.filter(q=>q.path==='aiSettings.getBudgetAlerts').length;});
      await page.waitForFunction(()=>!document.querySelector('[data-budget-alert-level]'),{timeout:40000});await inspect();
      assert.equal((await page.$$('[data-budget-alert-event]')).length,2);assert.equal(await page.evaluate(()=>window.__priceQueries.filter(q=>q.path==='aiSettings.getBudgetAlerts').length-window.__initialAlertReads),1);record('real_poll_updates_usage_retains_history',lang);
    }
    const report={generatedAt:new Date().toISOString(),browser:await browser.version(),scope:'Actual alert components, simulated API, local Chromium only; no production or physical iPhone/Safari',externalRequestsBlocked:true,results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){const page=(await browser.pages()).at(-1);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
