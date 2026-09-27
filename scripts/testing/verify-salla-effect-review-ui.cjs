const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
 const dir=path.resolve('.tmp/salla-effect-review-ui'),output=path.resolve(process.env.SARI_SALLA_EFFECT_REVIEW_UI_OUTPUT||'.tmp/salla-effect-review-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
 await esbuild.build({entryPoints:['scripts/testing/fixtures/salla-effect-review-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
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
  const visit=async(mode,lang)=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>window.__reads.length),0);if(mode!=='viewer'){await page.waitForSelector('[data-salla-effect-review] > summary');await page.click('[data-salla-effect-review] > summary');}};
  const settled=()=>page.waitForSelector('[data-effect-results]');
  const inspect=async()=>{assert.deepEqual(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/merchantUx\./.test(document.body.innerText),secret:/private SQL|token/.test(document.body.innerText),xss:!!window.__xss})),{overflow:false,raw:false,secret:false,xss:false});assert.deepEqual(errors,[]);};
  const record=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
  for(const lang of ['ar','en']){
   for(const width of [320,375,390,430,768,1440]){
    await page.setViewport({width,height:900});await visit('ready',lang);await settled();assert.equal((await page.$$('[data-effect-row]')).length,3);await inspect();
    for(const selector of ['[data-effect-order]','[data-effect-state]','[data-effect-kind]','[data-effect-check]','[data-effect-refresh]'])assert.ok(await page.$eval(selector,n=>n.getBoundingClientRect().height)>=44);
    assert.equal(await page.evaluate(()=>window.__writes.length),0);if([375,1440].includes(width))await page.screenshot({path:path.join(output,`effects-${lang}-${width}.png`),fullPage:true});record('responsive',lang,{width});
   }
   await page.setViewport({width:375,height:900});
   await visit('viewer',lang);assert.equal(await page.$('[data-salla-effect-review]'),null);assert.equal(await page.evaluate(()=>window.__reads.length),0);record('viewer_hidden',lang);
   for(const mode of ['empty','error','extra','contradictory','xss']){await visit(mode,lang);await page.waitForSelector(mode==='empty'?'[data-effect-results]':'[data-effect-error]');assert.equal((await page.$$('[data-effect-row]')).length,0);await inspect();record(mode,lang);}
   await visit('ready',lang);await settled();await page.type('[data-effect-order]','-1');await page.click('[data-effect-apply]');await page.waitForSelector('[data-effect-filter-error]');assert.equal(await page.evaluate(()=>window.__reads.length),1);record('invalid_filter_no_request',lang);
   await visit('ready',lang);await settled();await page.type('[data-effect-order]','4');await page.select('[data-effect-state]','review');await page.select('[data-effect-kind]','sheets');await page.focus('[data-effect-apply]');await page.keyboard.press('Enter');await settled();await page.waitForFunction(()=>window.__reads.length===2);assert.deepEqual(await page.evaluate(()=>window.__reads.at(-1).input),{orderId:4,state:'review',kind:'sheets'});record('filters_keyboard',lang);
   await visit('paged',lang);await settled();await page.click('[data-effect-older]');await page.waitForFunction(()=>document.querySelectorAll('[data-effect-row]').length===2);assert.equal(await page.evaluate(()=>window.__reads.at(-1).input.beforeId),11);await page.click('[data-effect-refresh]');await page.waitForFunction(()=>document.querySelectorAll('[data-effect-row]').length===20);record('pagination',lang);
   for(const mode of ['ready','lost']){
    await visit(mode,lang);await settled();assert.equal(await page.$eval('[data-effect-check]',n=>n.disabled),true);await page.select('[data-effect-reason]','delivery_check');await page.click('[data-effect-check]');await page.waitForSelector('[data-effect-notice]');await settled();
     if(mode==='lost'){assert.equal(await page.$eval('[data-effect-check]',n=>n.disabled),true);await page.click('[data-effect-refresh]');await page.waitForSelector('[data-effect-check]:enabled',{visible:true});await page.click('[data-effect-check]');await page.waitForFunction(()=>window.__writes.length===2);await settled();assert.equal(await page.evaluate(()=>window.__writes[0].input.requestId===window.__writes[1].input.requestId),true);}
    assert.equal(await page.evaluate(()=>window.__audits.length),1);assert.ok(await page.evaluate(()=>window.__writes.every(v=>v.path==='salla.checkEffect'&&!('merchantId'in v.input)&&!('accepted'in v.input))));
    await page.click('[data-effect-tab="history"]');await page.waitForSelector('[data-effect-audit]');assert.equal((await page.$$('[data-effect-audit]')).length,1);await inspect();record(mode==='lost'?'lost_ack_same_request':'check_and_history',lang);
   }
   await visit('ready',lang);await settled();await page.evaluate(()=>{window.__error=true;window.__refresh();});await page.waitForSelector('[data-effect-loading]');assert.equal(await page.$('[data-effect-results]'),null);await page.waitForSelector('[data-effect-error]');await inspect();record('revocation_hides_cached_result',lang);
   await visit('ready',lang);await settled();await page.evaluate(()=>window.__online(false));await page.click('[data-effect-refresh]');await page.waitForSelector('[data-effect-loading]');assert.equal(await page.$('[data-effect-results]'),null);record('offline_hides_cached_result',lang);
   for(const width of [320,375,390,430,768,1440]){
    await page.setViewport({width,height:900});await visit('notice',lang);await settled();await inspect();assert.equal((await page.$$('[data-notice-target]')).length,10);
    const text=await page.$eval('[data-effect-row]',n=>n.textContent);assert.match(text,lang==='ar'?/قبول جزئي/:/Partial acceptance/);
    if([375,1440].includes(width))await page.screenshot({path:path.join(output,`notices-${lang}-${width}.png`),fullPage:true});record('recipient_results_responsive',lang,{width});
   }
   await page.setViewport({width:375,height:900});await visit('notice-invalid',lang);await page.waitForSelector('[data-effect-error]');assert.equal(await page.$('[data-effect-results]'),null);await inspect();record('false_complete_receipt_rejected',lang);
   await visit('notice',lang);await settled();await page.select('[data-effect-reason]','incident_review');await page.click('[data-effect-check]');await page.waitForSelector('[data-effect-notice]');await settled();await page.click('[data-effect-tab="history"]');await page.waitForSelector('[data-effect-audit]');assert.equal((await page.$$('[data-notice-target]')).length,9);await inspect();record('recipient_snapshot_history',lang);
  }
  const report={generatedAt:new Date().toISOString(),browser:await browser.version(),scope:'Actual SallaEffectReview component, simulated API, loopback Chromium; not physical iPhone/Safari or production.',externalRequestsBlocked:true,results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
 }catch(e){const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(await page.evaluate(()=>({url:location.href,reads:window.__reads,writes:window.__writes,buttons:[...document.querySelectorAll('[data-effect-check]')].map(n=>({disabled:n.disabled,text:n.textContent})),results:!!document.querySelector('[data-effect-results]')})),null,2));}throw e;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
