import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  callGPT4: vi.fn(),
  checkpoint: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  logChange: vi.fn(),
  getSectionsByMerchantId: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: dependencies.callGPT4 }));
vi.mock("../knowledge/intake-execution", () => ({
  assertIntakeCheckpoint: dependencies.checkpoint,
}));
vi.mock("../db/knowledge", () => dependencies);

import {
  analyzeSalesIntelligence,
  classifyContent,
  ingestContent,
} from "./knowledge-engine";

const secret = {
  raw: "CONFIDENTIAL_FILE_CONTENT_427",
  title: "CONFIDENTIAL_SECTION_TITLE_427",
  content: "CONFIDENTIAL_SECTION_CONTENT_427",
  summary: "CONFIDENTIAL_SUMMARY_427",
  business: "CONFIDENTIAL_BUSINESS_427",
  url: "https://example.test/private?token=SECRET_427",
  usp: "CONFIDENTIAL_USP_427",
  tip: "CONFIDENTIAL_TIP_427",
  opportunity: "CONFIDENTIAL_OPPORTUNITY_427",
  error: "CONFIDENTIAL_PROVIDER_BODY_427",
  stack: "CONFIDENTIAL_PROVIDER_STACK_427",
};
const sections = [
  {
    sectionType: "identity" as const,
    title: secret.title,
    content: secret.content,
    summary: secret.summary,
    confidence: 0.9,
  },
];
const sales = {
  usps: [secret.usp],
  sellingTips: [secret.tip],
  opportunities: [secret.opportunity],
};
const context = { businessName: secret.business };
let output: unknown[][];
function assertPrivateLogs() {
  const log = JSON.stringify(output);
  for (const value of Object.values(secret)) expect(log).not.toContain(value);
  return log;
}
beforeEach(() => {
  vi.resetAllMocks();
  output = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      output.push(args);
    });
  dependencies.checkpoint.mockResolvedValue(undefined);
  dependencies.getSectionsByMerchantId.mockResolvedValue([]);
  dependencies.createSection.mockResolvedValue(7);
});
afterEach(() => vi.restoreAllMocks());

describe("knowledge operational logs exclude tenant content", () => {
  it("classifies the original data while logging only response lengths and counts", async () => {
    dependencies.callGPT4.mockResolvedValue(JSON.stringify(sections));
    expect(await classifyContent(42, secret.raw, context)).toEqual(sections);
    expect(dependencies.callGPT4.mock.calls[0][0][1].content).toContain(
      secret.raw
    );
    expect(assertPrivateLogs()).toContain("1 sections passed validation");
  });
  it("never prints invalid model section types or titles", async () => {
    dependencies.callGPT4.mockResolvedValue(
      JSON.stringify([{ ...sections[0], sectionType: secret.error }])
    );
    expect(await classifyContent(42, secret.raw, context)).toEqual([]);
    expect(assertPrivateLogs()).toContain("0 sections passed validation");
  });
  it.each(["classification", "sales"] as const)(
    "does not log provider messages or stacks after %s failure",
    async task => {
      const error = new Error(secret.error);
      error.stack = secret.stack;
      dependencies.callGPT4.mockRejectedValue(error);
      const result =
        task === "classification"
          ? await classifyContent(42, secret.raw, context)
          : await analyzeSalesIntelligence(42, sections, context);
      expect(result).toEqual(
        task === "classification"
          ? []
          : { usps: [], sellingTips: [], opportunities: [] }
      );
      expect(assertPrivateLogs()).toMatch(/failed/i);
    }
  );
  it.each(["classification", "sales"] as const)(
    "does not print invalid JSON or parser diagnostics in %s",
    async task => {
      dependencies.callGPT4.mockResolvedValue(secret.error);
      if (task === "classification")
        expect(await classifyContent(42, secret.raw, context)).toEqual([]);
      else
        expect(await analyzeSalesIntelligence(42, sections, context)).toEqual({
          usps: [],
          sellingTips: [],
          opportunities: [],
        });
      expect(assertPrivateLogs()).toMatch(/failed/i);
    }
  );
  it("preserves saved knowledge, audit content, sales and merchant-only opportunities without copying them to console", async () => {
    dependencies.callGPT4
      .mockResolvedValueOnce(JSON.stringify(sections))
      .mockResolvedValueOnce(JSON.stringify(sales));
    const result = await ingestContent(
      42,
      secret.raw,
      "document",
      context,
      secret.url
    );
    expect(result).toEqual({
      evolveResult: {
        added: 1,
        merged: 0,
        evolved: 0,
        conflicts: 0,
        unchanged: 0,
      },
      salesIntel: sales,
    });
    expect(dependencies.createSection).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 42,
        content: secret.content,
        title: secret.title,
        sourceUrl: secret.url,
      })
    );
    expect(dependencies.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 42, newContent: secret.content })
    );
    expect(dependencies.createSection).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionType: "sales_intel",
        content: expect.stringContaining(secret.tip),
      })
    );
    expect(dependencies.createSection).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionType: "opportunities",
        useInBot: false,
        injectAs: "none",
        content: expect.stringContaining(secret.opportunity),
      })
    );
    expect(assertPrivateLogs()).toContain("Classified 1 sections");
  });
  it("keeps a numeric empty-outcome diagnostic without leaking the uploaded file", async () => {
    dependencies.callGPT4.mockResolvedValue("[]");
    expect(
      (await ingestContent(42, secret.raw, "document", context)).evolveResult
        .added
    ).toBe(0);
    expect(dependencies.createSection).not.toHaveBeenCalled();
    expect(assertPrivateLogs()).toContain("ZERO SECTIONS");
  });
});
