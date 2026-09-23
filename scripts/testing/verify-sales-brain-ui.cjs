const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const esbuild = require('esbuild'), puppeteer = require('puppeteer-core');
const dir = path.resolve('.tmp/brain-ui'), output = path.resolve('docs/audits/sales-brain-implementation-2026-09-23/ui');
async function main() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  await esbuild.build({ entryPoints: [path.resolve('scripts/testing/fixtures/brain-ui-entry.tsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@/lib/trpc': path.resolve('scripts/testing/fixtures/brain-ui-trpc.tsx'), '@': path.resolve('client/src') } });
  const publicDir = path.resolve('dist/public'), css = fs.readdirSync(path.join(publicDir, 'assets')).find(name => name.endsWith('.css'));
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/${css}"><body><div id="root"></div><script src="/fixture.js"></script></body></html>`); }
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
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport({ width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1 });
      for (const mode of ['ready', 'loading', 'error']) {
        await page.goto(`${origin}/?case=${mode}`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#invoice-fixture input');
        const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
          rawKeys: document.body.innerText.includes('merchantUx.'), targets: [...document.querySelectorAll('button')].map(b => b.getBoundingClientRect().height) }));
        assert.equal(layout.overflow, false, `Horizontal overflow at ${width}/${mode}`); assert.equal(layout.rawKeys, false);
        assert.ok(layout.targets.every(height => height >= 44), `Small tap target at ${width}/${mode}: ${layout.targets}`);
        assert.equal(await page.$eval('#invoice-fixture button', node => node.disabled), true);
        if (mode === 'error') { await page.click('[role="alert"] button'); await page.waitForSelector('details'); }
        if (mode === 'ready') {
          await page.click('details summary');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(output, `learning-invoice-${width}.png`), fullPage: true });
          await page.click('#invoice-fixture input'); await page.click('#invoice-fixture button');
          await page.waitForSelector('#invoice-fixture [role="status"] a');
          assert.deepEqual(await page.evaluate(() => window.__invoiceInput), { orderId: 123, expectedAmountMinor: 23000, totalIsFinal: true });
          assert.equal(await page.evaluate(() => window.__approved), true);
        }
        results.push({ width, mode, passed: true });
      }
    }
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${origin}/?case=mutation-error`, { waitUntil: 'networkidle0' });
    await page.click('#invoice-fixture input'); await page.click('#invoice-fixture button');
    await page.waitForSelector('#invoice-fixture [role="alert"]');
    assert.equal(await page.$('#invoice-fixture [role="status"]'), null);
    await page.click('#invoice-fixture button'); await page.waitForSelector('#invoice-fixture [role="status"]');
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
      assert.ok(await page.$$eval('#followup-fixture input:not([type=checkbox]), #followup-fixture button',
        inputs => inputs.every(input => input.getBoundingClientRect().height >= 44)));
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
    assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), browser: await browser.version(), actualComponents: true,
      fixtureApi: true, externalRequestsBlocked: true, scope: 'component UI only, not authenticated production journeys or physical iPhone/Safari', results, errors };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ scenarios: results.length, screenshots: 7, errors }));
  } catch (error) {
    const pages = await browser.pages(), page = pages.at(-1);
    if (page) {
      await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }).catch(() => {});
      const state = await page.evaluate(() => ({ url: location.href, text: document.querySelector('#followup-fixture')?.textContent,
        inputs: [...document.querySelectorAll('#followup-fixture input')].map(input => ({ id: input.id, value: input.value, checked: input.checked })),
        saved: window.__followupInput })).catch(() => null);
      console.error(JSON.stringify({ state, errors }));
    }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
