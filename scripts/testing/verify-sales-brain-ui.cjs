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
    assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), browser: await browser.version(), actualComponents: true,
      fixtureApi: true, externalRequestsBlocked: true, scope: 'component UI only, not authenticated production journeys or physical iPhone/Safari', results, errors };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ scenarios: results.length, screenshots: 2, errors }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
