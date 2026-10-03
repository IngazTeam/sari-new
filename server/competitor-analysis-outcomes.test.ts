import { inspect } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  product: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  analyze: vi.fn(),
  scrape: vi.fn(),
  extract: vi.fn(),
  close: vi.fn(),
  rows: [] as any[],
  writes: [] as any[],
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", () => ({
  getMerchantById: m.merchant,
  createCompetitorAnalysis: m.create,
  updateCompetitorAnalysis: m.update,
  createCompetitorProduct: m.product,
  getCompetitorAnalysesByMerchant: m.list,
  getCompetitorAnalysisById: m.read,
  deleteCompetitorAnalysis: m.remove,
}));
vi.mock("./_core/websiteAnalyzer", () => ({
  analyzeWebsite: m.analyze,
  scrapeWebsite: m.scrape,
  extractProducts: m.extract,
  isUrlSafe: (url: string) => url.startsWith("https://example.test"),
}));
import { websiteAnalysisRouter } from "./routers-website-analysis";
const secret = "PRIVATE_COMPETITOR_FAILURE_430";
const input = { name: "Fixture", url: "https://example.test" };
const caller = () =>
  websiteAnalysisRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
let output: unknown[][];
beforeEach(() => {
  vi.resetAllMocks();
  output = [];
  m.writes = [];
  m.rows = [
    {
      id: 8,
      merchantId: 20,
      status: "failed",
      errorMessage: secret,
      name: "Fixture",
    },
  ];
  for (const level of ["log", "warn", "error"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      output.push(args);
    });
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.merchant.mockResolvedValue({ id: 20 });
  m.create.mockResolvedValue(8);
  m.update.mockImplementation(async (_id, patch) => {
    m.writes.push(patch);
  });
  m.analyze.mockResolvedValue({
    overallScore: 75,
    seoScore: 70,
    performanceScore: 60,
    uxScore: 50,
    contentQuality: 80,
  });
  m.scrape.mockResolvedValue({
    html: "<p>Fixture</p>",
    text: "Fixture",
    dom: { window: { close: m.close } },
  });
  m.extract.mockResolvedValue([]);
  m.list.mockImplementation(async () => m.rows);
  m.read.mockImplementation(async () => m.rows[0]);
});
afterEach(() => vi.restoreAllMocks());
it("stays analyzing until all product writes settle and closes the scraped DOM", async () => {
  let complete!: () => void;
  m.extract.mockResolvedValue([
    { name: "Product", price: 15, currency: "SAR" },
  ]);
  m.product.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        complete = resolve;
      })
  );
  expect(await caller().addCompetitor(input)).toEqual({
    competitorId: 8,
    status: "analyzing",
  });
  await flush();
  expect(m.product).toHaveBeenCalled();
  expect(m.writes.some(p => p.status === "completed")).toBe(false);
  complete();
  await flush();
  expect(m.writes.at(-1)).toMatchObject({ status: "completed" });
  expect(m.close).toHaveBeenCalledOnce();
});
it("completes an empty catalog only after extraction has settled", async () => {
  let complete!: (products: unknown[]) => void;
  m.extract.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await caller().addCompetitor(input);
  await flush();
  expect(m.writes.some(p => p.status === "completed")).toBe(false);
  complete([]);
  await flush();
  expect(m.writes.at(-1)).toMatchObject({ status: "completed" });
});
it.each(["analyze", "extract", "product"] as const)(
  "stores only a public failure code after %s failure without a prior completion",
  async target => {
    m.extract.mockResolvedValue([{ name: "Product", price: 15 }]);
    m[target].mockRejectedValue(Error(secret));
    await caller().addCompetitor(input);
    await flush();
    expect(m.writes.some(p => p.status === "completed")).toBe(false);
    expect(m.writes.at(-1)).toMatchObject({
      status: "failed",
      errorMessage: "COMPETITOR_ANALYSIS_FAILED",
    });
    expect(inspect([...output, m.writes], { depth: null })).not.toContain(
      secret
    );
    if (target !== "analyze") expect(m.close).toHaveBeenCalledOnce();
  }
);
it("handles failure to store the terminal outcome without an unhandled background rejection", async () => {
  m.analyze.mockRejectedValue(Error(secret));
  m.update.mockRejectedValue(Error(secret));
  await caller().addCompetitor(input);
  await flush();
  expect(inspect(output, { depth: null })).not.toContain(secret);
  expect(inspect(output)).toContain("Failed to store terminal status");
});
it("does not return raw admission errors or replace intentional not-found responses", async () => {
  m.create.mockRejectedValue(Error(secret));
  await expect(caller().addCompetitor(input)).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Competitor analysis unavailable",
  });
  m.merchant.mockResolvedValue(null);
  await expect(caller().addCompetitor(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it.each(['list','detail','products','compare','delete'])('retires the old %s entry without accessing old storage or a provider',async method=>{
 const api=caller(); const call=method==='list'?api.listCompetitors():method==='detail'?api.getCompetitor({id:8}):method==='products'?api.getCompetitorProducts({competitorId:8}):method==='compare'?api.compareWithCompetitors({analysisId:8,competitorIds:[8]}):api.deleteCompetitor({id:8});
 await expect(call).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'competitor_workspace:upgrade_required'});
 for(const fn of [m.list,m.read,m.remove,m.analyze])expect(fn).not.toHaveBeenCalled();
});
it.each(["viewer", "sales_supervisor"])(
  "blocks %s creation and deletion before side effects",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await expect(caller().addCompetitor(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().deleteCompetitor({ id: 8 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.analyze).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  }
);
it.each([
  { name: " " },
  { name: "x".repeat(256) },
  { url: "http://127.0.0.1/private" },
  { url: "file:///tmp/file" },
])("rejects invalid competitor input before saving: %j", async patch => {
  await expect(
    caller().addCompetitor({ ...input, ...patch })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.create).not.toHaveBeenCalled();
});
