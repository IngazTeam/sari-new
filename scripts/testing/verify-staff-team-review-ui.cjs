const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
 const dir=path.resolve('.tmp/staff-team-review-ui'),output=path.resolve(process.env.STAFF_TEAM_REVIEW_UI_OUTPUT||'.tmp/staff-team-review-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
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
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  const visit=async(mode,lang)=>{await page.goto(`${origin}/?team=1&case=${mode}&lang=${lang}`,{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>window.__teamQueries.length),0);if(mode!=='viewer'){await page.waitForSelector('[data-team-review] > summary');await page.click('[data-team-review] > summary');}};
  const settled=()=>page.waitForFunction(()=>document.querySelector('[data-team-refresh]')?.disabled===false&&!!document.querySelector('[data-team-list],[data-team-review] [role="alert"]'));
  const inspect=async()=>{const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,private:/private team|merchantUx\.(teamAttempts|staffAttempts)/.test(document.body.innerText),
   controls:[...document.querySelectorAll('[data-team-review] button,[data-team-review] select,[data-team-review] input,[data-team-review] > summary')].every(n=>n.getBoundingClientRect().height>=44),writes:window.__staffWrites.length}));
   assert.equal(r.overflow,false);assert.equal(r.private,false);assert.equal(r.controls,true);assert.equal(r.writes,0);assert.deepEqual(errors,[]);};
  const check=async()=>{await page.select('[data-team-reason]','departed_employee');await page.click('[data-team-check]');await page.waitForSelector('[data-team-notice]');await settled();};
  const passed=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
  for(const lang of ['ar','en']){
   for(const width of [320,375,430,1440]){
    await page.setViewport({width,height:900});await visit('accepted',lang);await settled();assert.equal(await page.$eval('[data-team-check]',n=>n.disabled),true);
    await page.click('[data-team-kind="voice"]');await settled();await check();await page.waitForSelector('[data-team-attempt][data-team-state="accepted"]');
    const checks=await page.evaluate(()=>window.__teamChecks);assert.equal(checks.length,1);assert.deepEqual(Object.keys(checks[0]).sort(),['kind','sourceId','authorUserId','conversationId','requestId','reason'].sort());assert.equal(checks[0].kind,'voice');
    await page.click('[data-team-mode="history"]');await settled();await page.waitForSelector('[data-team-audit]');await inspect();
    if([375,1440].includes(width))await page.screenshot({path:path.join(output,`team-review-${lang}-${width}.png`),fullPage:true});
    passed('responsive_reason_and_audit',lang,{width});
   }
   await page.setViewport({width:375,height:900});
   for(const mode of ['pending','unavailable','failed','suppressed','projection','error','bad-result']){
    await visit(mode,lang);await settled();await check();await inspect();assert.equal(await page.evaluate(()=>window.__teamChecks.length),1);
    if(['error','bad-result'].includes(mode)){assert.equal(await page.$eval('[data-team-check]',n=>n.disabled),true);await page.click('[data-team-refresh]');await settled();await page.waitForFunction(()=>document.querySelector('[data-team-check]')?.disabled===false);await page.click('[data-team-check]');await page.waitForFunction(()=>window.__teamChecks.length===2);
     const requests=await page.evaluate(()=>window.__teamChecks);assert.deepEqual(requests[0],requests[1]);}
    passed(mode,lang);
   }
   for(const mode of ['empty','list-error','invalid','viewer']){await visit(mode,lang);if(mode!=='viewer')await settled();await inspect();assert.equal(await page.$('[data-team-check]'),null);if(mode==='viewer')assert.equal(await page.$('[data-team-review]'),null);passed(mode,lang);}
   await visit('pages',lang);await settled();assert.equal((await page.$$('[data-team-attempt]')).length,20);await page.click('[data-team-older]');await settled();await page.waitForSelector('[data-team-attempt="80"]');assert.equal((await page.$$('[data-team-attempt]')).length,3);await page.click('[data-team-refresh]');await settled();await page.waitForSelector('[data-team-attempt="100"]');passed('pagination',lang);
   await visit('pending',lang);await settled();await page.type('[data-team-conversation]','4');await page.type('[data-team-author]','8');await page.click('[data-team-apply]');await settled();await page.waitForFunction(()=>window.__teamQueries.at(-1).input.authorUserId===8);
   await page.click('[data-team-conversation]');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.type('[data-team-conversation]','-1');
   const before=await page.evaluate(()=>window.__teamQueries.length);await page.click('[data-team-apply]');await page.waitForSelector('[data-team-review] [role="alert"]');assert.equal(await page.evaluate(()=>window.__teamQueries.length),before);passed('filters_and_invalid_input',lang);
   await visit('pending',lang);await settled();await page.select('[data-team-reason]','incident_review');await page.$eval('[data-team-check]',n=>{n.click();n.click();});await page.waitForSelector('[data-team-notice]');assert.equal(await page.evaluate(()=>window.__teamChecks.length),1);passed('double_click',lang);
   await visit('pending',lang);await settled();await page.evaluate(()=>window.__teamDenied=true);await check();await page.click('[data-team-refresh]');await settled();await page.waitForSelector('[data-team-review] [role="alert"]');assert.equal(await page.$('[data-team-check]'),null);passed('revocation',lang);
   await visit('lost-ack',lang);await settled();await check();assert.equal(await page.$eval('[data-team-check]',n=>n.disabled),true);await page.click('[data-team-refresh]');await settled();await page.waitForSelector('[data-team-attempt][data-team-state="accepted"]');
   await page.click('[data-team-mode="history"]');await settled();await page.waitForSelector('[data-team-audit]');assert.equal((await page.$$('[data-team-audit]')).length,1);assert.equal(await page.evaluate(()=>window.__teamChecks.length),1);passed('lost_ack_visible_in_history',lang);
   await visit('accepted',lang);await settled();await page.evaluate(()=>window.__teamDelay=1200);await page.select('[data-team-reason]','delivery_check');await page.click('[data-team-check]');await page.click('[data-team-kind="voice"]');await settled();await new Promise(r=>setTimeout(r,1400));
   assert.equal(await page.$('[data-team-notice]'),null);assert.equal(await page.$eval('[data-team-attempt]',n=>n.getAttribute('data-team-state')),'pending');passed('late_result_cannot_retarget',lang);
   await visit('accepted',lang);await settled();await page.evaluate(()=>window.__teamDelay=1200);await page.select('[data-team-reason]','delivery_check');await page.click('[data-team-check]');await page.type('[data-team-conversation]','5');await page.click('[data-team-apply]');await settled();await new Promise(r=>setTimeout(r,1400));
   assert.equal(await page.$('[data-team-notice]'),null);assert.equal(await page.$('[data-team-attempt]'),null);passed('late_result_cannot_retarget_filter',lang);
   await visit('pending',lang);await settled();await page.focus('[data-team-reason]');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-team-check')),true);await page.keyboard.press('Enter');await page.waitForSelector('[data-team-notice]');passed('keyboard',lang);
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors:errors.length}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
