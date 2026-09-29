import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ settings: vi.fn(), gpt: vi.fn() }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("../ai/openai", () => ({ callGPT4: mocks.gpt }));
import {
  validateOnboardingDecision,
  understandOnboarding,
  onboardingMessages,
  type OnboardingDecision,
  type OnboardingInput,
} from "./onboarding-understanding";
import {
  onboardingPrompt,
  nextOnboardingQuestion,
} from "./onboarding-questions";
const input = (): OnboardingInput => ({
  basisHash: "a".repeat(64),
  reply: "نحن متجر كتب ولدينا أيضًا تدريب على القراءة",
  status: "active",
  question: { key: "businessType", question: "وش نوع نشاطك؟" },
  answers: {},
  canAnswer: true,
});
const decision = (
  intent: OnboardingDecision["intent"] = "answer"
): OnboardingDecision => ({
  version: 1,
  basisHash: "a".repeat(64),
  intent,
  fieldKey: "businessType",
  businessType: "both",
  confidence: 0.99,
  explicit: true,
  ambiguous: false,
  conditional: false,
  evidence: "متجر كتب",
  rationale: "fixture",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "super-admin-model",
  });
  mocks.gpt.mockResolvedValue(JSON.stringify(decision()));
});
describe("contextual onboarding understanding contract", () => {
  it("uses the centrally selected model and complete current statement", async () => {
    expect(await understandOnboarding(12, input())).toEqual(decision());
    expect(mocks.gpt).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        merchantId: 12,
        taskType: "sari.merchant.intent",
        model: "super-admin-model",
        noRetry: true,
      })
    );
    expect(mocks.gpt.mock.calls[0][0][1].content).toContain(input().reply);
  });
  it.each([
    ["confidence", 0.89],
    ["explicit", false],
    ["ambiguous", true],
    ["conditional", true],
    ["basisHash", "b".repeat(64)],
    ["evidence", "invented"],
    ["fieldKey", "bankAccount"],
    ["businessType", null],
  ])("rejects unsafe %s", (key, value) => {
    expect(() =>
      validateOnboardingDecision(
        JSON.stringify({ ...decision(), [key]: value }),
        input()
      )
    ).toThrow();
  });
  it.each(["paused", "not_started", "completed"])(
    "cannot consume a question while %s",
    status => {
      expect(() =>
        validateOnboardingDecision(JSON.stringify(decision()), {
          ...input(),
          status,
        })
      ).toThrow();
    }
  );
  it("requires a delivered current question for answer", () => {
    expect(() =>
      validateOnboardingDecision(JSON.stringify(decision()), {
        ...input(),
        canAnswer: false,
      })
    ).toThrow();
  });
  it("never silently truncates an overlong policy", () => {
    const long = { ...input(), reply: "ن".repeat(4001) };
    expect(() =>
      validateOnboardingDecision(
        JSON.stringify({ ...decision("update"), evidence: "ن" }),
        long
      )
    ).toThrow();
  });
  it.each([
    "لا يوجد",
    "لا",
    "مافيه",
    "لاحقًا سنفتح فرعًا، حاليًا أونلاين فقط",
    "الدفع عند الاستلام داخل الرياض فقط\nولا تقبله خارجها",
  ])(
    "keeps the model evidence and complete policy without lexical intent: %s",
    reply => {
      const current = {
        ...input(),
        reply,
        question: { key: "address", question: "العنوان؟" },
      };
      expect(
        validateOnboardingDecision(
          JSON.stringify({
            ...decision(),
            fieldKey: "address",
            businessType: null,
            evidence: reply,
          }),
          current
        ).intent
      ).toBe("answer");
    }
  );
  it.each(["unrelated", "clarify"] as const)(
    "allows non-mutating %s without pretending confidence",
    intent => {
      const d = {
        ...decision(intent),
        fieldKey: null,
        businessType: null,
        explicit: false,
        confidence: 0.2,
        ambiguous: true,
      };
      expect(
        validateOnboardingDecision(JSON.stringify(d), input()).intent
      ).toBe(intent);
    }
  );
  it("does not invent a business type for another field", () => {
    expect(() =>
      validateOnboardingDecision(
        JSON.stringify({ ...decision("update"), fieldKey: "address" }),
        input()
      )
    ).toThrow();
  });
  it.each(["disabled", "failure", "invalid"])(
    "fails closed on %s AI, without keyword fallback",
    async mode => {
      if (mode === "disabled")
        mocks.settings.mockResolvedValueOnce({ isActive: false });
      if (mode === "failure") mocks.gpt.mockRejectedValueOnce(Error("offline"));
      if (mode === "invalid") mocks.gpt.mockResolvedValueOnce("```json {} ```");
      await expect(understandOnboarding(12, input())).rejects.toThrow();
      if (mode === "disabled") expect(mocks.gpt).not.toHaveBeenCalled();
    }
  );
  it("preserves a large JSON context and trailing exceptions across transport parts", () => {
    const current = {
      ...input(),
      answers: { businessDescription: '"\\\n😀'.repeat(2000) },
      reply: "لا تحفظها إلا بعد المراجعة",
    };
    const messages = onboardingMessages(current),
      parts = messages.slice(1).map(m => JSON.parse(m.content as string));
    expect(parts.length).toBeGreaterThan(1);
    expect(messages.every(m => (m.content as string).length <= 16000)).toBe(
      true
    );
    expect(JSON.parse(parts.map(p => p.data).join(""))).toEqual(current);
  });
  it("prints real questions instead of object coercion and adapts product/service questions", () => {
    expect(onboardingPrompt({})).toContain("وش نوع نشاطك");
    expect(onboardingPrompt({})).not.toContain("[object Object]");
    expect(
      nextOnboardingQuestion({ businessType: "both" })?.totalQuestions
    ).toBe(30);
    expect(
      nextOnboardingQuestion({ businessType: "services" })?.totalQuestions
    ).toBe(25);
    expect(
      nextOnboardingQuestion({ businessType: "store" })?.totalQuestions
    ).toBe(25);
  });
});
