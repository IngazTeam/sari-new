import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  runtime: vi.fn(),
  zahy: vi.fn(),
  key: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
  getOpenAiApiKey: mocks.key,
  logAiUsage: vi.fn(),
  estimateCost: () => 0,
}));
vi.mock("./zahypi-client", async original => ({
  ...(await original<typeof import("./zahypi-client")>()),
  resolveZahyPiRuntimeConfig: mocks.runtime,
  requestZahyPiChat: mocks.zahy,
}));
vi.mock("./budget-ledger", async original => ({
  ...(await original<typeof import("./budget-ledger")>()),
  withAiBudget: mocks.budget,
}));
import { understandPreview } from "./conversation-understanding";
import { runWithZahyPiContext } from "./zahypi-client";
import {
  withConversationUnderstanding,
  semanticAction,
  semanticIdentityMatches,
  semanticQuoteMatches,
  contextualHandoffRequested,
  currentConversationUnderstanding,
} from "./conversation-understanding-context";
import { AiBudgetError } from "./budget-ledger";
function output(messages: any[]) {
  const input = JSON.parse(messages[1].content),
    last = input.messages.at(-1);
  return JSON.stringify({
    version: 1,
    intent: "inquiring",
    goal: "explain_requested_information",
    action: "respond",
    confidence: 0.98,
    conditional: false,
    ambiguous: false,
    targetQuoteId: null,
    targetProvider: "none",
    productIds: [],
    sessionIndex: null,
    ...(input.agents
      ? { virtualAgentId: input.agents.at(-1)?.id ?? null }
      : {}),
    requestKind: "ordinary",
    sentiment: "neutral",
    topicChanged: false,
    objection: "none",
    needs: [],
    unresolvedQuestions: [],
    summary: "موافقة على الشرح.",
    nextStep: "answer",
    evidence: [{ messageId: last.id, excerpt: last.content }],
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "central-model",
    textGenerationProvider: "openai",
  });
  mocks.runtime.mockResolvedValue({ enabled: true, provider: "openai" });
  mocks.key.mockResolvedValue("sk-synthetic-test-only");
  mocks.budget.mockImplementation(async (_input, run) =>
    run({ requestId: "synthetic-budget-id" })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url, options) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: output(JSON.parse(options.body).messages) },
              },
            ],
          }),
          { status: 200 }
        )
    )
  );
  mocks.zahy.mockImplementation(async messages => ({
    content: output(messages),
    model: "central-zahypi-model",
  }));
});
afterEach(() => vi.unstubAllGlobals());
describe("preview central provider transport and non-executing boundaries (fake transports)", () => {
  it.each(["openai", "zahypi"])(
    "carries tenant specialties through the central %s adapter while preserving the non-executing scope",
    async provider => {
      mocks.runtime.mockResolvedValue({
        enabled: true,
        provider,
        model: "central-model",
      });
      const context = await understandPreview(
        71,
        "لا أريد الفوترة، قارن الدورات",
        {
          userId: 7,
          history: [
            {
              role: "assistant",
              content: "انتهينا من الفاتورة، ماذا تحتاج بعدها؟",
            },
          ],
          agents: [
            {
              id: 42,
              name: "نورة",
              role: "التدريب",
              department: null,
              expertise: "مقارنة الدورات",
            },
          ],
          currentAgentId: 999,
        }
      );
      expect(context.analysis.virtualAgentId).toBe(42);
      expect(context.mode).toBe("preview");
      const sent =
        provider === "zahypi"
          ? mocks.zahy.mock.calls[0][0]
          : JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
              .messages;
      expect(JSON.parse(sent[1].content)).toMatchObject({
        agents: [{ id: 42 }],
        currentAgentId: null,
      });
      await withConversationUnderstanding(context, async () => {
        expect(
          semanticIdentityMatches({
            merchantId: 71,
            conversationId: 5,
            incomingMessageId: 7,
          })
        ).toBe(false);
        expect(contextualHandoffRequested(context.message)).toBe(false);
      });
    }
  );
  it("uses the central OpenAI model and budget for each tenant, never a tenant-selected override", async () => {
    for (const merchantId of [71, 72])
      await understandPreview(merchantId, "نعم", {
        userId: 7,
        history: [{ role: "assistant", content: "أشرح الفرق؟" }],
      });
    expect(
      mocks.budget.mock.calls.map(([input]) => ({
        merchantId: input.merchantId,
        model: input.model,
        task: input.taskType,
      }))
    ).toEqual(
      [71, 72].map(merchantId => ({
        merchantId,
        model: "central-model",
        task: "sari.customer.intent",
      }))
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(
          ([, options]) => JSON.parse(options!.body as string).model
        )
    ).toEqual(["central-model", "central-model"]);
    expect(mocks.zahy).not.toHaveBeenCalled();
  });
  it("uses the central ZahyPi route for each tenant without reading OpenAI credentials", async () => {
    mocks.settings.mockResolvedValue({
      isActive: true,
      model: "unused-openai-model",
      textGenerationProvider: "zahypi",
    });
    mocks.runtime.mockResolvedValue({
      enabled: true,
      provider: "zahypi",
      model: "central-zahypi-model",
    });
    for (const merchantId of [71, 72])
      await understandPreview(merchantId, "نعم", { userId: 7 });
    expect(
      mocks.zahy.mock.calls.map(([, options, context]) => ({
        context,
        maxAttempts: options.maxAttempts,
      }))
    ).toEqual(
      [71, 72].map(merchantId => ({
        context: { merchantId, userId: 7, taskType: "sari.customer.intent" },
        maxAttempts: 1,
      }))
    );
    expect(mocks.key).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not inherit a live conversation ID or model when nested in the same merchant context", async () => {
    const prior = await understandPreview(71, "قبل");
    await runWithZahyPiContext(
      { merchantId: 71, conversationId: 900, taskType: "sari.reply" },
      () =>
        withConversationUnderstanding(
          {
            ...prior,
            mode: undefined,
            conversationId: 900,
            incomingMessageId: 99,
            model: "stale-live-model",
          },
          async () => {
            mocks.runtime.mockResolvedValue({
              enabled: true,
              provider: "zahypi",
            });
            const value = await understandPreview(71, "نعم", { userId: 7 });
            expect(value).toMatchObject({
              mode: "preview",
              conversationId: 0,
              incomingMessageId: 0,
              model: "central-model",
            });
            expect(mocks.zahy.mock.calls[0][2].conversationId).toBeUndefined();
            expect(
              currentConversationUnderstanding()?.evidence[0].excerpt
            ).toBe("قبل");
          }
        )
    );
  });
  it("does not override a shared budget rejection with a direct or fallback API request", async () => {
    mocks.budget.mockRejectedValue(new AiBudgetError("budget_exceeded"));
    await expect(understandPreview(71, "نعم")).rejects.toMatchObject({
      code: "budget_exceeded",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.zahy).not.toHaveBeenCalled();
    expect(mocks.budget).toHaveBeenCalledOnce();
  });
  it("observes a central disable after the settings read but before dispatch", async () => {
    mocks.runtime.mockResolvedValue({ enabled: false, provider: "openai" });
    await expect(understandPreview(71, "نعم")).rejects.toThrow("disabled");
    expect(mocks.key).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cannot grant agreement, identity or staff-notification authority from a preview scope", async () => {
    const context = await understandPreview(71, "نعم");
    await withConversationUnderstanding(
      {
        ...context,
        analysis: {
          ...context.analysis,
          action: "confirm_offer",
          targetQuoteId: 19,
          targetProvider: "local",
          nextStep: "handoff",
        },
      },
      async () => {
        expect(semanticAction("نعم", ["confirm_offer"])).toBe(false);
        expect(semanticQuoteMatches(19, "local")).toBe(false);
        expect(
          semanticIdentityMatches({
            merchantId: 71,
            conversationId: 0,
            incomingMessageId: 0,
          })
        ).toBe(false);
        expect(contextualHandoffRequested("نعم")).toBe(false);
      }
    );
  });
});
