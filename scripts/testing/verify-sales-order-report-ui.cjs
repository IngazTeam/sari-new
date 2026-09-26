const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process'), esbuild = require('esbuild'), puppeteer = require('puppeteer-core');
const dir = path.resolve('.tmp/sales-order-report-ui'), output = path.resolve('docs/audits/sales-brain-implementation-2026-09-23/order-report-ui');

async function main() {
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const fixtures = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/testing/fixtures/sales-order-report-data.ts'], { encoding: 'utf8', windowsHide: true, maxBuffer: 4e6 });
  JSON.parse(fixtures);
  await esbuild.build({ entryPoints: ['scripts/testing/fixtures/sales-order-report-ui-entry.tsx'], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', __REPORT_FIXTURES__: fixtures }, alias: { '@': path.resolve('client/src') } });
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
  try {
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith(origin)||req.url().startsWith('data:')?req.continue():req.abort());
    const record=(mode,extra={})=>results.push({mode,...extra,passed:true});
    const visit=async(mode='mixed',lang='ar',merchant='7')=>{await page.goto(`${origin}/?case=${mode}&lang=${lang}&merchantId=${merchant}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-sales-idle]');assert.deepEqual(await page.evaluate(()=>window.__salesReads),[]);};
    const set=values=>page.evaluate(values=>{for(const[key,value]of Object.entries(values)){const node=document.querySelector(`[data-sales-field=${key}]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}},values);
    const read=async()=>{await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-result]');};
    const check=async()=>{
      const state=await page.$eval('[data-sales-report-page]',node=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:node.innerText.includes('salesEvidence.'),private:node.innerText.includes('private server'),
        controls:[...node.querySelectorAll('input,button,summary')].filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize),input:n.tagName==='INPUT',label:n.tagName!=='INPUT'||!!document.querySelector(`label[for="${CSS.escape(n.id)}"]`)}))}));
      assert.equal(state.overflow,false);assert.equal(state.raw,false);assert.equal(state.private,false);
      assert.ok(state.controls.every(n=>n.height>=44&&n.label));assert.ok(state.controls.filter(n=>n.input).every(n=>n.font>=16));
      assert.deepEqual(await page.evaluate(()=>window.__salesWrites),[]);assert.equal(await page.evaluate(()=>window.__salesXss),undefined);
    };
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:1000,isMobile:width<500,hasTouch:width<500});await visit('mixed',lang);
      await set({merchant:'٧',from:'۱',through:'۵'});await page.focus('[data-sales-read]');await page.keyboard.press('Enter');await page.waitForSelector('[data-sales-result]');
      assert.deepEqual(await page.evaluate(()=>window.__salesReads),[{merchantId:7,fromFactId:1,throughFactId:5}]);
      assert.equal(await page.$$eval('[data-sales-order]',nodes=>nodes.length),5);await check();
      await page.focus('[data-sales-details] summary');await page.keyboard.press('Enter');assert.equal(await page.$eval('[data-sales-details]',n=>n.open),true);await check();
      if([375,1440].includes(width))await page.screenshot({path:path.join(output,`report-${lang}-${width}.png`),fullPage:true});
      record('read_normalized_keyboard_details_layout',{width,lang});
      await set({merchant:'8'});assert.equal(await page.$('[data-sales-result]'),null);assert.equal((await page.evaluate(()=>window.__salesReads)).length,1);record('merchant_edit_hides_old_report_without_read',{width,lang});
    }
    await page.setViewport({width:375,height:812,isMobile:true,hasTouch:true});
    for(const mode of ['empty','unmeasured','refund','huge','limit']){
      await visit(mode,'en');await read();await check();
      if(mode==='empty'){assert.ok(await page.$('[data-sales-empty]'));assert.equal(await page.$('[data-sales-metric=netAmount]'),null);}
      if(mode==='unmeasured')assert.equal(await page.$eval('[data-sales-metric=netAmount]',n=>n.textContent),'No recorded evidence');
      if(mode==='refund')assert.match(await page.$eval('[data-sales-metric=netAmount]',n=>n.textContent),/0\.00/);
      if(mode==='huge')assert.match(await page.$eval('[data-sales-metric=netAmount]',n=>n.textContent),/90,071,992,547,409\.91/);
      if(mode==='limit')assert.equal(await page.$$eval('[data-sales-order]',nodes=>nodes.length),200);
      record(`${mode}_bounded_truthful_display`);
    }
    for(const mode of ['FORBIDDEN','UNAUTHORIZED','PRECONDITION_FAILED','INTERNAL_SERVER_ERROR','foreign','range-mismatch','unsupported']){
      await visit(mode);await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-error]');assert.equal(await page.$('[data-sales-result]'),null);await check();record(`${mode}_no_stale_report_or_error_leak`);
    }
    await visit('xss');await read();await page.click('[data-sales-details] summary');assert.equal(await page.$('[data-sales-result] img'),null);await check();record('untrusted_text_escaped');
    for(const code of ['FORBIDDEN','UNAUTHORIZED','INTERNAL_SERVER_ERROR']){
      await visit();await read();await page.evaluate(code=>window.__salesNextError=code,code);await page.click('[data-sales-refresh]');
      await page.waitForSelector('[data-sales-loading]');assert.equal(await page.$('[data-sales-result]'),null);await page.waitForSelector('[data-sales-error]');assert.equal(await page.$('[data-sales-result]'),null);
      await page.click('[data-sales-refresh]');await page.waitForSelector('[data-sales-result]');await check();record(`${code}_refresh_hides_cached_data_then_recovers`);
    }
    await visit();await read();await page.evaluate(()=>{window.__salesNextError='FORBIDDEN';window.__salesFocus();});await page.waitForSelector('[data-sales-error]');assert.equal(await page.$('[data-sales-result]'),null);record('window_refocus_rechecks_authority');
    await visit('refresh-changed','en');await read();const before=await page.$eval('[data-sales-metric=netAmount]',n=>n.textContent);await page.click('[data-sales-refresh]');await page.waitForSelector('[data-sales-loading]');await page.waitForSelector('[data-sales-result]');assert.notEqual(await page.$eval('[data-sales-metric=netAmount]',n=>n.textContent),before);record('refresh_replaces_snapshot_without_adding_totals');
    await visit('race','en');await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-loading]');await set({merchant:'8'});await read();await page.waitForSelector('[data-sales-empty]');
    await page.waitForFunction(()=>window.__salesAborted>0);assert.match(await page.$eval('[data-sales-scope]',n=>n.textContent),/Merchant 8/);await check();record('merchant_change_aborts_old_request');
    for(const values of [{merchant:'1e3'},{from:'0'},{from:'4',through:'3'},{through:'9007199254740992'}]){
      await visit();await set(values);await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-invalid]');assert.deepEqual(await page.evaluate(()=>window.__salesReads),[]);record('invalid_form_no_request',{values});
    }
    await visit();await read();await set({from:'2'});assert.equal(await page.$('[data-sales-result]'),null);record('range_edit_hides_old_report');
    await visit();await read();await page.evaluate(()=>history.pushState({},'',`/?case=mixed&lang=ar&merchantId=8`));await page.waitForSelector('[data-sales-idle]');
    assert.equal(await page.$('[data-sales-result]'),null);assert.equal(await page.$eval('[data-sales-field=merchant]',n=>n.value),'8');assert.equal((await page.evaluate(()=>window.__salesReads)).length,1);record('contextual_navigation_discards_old_scope');
    await visit();await read();await page.evaluate(()=>window.__salesOnline(false));await page.click('[data-sales-refresh]');await page.waitForSelector('[data-sales-paused]');
    assert.equal(await page.$('[data-sales-result]'),null);assert.equal((await page.evaluate(()=>window.__salesReads)).length,1);await page.evaluate(()=>window.__salesOnline(true));await page.waitForSelector('[data-sales-result]');record('offline_refresh_hides_cache_until_verified_again');
    await visit('slow');await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-loading]');assert.equal(await page.$eval('[data-sales-refresh]',n=>n.disabled),true);await check();await page.waitForSelector('[data-sales-result]');record('loading_disables_refresh');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await visit('slow');await page.click('[data-sales-read]');await page.waitForSelector('[data-sales-loading]');
    assert.equal(await page.$eval('[data-sales-refresh] svg',n=>getComputedStyle(n).animationName),'none');record('reduced_motion_no_spinner_animation');
    assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,fixtureApi:true,realReactQueryAndTrpc:true,externalRequestsBlocked:true,
      scope:'SalesEvidence page with real React Query/tRPC hooks and simulated read transport. Desktop and mobile Chromium viewports; not physical iPhone/Safari or an authenticated production journey.',
      results,errors,screenshots:fs.readdirSync(output).filter(name=>name.endsWith('.png'))};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  } catch(error) {
    const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.evaluate(()=>({text:document.body.innerText,reads:window.__salesReads})).catch(()=>null));}throw error;
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
