import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gpt: vi.fn(), settings: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: mocks.gpt }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
import {
  validateTeachingDialogue,
  understandTeachingDialogue,
  teachingDialogueMessages,
  type TeachingDialogueInput,
  type TeachingDialogueDecision,
} from "./teaching-dialogue-understanding";
const input = (): TeachingDialogueInput => ({
  basisHash: "a".repeat(64),
  message: "أضف شرطًا: الضمان لا يشمل الكسر",
  draftUnavailable: false,
  draft: {
    version: 1,
    fragments: [{ inboundId: 1, text: "سأشرح سياسة الضمان، مدته سنتان" }],
  },
});
const decision = (
  intent: TeachingDialogueDecision["intent"] = "append"
): TeachingDialogueDecision => ({
  version: 2,
  basisHash: "a".repeat(64),
  intent,
  includeCurrent: true,
  complete: false,
  general: true,
  explicit: true,
  ambiguous: false,
  conditional: false,
  businessKnowledge: true,
  confidence: 0.99,
  title: "الضمان",
  evidence: "لا يشمل الكسر",
  reason: "fixture",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "selected-by-superadmin",
  });
  mocks.gpt.mockResolvedValue(JSON.stringify(decision()));
});
describe("multi-turn teaching semantic contract", () => {
  it("does not fall through to another action classifier on an uncertain not-teaching result", () => {
    expect(() =>
      validateTeachingDialogue(
        JSON.stringify({
          ...decision("not_teaching"),
          includeCurrent: false,
          title: "",
          confidence: 0.5,
          ambiguous: true,
        }),
        input()
      )
    ).toThrow();
  });
  it("sends ordered full original fragments and current exceptions through the centrally selected model", async () => {
    expect(await understandTeachingDialogue(12, input())).toEqual(decision());
    expect(JSON.parse(mocks.gpt.mock.calls[0][0][1].content)).toEqual(input());
    expect(mocks.gpt.mock.calls[0][1]).toMatchObject({
      merchantId: 12,
      model: "selected-by-superadmin",
      taskType: "sari.merchant.intent",
      noRetry: true,
    });
  });
  it.each([
    { confidence: 0.89 },
    { explicit: false },
    { ambiguous: true },
    { conditional: true },
    { businessKnowledge: false },
    { basisHash: "b".repeat(64) },
    { evidence: "invented" },
    { version: 1 },
    { includeCurrent: false },
    { title: "" },
    { injected: true },
  ])("rejects an unsafe draft mutation %j", patch => {
    expect(() =>
      validateTeachingDialogue(
        JSON.stringify({ ...decision(), ...patch }),
        input()
      )
    ).toThrow();
  });
  it("requires complete explicitly general knowledge before submitting", () => {
    expect(() =>
      validateTeachingDialogue(JSON.stringify(decision("submit")), input())
    ).toThrow();
    expect(() =>
      validateTeachingDialogue(
        JSON.stringify({
          ...decision("submit"),
          complete: true,
          general: false,
        }),
        input()
      )
    ).toThrow();
    expect(
      validateTeachingDialogue(
        JSON.stringify({
          ...decision("submit"),
          complete: true,
          includeCurrent: false,
        }),
        input()
      ).includeCurrent
    ).toBe(false);
  });
  it.each(["append", "replace", "cancel"] as const)(
    "rejects %s without a sourced draft",
    intent => {
      expect(() =>
        validateTeachingDialogue(
          JSON.stringify({
            ...decision(intent),
            ...(intent === "cancel"
              ? { title: "", includeCurrent: false }
              : {}),
          }),
          { ...input(), draft: null }
        )
      ).toThrow();
    }
  );
  it("allows explicit cancellation of an unavailable draft without reusing its missing content", () => {
    expect(
      validateTeachingDialogue(
        JSON.stringify({
          ...decision("cancel"),
          includeCurrent: false,
          title: "",
        }),
        { ...input(), draft: null, draftUnavailable: true }
      ).intent
    ).toBe("cancel");
  });
  it("rejects appending beyond fragment bounds without truncation", () => {
    const full = {
      ...input(),
      draft: {
        version: 8,
        fragments: Array.from({ length: 8 }, (_, i) => ({
          inboundId: i + 1,
          text: "policy",
        })),
      },
    };
    expect(() =>
      validateTeachingDialogue(JSON.stringify(decision()), full)
    ).toThrow();
  });
  it.each(["disabled", "error", "invalid"])(
    "fails closed on %s model output without lexical fallback",
    async mode => {
      if (mode === "disabled")
        mocks.settings.mockResolvedValueOnce({ isActive: false });
      if (mode === "error") mocks.gpt.mockRejectedValueOnce(Error("offline"));
      if (mode === "invalid") mocks.gpt.mockResolvedValueOnce("not JSON");
      await expect(understandTeachingDialogue(12, input())).rejects.toThrow();
    }
  );
  it("preserves large escaped conversation context across bounded transport parts", () => {
    const current = {
      ...input(),
      draft: {
        version: 2,
        fragments: [{ inboundId: 1, text: '"\\\n😀'.repeat(2300) }],
      },
    };
    const messages = teachingDialogueMessages(current),
      parts = messages.slice(1).map(m => JSON.parse(m.content as string));
    expect(parts.length).toBeGreaterThan(1);
    expect(messages.every(m => (m.content as string).length <= 16000)).toBe(
      true
    );
    expect(JSON.parse(parts.map(p => p.data).join(""))).toEqual(current);
  });
});
