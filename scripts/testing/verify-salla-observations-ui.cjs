const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/salla-observations-ui'),output=path.resolve(process.env.SARI_SALLA_UI_OUTPUT||'.tmp/salla-observations-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/salla-observations-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}});
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
    const visit=async(mode,lang)=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}&merchantId=7`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-salla-observations]');assert.equal(await page.evaluate(()=>window.__reads.length),0);};
    const submit=async()=>{await page.type('[data-salla-store]','123456');await page.type('[data-salla-order]','98765');await page.click('[data-salla-read]');};
    const inspect=async()=>{assert.deepEqual(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/sallaEvidence\.|salesEvidence\./.test(document.body.innerText),secret:/private SQL|password/.test(document.body.innerText),writes:window.__writes.length,xss:!!window.__xss})),{overflow:false,raw:false,secret:false,writes:0,xss:false});assert.deepEqual(errors,[]);};
    const record=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
    for(const lang of ['ar','en']){
      for(const width of [320,375,390,430,768,1440]){
        await page.setViewport({width,height:900});await visit('ready',lang);await submit();await page.waitForSelector('[data-salla-result]');assert.equal((await page.$$('[data-salla-state]')).length,6);await inspect();
        assert.deepEqual(await page.evaluate(()=>window.__reads),[{merchantId:7,storeId:'123456',orderId:'98765'}]);
        for(const selector of ['[data-salla-store]','[data-salla-order]','[data-salla-read]','[data-salla-refresh]'])assert.ok(await page.$eval(selector,n=>n.getBoundingClientRect().height)>=44);
        if([375,1440].includes(width))await page.screenshot({path:path.join(output,`salla-${lang}-${width}.png`),fullPage:true});record('responsive_first_observations',lang,{width});
      }
      await page.setViewport({width:375,height:900});
      for(const mode of ['empty','FORBIDDEN','UNAUTHORIZED','INTERNAL_SERVER_ERROR','foreign-merchant','foreign-store','foreign-order','xss','financial','extra','duplicate']){
        await visit(mode,lang);await submit();await page.waitForSelector(mode==='empty'?'[data-salla-result]':'[data-salla-error]');assert.equal((await page.$$('[data-salla-state]')).length,0);await inspect();record(mode,lang);
      }
      await visit('ready',lang);await page.click('[data-salla-read]');await page.waitForSelector('[data-salla-invalid]');assert.equal(await page.evaluate(()=>window.__reads.length),0);record('invalid_no_request',lang);
      await visit('ready',lang);await page.evaluate(()=>{const node=document.querySelector('[data-sales-field=merchant]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'٧');node.dispatchEvent(new Event('input',{bubbles:true}));});
      await submit();await page.waitForSelector('[data-salla-result]');assert.equal(await page.evaluate(()=>window.__reads[0].merchantId),7);record('arabic_merchant_matches_report_scope',lang);
      await visit('ready',lang);await submit();await page.waitForSelector('[data-salla-result]');await page.evaluate(()=>{window.__error='FORBIDDEN';window.__refresh();});await page.waitForSelector('[data-salla-loading]');assert.equal(await page.$('[data-salla-result]'),null);await page.waitForSelector('[data-salla-error]');assert.equal(await page.$('[data-salla-result]'),null);await inspect();record('revocation_hides_cached_result',lang);
      await visit('ready',lang);await submit();await page.waitForSelector('[data-salla-result]');await page.evaluate(()=>window.__online(false));await page.click('[data-salla-refresh]');await page.waitForSelector('[data-salla-loading]');assert.equal(await page.$('[data-salla-result]'),null);record('offline_hides_cached_result',lang);
      for(const field of ['merchant','store','order']){
        await visit('slow',lang);await submit();await page.waitForSelector('[data-salla-loading]');await page.type(field==='merchant'?'[data-sales-field=merchant]':`[data-salla-${field}]`,'8');
        await page.waitForFunction(()=>!document.querySelector('[data-salla-loading]'));await new Promise(r=>setTimeout(r,1400));assert.equal(await page.$('[data-salla-result]'),null);assert.ok(await page.evaluate(()=>window.__aborted)>0);record('scope_change_aborts_'+field,lang);
      }
      await visit('ready',lang);await page.type('[data-salla-store]','123456');await page.type('[data-salla-order]','98765');await page.focus('[data-salla-read]');await page.keyboard.press('Enter');await page.waitForSelector('[data-salla-result]');await inspect();record('keyboard_submit',lang);
    }
    const report={generatedAt:new Date().toISOString(),browser:await browser.version(),scope:'Actual SalesEvidence page and Salla component, simulated API, loopback Chromium; not physical iPhone/Safari or production.',externalRequestsBlocked:true,results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){const page=(await browser.pages()).at(-1);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
