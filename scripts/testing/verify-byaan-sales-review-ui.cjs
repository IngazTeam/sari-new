const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), esbuild = require('esbuild'), puppeteer = require('puppeteer-core');
(async () => {
  const dir = path.resolve('.tmp/byaan-sales-review-ui'), output = path.join(dir, 'results');
  fs.mkdirSync(output, { recursive: true });
  await esbuild.build({ entryPoints: ['scripts/testing/fixtures/byaan-sales-review-ui-entry.tsx'], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') } });
  const publicDir = path.resolve('dist/public'), styles = fs.readdirSync(path.join(publicDir, 'assets')).filter(n => /^(?:index|App)-[\w-]+\.css$/.test(n));
  assert.equal(styles.filter(n => n.startsWith('index-')).length, 1);
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n => `<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`); return; }
    const file = pathname === '/fixture.js' ? path.join(dir, 'fixture.js') : path.resolve(publicDir, '.' + pathname);
    if (file !== path.join(dir, 'fixture.js') && !file.startsWith(publicDir + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }), results = [], errors = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true); page.on('request', r => r.url().startsWith(origin) || r.url().startsWith('data:') ? r.continue() : r.abort());
    const visit = async (mode, lang) => { await page.goto(`${origin}/?case=${mode}&lang=${lang}`, { waitUntil: 'networkidle0' }); assert.equal(await page.evaluate(() => window.__reads.filter(r => r.path !== 'byaan.getStatus').length), 0); await page.click('[data-byaan-sales-review] > summary'); };
    const list = () => page.waitForSelector('[data-byaan-review-list]');
    const inspect = async () => {
      assert.deepEqual(await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, raw: /merchantUx\./.test(document.body.innerText), secret: /private SQL|customerPhone|webhook_secret/.test(document.body.innerText), xss: !!window.__xss, writes: window.__writes.length })), { overflow: false, raw: false, secret: false, xss: false, writes: 0 });
      assert.deepEqual(errors, []);
    };
    const record = (mode, lang, extra = {}) => results.push({ mode, lang, ...extra, passed: true });
    for (const lang of ['ar', 'en']) {
      for (const width of [320, 375, 390, 430, 768, 1440]) {
        await page.setViewport({ width, height: 900 }); await visit('ready', lang); await list(); await inspect();
        assert.equal(await page.$eval('[data-byaan-sales-review]', n => n.dir), lang === 'ar' ? 'rtl' : 'ltr');
        assert.equal((await page.$$('[data-byaan-review-row]')).length, 6);
        assert.equal((await page.$$('[data-byaan-review-reference]')).length, 1);
        for (const selector of ['[data-byaan-sales-review] > summary', '[data-byaan-review-refresh]']) assert.ok(await page.$eval(selector, n => n.getBoundingClientRect().height) >= 44);
        if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(output, `byaan-${lang}-${width}.png`), fullPage: true });
        record('responsive_states', lang, { width });
      }
      await page.setViewport({ width: 375, height: 900 });
      for (const mode of ['empty', 'error', 'wrong-scope', 'extra', 'duplicate', 'xss', 'false-payment', 'denied']) {
        await visit(mode, lang); await page.waitForSelector(mode === 'empty' ? '[data-byaan-review-empty]' : '[data-byaan-review-error]');
        assert.equal((await page.$$('[data-byaan-review-row]')).length, 0); await inspect(); record(mode, lang);
      }
      for (const mode of ['disconnected', 'status-error']) { await visit(mode, lang); await list(); await inspect(); record(mode, lang); }
      await visit('paged', lang); await list(); await page.click('[data-byaan-review-older]'); await page.waitForFunction(() => document.querySelectorAll('[data-byaan-review-row]').length === 2);
      assert.equal(await page.evaluate(() => window.__reads.at(-1).input.beforeId), 11);
      await page.click('[data-byaan-review-refresh]'); await page.waitForFunction(() => document.querySelectorAll('[data-byaan-review-row]').length === 20); await inspect(); record('pagination', lang);
      await visit('old-page', lang); await list(); await page.click('[data-byaan-review-older]'); await page.waitForSelector('[data-byaan-review-error]'); assert.equal(await page.$('[data-byaan-review-list]'), null); record('wrong_cursor_response', lang);
      await visit('ready', lang); await list(); await page.evaluate(() => { window.__error = true; }); await page.click('[data-byaan-review-refresh]'); await page.waitForSelector('[data-byaan-review-error]'); assert.equal(await page.$('[data-byaan-review-list]'), null); await inspect(); record('refresh_failure_hides_cached_records', lang);
      await visit('ready', lang); await list(); await page.evaluate(() => { window.__revoked = true; window.__refresh(); }); await page.waitForSelector('[data-byaan-review-error]'); assert.equal(await page.$('[data-byaan-review-list]'), null); record('revocation_hides_records', lang);
      await visit('ready', lang); await list(); await page.evaluate(() => window.__online(false)); await page.click('[data-byaan-review-refresh]'); await page.waitForSelector('[data-byaan-review-loading]'); assert.equal(await page.$('[data-byaan-review-list]'), null); record('offline_refresh_hides_records', lang);
      await visit('slow', lang); await page.waitForSelector('[data-byaan-review-loading]'); await page.focus('[data-byaan-sales-review] > summary'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[data-byaan-sales-review]').open); assert.equal(await page.$('[data-byaan-review-list]'), null); await inspect(); record('keyboard_close_during_load', lang);
      await visit('ready', lang); await list(); await page.evaluate(() => { window.__scope = 21; window.__refresh(); }); await page.waitForFunction(() => window.__reads.filter(r => r.path === 'byaan.listSalesOperations').length >= 2); await list(); await inspect(); record('merchant_scope_refresh', lang);
    }
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ version: 'byaan-sales-review-ui.v1', passed: results.length, failed: 0, browser: await browser.version(), realSafari: false, scope: 'Actual React components and production CSS; synthetic query responses; no real accounts or external networking.', results, pageErrors: errors }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: results.length, output }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
