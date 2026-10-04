import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  callGPT4: vi.fn(),
  checkpoint: vi.fn(),
  commit: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: dependencies.callGPT4 }));
vi.mock("../knowledge/intake-execution", () => ({
  assertIntakeCheckpoint: dependencies.checkpoint,
}));
vi.mock("../knowledge/evolution-storage", () => ({
  readEvolutionSnapshot: dependencies.read,
  commitEvolution: dependencies.commit,
}));

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
  dependencies.read.mockResolvedValue({ merchantId: 42, sections: [], revision: 'test' });
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
    await expect(
      classifyContent(42, secret.raw, context)
    ).rejects.toMatchObject({ name: "KnowledgeAnalysisError" });
    expect(assertPrivateLogs()).toContain("classifyContent failed");
  });
  it.each(["classification", "sales"] as const)(
    "does not log provider messages or stacks after %s failure",
    async task => {
      const error = new Error(secret.error);
      error.stack = secret.stack;
      dependencies.callGPT4.mockRejectedValue(error);
      const result =
        task === "classification"
          ? classifyContent(42, secret.raw, context)
          : analyzeSalesIntelligence(42, sections, context);
      await expect(result).rejects.toMatchObject({
        name: "KnowledgeAnalysisError",
      });
      expect(assertPrivateLogs()).toMatch(/failed/i);
    }
  );
  it.each(["classification", "sales"] as const)(
    "does not print invalid JSON or parser diagnostics in %s",
    async task => {
      dependencies.callGPT4.mockResolvedValue(secret.error);
      if (task === "classification")
        await expect(
          classifyContent(42, secret.raw, context)
        ).rejects.toMatchObject({ name: "KnowledgeAnalysisError" });
      else
        await expect(
          analyzeSalesIntelligence(42, sections, context)
        ).rejects.toMatchObject({ name: "KnowledgeAnalysisError" });
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
    expect(dependencies.commit).toHaveBeenCalledTimes(1);
    const [snapshot, operations] = dependencies.commit.mock.calls[0];
    expect(snapshot.merchantId).toBe(42);
    expect(operations).toHaveLength(3);
    expect(operations[0]).toMatchObject({ kind: 'create',
      values: { content: secret.content, title: secret.title, sourceUrl: secret.url },
      audit: { newContent: secret.content } });
    expect(operations[1]).toMatchObject({ kind: 'create', values: {
      sectionType: 'sales_intel', content: expect.stringContaining(secret.tip) } });
    expect(operations[2]).toMatchObject({ kind: 'create', values: {
      sectionType: 'opportunities', useInBot: false, injectAs: 'none',
      content: expect.stringContaining(secret.opportunity) } });
    expect(assertPrivateLogs()).toContain("Classified 1 sections");
  });
  it("keeps a numeric empty-outcome diagnostic without leaking the uploaded file", async () => {
    dependencies.callGPT4.mockResolvedValue("[]");
    await expect(
      ingestContent(42, secret.raw, "document", context)
    ).rejects.toMatchObject({
      name: "KnowledgeAnalysisError",
      stage: "empty_classification",
    });
    expect(dependencies.commit).not.toHaveBeenCalled();
    expect(assertPrivateLogs()).toContain("ZERO SECTIONS");
  });
});

it.each(["classification", "sales"] as const)(
  "does not write knowledge for a malformed %s provider result",
  async stage => {
    dependencies.callGPT4.mockResolvedValueOnce(
      stage === "classification"
        ? JSON.stringify([sections[0], { ...sections[0], title: 4 }])
        : JSON.stringify(sections)
    );
    if (stage === "sales")
      dependencies.callGPT4.mockResolvedValueOnce(
        JSON.stringify({ ...sales, sellingTips: [{}] })
      );
    await expect(
      ingestContent(42, secret.raw, "document", context)
    ).rejects.toMatchObject({ name: "KnowledgeAnalysisError", stage });
    expect(dependencies.commit).not.toHaveBeenCalled();
    assertPrivateLogs();
  }
);
it("does not classify a late response or request sales analysis after the execution closes", async () => {
  dependencies.callGPT4.mockResolvedValue(JSON.stringify(sections));
  const expired = Object.assign(new Error("Execution closed"), {
    name: "IntakeExecutionExpired",
  });
  dependencies.checkpoint
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(expired);
  await expect(ingestContent(42, secret.raw, "document", context)).rejects.toBe(
    expired
  );
  expect(dependencies.callGPT4).toHaveBeenCalledTimes(1);
  expect(dependencies.commit).not.toHaveBeenCalled();
});
it("does not write a late sales result after the execution closes", async () => {
  dependencies.callGPT4
    .mockResolvedValueOnce(JSON.stringify(sections))
    .mockResolvedValueOnce(JSON.stringify(sales));
  const expired = Object.assign(new Error("Execution closed"), {
    name: "IntakeExecutionExpired",
  });
  dependencies.checkpoint
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(expired);
  await expect(ingestContent(42, secret.raw, "document", context)).rejects.toBe(
    expired
  );
  expect(dependencies.callGPT4).toHaveBeenCalledTimes(2);
  expect(dependencies.commit).not.toHaveBeenCalled();
});

it("uses full parent and child evidence in sales analysis without copying it to logs", async () => {
  const child = {
    ...sections[0],
    sectionType: "policies" as const,
    title: "Delivery",
    content: "Policy detail ".repeat(50) + "IMPORTANT_CHILD_END_446",
    summary: "Short child summary",
  };
  const input = [
    {
      ...sections[0],
      content: "Parent detail ".repeat(50) + "IMPORTANT_PARENT_END_446",
      children: [child],
    },
  ];
  dependencies.callGPT4.mockResolvedValue(JSON.stringify(sales));
  expect(await analyzeSalesIntelligence(42, input, context)).toEqual(sales);
  const prompt = dependencies.callGPT4.mock.calls[0][0][1].content;
  expect(prompt).toContain("IMPORTANT_CHILD_END_446");
  expect(prompt).toContain("IMPORTANT_PARENT_END_446");
  expect(JSON.stringify(output)).not.toContain("IMPORTANT_CHILD_END_446");
});
it.each(["empty", "too-large"])(
  "rejects %s classification input without a paid model call",
  async kind => {
    await expect(
      classifyContent(
        42,
        kind === "empty" ? "   " : "x".repeat(100001),
        context
      )
    ).rejects.toMatchObject({ name: "KnowledgeAnalysisError" });
    expect(dependencies.callGPT4).not.toHaveBeenCalled();
  }
);
it("does not generate sales advice without any knowledge evidence", async () => {
  await expect(analyzeSalesIntelligence(42, [], context)).rejects.toMatchObject(
    { name: "KnowledgeAnalysisError", stage: "sales" }
  );
  expect(dependencies.callGPT4).not.toHaveBeenCalled();
});
