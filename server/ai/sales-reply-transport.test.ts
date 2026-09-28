import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  runtime: vi.fn(),
  budget: vi.fn(),
  key: vi.fn(),
}));
vi.mock("../db_ai_settings", () => ({
  getZahyPiRuntimeConfig: m.runtime,
  getOpenAiApiKey: m.key,
  logAiUsage: vi.fn(),
  estimateCost: () => 0,
}));
vi.mock("./budget-ledger", async original => ({
  ...(await original<typeof import("./budget-ledger")>()),
  withAiBudget: m.budget,
}));
import { callGPT4 } from "./openai";
import { buildSalesReplyMessages } from "./sales-reply-prompt";
import {
  clearZahyPiRuntimeConfigCache,
  runWithZahyPiContext,
} from "./zahypi-client";
import {
  withConversationUnderstanding,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import { AiBudgetError } from "./budget-ledger";

const analysis: ConversationUnderstanding = {
  version: 1,
  intent: "comparing",
  goal: "compare_suitable_options",
  action: "respond",
  confidence: 0.98,
  conditional: false,
  ambiguous: false,
  targetQuoteId: null,
  targetProvider: "none",
  productIds: [],
  sessionIndex: null,
  requestKind: "ordinary",
  sentiment: "neutral",
  topicChanged: false,
  objection: "timing",
  needs: [],
  unresolvedQuestions: [],
  summary: "مقارنة موعدين",
  nextStep: "compare",
  evidence: [{ messageId: 13, excerpt: "نعم" }],
};
const messages = buildSalesReplyMessages({
  systemPrompt: "معلومة موثقة.\n".repeat(3500) + "FINAL_FACT",
  salesTurnPolicy: "FINAL_SALES_POLICY",
  examples: [],
  history: [{ role: "assistant", content: "أشرح الفرق؟" }],
  currentUserContent: "نعم",
});
const scoped = <T>(merchantId: number, run: () => Promise<T>) =>
  runWithZahyPiContext(
    { merchantId, conversationId: 31, taskType: "sari.reply" },
    () =>
      withConversationUnderstanding(
        {
          merchantId,
          conversationId: 31,
          incomingMessageId: 13,
          message: "نعم",
          model: "central-admin-model",
          analysis,
        },
        run
      )
  );
function gatewayResponse(request: RequestInit) {
  const headers = request.headers as Record<string, string>,
    traceId = headers["X-Trace-Id"];
  return Response.json({
    job_id: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    project_id: "sari",
    tenant_id: headers["X-ZahyPi-Tenant"],
    task_type: "sari.reply",
    trace_id: traceId,
    run_manifest_id: "22222222-2222-4222-8222-222222222222",
    route: "central-zahypi-route",
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    structured_output: {
      traceId,
      text: "synthetic reply",
      applicationResponse: "synthetic reply",
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  clearZahyPiRuntimeConfigCache();
  m.runtime.mockResolvedValue({
    enabled: true,
    provider: "openai",
    apiKey: "synthetic-gateway-key",
    baseUrl: "https://api.zahypi.test/v1",
    projectId: "sari",
    model: "central-zahypi-model",
    source: "database",
  });
  m.key.mockResolvedValue("synthetic-openai-key");
  m.budget.mockImplementation(async (_input, run) =>
    run({ requestId: "33333333-3333-4333-8333-333333333333" })
  );
  vi.stubEnv("ZAHYPI_ALLOWED_ORIGINS", "https://api.zahypi.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, request) =>
      String(url).includes("zahypi.test")
        ? gatewayResponse(request)
        : Response.json({
            choices: [{ message: { content: "synthetic reply" } }],
          })
    )
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearZahyPiRuntimeConfigCache();
});
describe("complete reply transport with synthetic HTTP and budget admission", () => {
  it("sends complete bounded history and central model to OpenAI for separate tenants", async () => {
    for (const merchantId of [71, 72])
      expect(
        await scoped(merchantId, () =>
          callGPT4(messages, {
            model: "caller-override",
            maxTokens: 700,
            noRetry: true,
          })
        )
      ).toBe("synthetic reply");
    for (const [, request] of vi.mocked(fetch).mock.calls)
      expect(JSON.parse(request!.body as string)).toMatchObject({
        model: "central-admin-model",
        messages,
        max_tokens: 700,
      });
    expect(m.budget.mock.calls.map(([input]) => input.merchantId)).toEqual([
      71, 72,
    ]);
  });
  it("sends all late facts and policy through the actual ZahyPi job envelope without crossing tenant memory", async () => {
    m.runtime.mockResolvedValue({ ...(await m.runtime()), provider: "zahypi" });
    for (const merchantId of [71, 72])
      await scoped(merchantId, () => callGPT4(messages, { noRetry: true }));
    expect(m.key).not.toHaveBeenCalled();
    vi.mocked(fetch).mock.calls.forEach(([, request], index) => {
      const body = JSON.parse(request!.body as string);
      expect(body.business_input.conversationId).toBe(
        `merchant:${71 + index}:conversation:31`
      );
      const expected = messages.map(message => ({
        ...message,
        content: String(message.content).trim(),
      }));
      expect(body.input.messages).toEqual(expected);
      expect(body.business_input.promptMessages).toEqual(expected);
      expect(
        body.input.messages.map((message: any) => message.content).join("")
      ).toContain("FINAL_FACT");
      expect(body.input.messages.at(-3).content).toBe("FINAL_SALES_POLICY");
    });
  });
  it("keeps the same context and selected model on retry and never starts a hidden mini fallback", async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response("synthetic outage", { status: 500 })
    );
    await expect(
      scoped(71, () => callGPT4(messages, { maxTokens: 700 }))
    ).rejects.toThrow("500");
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, request] of vi.mocked(fetch).mock.calls)
      expect(JSON.parse(request!.body as string)).toMatchObject({
        model: "central-admin-model",
        messages,
        max_tokens: 700,
      });
    expect(m.budget).toHaveBeenCalledTimes(2);
  });
  it("preserves legacy retry behavior outside the contextual sales scope", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("outage", { status: 500 }))
      .mockResolvedValueOnce(new Response("outage", { status: 500 }));
    expect(
      await callGPT4(messages, { merchantId: 71, model: "legacy-model" })
    ).toBe("synthetic reply");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(
          ([, request]) => JSON.parse(request!.body as string).model
        )
    ).toEqual(["legacy-model", "legacy-model", "gpt-4o-mini"]);
  });
  it.each(["openai", "zahypi"])(
    "does not dispatch or fall back when %s budget admission fails",
    async provider => {
      m.runtime.mockResolvedValue({ ...(await m.runtime()), provider });
      m.budget.mockRejectedValue(new AiBudgetError("budget_exceeded"));
      await expect(scoped(71, () => callGPT4(messages))).rejects.toBeInstanceOf(
        AiBudgetError
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(m.budget).toHaveBeenCalledOnce();
    }
  );
});
