import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  analyze: vi.fn(),
  extract: vi.fn(),
  scrape: vi.fn(),
  insights: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  product: vi.fn(),
  insight: vi.fn(),
  persist: vi.fn(),
  merge: vi.fn(),
  ingest: vi.fn(),
  row: {} as any,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./_core/rateLimiter", () => ({
  checkRateLimit: () => ({ allowed: true }),
}));
vi.mock("./db", () => ({
  getMerchantById: async () => ({ id: 20, businessName: "Fixture" }),
  createWebsiteAnalysis: m.create,
  updateWebsiteAnalysis: m.update,
  getWebsiteAnalysisById: m.read,
  createExtractedProduct: m.product,
  createWebsiteInsight: m.insight,
  updateMerchant: vi.fn(),
}));
vi.mock("./_core/websiteAnalyzer", () => ({
  isUrlSafe: () => true,
  analyzeWebsite: m.analyze,
  extractProducts: m.extract,
  scrapeWebsite: m.scrape,
  generateInsights: m.insights,
  cleanScrapedText: (s: string) => s,
}));
vi.mock("./knowledge/crawled-snapshot", () => ({
  persistCrawledKnowledge: m.persist,
}));
vi.mock("./catalog/analysis-snapshot", () => ({
  mergeAnalyzedProducts: m.merge,
}));
vi.mock("./ai/knowledge-engine", () => ({ ingestContent: m.ingest }));
import { websiteAnalysisRouter } from "./routers-website-analysis";
const caller = () =>
  websiteAnalysisRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.row = { id: 8, status: "analyzing", overallScore: 0 };
  m.create.mockResolvedValue(8);
  m.update.mockImplementation(async (_id, patch) =>
    Object.assign(m.row, patch)
  );
  m.read.mockImplementation(async () => ({ ...m.row }));
  m.analyze.mockResolvedValue({
    title: "Fixture",
    overallScore: 75,
    seoScore: 80,
    seoIssues: [],
    metaTags: {},
    _scrapedHtml: "<p>Fixture</p>",
    _scrapedText: "Short fixture",
    _enrichedText: "",
  });
  m.extract.mockResolvedValue([]);
  m.scrape.mockResolvedValue({ html: "", text: "" });
  m.insights.mockResolvedValue([]);
  m.persist.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());
it("starts only with explicit acknowledgement and stores completed results after the pipeline settles", async () => {
  await expect(
    caller().analyze({ url: "https://example.test" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.create).not.toHaveBeenCalled();
  expect(
    await caller().analyze({ url: "https://example.test", acknowledged: true })
  ).toMatchObject({ analysisId: 8 });
  await flush();
  expect(m.row.status).toBe("completed");
  expect(m.persist).toHaveBeenCalledWith(
    20,
    "https://example.test",
    expect.any(Object)
  );
});
it("does not label a failed website scrape as successful product extraction", async () => {
  m.analyze.mockRejectedValue(Error("blocked"));
  m.scrape.mockRejectedValue(Error("blocked"));
  await caller().analyze({ url: "https://example.test", acknowledged: true });
  await flush();
  expect(m.row.status).toBe("failed");
  expect(m.row.errorMessage).toContain("analysis_or_knowledge");
  expect(m.row.description).not.toContain("تم استخراج المنتجات");
});
it("keeps a report running while database writes can still arrive, even beyond the former global timeout", async () => {
  let finish!: () => void;
  m.persist.mockImplementation(
    () => new Promise<void>(resolve => (finish = resolve))
  );
  await caller().analyze({ url: "https://example.test", acknowledged: true });
  await flush();
  await vi.advanceTimersByTimeAsync(181000);
  expect(m.row.status).toBe("analyzing");
  finish();
  await flush();
  expect(m.row.status).toBe("completed");
});
it("marks a partially failed insight stage without claiming total success", async () => {
  m.insights.mockRejectedValue(Error("provider"));
  await caller().analyze({ url: "https://example.test", acknowledged: true });
  await flush();
  expect(m.row.status).toBe("completed");
  expect(m.row.errorMessage).toContain("insights");
});
it("preserves stored website estimates if the following knowledge write fails", async () => {
  m.persist.mockRejectedValue(Error("knowledge save"));
  await caller().analyze({ url: "https://example.test", acknowledged: true });
  await flush();
  expect(m.row.status).toBe("completed");
  expect(m.row.overallScore).toBe(75);
  expect(m.row.errorMessage).toContain("analysis_or_knowledge");
});
