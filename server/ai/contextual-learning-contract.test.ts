import { describe, expect, it } from "vitest";
import {
  validateUnderstanding,
  understandingMessages,
  type UnderstandingInput,
} from "./conversation-understanding";
import {
  conversationUnderstandingSchema,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import {
  resolvedLearningSignals,
  type ContextualLearningSignal,
} from "./contextual-learning-contract";
import { learningUnderstandingFixture } from "../tests/helpers/learning-understanding-fixture";

const input: UnderstandingInput = {
  currentMessageId: 3,
  catalog: [],
  targets: [],
  messages: [
    { id: 1, role: "user", content: "ما قيمة الاشتراك؟" },
    {
      id: 2,
      role: "assistant",
      content: "هذه المزايا المتاحة للاشتراك.",
      isAiReply: true,
    },
    {
      id: 3,
      role: "user",
      content: "وضحت لي الفروق لكن الميزانية لا تكفي لهذا الخيار",
    },
  ],
};
const parse = (value: ConversationUnderstanding, context = input) =>
  validateUnderstanding(JSON.stringify(value), context);
describe("grounded contextual learning interpretation", () => {
  it.each([
    "positive_feedback",
    "question_repeated",
    "price_objection",
    "sales_objection",
    "escalation_requested",
    "knowledge_gap",
  ] as ContextualLearningSignal["type"][])(
    "accepts a coherent centrally interpreted %s signal with current and prior evidence",
    type => {
      expect(
        resolvedLearningSignals(
          parse(learningUnderstandingFixture(input, [type]))
        ).map(s => s.type)
      ).toEqual([type]);
    }
  );
  it("has no default that would change historical seals and never falls back to words", () => {
    const old = learningUnderstandingFixture(input);
    delete old.learningSignals;
    expect(conversationUnderstandingSchema.parse(old)).not.toHaveProperty(
      "learningSignals"
    );
    expect(resolvedLearningSignals(old)).toEqual([]);
    expect(
      resolvedLearningSignals(parse(learningUnderstandingFixture(input, [])))
    ).toEqual([]);
  });
  it.each([{ confidence: 0.84 }, { conditional: true }, { ambiguous: true }])(
    "rejects executable learning from uncertain interpretation %j",
    change => {
      const value = learningUnderstandingFixture(
        input,
        ["price_objection"],
        change
      );
      expect(resolvedLearningSignals(value)).toEqual([]);
      expect(() => parse(value)).toThrow();
    }
  );
  it("does not discard a grounded objection merely because the customer is angry", () => {
    expect(
      resolvedLearningSignals(
        parse(
          learningUnderstandingFixture(input, ["price_objection"], {
            sentiment: "angry",
          })
        )
      )
    ).toHaveLength(1);
  });
  it.each([
    "duplicate",
    "both objections",
    "wrong price",
    "wrong nonprice",
    "unrequested human",
    "foreign evidence",
    "invented excerpt",
    "missing current",
    "missing target",
    "human target",
    "future target",
    "wrong target role",
  ])("rejects %s without inventing alternative learning", fault => {
    const value = learningUnderstandingFixture(input, ["positive_feedback"]);
    const signal = value.learningSignals![0];
    let context = input;
    if (fault === "duplicate") value.learningSignals!.push({ ...signal });
    if (fault === "both objections")
      value.learningSignals = learningUnderstandingFixture(input, [
        "price_objection",
        "sales_objection",
      ]).learningSignals;
    if (fault === "wrong price") {
      signal.type = "price_objection";
      value.objection = "timing";
    }
    if (fault === "wrong nonprice") {
      signal.type = "sales_objection";
      value.objection = "price";
    }
    if (fault === "unrequested human") signal.type = "escalation_requested";
    if (fault === "foreign evidence")
      signal.evidence.push({ messageId: 999999, excerpt: "غالي" });
    if (fault === "invented excerpt") signal.evidence[0].excerpt = "ممتاز جدا";
    if (fault === "missing current")
      signal.evidence = signal.evidence.filter(e => e.messageId !== 3);
    if (fault === "missing target") signal.aboutAssistantMessageId = null;
    if (fault === "human target")
      context = {
        ...input,
        messages: input.messages.map(m =>
          m.id === 2 ? { ...m, isAiReply: false } : m
        ),
      };
    if (fault === "future target") signal.aboutAssistantMessageId = 4;
    if (fault === "wrong target role") signal.aboutAssistantMessageId = 1;
    expect(() => parse(value, context)).toThrow();
  });
  it("allows a price objection without attributing it to any assistant when no reply is identified", () => {
    const value = learningUnderstandingFixture(input);
    value.learningSignals![0].aboutAssistantMessageId = null;
    value.learningSignals![0].evidence =
      value.learningSignals![0].evidence.slice(0, 1);
    expect(parse(value).learningSignals![0].aboutAssistantMessageId).toBeNull();
  });
  it("forbids fabricated purchase/weight/policy output and excessive signal arrays", () => {
    for (const extra of [
      { type: "purchase_completed" },
      { weight: 9 },
      { activatePolicy: true },
    ]) {
      const value = learningUnderstandingFixture(input);
      Object.assign(value.learningSignals![0], extra);
      expect(() => parse(value)).toThrow();
    }
    const value = learningUnderstandingFixture(input);
    value.learningSignals = Array(6).fill(value.learningSignals![0]);
    expect(() => parse(value)).toThrow();
  });
  it("keeps instructions intact within the governed message limit for live and preview", () => {
    for (const context of [input, { ...input, mode: "preview" as const }]) {
      expect(
        understandingMessages(context).every(m => m.content.length <= 16000)
      ).toBe(true);
      expect(understandingMessages(context)[0].content).toContain(
        "لا تتنبأ بفشل الرد الذي لم يُكتب بعد"
      );
    }
  });
});
