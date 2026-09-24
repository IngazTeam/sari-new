const assert = require("node:assert/strict"),
  path = require("node:path");
module.exports = async (page, origin, output, results) => {
  for (const width of [320, 375, 390, 768, 1440])
    for (const lang of ["ar", "en"]) {
      await page.setViewport({ width, height: width < 500 ? 812 : 900 });
      await page.goto(`${origin}/?case=ai-capabilities-mixed&lang=${lang}`, {
        waitUntil: "networkidle0",
      });
      await page.waitForSelector("[data-ai-mode]");
      const layout = await page.$eval("[data-ai-capabilities]", n => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        text: n.innerText,
        button: n.querySelector("button").getBoundingClientRect().height,
        rows: n.querySelectorAll("[data-ai-capability]").length,
      }));
      assert.equal(layout.overflow, false);
      assert.equal(layout.rows, 4);
      assert.equal(layout.text.includes("merchantUx."), false);
      assert.ok(layout.button >= 44);
      assert.match(
        await page.$eval("[data-ai-capability=text]", n => n.innerText),
        /ZahyPi/
      );
      assert.match(
        await page.$eval(
          "[data-ai-capability=transcription]",
          n => n.innerText
        ),
        /OpenAI.*whisper-1/
      );
      await page.focus("[data-ai-capabilities] button");
      await page.keyboard.press("Enter");
      assert.equal(
        await page.$eval("[data-ai-capabilities] button", n => n.disabled),
        true
      );
      await page.click("[data-ai-capabilities] button");
      assert.equal(
        await page.evaluate(() => window.__capabilityRefreshCount),
        1
      );
      await page.waitForFunction(
        () => !document.querySelector("[data-ai-capabilities] button").disabled
      );
      if (lang === "ar" && [375, 1440].includes(width))
        await (
          await page.$("[data-ai-capabilities]")
        ).screenshot({
          path: path.join(output, `ai-capabilities-${width}.png`),
        });
      results.push({
        width,
        lang,
        mode: "ai_capabilities_mixed_explicit_routing_refresh_keyboard",
        passed: true,
      });
    }
  for (const lang of ["ar", "en"])
    for (const mode of [
      "disabled",
      "missing",
      "unreadable",
      "loading",
      "error",
      "openai",
      "xss",
    ]) {
      await page.setViewport({ width: 375, height: 812 });
      await page.goto(`${origin}/?case=ai-capabilities-${mode}&lang=${lang}`, {
        waitUntil: "networkidle0",
      });
      await page.waitForSelector("[data-ai-capabilities]");
      if (mode === "loading") {
        assert.equal(
          await page.$eval("[data-ai-capabilities] button", n => n.disabled),
          true
        );
        assert.equal(await page.$("[data-ai-mode]"), null);
        await page.waitForSelector("[role=status]");
      } else if (mode === "error") {
        await page.waitForSelector("[role=alert]");
        assert.equal(await page.$("[data-ai-mode]"), null);
        await page.click("[data-ai-capabilities] button");
        await page.waitForSelector("[data-ai-mode]");
      } else if (mode === "xss") {
        assert.equal(await page.$("[data-ai-capabilities] img"), null);
        assert.equal(
          await page.evaluate(() => window.__capabilityXss),
          undefined
        );
      } else if (mode === "openai")
        assert.equal(
          (
            await page.$eval("[data-ai-capabilities]", n => n.innerText)
          ).includes("ZahyPi ·"),
          false
        );
      else {
        const states = await page.$$eval("[data-ai-capability-state]", nodes =>
          nodes.map(n => n.innerText)
        );
        assert.equal(states.length, 4);
        if (mode === "disabled") assert.equal(new Set(states).size, 1);
        else {
          assert.equal(states[0], states[1]);
          assert.equal(states[2], states[3]);
          assert.notEqual(states[0], states[2]);
        }
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      assert.equal(
        (await page.$eval("[data-ai-capabilities]", n => n.innerText)).includes(
          "merchantUx."
        ),
        false
      );
      results.push({
        width: 375,
        lang,
        mode: `ai_capabilities_${mode}`,
        passed: true,
      });
    }
};
