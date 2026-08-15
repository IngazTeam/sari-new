import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  analyzeSentiment,
  createWeeklySentimentReport,
  getConversationsByMerchantId,
  getMerchantById,
  getMessagesByConversationId,
  getUserById,
} = vi.hoisted(() => ({
  analyzeSentiment: vi.fn(),
  createWeeklySentimentReport: vi.fn(),
  getConversationsByMerchantId: vi.fn(),
  getMerchantById: vi.fn(),
  getMessagesByConversationId: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("../db", () => ({
  createWeeklySentimentReport,
  getConversationsByMerchantId,
  getMerchantById,
  getMessagesByConversationId,
  getUserById,
}));

vi.mock("./sentiment-analysis", () => ({ analyzeSentiment }));
vi.mock("../reports/email-sender", () => ({ sendEmail: vi.fn() }));
vi.mock("./loss-detector", () => ({
  getPipelineSummary: vi.fn().mockResolvedValue({ stages: {}, lossReasons: {} }),
}));

import { generateWeeklySentimentReport } from "./weekly-sentiment";

afterEach(() => {
  vi.clearAllMocks();
});

describe("ZahyPi tenant propagation", () => {
  it("passes the report merchant to the real weekly sentiment analyzer", async () => {
    const now = new Date();
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - now.getDay());
    lastSunday.setHours(12, 0, 0, 0);
    getConversationsByMerchantId.mockResolvedValue([{ id: 10, createdAt: lastSunday }]);
    getMessagesByConversationId.mockResolvedValue([{ direction: "incoming", content: "الخدمة ممتازة" }]);
    analyzeSentiment.mockResolvedValue({
      sentiment: "positive",
      confidence: 90,
      keywords: ["ممتازة"],
      reasoning: "positive message",
    });
    createWeeklySentimentReport.mockResolvedValue({ id: 1 });
    getMerchantById.mockResolvedValue(undefined);
    getUserById.mockResolvedValue(undefined);

    await generateWeeklySentimentReport(77);

    expect(analyzeSentiment).toHaveBeenCalledWith("الخدمة ممتازة", {
      merchantId: 77,
      taskType: "sari.sentiment.weekly",
    });
  });

  it("keeps both merchant-reply webhook AI calls scoped to the instance merchant", () => {
    const source = readFileSync(new URL("../webhooks/greenapi.ts", import.meta.url), "utf8");
    expect(source).toMatch(
      /merchantId: instance\.merchantId,[\s\S]{0,120}taskType: 'sari\.webhook\.merchant_reply_improvement'/,
    );
    expect(source).toMatch(
      /merchantId: instance\.merchantId,[\s\S]{0,120}taskType: 'sari\.webhook\.merchant_reply_feedback'/,
    );
  });

  it("scopes every AI suggestion and brain analysis call to the authenticated merchant", () => {
    const suggestions = readFileSync(new URL("../routers-ai-suggestions.ts", import.meta.url), "utf8");
    expect(suggestions.match(/invokeLLM\(\{/g)).toHaveLength(3);
    expect(suggestions.match(/merchantId: merchant\.id/g)).toHaveLength(3);

    const brain = readFileSync(new URL("../routers-sari-brain.ts", import.meta.url), "utf8");
    expect(brain.match(/invokeLLM\(\{/g)).toHaveLength(2);
    expect(brain.match(/invokeLLM\(\{\s*merchantId: merchant\.id/g)).toHaveLength(2);
  });

  it("propagates merchant identity through every website-analysis AI stage", () => {
    const analyzer = readFileSync(new URL("../_core/websiteAnalyzer.ts", import.meta.url), "utf8");
    expect(analyzer.match(/invokeLLM\(\{\s*merchantId,/g)).toHaveLength(5);

    const websiteRouter = readFileSync(new URL("../routers-website-analysis.ts", import.meta.url), "utf8");
    expect(websiteRouter).toMatch(/analyzer\.analyzeWebsite\(input\.url, merchant\.id\)/);
    expect(websiteRouter).toMatch(/analyzer\.extractProducts\(input\.url, scrapedHtml, allText, merchant\.id\)/);
    expect(websiteRouter).toMatch(/analyzer\.generateInsights\(insightsData, merchant\.id\)/);

    const analysisRouter = readFileSync(new URL("../routers\/analysis\.ts", import.meta.url), "utf8");
    expect(analysisRouter).toMatch(/extractProducts\(input\.websiteUrl, html, homeText, merchant\.id\)/);
    expect(analysisRouter).toMatch(/extractAllWithAI\(allText, input\.websiteUrl, siteType, merchant\.id\)/);
  });

  it.each([
    ["keyword-extraction.ts", "sari.keyword.extraction"],
    ["insights.ts", "sari.insights"],
    ["learning-engine.ts", "sari.learning.pattern_analysis"],
    ["action-selector.ts", "sari.action.selection"],
    ["supervisor-recovery.ts", "sari.supervisor.recovery"],
  ])("scopes the %s background AI path", (file, taskType) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    expect(source).toContain(`taskType: '${taskType}'`);
  });

  it("scopes every merchant-mode AI operation", () => {
    const source = readFileSync(new URL("./merchant-mode.ts", import.meta.url), "utf8");
    expect(source).toContain("taskType: 'sari.merchant.intent'");
    expect(source).toContain("taskType: 'sari.merchant.reply_coaching'");
    expect(source).toContain("taskType: 'sari.merchant.assistant'");
  });

  it("scopes product search, product suggestions, and welcome generation", () => {
    const products = readFileSync(new URL("./product-intelligence.ts", import.meta.url), "utf8");
    expect(products).toContain("taskType: 'sari.product.search'");
    expect(products).toContain("taskType: 'sari.product.suggestions'");

    const personality = readFileSync(new URL("./sari-personality.ts", import.meta.url), "utf8");
    expect(personality).toContain("taskType: 'sari.welcome'");
  });

  it("scopes quick-response suggestions in both keyword routers", () => {
    const analysis = readFileSync(new URL("./keyword-analysis.ts", import.meta.url), "utf8");
    expect(analysis).toContain("taskType: 'sari.keyword.quick_responses'");

    for (const file of ["../routers-keywords.ts", "../routers.ts"]) {
      const routerSource = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(routerSource).toMatch(/suggestQuickResponses\([\s\S]{0,500}merchantId: merchant\.id/);
    }
  });
});
