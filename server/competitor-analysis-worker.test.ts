import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  assert: vi.fn(),
  advance: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
  analyze: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("./competitor-analysis-jobs", () => ({
  assertCompetitorAnalysisJob: m.assert,
  advanceCompetitorAnalysisJob: m.advance,
  finishCompetitorAnalysisJob: m.finish,
  failCompetitorAnalysisJob: m.fail,
}));
vi.mock("./_core/websiteAnalyzer", () => ({
  analyzeWebsite: m.analyze,
  extractProducts: m.extract,
}));
import { runCompetitorAnalysisWorker } from "./competitor-analysis-worker";
import {
  assertActiveCompetitorAnalysis,
  runCompetitorAnalysisContext,
} from "./competitor-analysis-context";
const scope = { merchantId: 20, requestId: randomUUID(), token: randomUUID() },
  url = "https://example.test/";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.analyze.mockResolvedValue({
    overallScore: 75,
    seoScore: 60,
    performanceScore: 0,
    uxScore: 70,
    contentQuality: 80,
    industry: "Retail",
    _scrapedHtml: "<p>Fixture</p>",
    _scrapedText: "Fixture",
    _enrichedText: "More",
  });
  m.extract.mockResolvedValue([
    { name: "Product", description: "Known", price: 20, currency: "SAR" },
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("reuses the analyzed snapshot and completes only the fenced atomic result", async () => {
  await runCompetitorAnalysisWorker(scope, url);
  expect(m.assert).toHaveBeenCalledTimes(3);
  expect(m.extract).toHaveBeenCalledWith(
    url,
    "<p>Fixture</p>",
    "Fixture\nMore",
    20,
    { requireVerifiedOutcome: true }
  );
  expect(m.finish).toHaveBeenCalledWith(scope, {
    scores: { overall: 75, seo: 60, performance: 0, ux: 70, content: 80 },
    industry: "Retail",
    products: [
      {
        name: "Product",
        description: "Known",
        price: 20,
        currency: "SAR",
        imageUrl: null,
        productUrl: null,
        category: null,
      },
    ],
  });
  expect(m.fail).not.toHaveBeenCalled();
});
it("does not publish completion while extraction is still pending", async () => {
  let done!: (p: any[]) => void;
  m.extract.mockImplementation(
    () =>
      new Promise(resolve => {
        done = resolve;
      })
  );
  const work = runCompetitorAnalysisWorker(scope, url);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(m.finish).not.toHaveBeenCalled();
  done([]);
  await work;
  expect(m.finish).toHaveBeenCalledOnce();
});
it.each(["analyze", "extract", "finish"] as const)(
  "contains %s failure without raw diagnostics or a second completion",
  async phase => {
    m[phase].mockRejectedValue(Error("PRIVATE_PROVIDER_TOKEN"));
    await runCompetitorAnalysisWorker(scope, url);
    expect(m.fail).toHaveBeenCalledWith(scope);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "PRIVATE_PROVIDER_TOKEN"
    );
    if (phase !== "finish") expect(m.finish).not.toHaveBeenCalled();
  }
);
it("stops before network work when the initial lease check fails", async () => {
  m.assert.mockRejectedValue(Error("expired"));
  await runCompetitorAnalysisWorker(scope, url);
  expect(m.analyze).not.toHaveBeenCalled();
  expect(m.extract).not.toHaveBeenCalled();
  expect(m.finish).not.toHaveBeenCalled();
});
it("does not extract after authority is revoked during website analysis", async () => {
  m.assert.mockResolvedValueOnce(undefined).mockRejectedValue(Error("revoked"));
  await runCompetitorAnalysisWorker(scope, url);
  expect(m.analyze).toHaveBeenCalledOnce();
  expect(m.extract).not.toHaveBeenCalled();
  expect(m.finish).not.toHaveBeenCalled();
});
it("contains failure to record an outcome so expiry can settle it", async () => {
  m.analyze.mockRejectedValue(Error("PRIVATE"));
  m.fail.mockRejectedValue(Error("PRIVATE"));
  await expect(
    runCompetitorAnalysisWorker(scope, url)
  ).resolves.toBeUndefined();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE"
  );
});
it("serializes heartbeats and releases the interval on completion", async () => {
  vi.useFakeTimers();
  let finishAnalysis!: (v: any) => void, renew!: () => void;
  m.analyze.mockImplementation(
    () =>
      new Promise(resolve => {
        finishAnalysis = resolve;
      })
  );
  m.advance.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        renew = resolve;
      })
  );
  const work = runCompetitorAnalysisWorker(scope, url);
  await vi.advanceTimersByTimeAsync(90000);
  expect(m.advance).toHaveBeenCalledOnce();
  renew();
  await Promise.resolve();
  finishAnalysis({ _scrapedHtml: "", _scrapedText: "", _enrichedText: "" });
  await work;
  expect(vi.getTimerCount()).toBe(0);
});
it("isolates concurrent transport contexts and rejects a mismatched LLM tenant", async () => {
  const a = vi.fn(),
    b = vi.fn();
  await Promise.all([
    runCompetitorAnalysisContext(1, a, () => assertActiveCompetitorAnalysis(1)),
    runCompetitorAnalysisContext(2, b, () => assertActiveCompetitorAnalysis(2)),
  ]);
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  await expect(
    runCompetitorAnalysisContext(1, a, () => assertActiveCompetitorAnalysis(2))
  ).rejects.toThrow("forbidden");
  await assertActiveCompetitorAnalysis(99);
  expect(a).toHaveBeenCalledOnce();
});
