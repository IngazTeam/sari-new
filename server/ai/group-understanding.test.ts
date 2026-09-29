import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  settings: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: mocks.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("./zahypi-client", () => ({
  runWithZahyPiContext: (context: unknown, run: () => unknown) => {
    mocks.scope(context);
    return run();
  },
}));
import {
  groupHash,
  groupMessages,
  validateGroupDecision,
  understandGroup,
  type GroupInput,
} from "./group-understanding";
import { resolveSariTaskType } from "./task-catalog";
const input = (): GroupInput => ({
  basisHash: groupHash("fixture"),
  currentMessageId: 2,
  mode: "keyword_only",
  language: "ar",
  businessName: "تدريب",
  topics: ["تعليم الجداول"],
  mentioned: false,
  messages: [
    {
      id: 1,
      actor: "other",
      text: "ميزانيتي 500",
      quoteId: null,
      unresolvedQuote: false,
    },
    {
      id: 2,
      actor: "current",
      text: "أحتاج ترتيب شغلي بالأرقام، أي دورة تناسبني؟",
      quoteId: 1,
      unresolvedQuote: false,
    },
  ],
  assistantReplies: [],
  facts: [{ key: "product:3", title: "إكسل", content: "للمبتدئين" }],
  historyLimited: false,
  catalogLimited: false,
});
const decision = (i = input()) => ({
  version: 1,
  basisHash: i.basisHash,
  currentMessageId: i.currentMessageId,
  action: "respond",
  confidence: 0.99,
  ambiguous: false,
  evidence: [{ messageId: 2, excerpt: "أي دورة تناسبني؟" }],
  factKeys: ["product:3"],
  reply: "دورة إكسل مناسبة للبداية. ما مستوى خبرتك؟",
  reason: "حاجة فعلية",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "centrally-selected",
  });
  mocks.call.mockResolvedValue(JSON.stringify(decision()));
});
it("registers group understanding as a governed conversation task", () => {
  expect(resolveSariTaskType("sari.group.intent")).toMatchObject({
    status: "existing",
    inputKind: "conversation",
    externalProcessing: "deny",
    dataClassification: "red",
  });
});
it("rejects an invalid tenant before calling the provider", async () => {
  await expect(understandGroup(0, input())).rejects.toThrow();
  expect(mocks.call).not.toHaveBeenCalled();
});
it("passes the full multi-party context and centrally selected model through the governed provider", async () => {
  expect((await understandGroup(18, input())).action).toBe("respond");
  expect(mocks.scope).toHaveBeenCalledWith({
    merchantId: 18,
    taskType: "sari.group.intent",
  });
  expect(mocks.call).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({
      merchantId: 18,
      model: "centrally-selected",
      taskType: "sari.group.intent",
      noRetry: true,
    })
  );
  expect(JSON.stringify(mocks.call.mock.calls[0][0])).toContain("ميزانيتي");
});
it("does not fall back to matching topic words when the provider fails", async () => {
  mocks.call.mockRejectedValue(Error("offline"));
  await expect(understandGroup(18, input())).rejects.toThrow("offline");
});
it("does not call a disabled provider", async () => {
  mocks.settings.mockResolvedValue({ isActive: false });
  await expect(understandGroup(18, input())).rejects.toThrow();
  expect(mocks.call).not.toHaveBeenCalled();
});
it.each([
  { basisHash: "a".repeat(64) },
  { currentMessageId: 1 },
  { evidence: [{ messageId: 1, excerpt: "ميزانيتي" }] },
  { evidence: [{ messageId: 2, excerpt: "غير موجود" }] },
  { factKeys: ["private:99"] },
  { factKeys: [] },
  { confidence: 0.7 },
  { ambiguous: true },
  { reply: "تم حجز موعدك" },
  { reply: "https://example.invalid/pay" },
  { reply: "[[send_payment]]" },
  { action: "ignore" },
  { action: "book" },
  { phone: "966500000000" },
])("rejects ungrounded or executable result %j", patch => {
  expect(() =>
    validateGroupDecision(JSON.stringify({ ...decision(), ...patch }), input())
  ).toThrow();
});
it("does not infer native mention from the model", () => {
  const i = { ...input(), mode: "mention_only" as const };
  expect(() => validateGroupDecision(JSON.stringify(decision(i)), i)).toThrow();
});
it("does not respond to an unresolved quote", () => {
  const i = input();
  i.messages[1].unresolvedQuote = true;
  expect(() => validateGroupDecision(JSON.stringify(decision(i)), i)).toThrow();
});
it("allows only a public invitation in private-redirect mode", () => {
  const i = { ...input(), mode: "private_redirect" as const };
  expect(() => validateGroupDecision(JSON.stringify(decision(i)), i)).toThrow();
  expect(
    validateGroupDecision(
      JSON.stringify({
        ...decision(i),
        action: "invite_private",
        factKeys: [],
        reply: "راسلنا على الخاص لتفاصيل طلبك.",
      }),
      i
    ).action
  ).toBe("invite_private");
});
it("can ignore an ambiguous discussion without producing any text", () => {
  expect(
    validateGroupDecision(
      JSON.stringify({
        ...decision(),
        action: "ignore",
        reply: null,
        factKeys: [],
        ambiguous: true,
        confidence: 0.3,
      }),
      input()
    ).action
  ).toBe("ignore");
});
it("preserves long context in ordered bounded transport parts", () => {
  const i = input();
  i.facts[0].content = "تعليم😀".repeat(5000);
  const messages = groupMessages(i);
  const parts = messages.slice(1).map(m => JSON.parse(String(m.content)));
  expect(parts.map(p => p.data).join("")).toBe(JSON.stringify(i));
  expect(messages.every(m => String(m.content).length < 16000)).toBe(true);
});
