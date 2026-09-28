const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
 const dir=path.resolve('.tmp/salla-checkout-review-ui'),output=path.resolve(process.env.SARI_SALLA_CHECKOUT_REVIEW_UI_OUTPUT||'.tmp/salla-checkout-review-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
 await esbuild.build({entryPoints:['scripts/testing/fixtures/salla-checkout-review-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
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
  const visit=async(mode,lang)=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>window.__reads.length),0);if(mode!=='viewer'){await page.waitForSelector('[data-salla-checkout-review] > summary');await page.click('[data-salla-checkout-review] > summary');}};
  const list=()=>page.waitForSelector('[data-checkout-list]');
  const select=async()=>{await list();await page.click('[data-checkout-select]');await page.waitForSelector('[data-checkout-order]');};
  const enter=async(transaction=true)=>{await page.type('[data-checkout-order]','9007199254740993');if(transaction)await page.type('[data-checkout-transaction]','456');await page.click('[data-checkout-submit]');};
  const inspect=async()=>{assert.deepEqual(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/merchantUx\./.test(document.body.innerText),secret:/private SQL|token|customerPhone/.test(document.body.innerText),xss:!!window.__xss,writes:window.__writes.length})),{overflow:false,raw:false,secret:false,xss:false,writes:0});assert.deepEqual(errors,[]);};
  const record=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
  for(const lang of ['ar','en']){
   for(const width of [320,375,390,430,768,1440]){
    await page.setViewport({width,height:900});await visit('ready',lang);await select();
    assert.equal(await page.$eval('[data-checkout-order]',n=>n.type),'text');
    for(const selector of ['[data-checkout-order]','[data-checkout-transaction]','[data-checkout-submit]','[data-checkout-refresh]','[data-checkout-close]'])assert.ok(await page.$eval(selector,n=>n.getBoundingClientRect().height)>=44);
    assert.ok(await page.$eval('[data-checkout-order]',n=>parseFloat(getComputedStyle(n).fontSize))>=16);
    await enter();await page.waitForSelector('[data-checkout-evidence]');assert.equal((await page.$$('[data-checkout-comparison="equal"]')).length,2);assert.equal((await page.$$('[data-checkout-comparison="absent"]')).length,1);await inspect();
    assert.equal(await page.evaluate(()=>window.__reads.find(r=>r.path==='orders.inspectSallaCheckoutEvidence').input.orderId),'9007199254740993');
    if([375,1440].includes(width))await page.screenshot({path:path.join(output,`checkout-${lang}-${width}.png`),fullPage:true});record('responsive_evidence',lang,{width});
   }
   await page.setViewport({width:375,height:900});await visit('viewer',lang);assert.equal(await page.$('[data-salla-checkout-review]'),null);assert.equal(await page.evaluate(()=>window.__reads.length),0);record('viewer_hidden',lang);
   for(const mode of ['empty','error','extra','bad-page','wrong-scope','unavailable']){
    await visit(mode,lang);await page.waitForSelector(['empty','unavailable'].includes(mode)?'[data-checkout-list]':'[data-checkout-list-error]');
    assert.equal((await page.$$('[data-checkout-select]')).length,0);await inspect();record(mode,lang);
   }
   await visit('ready',lang);await select();await page.type('[data-checkout-order]','-1');await page.click('[data-checkout-submit]');await page.waitForSelector('[data-checkout-error]');assert.equal(await page.evaluate(()=>window.__reads.length),1);record('invalid_input_no_request',lang);
   await visit('ready',lang);await select();await page.type('[data-checkout-order]','٩٠٠٧١٩٩٢٥٤٧٤٠٩٩٣');await page.focus('[data-checkout-order]');await page.keyboard.press('Enter');await page.waitForSelector('[data-checkout-evidence]');assert.equal(await page.evaluate(()=>window.__reads.at(-1).input.orderId),'9007199254740993');assert.equal(await page.evaluate(()=>window.__reads.at(-1).input.transactionId),undefined);assert.ok(await page.$('[data-checkout-not-checked]'));record('arabic_digits_keyboard_optional_transaction',lang);
   for(const mode of ['inspect-error','wrong-order','wrong-cart','xss','false-sale','private-result']){
    await visit(mode,lang);await select();await enter();await page.waitForSelector('[data-checkout-error]');assert.equal(await page.$('[data-checkout-evidence]'),null);await inspect();record(mode,lang);
   }
   for(const mode of ['different','draft']){await visit(mode,lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');if(mode==='different')assert.ok(await page.$('[data-checkout-comparison="different"]'));else assert.match(await page.$eval('[data-checkout-evidence]',n=>n.textContent),lang==='ar'?/الطلب مسودة/:/The order is a draft/);await inspect();record(mode,lang);}
   await visit('ready',lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');await page.type('[data-checkout-order]','1');assert.equal(await page.$('[data-checkout-evidence]'),null);record('edit_hides_previous_result',lang);
   await visit('ready',lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');await page.evaluate(()=>window.__error=true);await page.click('[data-checkout-submit]');await page.waitForSelector('[data-checkout-busy]');assert.equal(await page.$('[data-checkout-evidence]'),null);await page.waitForSelector('[data-checkout-error]');assert.equal(await page.evaluate(()=>window.__reads.filter(r=>r.path==='orders.inspectSallaCheckoutEvidence').length),2);record('same_input_refetched_and_failure_hides_result',lang);
   for(const mode of ['edit','switch','close']){
    await visit('slow',lang);await select();await enter();await page.waitForSelector('[data-checkout-busy]');
    if(mode==='edit')await page.type('[data-checkout-order]','1');
    if(mode==='switch')await page.click('[data-checkout-row="29"] [data-checkout-select]');
    if(mode==='close')await page.click('[data-checkout-close]');
    await page.waitForFunction(()=>window.__aborted>0);await page.waitForFunction(()=>window.__late>0);assert.equal(await page.$('[data-checkout-evidence]'),null);
    if(mode==='switch')assert.equal(await page.$eval('[data-checkout-order]',n=>n.value),'');
    if(mode==='close')assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-checkout-select')),true);
    await inspect();record('late_response_after_'+mode,lang);
   }
   await visit('paged',lang);await list();assert.equal((await page.$$('[data-checkout-row]')).length,20);await page.click('[data-checkout-older]');await page.waitForFunction(()=>document.querySelectorAll('[data-checkout-row]').length===2);assert.equal(await page.evaluate(()=>window.__reads.at(-1).input.beforeId),11);await page.click('[data-checkout-refresh]');await page.waitForFunction(()=>document.querySelectorAll('[data-checkout-row]').length===20);record('pagination',lang);
   await visit('ready',lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');await page.evaluate(()=>{window.__revoked=true;window.__refresh();});await page.waitForFunction(()=>!document.querySelector('[data-salla-checkout-review]'));assert.equal(await page.$('[data-checkout-evidence]'),null);record('revocation_hides_evidence',lang);
   await visit('ready',lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');await page.evaluate(()=>window.__online(false));await page.click('[data-checkout-refresh]');await page.waitForSelector('[data-checkout-loading]');assert.equal(await page.$('[data-checkout-evidence]'),null);assert.equal(await page.$('[data-checkout-list]'),null);record('paused_refresh_hides_cached_evidence',lang);
   const prepareSave=async mode=>{await visit(mode,lang);await select();await enter();await page.waitForSelector('[data-checkout-evidence]');};
   const openHistory=async()=>{await page.click('[data-checkout-history] > summary');await page.waitForSelector('[data-checkout-history-list]');};
   const checkAuditLayout=async()=>{assert.deepEqual(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/merchantUx\./.test(document.body.innerText),secret:/private SQL|token|customerPhone/.test(document.body.innerText),xss:!!window.__xss})),{overflow:false,raw:false,secret:false,xss:false});assert.deepEqual(errors,[]);};
   for(const width of [375,1440]){
    await page.setViewport({width,height:900});await prepareSave('ready');assert.equal(await page.evaluate(()=>window.__writes.length),0);
    await page.click('[data-checkout-save]');await page.waitForSelector('[data-checkout-saved]');assert.equal(await page.$eval('[data-checkout-save]',n=>n.disabled),true);
    assert.equal(await page.evaluate(()=>window.__writes.length),1);assert.equal(await page.evaluate(()=>window.__saved[0].evidence.order.totalMinor),440);
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__writes[0].input).sort()),['evidence','reviewId']);
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__writes[0].input.evidence).sort()),['orderId','requestId','transactionId']);
    await openHistory();await page.click('[data-checkout-audit] > summary');assert.equal((await page.$$('[data-checkout-audit]')).length,1);
    for(const selector of ['[data-checkout-save]','[data-checkout-history] > summary','[data-checkout-audit] > summary'])assert.ok(await page.$eval(selector,n=>n.getBoundingClientRect().height)>=44);
    await checkAuditLayout();await page.screenshot({path:path.join(output,`audit-${lang}-${width}.png`),fullPage:true});record('saved_history_responsive',lang,{width});
   }
   await page.setViewport({width:375,height:900});await prepareSave('save-lost');await page.click('[data-checkout-save]');await page.waitForSelector('[data-checkout-save-error]');
   assert.equal(await page.$('[data-checkout-saved]'),null);await page.click('[data-checkout-save]');await page.waitForSelector('[data-checkout-saved]');
   assert.equal(await page.evaluate(()=>window.__writes.length),2);assert.equal(await page.evaluate(()=>window.__writes[0].input.reviewId===window.__writes[1].input.reviewId),true);assert.equal(await page.evaluate(()=>window.__saved.length),1);record('save_lost_ack_same_key_recovery',lang);
   await prepareSave('save-scope');await page.click('[data-checkout-save]');await page.waitForSelector('[data-checkout-save-error]');assert.equal(await page.$('[data-checkout-saved]'),null);await checkAuditLayout();record('save_wrong_scope_rejected',lang);
   for(const mode of ['edit','switch','close']){
    await prepareSave('save-slow');await page.click('[data-checkout-save]');
    if(mode==='edit')await page.type('[data-checkout-order]','1');if(mode==='switch')await page.click('[data-checkout-row="29"] [data-checkout-select]');if(mode==='close')await page.click('[data-checkout-close]');
    await page.waitForFunction(()=>window.__saved.length===1);assert.equal(await page.$('[data-checkout-saved]'),null);assert.equal(await page.$('[data-checkout-evidence]'),null);
    await openHistory();assert.equal((await page.$$('[data-checkout-audit]')).length,1);record('late_save_after_'+mode,lang);
   }
   for(const mode of ['history-error','history-scope']){await visit(mode,lang);await list();await page.click('[data-checkout-history] > summary');await page.waitForSelector('[data-checkout-history-error]');assert.equal(await page.$('[data-checkout-history-list]'),null);await inspect();record(mode,lang);}
   await prepareSave('ready');await page.click('[data-checkout-save]');await page.waitForSelector('[data-checkout-saved]');
   await page.evaluate(()=>{const saved=window.__saved[0];window.__saved=Array.from({length:22},(_,i)=>({...saved,id:i+1,reviewId:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}));});
   await openHistory();assert.equal((await page.$$('[data-checkout-audit]')).length,20);await page.click('[data-checkout-history-older]');await page.waitForFunction(()=>document.querySelectorAll('[data-checkout-audit]').length===2);await page.click('[data-checkout-history-refresh]');await page.waitForFunction(()=>document.querySelectorAll('[data-checkout-audit]').length===20);record('audit_pagination',lang);
   await page.evaluate(()=>window.__error=true);await page.click('[data-checkout-history-refresh]');await page.waitForSelector('[data-checkout-history-loading]');assert.equal(await page.$('[data-checkout-history-list]'),null);await page.waitForSelector('[data-checkout-history-error]');assert.equal(await page.$('[data-checkout-audit]'),null);record('history_failed_refresh_hides_cached_data',lang);
   const problems=async mode=>{await visit(mode,lang);await list();await page.click('[data-cart-problems] > summary');await page.waitForSelector('[data-cart-problem-list]');};
   for(const width of [375,1440]){
    await page.setViewport({width,height:900});await problems('ready');assert.equal(await page.evaluate(()=>window.__writes.length),0);await page.click('[data-cart-recover]');await page.waitForSelector('[data-cart-recovered]');
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__writes[0].input)),['requestId']);assert.equal(await page.$eval('[data-cart-recover]',n=>n.disabled),true);
    assert.ok(await page.$eval('[data-cart-recover]',n=>n.getBoundingClientRect().height)>=44);assert.ok(await page.$eval('[data-cart-problem-state]',n=>parseFloat(getComputedStyle(n).fontSize))>=16);
    await checkAuditLayout();await page.screenshot({path:path.join(output,`recovery-${lang}-${width}.png`),fullPage:true});record('cart_recovery_responsive',lang,{width});
   }
   await page.setViewport({width:375,height:900});
   for(const state of ['preparing','dispatching','rejected']){await problems('ready');await page.select('[data-cart-problem-state]',state);await page.waitForFunction(state=>window.__reads.at(-1).input.state===state,{},state);await page.waitForSelector('[data-cart-problem-list]');assert.equal(await page.$('[data-cart-recover]'),null);await inspect();record('no_recovery_for_'+state,lang);}
   for(const mode of ['problem-missing','problem-invalid']){await problems(mode);assert.equal(await page.$('[data-cart-recover]'),null);await inspect();record(mode,lang);}
   for(const mode of ['recover-failed','recover-scope']){await problems(mode);await page.click('[data-cart-recover]');await page.waitForSelector('[data-cart-recovery-error]');assert.equal(await page.$('[data-cart-recovered]'),null);await checkAuditLayout();record(mode,lang);}
   await problems('recover-lost');await page.click('[data-cart-recover]');await page.waitForSelector('[data-cart-recovery-error]');await page.click('[data-cart-recover]');await page.waitForSelector('[data-cart-recovered]');
   assert.equal(await page.evaluate(()=>window.__recoveries.length),1);assert.equal(await page.evaluate(()=>window.__writes[0].input.requestId===window.__writes[1].input.requestId),true);record('recovery_lost_ack_replay',lang);
   for(const mode of ['close','state']){
    await problems('recover-slow');await page.click('[data-cart-recover]');if(mode==='close')await page.click('[data-cart-problems] > summary');else await page.select('[data-cart-problem-state]','preparing');
    await page.waitForFunction(()=>window.__recoveries.length===1);assert.equal(await page.$('[data-cart-recovered]'),null);record('late_recovery_after_'+mode,lang);
   }
   for(const mode of ['problems-scope','problems-state']){await visit(mode,lang);await list();await page.click('[data-cart-problems] > summary');await page.waitForSelector('[data-cart-problems-error]');assert.equal(await page.$('[data-cart-recover]'),null);record(mode,lang);}
   await problems('problems-paged');assert.equal((await page.$$('[data-cart-problem]')).length,20);await page.click('[data-cart-problems-older]');await page.waitForFunction(()=>document.querySelectorAll('[data-cart-problem]').length===2);assert.equal(await page.evaluate(()=>window.__reads.at(-1).input.beforeId),11);record('problem_pagination',lang);
  }
  const report={generatedAt:new Date().toISOString(),browser:await browser.version(),scope:'Actual SallaCheckoutReview/history/recovery components and tRPC client with simulated API; loopback Chromium at mobile/desktop widths, not physical iPhone/Safari or live Salla.',externalRequestsBlocked:true,results,errors,screenshots:fs.readdirSync(output).filter(n=>/^(checkout|audit|recovery)-(ar|en)-(375|1440)\.png$/.test(n))};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
 }catch(e){const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(await page.evaluate(()=>({url:location.href,reads:window.__reads,writes:window.__writes,aborted:window.__aborted,text:document.body.innerText})),null,2));}throw e;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
