import { describe, expect, it } from "vitest";
import {
  conversationUnderstandingSchema,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import { contextualSalesLossReason } from "./contextual-sales-loss-contract";
import {
  validateUnderstanding,
  understandingMessages,
  type UnderstandingInput,
} from "./conversation-understanding";
import { salesLossUnderstandingFixture } from "../tests/helpers/sales-loss-understanding-fixture";

const input: UnderstandingInput = {
  currentMessageId: 3,
  catalog: [],
  targets: [],
  messages: [
    { id: 1, role: "user", content: "الدورة مناسبة لاحتياجي" },
    { id: 2, role: "assistant", content: "هل تناسبك المواعيد المتاحة؟" },
    {
      id: 3,
      role: "user",
      content: "تغير جدول عملي، لن أستطيع الالتحاق بهذه الدورة",
    },
  ],
};
const parsed = (changes: Partial<ConversationUnderstanding> = {}) =>
  validateUnderstanding(
    JSON.stringify(salesLossUnderstandingFixture(input, changes)),
    input
  );
describe("contextual sales decline contract", () => {
  it.each([
    "price",
    "trust",
    "competitor",
    "delivery",
    "timing",
    "fit",
    "other",
  ] as const)("accepts a grounded centrally interpreted %s decline", reason => {
    expect(
      contextualSalesLossReason(
        parsed({
          salesLoss: {
            status: "declined",
            reason,
            evidence: [{ messageId: 3, excerpt: input.messages[2].content }],
          },
        })
      )
    ).toBe(reason);
  });
  it("does not infer a decline from words, an old schema, or an uncertain decision", () => {
    const prior = salesLossUnderstandingFixture(input);
    delete prior.salesLoss;
    expect(conversationUnderstandingSchema.parse(prior)).not.toHaveProperty(
      "salesLoss"
    );
    expect(contextualSalesLossReason(prior)).toBeNull();
    for (const status of ["none", "unclear"] as const)
      expect(
        contextualSalesLossReason(
          parsed({ salesLoss: { status, reason: null, evidence: [] } })
        )
      ).toBeNull();
  });
  it.each([
    { confidence: 0.84 },
    { conditional: true },
    { ambiguous: true },
    { intent: "comparing" },
    { goal: "explain_requested_information" },
    { nextStep: "answer" },
    { action: "request_human" },
    {
      followup: {
        status: "clarify",
        localDate: null,
        localTime: null,
        timeZone: null,
        sourceCreatedAt: null,
        evidence: [{ messageId: 3, excerpt: input.messages[2].content }],
      },
    },
    {
      automaticFollowup: {
        status: "recommend",
        purpose: "price",
        delayHours: 4,
        evidence: [],
      },
    },
    {
      appointmentReminder: {
        status: "clarify",
        appointmentId: null,
        hoursBefore: null,
        evidence: [{ messageId: 3, excerpt: input.messages[2].content }],
      },
    },
  ] as Partial<ConversationUnderstanding>[])(
    "rejects contradictory or untrusted decline %j",
    changes => {
      expect(
        contextualSalesLossReason(salesLossUnderstandingFixture(input, changes))
      ).toBeNull();
      expect(() => parsed(changes)).toThrow();
    }
  );
  it.each([
    [],
    [{ messageId: 2, excerpt: input.messages[1].content }],
    [{ messageId: 3, excerpt: "نص لم يقله العميل" }],
    [{ messageId: 90000, excerpt: input.messages[2].content }],
  ])("rejects missing/current/foreign/forged evidence %j", evidence => {
    expect(() =>
      parsed({ salesLoss: { status: "declined", reason: "timing", evidence } })
    ).toThrow();
  });
  it("rejects unexplained loss metadata and unknown outcome fields", () => {
    expect(() =>
      parsed({ salesLoss: { status: "none", reason: "price", evidence: [] } })
    ).toThrow();
    expect(() =>
      parsed({
        salesLoss: {
          status: "unclear",
          reason: null,
          evidence: [{ messageId: 3, excerpt: input.messages[2].content }],
        },
      })
    ).toThrow();
    expect(() =>
      parsed({
        salesLoss: {
          status: "declined",
          reason: "timing",
          evidence: [],
          paid: true,
        } as any,
      })
    ).toThrow();
  });
  it("keeps the full instruction within the governed per-message limit and distinguishes interpretation from financial fact", () => {
    const prompt = understandingMessages(input)[0].content;
    expect(prompt.length).toBeLessThanOrEqual(16000);
    expect(prompt).toContain("عدم الرد أو تأخر الدفع");
    expect(prompt).toContain("ليس إثبات خسارة مالية");
  });
});
