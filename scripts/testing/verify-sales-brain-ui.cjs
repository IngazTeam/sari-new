const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const esbuild = require('esbuild'), puppeteer = require('puppeteer-core');
const onlyPolicyReview = process.argv.includes('--only-policy-review');
const onlyEvaluation = process.argv.includes('--only-evaluation');
const onlyInspection = process.argv.includes('--only-inspection');
const onlyCohort = process.argv.includes('--only-cohort');
const onlyProtocol = process.argv.includes('--only-protocol');
const dir = path.resolve('.tmp/brain-ui'), output = path.resolve(onlyInspection ? '.tmp/inspection-ui-targeted' : onlyCohort ? '.tmp/cohort-ui-targeted' : onlyProtocol ? '.tmp/protocol-ui-targeted' : onlyEvaluation ? '.tmp/evaluation-ui-targeted' : onlyPolicyReview ? '.tmp/policy-ui-targeted' : 'docs/audits/sales-brain-implementation-2026-09-23/ui');
async function main() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  await esbuild.build({ entryPoints: [path.resolve('scripts/testing/fixtures/brain-ui-entry.tsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@/lib/trpc': path.resolve('scripts/testing/fixtures/brain-ui-trpc.tsx'), '@': path.resolve('client/src') } });
  const publicDir = path.resolve('dist/public');
  // main.tsx loads index.css before App. A split App stylesheet can sort first;
  // selecting the first CSS asset would omit Tailwind and test an unstyled page.
  const styles = fs.readdirSync(path.join(publicDir, 'assets')).filter(name => /^(?:index|App)-[\w-]+\.css$/.test(name))
    .sort((a, b) => Number(b.startsWith('index-')) - Number(a.startsWith('index-')) || a.localeCompare(b));
  assert.equal(styles.filter(name => name.startsWith('index-')).length, 1, 'Build must contain exactly one global index stylesheet');
  const styleLinks = styles.map(name => `<link rel="stylesheet" href="/assets/${name}">`).join('');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styleLinks}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`); }
    const file = pathname === '/fixture.js' ? path.join(dir, 'fixture.js') : path.resolve(publicDir, '.' + pathname);
    if (file !== path.join(dir, 'fixture.js') && !file.startsWith(publicDir + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [], errors = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true); page.on('request', req => req.url().startsWith(origin) || req.url().startsWith('data:') ? req.continue() : req.abort());
    if (onlyInspection || !onlyCohort && !onlyPolicyReview && !onlyEvaluation && !onlyProtocol) await require('./verify-sales-cohort-inspection-ui.cjs')(page, origin, output, results);
    if (!onlyInspection && (onlyCohort || !onlyPolicyReview && !onlyEvaluation && !onlyProtocol)) await require('./verify-sales-cohort-ui.cjs')(page, origin, output, results);
    if (!onlyInspection && !onlyCohort && (onlyProtocol || !onlyPolicyReview && !onlyEvaluation)) await require('./verify-sales-protocol-ui.cjs')(page, origin, output, results);
    if (!onlyInspection && !onlyCohort && !onlyPolicyReview && !onlyProtocol) await require('./verify-learning-policy-evaluation-ui.cjs')(page, origin, output, results);
    if (!onlyInspection && !onlyCohort && !onlyEvaluation && !onlyProtocol) await require('./verify-learning-policy-review-ui.cjs')(page, origin, output, results);
    if (!onlyInspection && !onlyCohort && !onlyPolicyReview && !onlyEvaluation && !onlyProtocol) {
    await require('./verify-learning-status-ui.cjs')(page, origin, output, results);
    await require('./verify-appointment-reminders-ui.cjs')(page, origin, output, results);
    await require('./verify-ai-capabilities-ui.cjs')(page, origin, output, results);
    await require('./verify-booking-consent-ui.cjs')(page, origin, output, results);
    await require('./verify-booking-calendar-ui.cjs')(page, origin, output, results);
    await require('./verify-booking-reschedule-ui.cjs')(page, origin, output, results);
    await require('./verify-booking-cancellation-ui.cjs')(page, origin, output, results);
    await require('./verify-calendar-ui.cjs')(page, origin, output, results);
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});await page.goto(`${origin}/?case=booking-ops-ready&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-booking-operations]');
      const layout=await page.$eval('#booking-operations-fixture',node=>({overflow:document.documentElement.scrollWidth>innerWidth,rawKeys:node.innerText.includes('merchantUx.'),buttons:[...node.querySelectorAll('button,select')].map(b=>b.getBoundingClientRect().height)}));
      assert.equal(layout.overflow,false);assert.equal(layout.rawKeys,false);assert.ok(layout.buttons.every(h=>h>=44));
      assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);
      await page.select('[data-booking-operations] select','confirmed');assert.equal(await page.evaluate(()=>window.__operationCount),undefined);
      await page.click('[data-booking-operation-save]');assert.equal(await page.$eval('[data-booking-operation-refresh]',n=>n.disabled),true);
      await page.waitForFunction(()=>window.__operationParentRefreshed===true);await page.waitForSelector('[data-booking-operation-audit]');
      const input=await page.evaluate(()=>window.__operationInput);assert.equal(input.bookingId,321);assert.equal(input.expectedStatus,'pending');assert.equal(input.status,'confirmed');assert.match(input.operationId,/^[a-f0-9-]{36}$/);assert.equal('paymentStatus' in input,false);
      assert.equal(await page.evaluate(()=>window.__operationCount),1);assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#booking-operations-fixture')).screenshot({path:path.join(output,`booking-operations-${width}.png`)});
      results.push({width,lang,mode:'booking_operations_explicit_save_and_audit',passed:true});
    }
    for(const state of ['cancelled','completed','no-show','paid','refunded','loading','error','fetching','audit']){
      await page.goto(`${origin}/?case=booking-ops-${state}`,{waitUntil:'networkidle0'});
      if(['cancelled','completed','no-show','refunded','fetching'].includes(state))assert.equal(await page.$eval('[data-booking-operations] select',n=>n.disabled),true);
      if(['completed','no-show','paid','refunded'].includes(state))assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);
      if(state==='loading')await page.waitForSelector('#booking-operations-fixture [role=status]');
      if(state==='error'){await page.waitForSelector('#booking-operations-fixture [role=alert]');await page.click('#booking-operations-fixture button');await page.waitForSelector('[data-booking-operations]');}
      if(state==='audit')await page.waitForSelector('[data-booking-operation-audit]');results.push({width:1440,mode:`booking_operations_${state}`,passed:true});
    }
    for(const state of ['write-error','refresh-error','parent-error','stale']){
      await page.goto(`${origin}/?case=booking-ops-${state}`,{waitUntil:'networkidle0'});await page.select('[data-booking-operations] select','confirmed');await page.click('[data-booking-operation-save]');
      await page.waitForFunction(()=>window.__operationCount===1&&!document.querySelector('[data-booking-operation-refresh]').disabled);
      if(state!=='stale')await page.waitForSelector('#booking-operations-fixture [role=alert]');
      assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);assert.equal(await page.$eval('#booking-operations-fixture',n=>n.innerText.includes('private')),false);
      results.push({width:1440,mode:`booking_operations_${state}_single_submit`,passed:true});
    }
    for(const state of ['delete','delete-blocked']){
      await page.goto(`${origin}/?case=booking-ops-${state}`,{waitUntil:'networkidle0'});await page.click('[data-booking-operations] input[type=checkbox]');await page.select('[data-booking-operations] select','confirmed');
      assert.equal(await page.$eval('[data-booking-operations] input[type=checkbox]',n=>n.checked),false);await page.click('[data-booking-operations] input[type=checkbox]');await page.click('[data-booking-operation-delete]');
      if(state==='delete')await page.waitForSelector('[data-booking-deleted]');else{await page.waitForSelector('#booking-operations-fixture [role=alert]');assert.equal(await page.$eval('[data-booking-operation-delete]',n=>n.disabled),true);}
      const input=await page.evaluate(()=>window.__operationInput);assert.equal(input.expectedStatus,'pending');assert.equal('status' in input,false);assert.equal(await page.evaluate(()=>window.__operationCount),1);
      results.push({width:1440,mode:`booking_operations_${state}_attestation`,passed:true});
    }
    await page.goto(`${origin}/?case=booking-ops-ready`,{waitUntil:'networkidle0'});await page.select('[data-booking-operations] select','confirmed');await page.click('[data-booking-operations] input[type=checkbox]');
    await page.evaluate(()=>window.__changeOperationalBooking());await page.waitForFunction(()=>document.querySelector('[data-booking-operations] select').value==='cancelled');
    assert.equal(await page.$eval('[data-booking-operations] input[type=checkbox]',n=>n.checked),false);assert.equal(await page.$eval('[data-booking-operation-save]',n=>n.disabled),true);
    results.push({width:1440,mode:'booking_operations_changed_status_clears_consent',passed:true});
    const renewalForm='[data-booking-link-renewal-form]';
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});
      await page.goto(`${origin}/?case=booking-renewal-ready&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector(renewalForm);
      const layout=await page.$eval('#booking-renewal-fixture',node=>({overflow:document.documentElement.scrollWidth>innerWidth,rawKeys:node.innerText.includes('merchantUx.'),buttons:[...node.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)}));
      assert.equal(layout.overflow,false);assert.equal(layout.rawKeys,false);assert.ok(layout.buttons.every(h=>h>=44));
      assert.equal(await page.$eval('[data-booking-link-renew]',n=>n.disabled),true);
      await page.type(`${renewalForm} textarea`,'Customer requested another day');await page.focus(`${renewalForm} input`);await page.keyboard.press('Space');
      await page.evaluate(()=>window.__changeRenewalEvidence());await page.waitForFunction(()=>document.querySelector('[data-booking-link-renewal-form] textarea').value==='');
      assert.equal(await page.$eval(`${renewalForm} input`,n=>n.checked),false);
      await page.type(`${renewalForm} textarea`,'Customer requested another day');await page.click(`${renewalForm} input`);
      await page.type(`${renewalForm} textarea`,' to pay');assert.equal(await page.$eval(`${renewalForm} input`,n=>n.checked),false);await page.click(`${renewalForm} input`);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#booking-renewal-fixture')).screenshot({path:path.join(output,`booking-link-renewal-${width}.png`)});
      await page.click('[data-booking-link-renew]');
      assert.equal(await page.$eval('[data-booking-link-renewal-refresh]',n=>n.disabled),true);
      await page.waitForSelector('[data-booking-link-renewal-audit]');await page.waitForFunction(()=>window.__renewalParentRefreshed===true);
      assert.equal(await page.$(renewalForm),null);assert.equal(await page.evaluate(()=>window.__renewalCount),1);
      assert.deepEqual(await page.evaluate(()=>window.__renewalInput),{bookingId:321,evidence:'b'.repeat(64),reason:'Customer requested another day to pay',reviewed:true});
      results.push({width,lang,mode:'booking_renewal_evidence_attestation_single_submit_audit',passed:true});
    }
    for(const state of ['booking','legacy','identity','link','payment','fetching','empty','loading','error','audit','xss']){
      await page.setViewport({width:375,height:812});await page.goto(`${origin}/?case=booking-renewal-${state}`,{waitUntil:'networkidle0'});
      if(['booking','legacy','identity','link','payment','empty'].includes(state))assert.equal(await page.$(renewalForm),null);
      if(state==='fetching')assert.equal(await page.$eval(`${renewalForm} textarea`,n=>n.disabled),true);
      if(state==='loading')await page.waitForSelector('#booking-renewal-fixture [role=status]');
      if(state==='error'){await page.waitForSelector('#booking-renewal-fixture [role=alert]');await page.click('#booking-renewal-fixture button');await page.waitForSelector(renewalForm);}
      if(['audit','xss'].includes(state))await page.waitForSelector('[data-booking-link-renewal-audit]');
      if(state==='xss'){assert.equal(await page.$('#booking-renewal-fixture img'),null);assert.equal(await page.evaluate(()=>window.__renewalXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
      results.push({width:375,mode:`booking_renewal_${state}`,passed:true});
    }
    for(const state of ['write-error','refresh-error','stale-response']){
      await page.goto(`${origin}/?case=booking-renewal-${state}`,{waitUntil:'networkidle0'});await page.waitForSelector(renewalForm);
      await page.type(`${renewalForm} textarea`,'Customer requested another day');await page.click(`${renewalForm} input`);await page.click('[data-booking-link-renew]');
      await page.waitForFunction(()=>window.__renewalCount===1&&!document.querySelector('[data-booking-link-renewal-refresh]').disabled);
      if(state==='refresh-error')assert.equal(await page.$(renewalForm),null);
      else assert.equal(await page.$eval('[data-booking-link-renew]',n=>n.disabled),true);
      if(state!=='stale-response')await page.waitForSelector('#booking-renewal-fixture [role=alert]');
      assert.equal(await page.$eval('#booking-renewal-fixture',n=>n.innerText.includes('private financial')),false);
      results.push({width:375,mode:`booking_renewal_${state}_requires_fresh_read`,passed:true});
    }
    const bookingReview='[data-booking-checkout-review]';
    for(const width of [320,375,390,768,1440])for(const lang of ['ar','en']){
      await page.setViewport({width,height:width<500?812:900,deviceScaleFactor:1});
      await page.goto(`${origin}/?case=booking-review-ready&lang=${lang}`,{waitUntil:'networkidle0'});await page.waitForSelector(bookingReview);
      const bookingLayout=await page.$eval('#booking-checkout-fixture',node=>({overflow:document.documentElement.scrollWidth>innerWidth,rawKeys:node.innerText.includes('merchantUx.'),buttons:[...node.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)}));
      assert.equal(bookingLayout.overflow,false);assert.equal(bookingLayout.rawKeys,false);assert.ok(bookingLayout.buttons.every(h=>h>=44));
      assert.equal(await page.$eval(`${bookingReview} button`,n=>n.disabled),true);
      await page.type(`${bookingReview} input:not([type])`,'chg_fixture_1');await page.focus(`${bookingReview} input[type=checkbox]`);await page.keyboard.press('Space');
      await page.evaluate(()=>window.__changeBookingEvidence());await page.waitForFunction(()=>document.querySelector('[data-booking-checkout-review] input:not([type])').value==='');
      assert.equal(await page.$eval(`${bookingReview} input[type=checkbox]`,n=>n.checked),false);
      await page.type(`${bookingReview} input:not([type])`,'chg_fixture_1');await page.click(`${bookingReview} input[type=checkbox]`);await page.click(`${bookingReview} button`);
      await page.waitForFunction(()=>window.__bookingParentRefreshed===true);assert.equal(await page.evaluate(()=>window.__bookingReviewCount),1);
      assert.deepEqual(await page.evaluate(()=>window.__bookingReviewInput),{bookingId:321,attemptId:'00000000-0000-4000-8000-000000000000',chargeId:'chg_fixture_1',evidence:'b'.repeat(64),reviewed:true});
      assert.equal(await page.$eval(`${bookingReview} button`,n=>n.disabled),true);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#booking-checkout-fixture')).screenshot({path:path.join(output,`booking-checkout-review-${width}.png`)});
      await page.click('[data-booking-checkout-refresh]');assert.equal(await page.$eval(`${bookingReview} input:not([type])`,n=>n.value),'');
      results.push({width,lang,mode:'booking_review_evidence_keyboard_single_submit_parent_refresh',passed:true});
    }
    for(const state of ['write-error','unverified']){
      await page.goto(`${origin}/?case=booking-review-${state}`,{waitUntil:'networkidle0'});await page.waitForSelector(bookingReview);
      await page.type(`${bookingReview} input:not([type])`,'chg_fixture_1');await page.click(`${bookingReview} input[type=checkbox]`);await page.click(`${bookingReview} button`);
      await page.waitForSelector(`${bookingReview} [role=alert]`);assert.equal(await page.$eval(`${bookingReview} button`,n=>n.disabled),true);
      assert.equal(await page.$eval('#booking-checkout-fixture',n=>n.innerText.includes('private provider')),false);
      results.push({width:1440,mode:`booking_review_${state}_requires_refresh`,passed:true});
    }
    for(const state of ['empty','loading','error','blocked','audit','xss']){
      await page.goto(`${origin}/?case=booking-review-${state}`,{waitUntil:'networkidle0'});
      if(state==='error'){await page.waitForSelector('#booking-checkout-fixture [role=alert]');await page.click('#booking-checkout-fixture button');await page.waitForSelector('[data-booking-checkout-attempts]');}
      if(state==='loading')await page.waitForSelector('#booking-checkout-fixture [role=status]');
      if(state==='empty')assert.equal(await page.$('[data-booking-checkout-attempts]'),null);
      if(state==='blocked')assert.equal(await page.$(bookingReview),null);
      if(state==='audit')await page.waitForSelector('[data-booking-checkout-outcome]');
      if(state==='xss'){assert.equal(await page.$('#booking-checkout-fixture img'),null);assert.equal(await page.evaluate(()=>window.__bookingXss),undefined);}
      results.push({width:1440,mode:`booking_review_${state}`,passed:true});
    }
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport({ width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1 });
      for (const mode of ['ready', 'loading', 'error']) {
        await page.goto(`${origin}/?case=${mode}`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#invoice-fixture input');
        const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
          rawKeys: document.body.innerText.includes('merchantUx.'), targets: [...document.querySelectorAll('button')].map(b => b.getBoundingClientRect().height) }));
        assert.equal(layout.overflow, false, `Horizontal overflow at ${width}/${mode}`); assert.equal(layout.rawKeys, false);
        assert.ok(layout.targets.every(height => height >= 44), `Small tap target at ${width}/${mode}: ${layout.targets}`);
        assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]', node => node.disabled), true);
        if (mode === 'error') { await page.click('[role="alert"] button'); await page.waitForSelector('details'); }
        if (mode === 'ready') {
          await page.click('details summary');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(output, `learning-invoice-${width}.png`), fullPage: true });
          await page.click('#invoice-fixture input'); await page.click('#invoice-fixture [data-invoice-approve]');
          await page.waitForSelector('#invoice-fixture [role="status"] a');
          assert.deepEqual(await page.evaluate(() => window.__invoiceInput), { orderId: 123, expectedAmountMinor: 23000, totalIsFinal: true });
          assert.equal(await page.evaluate(() => window.__approved), true);
        }
        results.push({ width, mode, passed: true });
      }
    }
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${origin}/?case=mutation-error`, { waitUntil: 'networkidle0' });
    await page.click('#invoice-fixture input'); await page.click('#invoice-fixture [data-invoice-approve]');
    await page.waitForSelector('#invoice-fixture [role="alert"]');
    assert.equal(await page.$('#invoice-fixture [role="status"]'), null);
    await page.click('#invoice-fixture [data-invoice-approve]'); await page.waitForSelector('#invoice-fixture [role="status"]');
    results.push({ width: 375, mode: 'invoice_failure_retry', passed: true });
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${origin}/?case=ready`, { waitUntil: 'networkidle0' });
      assert.equal(await page.$eval('#zid-fixture button', b => b.disabled), true);
      await page.type('#zid-order-55', '999');
      assert.equal(await page.$eval('#zid-fixture button', b => b.disabled), true);
      await page.click('#zid-fixture input[type=checkbox]'); await page.click('#zid-fixture button');
      await page.waitForSelector('#zid-fixture [role=status]');
      assert.deepEqual(await page.evaluate(() => window.__zidInput), { quotationId: 55, orderId: 999, reviewed: true });
      await page.select('#sales-sector-select', 'training'); await page.click('#sector-fixture button');
      await page.waitForSelector('#sector-fixture [role=status]');
      assert.deepEqual(await page.evaluate(() => window.__sectorInput), { playbookId: 'training', expectedRevision: 0 });
      await page.click('#sector-fixture summary');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.evaluate(() => document.body.innerText.includes('merchantUx.')), false);
      results.push({ width, mode: 'zid_and_sector_save', passed: true });
    }
    await page.goto(`${origin}/?case=viewer`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$('#zid-order-55'), null); assert.equal(await page.$eval('#sales-sector-select', s => s.disabled), true);
    results.push({ width: 1440, mode: 'viewer_no_mutation_controls', passed: true });
    await page.goto(`${origin}/?case=empty`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$('#zid-order-55'), null);
    results.push({ width: 1440, mode: 'zid_empty', passed: true });
    await page.goto(`${origin}/?case=mutation-error`, { waitUntil: 'networkidle0' });
    await page.type('#zid-order-55', '999'); await page.click('#zid-fixture input[type=checkbox]'); await page.click('#zid-fixture button');
    await page.waitForSelector('#zid-fixture [role=alert]');
    assert.equal(await page.$('#zid-fixture [role=status]'), null);
    await page.click('#zid-fixture button'); await page.waitForSelector('#zid-fixture [role=status]');
    await page.select('#sales-sector-select', 'recruitment'); await page.click('#sector-fixture button');
    await page.waitForSelector('#sector-fixture [role=alert]'); assert.equal(await page.$('#sector-fixture [role=status]'), null);
    await page.click('#sector-fixture button'); await page.waitForSelector('#sector-fixture [role=status]');
    results.push({ width: 1440, mode: 'zid_sector_failure_retry', passed: true });
    const replace = async (selector, value) => {
      await page.click(selector); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      assert.equal(await page.$eval(selector, input => input.value), '', `Field must stay empty while editing: ${selector}`);
      await page.type(selector, value);
    };
    const fillMargin = async()=>{
      await page.type('#invoice-tax-123','٣٠');await page.type('#invoice-shipping-123','10');await page.type('#invoice-other-123','10');
      await page.click('#invoice-margin-preview-123');await page.waitForSelector('#invoice-margin-123 [aria-live]');
    };
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=discounted-ready&lang=${lang}`,{waitUntil:'networkidle0'});
      await page.waitForSelector('#invoice-fixture [data-discount-state=pending]');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.$eval('#invoice-fixture',n=>n.innerText.includes('merchantUx.')),false);
      assert.ok(await page.$eval('#invoice-fixture [data-checkout-discount]',n=>n.textContent.includes('SAVE_')));
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#invoice-fixture')).screenshot({path:path.join(output,`checkout-discount-${width}.png`)});
      await page.click('#invoice-final-attested-123');await page.click('#invoice-fixture [data-invoice-approve]');await page.waitForSelector('#invoice-fixture [data-discount-state=applied]');
      assert.deepEqual(await page.evaluate(()=>window.__invoiceInput),{orderId:123,expectedAmountMinor:23000,totalIsFinal:true});
      results.push({width,lang,mode:'checkout_discount_breakdown_and_final_amount',passed:true});
    }
    await page.goto(`${origin}/?case=discounted-invalid`,{waitUntil:'networkidle0'});await page.waitForSelector('#invoice-fixture [role=alert]');await page.click('#invoice-final-attested-123');
    assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);assert.equal(await page.evaluate(()=>window.__invoiceInput),undefined);
    results.push({width:1440,mode:'checkout_discount_inconsistent_amount_blocks_review',passed:true});
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=checkout-attempts-ready&lang=${lang}`,{waitUntil:'networkidle0'});
      await page.waitForSelector('[data-checkout-attempts]');assert.equal((await page.$$('#checkout-attempts-fixture article')).length,4);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.$eval('#checkout-attempts-fixture',n=>n.innerText.includes('merchantUx.')),false);
      assert.equal(await page.$('#checkout-attempts-fixture a'),null);
      assert.ok(await page.$eval('#checkout-attempts-fixture button',n=>n.getBoundingClientRect().height>=44));
      await page.click('#checkout-attempts-fixture [data-checkout-refresh]');assert.equal(await page.evaluate(()=>window.__attemptRefreshed),true);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#checkout-attempts-fixture')).screenshot({path:path.join(output,`checkout-attempts-${width}.png`)});
      results.push({width,lang,mode:'checkout_attempts_states_and_refresh',passed:true});
    }
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=coupon-release-ready&lang=${lang}`,{waitUntil:'networkidle0'});
      await page.waitForSelector('[data-coupon-release-review]');assert.equal(await page.$eval('[data-coupon-release-save]',n=>n.disabled),true);
      assert.ok(await page.$('#coupon-release-fixture [data-discount-state=historical]'));
      await page.type('#coupon-release-reason-123','سبب المراجعة لإلغاء الطلب قبل تحصيل المبلغ');await page.click('#coupon-release-fixture input[type=checkbox]');
      await page.type('#coupon-release-reason-123',' بعد المطابقة');assert.equal(await page.$eval('#coupon-release-fixture input[type=checkbox]',n=>n.checked),false);
      await page.click('#coupon-release-fixture input[type=checkbox]');await page.evaluate(()=>window.__changeCouponRelease());
      await page.waitForFunction(()=>!document.querySelector('#coupon-release-fixture input[type=checkbox]').checked);
      assert.equal(await page.$eval('[data-coupon-release-save]',n=>n.disabled),true);
      await page.type('#coupon-release-reason-123','سبب المراجعة لإلغاء الطلب قبل تحصيل المبلغ');await page.click('#coupon-release-fixture input[type=checkbox]');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.ok(await page.$$eval('#coupon-release-fixture button,#coupon-release-fixture textarea',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      await page.focus('[data-coupon-release-save]');await page.keyboard.press('Enter');await page.waitForSelector('[data-coupon-release-audit]');
      assert.deepEqual(await page.evaluate(()=>window.__couponReleaseInput),{orderId:123,evidence:'b'.repeat(64),reason:'سبب المراجعة لإلغاء الطلب قبل تحصيل المبلغ',reviewed:true});
      assert.equal(await page.evaluate(()=>window.__couponReleaseCount),1);assert.equal(await page.$('[data-coupon-release-save]'),null);
      assert.equal(await page.$eval('#coupon-release-fixture',n=>n.innerText.includes('merchantUx.')),false);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#coupon-release-fixture')).screenshot({path:path.join(output,`coupon-release-${width}.png`)});
      results.push({width,lang,mode:'coupon_release_review_fresh_evidence_keyboard_audit',passed:true});
    }
    for(const blocker of ['legacy','order','identity','payment','coupon','counter']) {
      await page.setViewport({width:320,height:812});await page.goto(`${origin}/?case=coupon-release-${blocker}`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-coupon-release-blocker]');
      assert.equal(await page.$('[data-coupon-release-save]'),null);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      results.push({width:320,mode:`coupon_release_blocked_${blocker}`,passed:true});
    }
    for(const state of ['loading','error','empty','write-error','audit']) {
      await page.goto(`${origin}/?case=coupon-release-${state}`,{waitUntil:'networkidle0'});
      if(state==='loading')await page.waitForSelector('#coupon-release-fixture [role=status]');
      if(state==='error'){await page.waitForSelector('#coupon-release-fixture [role=alert]');await page.click('#coupon-release-fixture button');await page.waitForSelector('[data-coupon-release]');}
      if(state==='empty')assert.equal(await page.$('[data-coupon-release]'),null);
      if(state==='write-error') {await page.type('#coupon-release-reason-123','Reviewed cancellation before any collection');await page.click('#coupon-release-fixture input[type=checkbox]');await page.click('[data-coupon-release-save]');
        await page.waitForSelector('#coupon-release-fixture [role=alert]');assert.equal(await page.$eval('[data-coupon-release-save]',n=>n.disabled),true);assert.equal(await page.$eval('#coupon-release-fixture',n=>n.textContent.includes('private coupon')),false);
        await page.click('[data-coupon-release-refresh]');assert.equal(await page.$eval('#coupon-release-reason-123',n=>n.value),'');}
      if(state==='audit'){assert.equal(await page.$('#coupon-release-fixture img'),null);assert.equal(await page.evaluate(()=>window.__couponXss),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
      results.push({width:320,mode:`coupon_release_${state}`,passed:true});
    }
    const checkoutReview='#checkout-attempts-fixture [data-checkout-review]';
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=checkout-attempts-ready&lang=${lang}`,{waitUntil:'networkidle0'});
      await page.waitForSelector(checkoutReview);assert.equal((await page.$$(`${checkoutReview}`)).length,2);
      assert.equal(await page.$eval(`${checkoutReview} button`,n=>n.disabled),true);
      await page.type(`${checkoutReview} input[type=text],${checkoutReview} input:not([type])`,'chg_fixture_1');
      assert.equal(await page.$eval(`${checkoutReview} button`,n=>n.disabled),true);
      await page.click(`${checkoutReview} input[type=checkbox]`);await page.type(`${checkoutReview} input:not([type])`,'2');
      assert.equal(await page.$eval(`${checkoutReview} input[type=checkbox]`,n=>n.checked),false);
      await page.click(`${checkoutReview} input[type=checkbox]`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.$eval('#checkout-attempts-fixture',n=>n.innerText.includes('merchantUx.')),false);
      await page.focus(`${checkoutReview} button`);await page.keyboard.press('Enter');await page.waitForSelector(`${checkoutReview} [role=status]`);
      assert.deepEqual(await page.evaluate(()=>window.__checkoutReviewInput),{orderId:123,attemptId:'00000000-0000-4000-8000-000000000000',evidence:'a'.repeat(64),chargeId:'chg_fixture_12',reviewed:true});
      assert.equal(await page.evaluate(()=>window.__checkoutReviewCount),1);assert.equal(await page.$eval(`${checkoutReview} button`,n=>n.disabled),true);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#checkout-attempts-fixture')).screenshot({path:path.join(output,`checkout-reconciliation-${width}.png`)});
      await page.click('[data-checkout-refresh]');assert.equal(await page.$eval(`${checkoutReview} input:not([type])`,n=>n.value),'');
      results.push({width,lang,mode:'checkout_reconcile_explicit_review_keyboard_single_submit',passed:true});
    }
    for(const state of ['unverified','reconcile-error']) {
      await page.goto(`${origin}/?case=checkout-attempts-${state}`,{waitUntil:'networkidle0'});await page.waitForSelector(checkoutReview);
      await page.type(`${checkoutReview} input:not([type])`,'chg_fixture_1');await page.click(`${checkoutReview} input[type=checkbox]`);await page.click(`${checkoutReview} button`);
      await page.waitForSelector(`${checkoutReview} [role=alert]`);assert.equal(await page.$eval(`${checkoutReview} button`,n=>n.disabled),true);
      assert.equal(await page.$eval('#checkout-attempts-fixture',n=>n.innerText.includes('private provider')),false);
      results.push({width:1440,mode:`checkout_reconcile_${state}_requires_refresh`,passed:true});
    }
    for(const state of ['error','loading','empty']) {
      await page.goto(`${origin}/?case=checkout-attempts-${state}`,{waitUntil:'networkidle0'});
      if(state==='error'){await page.waitForSelector('#checkout-attempts-fixture [role=alert]');await page.click('#checkout-attempts-fixture button');await page.waitForSelector('[data-checkout-attempts]');}
      if(state==='loading')await page.waitForSelector('#checkout-attempts-fixture [role=status]');
      if(state==='empty')assert.equal(await page.$('[data-checkout-attempts]'),null);
      results.push({width:1440,mode:`checkout_attempts_${state}`,passed:true});
    }
    await page.goto(`${origin}/?case=checkout-attempts-xss`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-checkout-attempts]');
    assert.equal(await page.$('#checkout-attempts-fixture img'),null);assert.equal(await page.evaluate(()=>window.__attemptXss),undefined);
    results.push({width:1440,mode:'checkout_attempts_reference_escaped',passed:true});
    const exceptionReason='اعتماد خاص لهذه الفاتورة بعد مراجعة التكاليف';
    const reviewException=async()=>{
      await page.type('#invoice-exception-reason-123',exceptionReason);
      await page.focus('#invoice-exception-reviewed-123');await page.keyboard.press('Space');
      await page.click('#invoice-final-attested-123');
    };
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=margin-exception&lang=${lang}`,{waitUntil:'networkidle0'});
      await fillMargin();assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
      await reviewException();assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),false);
      await replace('#invoice-exception-reason-123','قصير');
      assert.equal(await page.$eval('#invoice-exception-reviewed-123',n=>n.checked),false);
      assert.equal(await page.$eval('#invoice-final-attested-123',n=>n.checked),false);
      await page.click('#invoice-exception-reviewed-123');await page.click('#invoice-final-attested-123');
      assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
      await replace('#invoice-exception-reason-123',exceptionReason);await page.click('#invoice-exception-reviewed-123');await page.click('#invoice-final-attested-123');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.ok(await page.$$eval('#invoice-fixture button,#invoice-fixture textarea',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#invoice-fixture')).screenshot({path:path.join(output,`margin-exception-${width}.png`)});
      await page.focus('#invoice-fixture [data-invoice-approve]');await page.keyboard.press('Enter');await page.waitForSelector('#invoice-fixture [data-margin-exception-audit]');
      assert.deepEqual(await page.evaluate(()=>window.__invoiceInput),{orderId:123,expectedAmountMinor:23000,totalIsFinal:true,margin:{
        costs:{taxMinor:3000,shippingCostMinor:1000,otherCostMinor:1000},evidence:'c'.repeat(64),reviewedCosts:true,exception:{reason:exceptionReason,reviewed:true}}});
      assert.equal(await page.evaluate(()=>window.__marginPolicyInput),undefined);
      assert.equal(await page.evaluate(()=>document.body.innerText.includes('merchantUx.')),false);
      assert.ok(await page.$eval('#invoice-fixture [data-margin-exception-audit]',n=>n.textContent.includes('اعتماد خاص لهذه الفاتورة')));
      results.push({width,lang,mode:'invoice_exception_reason_review_keyboard_approval_audit',passed:true});
      await page.goto(`${origin}/?case=margin-audit&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$('#margin-audit-fixture img'),null);assert.equal(await page.$('#margin-audit-fixture button'),null);
      assert.ok(await page.$eval('#margin-audit-fixture',n=>n.textContent.includes('-15%')));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(lang==='ar'&&width===375)await(await page.$('#margin-audit-fixture')).screenshot({path:path.join(output,'margin-exception-audit-375.png')});
      results.push({width,lang,mode:'invoice_exception_historical_audit_and_escaped_reason',passed:true});
    }
    for(const mode of ['margin-supervisor','margin-missing']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});await fillMargin();
      assert.equal(await page.$('#invoice-exception-reason-123'),null);await page.click('#invoice-final-attested-123');
      assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
      results.push({width:1440,mode:`exception_unavailable_${mode}`,passed:true});
    }
    for(const change of ['cost','policy']) {
      await page.goto(`${origin}/?case=margin-exception`,{waitUntil:'networkidle0'});await fillMargin();await reviewException();
      if(change==='cost')await replace('#invoice-other-123','11');else await page.evaluate(()=>window.__changeMarginPolicy());
      await page.waitForFunction(()=>document.querySelector('#invoice-fixture [data-invoice-approve]').disabled);
      assert.equal(await page.$eval('#invoice-final-attested-123',n=>n.checked),false);
      assert.equal(await page.evaluate(()=>window.__invoiceInput),undefined);
      if(change==='cost') {
        await page.click('#invoice-margin-preview-123');await page.waitForSelector('#invoice-exception-reviewed-123');
        assert.equal(await page.$eval('#invoice-exception-reviewed-123',n=>n.checked),false);
      }
      results.push({width:1440,mode:`exception_review_invalidated_by_${change}`,passed:true});
    }
    await page.goto(`${origin}/?case=margin-exception-failure`,{waitUntil:'networkidle0'});await fillMargin();await reviewException();await page.click('#invoice-fixture [data-invoice-approve]');
    await page.waitForSelector('#invoice-fixture > section > [role=alert]');assert.equal(await page.$('#invoice-fixture [data-margin-exception-audit]'),null);
    await page.click('#invoice-fixture [data-invoice-approve]');await page.waitForSelector('#invoice-fixture [data-margin-exception-audit]');
    results.push({width:1440,mode:'exception_failed_approval_retry_without_false_success',passed:true});
    for(const mode of ['margin-audit-loading','margin-audit-error']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$('#margin-audit-fixture [data-margin-exception-audit]'),null);
      if(mode==='margin-audit-error'){await page.click('#margin-audit-fixture button');await page.waitForSelector('#margin-audit-fixture [data-margin-exception-audit]');}
      else assert.ok(await page.$('#margin-audit-fixture [role=status]'));
      results.push({width:1440,mode,passed:true});
    }
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=ready&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$eval('#margin-policy-save',n=>n.disabled),true);
      await page.click('#margin-policy-enabled');await page.click('#margin-policy-reviewed');await replace('#margin-policy-percent','35');
      assert.equal(await page.$eval('#margin-policy-reviewed',n=>n.checked),false);
      assert.equal(await page.$eval('#margin-policy-save',n=>n.disabled),true);
      await page.click('#margin-policy-reviewed');await page.click('#margin-policy-save');await page.waitForSelector('#margin-policy-fixture [role=status]');
      assert.deepEqual(await page.evaluate(()=>window.__marginPolicyInput),{policy:{enabled:true,minPercent:35},expectedRevision:0,evidence:'a'.repeat(64),reviewed:true});
      assert.equal(await page.evaluate(()=>window.__unexpectedMarginSubmit),undefined);
      await page.click('#margin-policy-fixture summary');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#margin-policy-fixture')).screenshot({path:path.join(output,`margin-policy-${width}.png`)});
      results.push({width,lang,mode:'margin_policy_review_and_save',passed:true});
      await page.goto(`${origin}/?case=margin-ready&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$eval('#invoice-margin-preview-123',n=>n.disabled),true);await page.click('#invoice-final-attested-123');
      assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
      await fillMargin();
      assert.deepEqual(await page.evaluate(()=>window.__marginPreviewInput),{orderId:123,costs:{taxMinor:3000,shippingCostMinor:1000,otherCostMinor:1000}});
      assert.equal(await page.$eval('#invoice-final-attested-123',n=>n.checked),false);
      await page.click('#invoice-margin-123 summary');assert.equal(await page.$('#invoice-margin-123 img'),null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.evaluate(()=>document.body.innerText.includes('merchantUx.')),false);
      await page.$eval('#invoice-fixture',async node=>{await Promise.allSettled(node.getAnimations({subtree:true}).map(a=>a.finished));});
      assert.ok(await page.$$eval('#invoice-fixture input:not([type=checkbox]),#invoice-fixture button',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#invoice-fixture')).screenshot({path:path.join(output,`invoice-margin-${width}.png`)});
      await page.click('#invoice-final-attested-123');await replace('#invoice-other-123','11');
      assert.equal(await page.$eval('#invoice-final-attested-123',n=>n.checked),false);
      assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
      await page.click('#invoice-margin-preview-123');await page.waitForSelector('#invoice-margin-123 [aria-live]');
      await page.click('#invoice-final-attested-123');await page.click('#invoice-fixture [data-invoice-approve]');
      await page.waitForSelector('#invoice-fixture [role=status] a');
      assert.deepEqual(await page.evaluate(()=>window.__invoiceInput),{orderId:123,expectedAmountMinor:23000,totalIsFinal:true,
        margin:{costs:{taxMinor:3000,shippingCostMinor:1000,otherCostMinor:1100},evidence:'c'.repeat(64),reviewedCosts:true}});
      results.push({width,lang,mode:'invoice_margin_preview_cost_edit_reapproval',passed:true});
    }
    for(const mode of ['viewer','loading','error']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});assert.equal(await page.$('#margin-policy-save'),null);
      if(mode==='viewer')assert.ok(await page.$$eval('#margin-policy-fixture input',nodes=>nodes.every(n=>n.disabled)));
      if(mode==='error'){await page.click('#margin-policy-fixture button');await page.waitForSelector('#margin-policy-save');}
      results.push({width:1440,mode:`margin_policy_${mode}`,passed:true});
    }
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});
    for(const value of ['101','-1','1.5']){await replace('#margin-policy-percent',value);assert.equal(await page.$eval('#margin-policy-save',n=>n.disabled),true);}
    assert.equal(await page.evaluate(()=>window.__marginPolicyInput),undefined);results.push({width:1440,mode:'margin_policy_invalid_floor',passed:true});
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});await page.click('#margin-policy-enabled');await page.click('#margin-policy-reviewed');await page.evaluate(()=>window.__changeMarginPolicy());
    await page.waitForSelector('#margin-policy-fixture [role=alert]');assert.equal(await page.$eval('#margin-policy-reviewed',n=>n.checked),false);
    assert.equal(await page.$eval('#margin-policy-enabled',n=>n.checked),true);await page.click('#margin-policy-fixture [role=alert] button');
    assert.equal(await page.$eval('#margin-policy-enabled',n=>n.checked),false);results.push({width:1440,mode:'margin_policy_stale_draft_refresh',passed:true});
    await page.goto(`${origin}/?case=mutation-error`,{waitUntil:'networkidle0'});await page.click('#margin-policy-enabled');await page.click('#margin-policy-reviewed');await page.click('#margin-policy-save');
    await page.waitForSelector('#margin-policy-fixture [role=alert]');assert.equal(await page.$eval('#margin-policy-save',n=>n.disabled),true);
    await page.click('#margin-policy-fixture [role=alert] button');await page.click('#margin-policy-enabled');await page.focus('#margin-policy-reviewed');await page.keyboard.press('Space');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'margin-policy-save');await page.keyboard.press('Enter');await page.waitForSelector('#margin-policy-fixture [role=status]');
    results.push({width:1440,mode:'margin_policy_failed_save_and_keyboard_review',passed:true});
    for(const mode of ['margin-missing','margin-below']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});await fillMargin();await page.click('#invoice-final-attested-123');
      assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);assert.equal(await page.evaluate(()=>window.__invoiceInput),undefined);
      results.push({width:1440,mode:`invoice_${mode}_blocked`,passed:true});
    }
    await page.goto(`${origin}/?case=margin-ready`,{waitUntil:'networkidle0'});await fillMargin();await page.click('#invoice-final-attested-123');await page.evaluate(()=>window.__changeMarginPolicy());
    await page.waitForFunction(()=>document.querySelector('#invoice-fixture [data-invoice-approve]').disabled);
    assert.equal(await page.$eval('#invoice-final-attested-123',n=>n.checked),false);results.push({width:1440,mode:'invoice_policy_changed_after_preview',passed:true});
    await page.goto(`${origin}/?case=margin-failure`,{waitUntil:'networkidle0'});
    await page.type('#invoice-tax-123','0.001');await page.type('#invoice-shipping-123','0');await page.type('#invoice-other-123','0');
    assert.equal(await page.$eval('#invoice-margin-preview-123',n=>n.disabled),true);await replace('#invoice-tax-123','0');await page.click('#invoice-margin-preview-123');
    await page.waitForSelector('#invoice-margin-123 [role=alert]');assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),true);
    await page.click('#invoice-margin-preview-123');await page.waitForSelector('#invoice-margin-123 [aria-live]');await page.click('#invoice-final-attested-123');
    assert.equal(await page.$eval('#invoice-fixture [data-invoice-approve]',n=>n.disabled),false);results.push({width:1440,mode:'invoice_invalid_precision_and_preview_retry',passed:true});
    for (const lang of ['ar','en']) for (const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=ready&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$eval('#discount-policy-save',b=>b.disabled),true);
      await page.click('#discount-policy-enabled');await replace('#discount-policy-percent','1');
      assert.equal(await page.$eval('#discount-policy-save',b=>b.disabled),true);
      await page.click('#discount-policy-reviewed');await replace('#discount-policy-hours','12');
      assert.equal(await page.$eval('#discount-policy-reviewed',b=>b.checked),false,'Policy edits revoke the previous review');
      await page.click('#discount-policy-reviewed');await page.click('#discount-policy-save');
      await page.waitForSelector('#discount-policy-fixture [role=status]');
      assert.deepEqual(await page.evaluate(()=>window.__discountInput),{policy:{enabled:true,maxPercent:1,expireHours:12},expectedRevision:0,evidence:'a'.repeat(64),reviewed:true});
      assert.equal(await page.evaluate(()=>window.__unexpectedBotSubmit),undefined,'Policy buttons must not submit the parent bot settings form');
      assert.equal(await page.$eval('#discount-policy-save',b=>b.disabled),true);
      await page.click('#discount-policy-fixture summary');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.evaluate(()=>document.body.innerText.includes('merchantUx.')),false);
      await page.$eval('#discount-policy-fixture',async node=>{await Promise.allSettled(node.getAnimations({subtree:true}).map(a=>a.finished));});
      assert.ok(await page.$$eval('#discount-policy-fixture input:not([type=checkbox]), #discount-policy-fixture button, #discount-policy-fixture summary',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      if(lang==='ar'&&[375,1440].includes(width))await(await page.$('#discount-policy-fixture')).screenshot({path:path.join(output,`discount-policy-${width}.png`)});
      await page.click('#discount-policy-enabled');await page.click('#discount-policy-reviewed');await page.click('#discount-policy-save');
      await page.waitForFunction(()=>window.__discountInput?.policy.enabled===false);
      assert.equal(await page.evaluate(()=>window.__discountInput.expectedRevision),1);
      results.push({width,lang,mode:'discount_policy_review_save_history_disable',passed:true});
    }
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});
    for(const [selector,value] of [['#discount-policy-percent','0'],['#discount-policy-percent','51'],['#discount-policy-percent','1.5'],['#discount-policy-hours','169']]) {
      await replace(selector,value);assert.equal(await page.$eval('#discount-policy-save',b=>b.disabled),true);
    }
    assert.equal(await page.evaluate(()=>window.__discountInput),undefined);
    results.push({width:1440,mode:'discount_policy_invalid_values',passed:true});
    for(const mode of ['loading','error','viewer']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$('#discount-policy-save'),null);
      if(mode==='viewer')assert.ok(await page.$$eval('#discount-policy-fixture input',nodes=>nodes.every(n=>n.disabled)));
      if(mode==='error'){await page.click('#discount-policy-fixture button');await page.waitForSelector('#discount-policy-save');}
      results.push({width:1440,mode:`discount_policy_${mode}`,passed:true});
    }
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});
    await page.click('#discount-policy-enabled');await page.click('#discount-policy-reviewed');await page.evaluate(()=>window.__discountChanged());
    await page.waitForSelector('#discount-policy-fixture [role=alert]');
    assert.equal(await page.$eval('#discount-policy-reviewed',n=>n.checked),false);
    assert.equal(await page.$eval('#discount-policy-enabled',n=>n.checked),true,'Preserve draft until explicit refresh');
    assert.equal(await page.$eval('#discount-policy-save',n=>n.disabled),true);
    await page.click('#discount-policy-fixture [role=alert] button');
    assert.equal(await page.$eval('#discount-policy-enabled',n=>n.checked),false);
    results.push({width:1440,mode:'discount_policy_stale_review_requires_refresh',passed:true});
    await page.goto(`${origin}/?case=mutation-error`,{waitUntil:'networkidle0'});
    await page.click('#discount-policy-enabled');await page.click('#discount-policy-reviewed');await page.click('#discount-policy-save');
    await page.waitForSelector('#discount-policy-fixture [role=alert]');
    assert.equal(await page.$eval('#discount-policy-enabled',n=>n.checked),true);
    assert.equal(await page.$eval('#discount-policy-save',n=>n.disabled),true);assert.equal(await page.$('#discount-policy-fixture [role=status]'),null);
    await page.click('#discount-policy-fixture [role=alert] button');await page.click('#discount-policy-enabled');
    await page.focus('#discount-policy-reviewed');await page.keyboard.press('Space');await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'discount-policy-save');await page.keyboard.press('Enter');
    await page.waitForSelector('#discount-policy-fixture [role=status]');
    assert.equal(await page.evaluate(()=>window.__unexpectedBotSubmit),undefined);
    results.push({width:1440,mode:'discount_policy_failed_save_refresh_keyboard_review',passed:true});
    for (const lang of ['ar', 'en']) for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${origin}/?case=ready&lang=${lang}`, { waitUntil: 'networkidle0' });
      assert.equal(await page.$eval('#followup-fixture button', b => b.disabled), true);
      await replace('#followup-timezone', 'Europe/London'); await replace('#followup-weekly-limit', '2');
      await replace('#followup-start-hour', '10'); await replace('#followup-end-hour', '18');
      await page.click('#followup-fixture button'); await page.waitForSelector('#followup-fixture [role=status]');
      assert.deepEqual(await page.evaluate(() => window.__followupInput), { expectedRevision: 0,
        policy: { enabled: true, timeZone: 'Europe/London', weeklyLimit: 2, startHour: 10, endHour: 18 } });
      assert.equal(await page.$eval('#followup-fixture button', b => b.disabled), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.evaluate(() => document.body.innerText.includes('merchantUx.')), false);
      await page.$eval('#followup-fixture', async node => {
        await Promise.allSettled(node.getAnimations({ subtree: true }).map(animation => animation.finished));
      });
      assert.ok(await page.$$eval('#followup-fixture input:not([type=checkbox]), #followup-fixture button',
        inputs => inputs.every(input => input.getBoundingClientRect().height >= 44)), `Small followup control at ${width}/${lang}`);
      if (lang === 'ar' && [375, 1440].includes(width)) await (await page.$('#followup-fixture')).screenshot({ path: path.join(output, `followup-policy-${width}.png`) });
      await page.click('#followup-enabled'); await page.click('#followup-fixture button');
      await page.waitForFunction(() => window.__followupInput?.policy.enabled === false);
      assert.equal(await page.evaluate(() => window.__followupInput.expectedRevision), 1);
      results.push({ width, lang, mode: 'followup_save_and_disable', passed: true });
    }
    await page.goto(`${origin}/?case=ready`, { waitUntil: 'networkidle0' });
    await replace('#followup-timezone', 'Invalid/Zone');
    await page.waitForSelector('#followup-fixture [role=alert]');
    assert.equal(await page.$eval('#followup-fixture button', b => b.disabled), true);
    await replace('#followup-timezone', 'Asia/Riyadh'); await replace('#followup-weekly-limit', '9');
    assert.equal(await page.$eval('#followup-fixture button', b => b.disabled), true);
    await replace('#followup-weekly-limit', '2'); await replace('#followup-start-hour', '23');
    assert.equal(await page.$eval('#followup-fixture button', b => b.disabled), true);
    assert.equal(await page.evaluate(() => window.__followupInput), undefined);
    results.push({ width: 1440, mode: 'followup_invalid_policy_no_mutation', passed: true });
    await page.goto(`${origin}/?case=viewer`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$('#followup-fixture button'), null);
    assert.ok(await page.$$eval('#followup-fixture input', inputs => inputs.every(input => input.disabled)));
    results.push({ width: 1440, mode: 'followup_viewer_read_only', passed: true });
    await page.goto(`${origin}/?case=error`, { waitUntil: 'networkidle0' });
    await page.click('#followup-fixture [role=alert] button'); await page.waitForSelector('#followup-timezone');
    results.push({ width: 1440, mode: 'followup_load_retry', passed: true });
    await page.goto(`${origin}/?case=mutation-error`, { waitUntil: 'networkidle0' });
    await replace('#followup-weekly-limit', '1'); await page.click('#followup-fixture button');
    await page.waitForSelector('#followup-fixture [role=alert]');
    assert.equal(await page.$('#followup-fixture [role=status]'), null);
    await page.click('#followup-fixture button'); await page.waitForSelector('#followup-fixture [role=status]');
    results.push({ width: 1440, mode: 'followup_failure_retry', passed: true });
    for (const lang of ['ar', 'en']) for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 }); await page.goto(`${origin}/?case=ready&lang=${lang}`, { waitUntil: 'networkidle0' });
      await page.click('#handoff-fixture summary');
      assert.equal(await page.$('#handoff-fixture img'), null);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.evaluate(() => document.body.innerText.includes('merchantUx.')), false);
      await page.click('#handoff-fixture a[href="#conversation-message-81"]');
      await page.waitForSelector('[role=dialog] [data-handoff-source="81"]');
      await page.$eval('[role=dialog]', async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)); });
      assert.equal(await page.$('[role=dialog] img'), null);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.$eval('[role=dialog]', node => node.innerText.includes('merchantUx.')), false);
      assert.equal(await page.$eval('[role=dialog]', node => node.innerText.includes('common.')), false);
      assert.ok(await page.$$eval('[role=dialog] button', nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
      if (lang === 'ar' && width === 375) await page.screenshot({ path: path.join(output, 'handoff-source-375.png'), fullPage: false });
      await page.keyboard.press('Escape'); await page.waitForSelector('[role=dialog]', { hidden: true });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#conversation-message-81');
      await page.click('#handoff-fixture button'); await page.waitForSelector('#handoff-fixture [data-handoff-owner=human]');
      assert.deepEqual(await page.evaluate(() => window.__handoffInput), { conversationId: 42, expectedVersion: 0, expectedLastMessageId: 82, reviewed: false, action: 'takeover' });
      assert.equal(await page.$eval('#handoff-fixture button', b => b.disabled), true);
      if (lang === 'ar' && [375, 1440].includes(width)) await (await page.$('#handoff-fixture')).screenshot({ path: path.join(output, `handoff-${width}.png`) });
      await page.click('#handoff-fixture input[type=checkbox]'); await page.click('#handoff-fixture button');
      await page.waitForSelector('#handoff-fixture [data-handoff-owner=bot]');
      assert.deepEqual(await page.evaluate(() => window.__handoffInput), { conversationId: 42, expectedVersion: 1, expectedLastMessageId: 82, reviewed: true, action: 'resume' });
      assert.ok(await page.$$eval('#handoff-fixture button, #handoff-fixture a', nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
      results.push({ width, lang, mode: 'handoff_source_takeover_review_resume', passed: true });
    }
    for (const mode of ['viewer', 'empty', 'error', 'mutation-error']) {
      await page.goto(`${origin}/?case=${mode}`, { waitUntil: 'networkidle0' });
      if (mode === 'viewer') assert.equal(await page.$('#handoff-fixture button'), null);
      if (mode === 'empty') { await page.click('#handoff-fixture summary'); assert.equal(await page.$('#handoff-fixture a'), null); }
      if (mode === 'error') { await page.click('#handoff-fixture button'); await page.waitForSelector('#handoff-fixture summary'); }
      if (mode === 'mutation-error') {
        await page.click('#handoff-fixture button'); await page.waitForSelector('#handoff-fixture [role=alert]');
        assert.equal(await page.$('#handoff-fixture [data-handoff-owner=human]'), null);
        await page.click('#handoff-fixture button'); await page.waitForSelector('#handoff-fixture [data-handoff-owner=human]');
      }
      results.push({ width: 1440, mode: `handoff_${mode}`, passed: true });
    }
    await page.goto(`${origin}/?case=source-error`, { waitUntil: 'networkidle0' });
    await page.click('#handoff-fixture summary'); await page.click('#handoff-fixture a');
    await page.waitForSelector('[role=dialog] [role=alert]');
    assert.equal(await page.$('[role=dialog] [data-handoff-source]'), null);
    await page.click('[role=dialog] [role=alert] button'); await page.waitForSelector('[role=dialog] [data-handoff-source]');
    results.push({ width: 1440, mode: 'handoff_source_error_retry', passed: true });
    for (const lang of ['ar','en']) for (const width of [320,375,390,768,1440]) {
      await page.setViewport({width,height:900}); await page.goto(`${origin}/?case=ready&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.$eval('[data-relay-id="5"] button',b=>b.disabled),true);
      await page.click('#relay-fixture summary');
      assert.equal(await page.$('#relay-fixture img'),null);
      await page.type('#relay-note-5','Reviewed receipt; outcome still unknown.');
      assert.equal(await page.$eval('[data-relay-id="5"] button',b=>b.disabled),true);
      await page.click('[data-relay-id="5"] input[type=checkbox]'); await page.click('[data-relay-id="5"] button');
      await page.waitForSelector('[data-relay-review]');
      assert.deepEqual(await page.evaluate(()=>window.__relayInput),{conversationId:42,relayId:5,expectedRevision:0,evidence:'a'.repeat(64),reviewed:true,note:'Reviewed receipt; outcome still unknown.'});
      assert.equal(await page.$eval('[data-relay-id="5"] input[type=checkbox]',n=>n.checked),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.evaluate(()=>document.body.innerText.includes('merchantUx.')),false);
      assert.ok((await page.$$eval('#relay-fixture button',buttons=>buttons.map(b=>b.getBoundingClientRect().height))).every(h=>h>=44));
      if(lang==='ar'&&[375,1440].includes(width)) {
        await page.click('#relay-fixture summary');
        await page.$eval('#relay-fixture [data-relay-id]', node => { node.parentElement.scrollTop = 0; });
        await (await page.$('#relay-fixture')).screenshot({path:path.join(output,`relay-review-${width}.png`)});
      }
      results.push({width,mode:`relay_review_${lang}`,passed:true});
    }
    for (const mode of ['viewer','empty','error','loading','mutation-error']) {
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});
      if(['viewer','empty'].includes(mode))assert.equal(await page.$('#relay-fixture textarea'),null);
      if(mode==='loading')assert.ok(await page.$('#relay-fixture [role=status]'));
      if(mode==='error'){await page.click('#relay-fixture [role=alert] button');await page.waitForSelector('#relay-note-5');}
      if(mode==='mutation-error'){
        await page.type('#relay-note-5','Review failed; refresh first.');await page.click('[data-relay-id="5"] input[type=checkbox]');await page.click('[data-relay-id="5"] button');
        await page.waitForSelector('#relay-fixture [role=alert]');assert.equal(await page.$('[data-relay-review]'),null);
        await page.click('#relay-fixture [role=alert] button');assert.equal(await page.$eval('[data-relay-id="5"] input[type=checkbox]',n=>n.checked),false);
        await page.click('[data-relay-id="5"] input[type=checkbox]');await page.click('[data-relay-id="5"] button');await page.waitForSelector('[data-relay-review]');
      }
      results.push({width:1440,mode:`relay_${mode}`,passed:true});
    }
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});
    await page.click('#relay-fixture > section > div:last-child button:last-child');await page.waitForSelector('#relay-note-4');
    await page.click('#relay-fixture > section > div:last-child button:first-child');await page.waitForSelector('#relay-note-5');
    results.push({width:1440,mode:'relay_pagination',passed:true});
    const offerId='1c2e9491-2555-4fa3-a5e9-846efea99780';
    const openOffer=async()=>{await page.click('#offer-fixture > details > summary');await page.waitForSelector('#offer-fixture > details > section');};
    for(const lang of ['ar','en'])for(const width of [320,375,390,768,1440]){
      await page.setViewport({width,height:900});await page.goto(`${origin}/?case=ready&lang=${lang}`,{waitUntil:'networkidle0'});
      assert.equal(await page.evaluate(()=>window.__offerReads||0),0);
      await page.focus('#offer-fixture > details > summary');await page.keyboard.press('Enter');
      await page.waitForSelector(`#offer-note-${offerId}`);assert.equal(await page.evaluate(()=>window.__offerReads),1);
      assert.equal(await page.$eval('[data-offer-save]',b=>b.disabled),true);
      await page.click('#offer-fixture [data-offer-details] summary');assert.equal(await page.$('#offer-fixture img'),null);
      await page.type(`#offer-note-${offerId}`,'Reviewed receipt; <img src=x onerror=alert(1)> outcome unknown.');
      assert.equal(await page.$eval('[data-offer-save]',b=>b.disabled),true);
      await page.click('#offer-fixture input[type=checkbox]');await page.click('[data-offer-save]');
      await page.waitForSelector('[data-offer-last-review]');await page.waitForSelector('[data-offer-saved]');
      assert.deepEqual(await page.evaluate(()=>window.__offerInput),{conversationId:42,attemptId:offerId,expectedRevision:0,evidence:'a'.repeat(64),reviewed:true,note:'Reviewed receipt; <img src=x onerror=alert(1)> outcome unknown.'});
      assert.equal(await page.$eval('#offer-fixture input[type=checkbox]',n=>n.checked),false);
      assert.equal(await page.$eval(`#offer-note-${offerId}`,n=>n.value),'');assert.equal(await page.$('#offer-fixture img'),null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.$eval('#offer-fixture',n=>n.innerText.includes('merchantUx.')),false);
      assert.ok(await page.$$eval('#offer-fixture button, #offer-fixture summary',nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
      if(lang==='ar'&&[375,1440].includes(width)){
        await page.$eval('[data-offer-details]',n=>{n.open=false;});
        await page.$eval('[data-offer-id]',n=>{n.parentElement.scrollTop=0;});
        await (await page.$('#offer-fixture')).screenshot({path:path.join(output,`offer-review-${width}.png`)});
      }
      results.push({width,lang,mode:'offer_review_save_and_keyboard',passed:true});
    }
    for(const mode of ['viewer','empty','error','loading','mutation-error']){
      await page.goto(`${origin}/?case=${mode}`,{waitUntil:'networkidle0'});await openOffer();
      if(['viewer','empty'].includes(mode))assert.equal(await page.$('#offer-fixture textarea'),null);
      if(mode==='loading')assert.ok(await page.$('#offer-fixture [role=status]'));
      if(mode==='error'){await page.click('#offer-fixture [role=alert] button');await page.waitForSelector(`#offer-note-${offerId}`);}
      if(mode==='mutation-error'){
        await page.type(`#offer-note-${offerId}`,'Review failed; refresh and check again.');await page.click('#offer-fixture input[type=checkbox]');await page.click('[data-offer-save]');
        await page.waitForSelector('#offer-fixture [role=alert]');assert.equal(await page.$('[data-offer-last-review]'),null);assert.equal(await page.$eval('[data-offer-save]',n=>n.disabled),true);
        await page.click('#offer-fixture [role=alert] button');assert.equal(await page.$eval('#offer-fixture input[type=checkbox]',n=>n.checked),false);
        await page.click('#offer-fixture input[type=checkbox]');await page.click('[data-offer-save]');await page.waitForSelector('[data-offer-last-review]');
      }
      results.push({width:1440,mode:`offer_${mode}`,passed:true});
    }
    await page.goto(`${origin}/?case=ready`,{waitUntil:'networkidle0'});await openOffer();
    await page.click('[data-offer-older]');await page.waitForSelector('[data-offer-id="98a9f3db-a76c-4413-baff-558ad0b1d73b"]');
    await page.click('[data-offer-refresh]');await page.waitForSelector(`[data-offer-id="${offerId}"]`);
    results.push({width:1440,mode:'offer_pagination',passed:true});
    await page.type(`#offer-note-${offerId}`,'Draft requiring refreshed evidence.');await page.click('#offer-fixture input[type=checkbox]');
    await page.evaluate(()=>window.__changeOfferEvidence());await page.waitForFunction(()=>!document.querySelector('#offer-fixture input[type=checkbox]').checked);
    assert.equal(await page.$eval('[data-offer-save]',n=>n.disabled),true);
    assert.equal(await page.$eval(`#offer-note-${offerId}`,n=>n.value),'Draft requiring refreshed evidence.');
    results.push({width:1440,mode:'offer_changed_evidence_invalidates_attestation',passed:true});
    await page.goto(`${origin}/?case=offer-fetching`,{waitUntil:'networkidle0'});await openOffer();
    assert.equal(await page.$eval('#offer-fixture input[type=checkbox]',n=>n.disabled),true);assert.equal(await page.$eval('[data-offer-save]',n=>n.disabled),true);
    results.push({width:1440,mode:'offer_refresh_blocks_stale_submission',passed:true});
    for(const mode of ['offer-failed','offer-read','offer-conflict','offer-source-missing']){
      await page.setViewport({width:320,height:812});await page.goto(`${origin}/?case=${mode}&lang=en`,{waitUntil:'networkidle0'});
      await openOffer();await page.click('#offer-fixture [data-offer-details] summary');
      if(mode==='offer-failed')assert.ok((await page.$eval('#offer-fixture',n=>n.innerText)).includes('acceptance was verified earlier'));
      if(mode==='offer-read')assert.equal(await page.$eval('[data-offer-state]',n=>n.dataset.offerState),'read');
      if(mode==='offer-conflict')assert.ok(await page.$('[data-offer-projection=conflict]'));
      if(mode==='offer-source-missing')assert.ok((await page.$eval('#offer-fixture',n=>n.innerText)).includes('source message is currently unavailable'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.$eval('#offer-fixture',n=>n.innerText.includes('merchantUx.')),false);
      results.push({width:320,mode,passed:true});
    }
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    assert.equal(await page.$eval('#offer-fixture > details > summary svg',n=>getComputedStyle(n).transitionProperty),'none');
    await page.emulateMediaFeatures([]);results.push({width:320,mode:'offer_reduced_motion',passed:true});
    }
    assert.deepEqual(errors, []);
    const screenshots = fs.readdirSync(output).filter(name => name.endsWith('.png')).sort();
    const report = { generatedAt: new Date().toISOString(), browser: await browser.version(), actualComponents: true, screenshots,
      fixtureApi: true, externalRequestsBlocked: true, scope: 'component UI only, not authenticated production journeys or physical iPhone/Safari', results, errors };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ scenarios: results.length, screenshots: screenshots.length, errors }));
  } catch (error) {
    const pages = await browser.pages(), page = pages.at(-1);
    if (page) {
      await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }).catch(() => {});
      const state = await page.evaluate(() => ({ url: location.href, text: document.querySelector('#followup-fixture')?.textContent,
        inputs: [...document.querySelectorAll('#followup-fixture input')].map(input => ({ id: input.id, value: input.value, checked: input.checked })),
        controls: [...document.querySelectorAll('#followup-fixture input, #followup-fixture button')].map(node => ({
          id: node.id, height: node.getBoundingClientRect().height, transform: getComputedStyle(node).transform,
          minHeight: getComputedStyle(node).minHeight, transition: getComputedStyle(node).transition })),
        saved: window.__followupInput })).catch(() => null);
      console.error(JSON.stringify({ state, errors }));
    }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
