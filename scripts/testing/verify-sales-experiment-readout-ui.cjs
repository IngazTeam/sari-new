const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process'), esbuild = require('esbuild'), puppeteer = require('puppeteer-core');
const dir = path.resolve('.tmp/sales-experiment-readout-ui'), output = path.resolve(process.env.SALES_READOUT_UI_OUTPUT || '.tmp/sales-experiment-readout-ui/results');

async function main() {
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const fixtures = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/testing/fixtures/sales-experiment-readout-data.ts'], { encoding: 'utf8', windowsHide: true, maxBuffer: 4e6 });
  JSON.parse(fixtures);
  await esbuild.build({ entryPoints: ['scripts/testing/fixtures/sales-experiment-readout-ui-entry.tsx'], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', __READOUT_FIXTURES__: fixtures }, alias: { '@': path.resolve('client/src') } });
  const publicDir = path.resolve('dist/public');
  const styles = fs.readdirSync(path.join(publicDir, 'assets')).filter(name => /^(?:index|App)-[\w-]+\.css$/.test(name))
    .sort((a,b) => Number(b.startsWith('index-')) - Number(a.startsWith('index-')) || a.localeCompare(b));
  assert.equal(styles.filter(name => name.startsWith('index-')).length, 1, 'Build global styles first');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(name=>`<link rel="stylesheet" href="/assets/${name}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return; }
    const file = pathname === '/fixture.js' ? path.join(dir,'fixture.js') : path.resolve(publicDir, '.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`, browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const results=[],errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith(origin)||req.url().startsWith('data:')?req.continue():req.abort());
    const record=(mode,extra={})=>results.push({mode,...extra,passed:true});
    const visit=async(mode='mixed',lang='ar')=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}&merchantId=1&protocolId=4`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-readout-idle]');assert.deepEqual(await page.evaluate(()=>window.__readoutReads),[]);};
    const set=values=>page.evaluate(values=>{for(const[key,value]of Object.entries(values)){const node=document.querySelector(`[data-readout-field=${key}]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}},values);
    const read=async()=>{await page.click('[data-readout-read]');await page.waitForSelector('[data-readout-result]');};
    const check=async()=>{
      const state=await page.$eval('[data-readout-page]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,
        raw:/salesReadout\.|salesEvidence\.|merchantUx\.|\{\{/.test(node.innerText),private:node.innerText.includes('private server'),
        controls:[...node.querySelectorAll('input,button,summary,a')].filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),input:n.tagName==='INPUT',label:n.tagName!=='INPUT'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`)}))}));
      assert.equal(state.overflow,false);assert.equal(state.raw,false);assert.equal(state.private,false);assert.ok(state.controls.every(n=>n.height>=44&&n.label));assert.ok(state.controls.filter(n=>n.input).every(n=>n.font>=16));
      assert.deepEqual(await page.evaluate(()=>window.__readoutWrites),[]);assert.equal(await page.evaluate(()=>window.__readoutXss),undefined);
    };
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:1000,isMobile:width<500,hasTouch:width<500});await visit('mixed',lang);
      await set({merchant:'١',protocol:'۴'});await page.focus('[data-readout-read]');await page.keyboard.press('Enter');await page.waitForSelector('[data-readout-result]');
      assert.deepEqual(await page.evaluate(()=>window.__readoutReads),[{merchantId:1,protocolId:4}]);assert.equal(await page.$$eval('[data-readout-arm]',n=>n.length),2);assert.equal(await page.$$eval('[data-readout-finance]',n=>n.length),3);
      await page.focus('[data-readout-window] summary');await page.keyboard.press('Enter');assert.equal(await page.$eval('[data-readout-window]',n=>n.open),true);
      await page.focus('[data-readout-counts] summary');await page.keyboard.press('Enter');await page.click('[data-readout-identity] summary');await check();
      assert.equal(await page.$eval('[data-readout-orders-link]',n=>n.getAttribute('href')),'/admin/sales-evidence?merchantId=1');
      if([375,1440].includes(width))await page.screenshot({path:path.join(output,`readout-${lang}-${width}.png`),fullPage:true});record('normalized_keyboard_details_responsive',{width,lang});
      if(width===375&&lang==='ar'){
        await (await page.$('[data-readout-arm=baseline]')).screenshot({path:path.join(output,'readout-ar-mobile-arm.png')});
        await (await page.$('[data-readout-finance=baseline-SAR-order]')).screenshot({path:path.join(output,'readout-ar-mobile-finance.png')});
      }
      await set({protocol:'5'});assert.equal(await page.$('[data-readout-result]'),null);assert.equal((await page.evaluate(()=>window.__readoutReads)).length,1);record('protocol_edit_discards_previous_read',{width,lang});
    }
    await page.setViewport({width:375,height:812,isMobile:true,hasTouch:true});
    for(const mode of ['empty','unmeasured','refund','late','pending','review','unassigned','huge','live','withdrawn','minimum']){
      await visit(mode,'en');await read();await check();
      if(['pending','review','unassigned'].includes(mode)){assert.ok(await page.$('[data-readout-unresolved]'));assert.equal(await page.$('[data-readout-finance]'),null);}
      if(['empty','unmeasured','minimum'].includes(mode)){assert.ok(await page.$('[data-readout-unmeasured]'));assert.equal(await page.$('[data-readout-finance]'),null);}
      if(mode==='empty')assert.ok(await page.$('[data-readout-empty]'));
      if(mode==='refund')assert.match(await page.$eval('[data-readout-metric=netCutoff]',n=>n.textContent),/0\.00/);
      if(mode==='late'){assert.match(await page.$eval('[data-readout-metric=netCutoff]',n=>n.textContent),/150\.00/);assert.match(await page.$eval('[data-readout-metric=netCurrent]',n=>n.textContent),/0\.00/);}
      if(mode==='huge')assert.match(await page.$eval('[data-readout-metric=netCurrent]',n=>n.textContent),/90,071,992,547,409\.91/);
      if(mode==='live'){assert.equal(await page.$eval('[data-readout-arm=baseline] [data-readout-metric=pending]',n=>n.textContent),'1');assert.match(await page.$eval('[data-readout-sample]',n=>n.textContent),/has not closed/);}
      if(mode==='withdrawn')assert.match(await page.$eval('[data-readout-state]',n=>n.textContent),/Withdrawn/);
      if(mode==='minimum')assert.match(await page.$eval('[data-readout-sample]',n=>n.textContent),/Both arms reached/);
      record(`${mode}_truthful_display`);
    }
    await visit('mixed','en');await read();assert.match(await page.$eval('[data-readout-finance=baseline-USD-booking] [data-readout-units]',n=>n.textContent),/recorded minor units/);
    assert.equal(await page.$eval('[data-readout-finance=baseline-USD-booking] [data-readout-metric=captured]',n=>n.textContent),'15,000');record('currency_scale_not_invented');
    await visit('many','en');await read();const denominator=await page.$eval('[data-readout-arm=baseline]',n=>n.innerText);const seen=new Set();
    for(let i=0;i<3;i++){for(const id of await page.$$eval('[data-readout-finance]',nodes=>nodes.map(n=>n.dataset.readoutFinance))){assert.ok(!seen.has(id));seen.add(id);}await check();if(i<2)await page.click('[data-readout-next]');}
    assert.equal(seen.size,15);assert.equal(await page.$eval('[data-readout-next]',n=>n.disabled),true);assert.equal(await page.$eval('[data-readout-arm=baseline]',n=>n.innerText),denominator);
    await page.click('[data-readout-prev]');await page.click('[data-readout-prev]');assert.equal(await page.$eval('[data-readout-prev]',n=>n.disabled),true);assert.equal((await page.evaluate(()=>window.__readoutReads)).length,1);record('all_financial_cards_paginated_without_slicing_denominator');
    await visit('many-refresh','en');await read();await page.click('[data-readout-next]');await page.click('[data-readout-next]');await page.click('[data-readout-refresh]');await page.waitForSelector('[data-readout-loading]');await page.waitForSelector('[data-readout-result]');
    assert.equal(await page.$$eval('[data-readout-finance]',n=>n.length),1);assert.match(await page.$eval('[data-readout-page-count]',n=>n.textContent),/Cards 1–1 of 1/);record('new_snapshot_resets_financial_page');
    for(const mode of ['FORBIDDEN','UNAUTHORIZED','PRECONDITION_FAILED','INTERNAL_SERVER_ERROR','foreign','wrong-protocol','unsupported','inconsistent','xss']){
      await visit(mode);await page.click('[data-readout-read]');await page.waitForSelector('[data-readout-error]');assert.equal(await page.$('[data-readout-result]'),null);await check();record(`${mode}_safe_error`);
    }
    for(const code of ['FORBIDDEN','UNAUTHORIZED','INTERNAL_SERVER_ERROR']){
      await visit();await read();await page.evaluate(code=>window.__readoutNextError=code,code);await page.click('[data-readout-refresh]');await page.waitForSelector('[data-readout-loading]');assert.equal(await page.$('[data-readout-result]'),null);
      await page.waitForSelector('[data-readout-error]');assert.equal(await page.$('[data-readout-result]'),null);await page.click('[data-readout-refresh]');await page.waitForSelector('[data-readout-result]');await check();record(`${code}_refresh_hides_cache_and_recovers`);
    }
    await visit();await read();await page.evaluate(()=>{window.__readoutNextError='FORBIDDEN';window.__readoutFocus();});await page.waitForSelector('[data-readout-error]');assert.equal(await page.$('[data-readout-result]'),null);record('focus_revalidates_authority');
    await visit();await read();await page.evaluate(()=>window.__readoutOnline(false));await page.click('[data-readout-refresh]');await page.waitForSelector('[data-readout-paused]');assert.equal(await page.$('[data-readout-result]'),null);
    await page.evaluate(()=>window.__readoutOnline(true));await page.waitForSelector('[data-readout-result]');record('offline_refresh_hides_cache_until_new_read');
    for(const field of ['merchant','protocol']){
      await visit('race','en');await page.click('[data-readout-read]');await page.waitForSelector('[data-readout-loading]');await set({[field]:field==='merchant'?'8':'5'});await read();await page.waitForSelector('[data-readout-empty]');
      assert.equal((await page.evaluate(()=>window.__readoutReads)).length,2);assert.ok(await page.evaluate(()=>window.__readoutAborted>0));await check();record(`${field}_change_cancels_delayed_read`);
    }
    await visit();await read();await page.evaluate(()=>history.pushState({},'',`/?case=mixed&lang=ar&merchantId=8&protocolId=5`));await page.waitForSelector('[data-readout-idle]');
    assert.equal(await page.$('[data-readout-result]'),null);assert.equal(await page.$eval('[data-readout-field=merchant]',n=>n.value),'8');assert.equal(await page.$eval('[data-readout-field=protocol]',n=>n.value),'5');record('context_navigation_resets_form_and_result');
    for(const values of [{merchant:'1e3'},{protocol:'0'},{protocol:'9007199254740992'},{protocol:'4bad'}]){
      await visit();await set(values);await page.click('[data-readout-read]');await page.waitForSelector('[data-readout-invalid]');assert.deepEqual(await page.evaluate(()=>window.__readoutReads),[]);record('invalid_form_no_read',{values});
    }
    await visit('refresh-changed','en');await read();await page.click('[data-readout-refresh]');await page.waitForSelector('[data-readout-loading]');await page.waitForSelector('[data-readout-result]');assert.equal(await page.$$eval('[data-readout-finance]',n=>n.length),1);record('refresh_replaces_old_groups');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await visit('slow');await page.click('[data-readout-read]');await page.waitForSelector('[data-readout-loading]');
    assert.equal(await page.$eval('[data-readout-refresh]',n=>n.disabled),true);assert.equal(await page.$eval('[data-readout-refresh] svg',n=>getComputedStyle(n).animationName),'none');await check();await page.waitForSelector('[data-readout-result]');record('reduced_motion_and_loading');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,fixtureApi:true,realReactQueryAndTrpc:true,
      externalRequestsBlocked:true,scope:'SalesExperimentEvidence component in Chromium with simulated read transport. Not physical iPhone/Safari or a signed-in production journey.',results,errors,
      screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))},null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(error){const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.evaluate(()=>({text:document.body.innerText,reads:window.__readoutReads})).catch(()=>null));}throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
