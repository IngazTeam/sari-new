const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async (page, origin, output, results) => {
  const accept = dialog => dialog.accept(); page.on('dialog', accept);
  try {
  const add = (mode, width = 390, lang = 'ar') => results.push({ mode: `reply_review_${mode}`, width, lang, passed: true });
  async function open(mode = 'ready', lang = 'ar', select = true) {
    await page.goto(`${origin}/?case=reply-review-${mode}&lang=${lang}`, { waitUntil: 'networkidle0' });
    await page.click('[data-reply-open]'); await page.waitForSelector('[data-reply-panel]');
    if (select) { await page.waitForSelector('[data-reply-select="21"]'); await page.click('[data-reply-select="21"]'); }
  }
  async function draft() {
    await page.click('[data-reply-start]'); await page.waitForSelector('[data-reply-draft]');
    for (const node of await page.$$('[data-reply-criterion]')) await node.select('pass');
    const original = await page.$eval('[data-reply-original]', n => n.textContent);
    await page.type('[data-reply-quote]', original.slice(0, 120));
    await page.type('[data-reply-rationale]', 'I verified the customer question, the business facts and the proposed next sales step.');
    await page.click('[data-reply-attest]'); await page.click('[data-reply-ack]');
    assert.equal(await page.$eval('[data-reply-save]', n => n.disabled), false);
  }
  async function layout() {
    const state = await page.$eval('[data-reply-panel]', n => ({ overflow: document.documentElement.scrollWidth > innerWidth,
      raw: n.innerText.includes('merchantUx.'), heights: [...n.querySelectorAll('button,select,summary')].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect().height) }));
    assert.equal(state.overflow, false); assert.equal(state.raw, false); assert.ok(state.heights.every(v => v >= 44));
  }
  for (const width of [320, 375, 390, 768, 1440]) for (const lang of ['ar', 'en']) {
    await page.setViewport({ width, height: width < 500 ? 812 : 1000, deviceScaleFactor: 1 }); await open('ready', lang); await draft(); await layout();
    assert.equal(await page.$eval('[data-reply-older]', n => n.disabled), true);
    if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(output, `reply-review-${lang}-${width}.png`), fullPage: true });
    await page.click('[data-reply-save]'); await page.waitForSelector('[data-reply-saved]'); await layout();
    const writes = await page.evaluate(() => window.__replyWrites); assert.equal(writes.length, 1); assert.equal(writes[0].generationId, 21);
    assert.equal('merchantId' in writes[0], false); assert.equal('responseText' in writes[0], false); assert.equal('baseSystemPrompt' in writes[0], false);
    add('responsive_save_and_receipt', width, lang);
  }
  await page.setViewport({ width: 390, height: 844 });
  for (const mode of ['unknown', 'outage', 'mismatch-actor', 'mismatch-request', 'mismatch-checks', 'mismatch-outcome', 'mismatch-quote', 'retry-forbidden']) {
    await open(mode); await draft(); await page.click('[data-reply-save]'); await page.waitForSelector('[data-reply-retry]');
    assert.equal(await page.$('[data-reply-saved]'), null); assert.equal(await page.$eval('[data-reply-discard]', n => n.disabled), true);
    assert.equal(await page.$eval('[data-reply-panel]', n => n.innerText.includes('private')), false);
    await page.click('[data-reply-retry]');
    if (mode === 'retry-forbidden') {
      await page.waitForFunction(() => window.__replyWrites?.length === 2 && !document.querySelector('[data-reply-retry]').disabled);
      assert.equal(await page.$('[data-reply-saved]'), null); assert.equal(await page.$eval('[data-reply-discard]', n => n.disabled), true);
      await page.click('[data-reply-retry]');
    }
    await page.waitForSelector('[data-reply-saved]'); const writes = await page.evaluate(() => window.__replyWrites);
    assert.equal(writes.length, mode === 'retry-forbidden' ? 3 : 2); for (const row of writes) assert.deepEqual(row, writes[0]); add(`${mode}_stable_request`);
  }
  for (const mode of ['conflict', 'refresh-error', 'critical', 'slow']) {
    await open(mode); await draft();
    await page.$eval('[data-reply-save]', n => { n.click(); n.click(); });
    if (mode === 'conflict') { await page.waitForSelector('[data-reply-failure]'); assert.equal(await page.$('[data-reply-retry]'), null); assert.equal(await page.$('[data-reply-saved]'), null); }
    else await page.waitForSelector('[data-reply-saved]');
    if (mode === 'refresh-error') { await page.waitForSelector('[data-reply-failure]'); assert.ok(await page.$('[data-reply-saved]')); }
    if (mode === 'critical') assert.equal(await page.$eval('[data-reply-saved]', n => n.innerText.includes('لم يجتز')), true);
    assert.equal((await page.evaluate(() => window.__replyWrites)).length, 1); add(mode);
  }
  for (const mode of ['basis', 'actor', 'permission', 'error']) {
    await open(); await draft(); await page.evaluate(kind => window.__replyChange(kind), mode); await page.waitForSelector('[data-reply-changed]');
    assert.equal(await page.$eval('[data-reply-save]', n => n.disabled), true); assert.equal(await page.$eval('[data-reply-attest]', n => n.checked), false);
    assert.ok((await page.$eval('[data-reply-rationale]', n => n.value)).includes('verified')); add(`${mode}_preserves_draft_and_locks_save`);
  }
  await open(); await draft(); await page.click('[data-reply-open]'); await page.click('[data-reply-open]');
  assert.ok((await page.$eval('[data-reply-rationale]', n => n.value)).includes('verified'));
  assert.equal(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), true);
  await page.click('[data-reply-refresh]'); await page.waitForFunction(() => !document.querySelector('[data-reply-refresh]').disabled);
  assert.equal(await page.$eval('[data-reply-attest]', n => n.checked), false);
  await page.click('[data-reply-discard]'); await page.click('[data-reply-discard-confirm]'); await page.waitForFunction(() => !document.querySelector('[data-reply-draft]'));
  await page.click('[data-reply-older]'); await page.waitForSelector('[data-reply-select="9"]'); await page.click('[data-reply-newer]'); await page.waitForSelector('[data-reply-select="21"]'); add('hide_refresh_discard_pagination');
  for (const mode of ['manager', 'stale', 'expired', 'invalid', 'uncertain', 'blocked', 'dispatching', 'foreign', 'unsupported']) {
    await open(mode); if (['foreign', 'unsupported'].includes(mode)) { await page.waitForSelector('[data-reply-panel] [role=alert]'); assert.equal(await page.$('[data-reply-start]'), null); }
    else { await page.waitForSelector('[data-reply-start]'); assert.equal(await page.$eval('[data-reply-start]', n => n.disabled), true); }
    assert.equal(await page.evaluate(() => window.__replyWrites), undefined); await layout(); add(`${mode}_read_only`);
  }
  for (const mode of ['empty', 'read-error', 'loading', 'fetching']) { await open(mode, 'en', false); await layout();
    if (mode === 'read-error') { await page.click('[data-reply-refresh]'); await page.waitForSelector('[data-reply-select="21"]'); }
    add(mode, 390, 'en'); }
  await open('xss'); await draft(); await layout(); assert.equal(await page.evaluate(() => window.__replyXss), undefined); assert.equal(await page.$('[data-reply-original] img'), null);
  await page.click('[data-reply-save]'); await page.waitForSelector('[data-reply-saved]'); await page.click('[data-reply-saved] summary'); await layout(); assert.equal(await page.evaluate(() => window.__replyXss), undefined); add('escaped_untrusted_text');
  await open(); await page.focus('[data-reply-start]'); await page.keyboard.press('Enter'); await page.waitForSelector('[data-reply-draft]');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H3'); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SELECT');
  assert.equal(await page.$eval('[data-reply-save]', n => n.disabled), true); add('keyboard_focus_and_no_default_approval');
  await page.click('[data-reply-discard]'); await page.click('[data-reply-discard-confirm]');
  await page.waitForFunction(() => !document.querySelector('[data-reply-draft]'));
  } finally { page.off('dialog', accept); }
};
