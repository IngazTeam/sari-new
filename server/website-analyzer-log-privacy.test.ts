import { inspect } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
const m = vi.hoisted(() => ({ request: vi.fn(), llm: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: m.llm }));
vi.mock("./security/public-website", async original => ({
  ...(await original<typeof import("./security/public-website")>()),
  requestPublicWebsite: m.request,
}));
import {
  analyzeWebsite,
  extractAllWithAI,
  extractProducts,
  smartCrawl,
} from "./_core/websiteAnalyzer";
const sensitive = "PRIVATE_CONTENT_428";
const url = `https://example.test/?token=${sensitive}`;
const text = `${sensitive} `.repeat(30);
let output: unknown[][];
beforeEach(() => {
  vi.resetAllMocks();
  output = [];
  for (const level of ["log", "warn", "error", "info", "debug"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      output.push(args);
    });
});
afterEach(() => vi.restoreAllMocks());
function privateLogs() {
  const log = inspect(output, { depth: null });
  expect(log).not.toContain(sensitive);
  expect(log).not.toContain("https://example.test");
  return log;
}
it.each([false, true])(
  "does not copy discovered URLs or fetch errors to crawl logs (failed=%s)",
  async failed => {
    const dom = new JSDOM(
      `<a href="/about?token=${sensitive}">About ${sensitive}</a>`,
      { url }
    );
    if (failed) m.request.mockRejectedValue(Error(sensitive));
    else
      m.request.mockResolvedValue({
        ok: true,
        status: 200,
        url,
        headers: { get: () => "text/html" },
        text: async () => `<p>${text}</p>`,
      });
    try {
      const result = await smartCrawl(url, dom, 1);
      expect(result.pages).toHaveLength(failed ? 0 : 1);
      if (!failed) expect(result.allText).toContain(sensitive);
      expect(privateLogs()).toContain("Crawled");
    } finally {
      dom.window.close();
    }
  }
);
it("keeps the original company and FAQ data in extracted results only", async () => {
  const data = {
    products: [],
    faqs: [{ question: sensitive, answer: sensitive }],
    companyInfo: {
      name: sensitive,
      description: sensitive,
      industry: "services",
    },
  };
  m.llm.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(data) } }],
  });
  expect(await extractAllWithAI(text, url, "services", 42)).toEqual(data);
  expect(privateLogs()).toContain("1 FAQs");
});
it("preserves extraction failure behavior without serializing a provider error", async () => {
  m.llm.mockRejectedValue(
    Object.assign(Error(sensitive), { response: { request: text } })
  );
  expect(await extractAllWithAI(text, url, "general", 42)).toEqual({
    products: [],
    faqs: [],
    companyInfo: { name: "", description: "", industry: "" },
  });
  expect(privateLogs()).toContain("AI extraction failed");
});
it("does not print requested URLs when website analysis fails", async () => {
  m.request.mockRejectedValue(Error(sensitive));
  await expect(analyzeWebsite(url, 42)).rejects.toThrow();
  expect(privateLogs()).toContain("Error analyzing website");
});
it("keeps JSON-LD product data while leaving URLs and provider messages out of discovery logs", async () => {
  m.request.mockRejectedValue(Error(sensitive));
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: sensitive, description: text, offers: { price: 15, priceCurrency: "SAR" } })}</script>`;
  const result = await extractProducts(url, html, text, 42);
  expect(result[0]?.name).toBe(sensitive);
  expect(privateLogs()).toContain("JSON-LD");
});
