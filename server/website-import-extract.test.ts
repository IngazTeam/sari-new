import { beforeEach, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
const m = vi.hoisted(() => ({
  safe: vi.fn(),
  scrape: vi.fn(),
  crawl: vi.fn(),
  products: vi.fn(),
  ai: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./_core/rateLimiter", () => ({ checkRateLimit: m.limit }));
vi.mock("./_core/websiteAnalyzer", () => ({
  isUrlSafe: m.safe,
  scrapeWebsite: m.scrape,
  smartCrawl: m.crawl,
  extractProducts: m.products,
  extractAllWithAI: m.ai,
  detectPlatform: () => "custom",
  detectSiteType: () => "ecommerce",
  discoverPages: () => [
    { url: "https://example.test/about", pageType: "about", title: "About" },
  ],
  extractContactInfo: () => ({
    phones: [],
    emails: [],
    whatsappNumber: null,
    address: null,
  }),
}));
import { extractImportPreview } from "./knowledge/website-import-extract";
beforeEach(() => {
  vi.clearAllMocks();
  m.safe.mockReturnValue(true);
  m.limit.mockReturnValue({ allowed: true });
  m.scrape.mockResolvedValue({
    html: "<html></html>",
    dom: new JSDOM("<html><title>Store</title></html>"),
    text: "Public home",
  });
  m.crawl.mockResolvedValue({
    pages: [
      {
        url: "https://example.test/about",
        text: "Full extracted content",
        type: "about",
      },
    ],
    allText: "Public about",
  });
  m.products.mockResolvedValue([{ name: "Gift", price: 0 }]);
});
it("preserves zero and complete bounded page source for review", async () => {
  const r = await extractImportPreview(4, "https://example.test");
  expect(r.products[0].price).toBe(0);
  expect(r.pages[0].content).toBe("Full extracted content");
  expect(m.ai).not.toHaveBeenCalled();
});
it("reports oversized page text instead of silently truncating it", async () => {
  m.crawl.mockResolvedValue({
    pages: [{ url: "https://example.test/about", text: "a".repeat(16000) }],
    allText: "",
  });
  const r = await extractImportPreview(4, "https://example.test");
  expect(r.pages[0].content).toBeUndefined();
  expect(r.warnings.join(" ")).toContain("IMPORT_PAGE_LINK_ONLY|");
});
it("rejects unsafe URLs and rate exhaustion before fetching", async () => {
  m.safe.mockReturnValue(false);
  await expect(
    extractImportPreview(4, "http://127.0.0.1")
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  m.safe.mockReturnValue(true);
  m.limit.mockReturnValue({ allowed: false });
  await expect(
    extractImportPreview(4, "https://example.test")
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  expect(m.scrape).not.toHaveBeenCalled();
});
