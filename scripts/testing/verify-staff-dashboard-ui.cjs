const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/staff-dashboard-ui'),output=path.resolve(process.env.STAFF_DASHBOARD_UI_OUTPUT||'.tmp/staff-dashboard-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/staff-dashboard-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src')}});
  const publicDir=path.resolve('dist/public'),styles=fs.readdirSync(path.join(publicDir,'assets')).filter(n=>/^(?:index|App)-[\w-]+\.css$/.test(n));
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return;}
    const file=pathname==='/fixture.js'?path.join(dir,'fixture.js'):path.resolve(publicDir,'.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[],errors=[];
  try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    const select=async()=>{await page.waitForSelector('[data-staff-conversation="4"]');await page.click('[data-staff-conversation="4"]');await page.waitForSelector('[data-staff-draft]',{visible:true});};
    const visit=async(mode,lang)=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});await page.evaluate(()=>sessionStorage.clear());await select();};
    const fill=async(text='Synthetic staff reply')=>{
      await page.focus('[data-staff-draft]');await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');if(text)await page.keyboard.sendCharacter(text);
      await page.waitForFunction(value=>document.querySelector('[data-staff-draft]').value===value&&document.querySelector('[data-staff-send]').disabled===!value.trim(),{},text);
    };
    const send=async(n=1)=>{await page.click('[data-staff-send]');await page.waitForFunction(n=>window.__staffWrites.length===n,{},n);await page.waitForFunction(()=>!document.querySelector('[data-staff-draft]').disabled);};
    const check=async()=>{const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/(staffDashboardReply|quickDrafts)\./.test(document.body.innerText),private:document.body.innerText.includes('private token'),
      inputSize:parseFloat(getComputedStyle(document.querySelector('[data-staff-draft]')).fontSize),height:document.querySelector('[data-staff-send]').getBoundingClientRect().height}));assert.equal(r.overflow,false);assert.equal(r.raw,false);assert.equal(r.private,false);assert.ok(r.inputSize>=16);assert.ok(r.height>=44);assert.deepEqual(errors,[]);};
    const record=(mode,extra={})=>results.push({mode,...extra,passed:true});
    for(const lang of ['ar','en']){
      for(const width of [320,375,430,1440]){await page.setViewport({width,height:900});await visit('pending',lang);await fill();await send();await check();
        assert.equal(await page.$eval('[data-staff-draft]',n=>n.value),'Synthetic staff reply');const first=await page.evaluate(()=>window.__staffWrites[0].requestId);await send(2);assert.equal(await page.evaluate(()=>window.__staffWrites[1].requestId),first);
        assert.equal(await page.$eval('[data-staff-draft]',n=>n.maxLength),4096);if([375,1440].includes(width))await page.screenshot({path:path.join(output,`staff-${lang}-${width}.png`),fullPage:true});record('pending_retry_same_identity',{lang,width});}
      const draftKeys={send_products:'productsMessage',send_payment_link:'paymentMessage',book_appointment:'bookingMessage',send_location:'locationMessage',send_hours:'hoursMessage',transfer_human:'followupMessage',send_order_status:'orderMessage',send_offer:'offerMessage',request_review:'reviewMessage',send_catalog:'catalogMessage'};
      const copy=JSON.parse(fs.readFileSync(`client/src/locales/${lang}.json`)).quickDrafts;
      for(const width of [320,375,430,1440]){
        await page.setViewport({width,height:900});await visit('pending',lang);
        await page.$eval('[data-quick-draft]',n=>{n.closest('details').open=true;});
        for(const [id,key]of Object.entries(draftKeys)){
          await fill('');await page.click(`[data-quick-draft="${id}"]`);
          await page.waitForFunction(text=>document.querySelector('[data-staff-draft]').value===text,{},copy[key]);
          assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);
          assert.equal(await page.$eval('[data-staff-draft]',n=>/https?:|\d|SPECIAL20|تم تأكيد|تم حجز|تم تحويل/.test(n.value)),false);
          assert.equal(await page.$eval(`[data-quick-draft="${id}"]`,n=>n.getBoundingClientRect().height>=44),true);
          assert.equal(await page.$('[data-sonner-toast][data-type="success"]'),null);
          record('shortcut_is_reviewable_draft_only',{lang,width,id});
        }
        await fill('Existing private draft');await page.click('[data-quick-draft="send_payment_link"]');
        assert.equal(await page.$eval('[data-staff-draft]',n=>n.value),'Existing private draft');assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);
        record('shortcut_preserves_existing_draft',{lang,width});
        await fill('');await page.click('[data-quick-draft="book_appointment"]');await send();await send(2);
        const writes=await page.evaluate(()=>window.__staffWrites);assert.equal(writes[0].message,copy.bookingMessage);assert.equal(writes[1].requestId,writes[0].requestId);
        assert.match(writes[0].requestId,/^[0-9a-f-]{36}$/i);await check();record('explicit_shortcut_send_uses_durable_identity',{lang,width});
        if(width===375)await page.screenshot({path:path.join(output,`drafts-${lang}-${width}.png`),fullPage:true});
      }
      await page.setViewport({width:375,height:900});
      for(const mode of ['accepted','failed','projection','error']){await visit(mode,lang);await fill();await send();await check();assert.equal(await page.$eval('[data-staff-draft]',n=>n.value),['accepted','projection'].includes(mode)?'':'Synthetic staff reply');record(mode,{lang});}
      await visit('pending',lang);await fill();await send();const before=await page.evaluate(()=>window.__staffWrites[0].requestId);await page.reload({waitUntil:'networkidle0'});await select();await fill();await send();assert.equal(await page.evaluate(()=>window.__staffWrites[0].requestId),before);record('reload_keeps_attempt',{lang});
      await page.evaluate(()=>window.__staffResult='accepted');await send(2);await fill();await send(3);assert.notEqual(await page.evaluate(()=>window.__staffWrites[2].requestId),before);record('only_acceptance_releases_identity',{lang});
      await visit('accepted',lang);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('storage unavailable');};});await fill();await page.click('[data-staff-send]');await page.waitForSelector('[data-sonner-toast]');assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);assert.equal(await page.$eval('[data-staff-draft]',n=>n.value),'Synthetic staff reply');record('storage_failure_blocks_send',{lang});
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,fixtureApi:true,realReactQueryAndTrpc:true,externalRequestsBlocked:true,
      scope:'Actual Conversations component with simulated queries/mutations in Chromium, not production or physical iPhone/Safari.',results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))},null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){console.error({completed:results.length,last:results.at(-1),stack:e.stack});const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({text:document.body.innerText,queries:window.__staffQueries,writes:window.__staffWrites})));}throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
