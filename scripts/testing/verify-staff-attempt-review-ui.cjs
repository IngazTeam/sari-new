const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/staff-attempt-review-ui'),output=path.resolve(process.env.STAFF_ATTEMPT_REVIEW_UI_OUTPUT||'.tmp/staff-attempt-review-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/staff-dashboard-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src')}});
  const publicDir=path.resolve('dist/public'),styles=fs.readdirSync(path.join(publicDir,'assets')).filter(n=>/^(?:index|App)-[\w-]+\.css$/.test(n));
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return;}
    const file=pathname==='/fixture.js'?path.join(dir,'fixture.js'):path.resolve(publicDir,'.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const results=[],errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
    page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    const open=async()=>{await page.waitForSelector('[data-staff-conversation="4"]');await page.click('[data-staff-conversation="4"]');await page.click('[data-staff-attempt-review] > summary');await page.waitForFunction(()=>window.__attemptQueries.length>0);};
    const visit=async(mode,lang)=>{await page.goto(`${origin}/?review=1&case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>window.__attemptQueries.length),0);await open();};
    const settled=()=>page.waitForFunction(()=>document.querySelector('[data-attempt-refresh]')?.disabled===false
      && !!document.querySelector('[data-staff-attempt-review] [data-attempt-list],[data-staff-attempt-review] [role="alert"]'));
    const inspect=async()=>{const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      private:/private (attempt|signed)|merchantUx\.staffAttempts/.test(document.body.innerText),
      controls:[...document.querySelectorAll('[data-staff-attempt-review] button,[data-staff-attempt-review] > summary')].every(n=>n.getBoundingClientRect().height>=44&&Boolean(n.textContent.trim())),writes:window.__staffWrites.length}));
      assert.equal(r.overflow,false);assert.equal(r.private,false);assert.equal(r.controls,true);assert.equal(r.writes,0);assert.deepEqual(errors,[]);};
    const check=async()=>{await page.click('[data-staff-attempt="30"] [data-attempt-check]');await page.waitForSelector('[data-attempt-notice]');await settled();};
    const passed=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
    for(const lang of ['ar','en']){
      for(const width of [320,375,430,1440]){
        await page.setViewport({width,height:900});await visit('pending',lang);await settled();
        await page.click('[data-attempt-kind="voice"]');await settled();await check();
        assert.deepEqual(await page.evaluate(()=>window.__attemptChecks),[{conversationId:4,kind:'voice',sourceId:30}]);
        await page.waitForFunction(()=>document.querySelector('[data-attempt-check]')?.disabled===false);await inspect();
        if([375,1440].includes(width))await page.screenshot({path:path.join(output,`attempt-review-${lang}-${width}.png`),fullPage:true});
        await page.reload({waitUntil:'networkidle0'});await open();await settled();await page.click('[data-attempt-kind="voice"]');await settled();await check();
        assert.deepEqual(await page.evaluate(()=>window.__attemptChecks),[{conversationId:4,kind:'voice',sourceId:30}]);
        assert.equal(await page.evaluate(()=>[...Array(sessionStorage.length)].some((_,i)=>/audioBase64|OggS/.test(sessionStorage.getItem(sessionStorage.key(i))))),false);
        passed('voice_check_survives_reload_without_original_recording',lang,{width});
      }
      await page.setViewport({width:375,height:900});
      for(const [index,diagnostic]of ['upload_unconfirmed','transport_unconfirmed','transport_pending','outcome_unknown','settlement_available','provider_failed','dispatch_suppressed','evidence_conflict'].entries()){
        const width=[320,375,430,1440][index%4];await page.setViewport({width,height:900});await visit('diag-'+diagnostic,lang);await settled();
        await page.waitForSelector(`[data-staff-attempt="30"] [data-attempt-diagnostic="${diagnostic}"]`);await inspect();
        assert.equal(await page.$eval('[data-staff-attempt="30"] [data-attempt-diagnostic]',n=>n.textContent.length>55),true);
        assert.equal(await page.$eval('[data-staff-attempt="30"]',n=>n.dataset.attemptState),diagnostic==='provider_failed'?'failed':diagnostic==='dispatch_suppressed'?'suppressed':diagnostic==='evidence_conflict'?'unavailable':'pending');
        await page.click('[data-attempt-refresh]');await settled();assert.equal(await page.evaluate(()=>window.__attemptChecks.length),0);
        if(diagnostic==='evidence_conflict')assert.equal(await page.$('[data-staff-attempt="30"] [data-attempt-check]'),null);
        if(diagnostic==='outcome_unknown'){await page.setViewport({width:375,height:900});await inspect();await page.screenshot({path:path.join(output,`attempt-diagnostic-${lang}-375.png`),fullPage:true});}
        passed('diagnostic_'+diagnostic,lang,{width});
      }
      await page.setViewport({width:375,height:900});
      for(const mode of ['accepted','projection','failed','suppressed','error','bad-result']){
        await visit(mode,lang);await settled();await check();await inspect();assert.equal(await page.evaluate(()=>window.__attemptChecks.length),1);
        if(['accepted','projection'].includes(mode))await page.waitForSelector('[data-staff-attempt="30"][data-attempt-state="accepted"]');
        else if(['error','bad-result'].includes(mode)){
          assert.equal(await page.$eval('[data-staff-attempt="30"] [data-attempt-check]',n=>n.disabled),true);
          await page.click('[data-attempt-refresh]');await settled();await page.waitForFunction(()=>document.querySelector('[data-staff-attempt="30"] [data-attempt-check]')?.disabled===false);
        }
        passed(mode,lang);
      }
      for(const mode of ['empty','list-error','invalid']){await visit(mode,lang);await settled();
        await page.waitForSelector(mode==='empty'?'[data-attempt-list]':'[data-staff-attempt-review] [role="alert"]');
        await inspect();assert.equal(await page.$('[data-attempt-check]'),null);passed(mode,lang);}
      await visit('pages',lang);await settled();assert.equal((await page.$$('[data-staff-attempt]')).length,20);await page.click('[data-attempt-older]');await settled();
      await page.waitForSelector('[data-staff-attempt="80"]');assert.equal(await page.$('[data-attempt-older]'),null);
      await page.click('[data-attempt-refresh]');await settled();await page.waitForSelector('[data-staff-attempt="100"]');passed('older_and_latest_pages',lang);
      await visit('pending',lang);await settled();await page.$eval('[data-attempt-check]',button=>{button.click();button.click();});await page.waitForSelector('[data-attempt-notice]');await settled();
      assert.equal(await page.evaluate(()=>window.__attemptChecks.length),1);passed('double_click_has_one_check',lang);
      await visit('pending',lang);await settled();await page.evaluate(()=>window.__reviewDenied=true);await check();await page.click('[data-attempt-refresh]');await settled();
      await page.waitForFunction(()=>!document.querySelector('[data-attempt-check]')&&!!document.querySelector('[data-staff-attempt-review] [role="alert"]'));
      assert.equal(await page.$('[data-attempt-check]'),null);await inspect();passed('revocation_hides_stale_actions',lang);
      await visit('pending',lang);await settled();await page.evaluate(()=>{window.__attemptCheckDelay=1200;window.__reviewResult='accepted';});await page.click('[data-attempt-check]');
      await page.click('[data-attempt-kind="voice"]');await settled();await new Promise(resolve=>setTimeout(resolve,1400));
      assert.equal(await page.$eval('[data-staff-attempt="30"]',n=>n.getAttribute('data-attempt-state')),'pending');assert.equal(await page.$('[data-attempt-notice]'),null);
      assert.deepEqual(await page.evaluate(()=>window.__attemptChecks),[{conversationId:4,kind:'text',sourceId:30}]);passed('late_text_check_cannot_retarget_voice',lang);
      await page.setViewport({width:1440,height:900});await visit('pending',lang);await settled();await page.evaluate(()=>{window.__attemptCheckDelay=1200;window.__reviewResult='accepted';});await page.click('[data-attempt-check]');
      await page.click('[data-staff-conversation="5"]');await page.click('[data-staff-attempt-review] > summary');await settled();await new Promise(resolve=>setTimeout(resolve,1400));
      assert.equal(await page.$('[data-staff-attempt]'),null);assert.equal(await page.$('[data-attempt-notice]'),null);await inspect();passed('late_check_cannot_retarget_conversation',lang);
      await visit('pending',lang);await settled();await page.focus('[data-attempt-kind="voice"]');await page.keyboard.press('Enter');await settled();
      await page.focus('[data-attempt-check]');await page.keyboard.press('Enter');await page.waitForSelector('[data-attempt-notice]');assert.equal(await page.$eval('[data-attempt-notice]',n=>n.getAttribute('role')),'status');
      await inspect();passed('keyboard_and_live_status',lang);
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,fixtureApi:true,externalRequestsBlocked:true,
      scope:'Actual Conversations and StaffAttemptReview with simulated API. No live provider, production or physical iPhone/Safari.',results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))},null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){const page=(await browser.pages()).at(-1);if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});console.error({completed:results.length,last:results.at(-1),stack:e.stack});throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
