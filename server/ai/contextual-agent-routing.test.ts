import { describe, expect, it } from "vitest";
import {
  agentCandidates,
  chooseContextualAgent,
  contextualAgentPrompt,
  resolveContextualAgent,
  type ContextualAgent,
} from "./contextual-agent-routing";
import {
  withConversationUnderstanding,
  conversationUnderstandingSchema,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";

const agent = (
  id: number,
  extra: Partial<ContextualAgent> = {}
): ContextualAgent => ({
  id,
  name: `موظف ${id}`,
  role: "مبيعات",
  department: null,
  personalityPrompt: "اشرح الخيارات حسب احتياج العميل.",
  isActive: 1,
  isDefault: 0,
  sortOrder: id,
  shiftStart: null,
  shiftEnd: null,
  ...extra,
});
const interpretation = (
  overrides: Partial<ConversationUnderstanding> = {}
): ConversationUnderstanding => ({
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
  requestKind: "ordinary",
  sentiment: "neutral",
  topicChanged: false,
  objection: "none",
  needs: [],
  unresolvedQuestions: [],
  summary: "يريد مقارنة الدورات، لا التواصل مع المحاسب.",
  nextStep: "compare",
  evidence: [{ messageId: 13, excerpt: "لا أريد المحاسب" }],
  ...overrides,
});

describe("contextual agent routing (synthetic interpretation, not a model quality measurement)", () => {
  it("honors contextual specialization despite a literal department mention", () => {
    const accounting = {
      ...agent(1, { department: "المحاسبة", isDefault: 1 }),
      triggerKeywords: '["المحاسب"]',
    };
    const training = agent(2, { department: "التدريب" });
    expect(
      chooseContextualAgent(
        [accounting, training],
        1,
        interpretation({ virtualAgentId: 2 }),
        "12:00"
      )?.id
    ).toBe(2);
  });
  it.each([
    { virtualAgentId: null },
    {},
    { virtualAgentId: 2, confidence: 0.84 },
    { virtualAgentId: 2, ambiguous: true },
    { virtualAgentId: 2, conditional: true },
    { virtualAgentId: 99 },
  ])(
    "keeps eligible current identity when switching is unsupported: %j",
    overrides => {
      expect(
        chooseContextualAgent(
          [agent(1), agent(2, { isDefault: 1 })],
          1,
          interpretation(overrides),
          "12:00"
        )?.id
      ).toBe(1);
    }
  );
  it.each([
    { isActive: 0 },
    { shiftStart: "22:00", shiftEnd: "06:00" },
    { shiftStart: "12:00", shiftEnd: "12:00" },
  ])("replaces unavailable current and proposed agents: %j", extra => {
    expect(
      chooseContextualAgent(
        [agent(1, extra), agent(2, { isDefault: 1 })],
        1,
        interpretation({ virtualAgentId: 1 }),
        "12:00"
      )?.id
    ).toBe(2);
  });
  it("uses a deterministic available default then saved order, or business identity", () => {
    const agents = [
      agent(4, { sortOrder: 1 }),
      agent(2, { sortOrder: 1 }),
      agent(9, { isDefault: 1 }),
    ];
    expect(
      chooseContextualAgent(agents, 99, interpretation(), "12:00")?.id
    ).toBe(9);
    expect(
      chooseContextualAgent(agents.slice(0, 2), 99, interpretation(), "12:00")
        ?.id
    ).toBe(2);
    expect(chooseContextualAgent([], 99, interpretation(), "12:00")).toBeNull();
    expect(agents.map(a => a.id)).toEqual([4, 2, 9]);
  });
  it("bounds untrusted expertise and exposes no keyword or tenant identifier to the model", () => {
    const candidates = agentCandidates(
      Array.from({ length: 51 }, (_, i) =>
        agent(i + 1, { personalityPrompt: "x".repeat(2000) })
      )
    );
    expect(candidates).toHaveLength(50);
    expect(candidates.every(a => a.expertise.length === 1000)).toBe(true);
    expect(Object.keys(candidates[0]).sort()).toEqual([
      "department",
      "expertise",
      "id",
      "name",
      "role",
    ]);
  });
  it("preserves old sealed JSON without adding a missing routing field", () => {
    const old = interpretation();
    expect(JSON.stringify(conversationUnderstandingSchema.parse(old))).toBe(
      JSON.stringify(old)
    );
    expect(conversationUnderstandingSchema.parse(old)).not.toHaveProperty(
      "virtualAgentId"
    );
  });
  it("uses business identity when no agent is eligible and never promises a human handoff", () => {
    expect(contextualAgentPrompt(null, "متجر التجربة")).toContain(
      "متجر التجربة"
    );
    const prompt = contextualAgentPrompt(agent(1), "متجر التجربة");
    expect(prompt).toContain("لا تدّع وصول موظف");
    expect(prompt).not.toContain("تم تحويله");
  });
  it("rejects mismatched or missing interpretation before touching storage", async () => {
    const input = {
      merchantId: 1,
      conversationId: 2,
      incomingMessageId: 13,
      customerPhone: "966500000001",
      message: "لا أريد المحاسب",
    };
    await expect(resolveContextualAgent(input)).rejects.toThrow(
      "Missing conversation understanding"
    );
    await withConversationUnderstanding(
      { ...input, analysis: interpretation() },
      async () => {
        for (const change of [
          { merchantId: 2 },
          { conversationId: 3 },
          { incomingMessageId: 14 },
          { message: "اختلاف" },
        ])
          await expect(
            resolveContextualAgent({ ...input, ...change })
          ).rejects.toThrow("identity mismatch");
      }
    );
    await withConversationUnderstanding(
      {
        ...input,
        mode: "preview",
        analysis: interpretation({ virtualAgentId: 99 }),
      },
      async () => {
        expect(await resolveContextualAgent(input)).toBeNull();
      }
    );
  });
});
