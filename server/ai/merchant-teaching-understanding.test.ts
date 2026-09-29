import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  settings: vi.fn(),
  context: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: mocks.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("./zahypi-client", () => ({
  runWithZahyPiContext: (context: unknown, work: () => unknown) => {
    mocks.context(context);
    return work();
  },
}));
import {
  teachingTextHash,
  understandMerchantTeaching,
  validateTeachingDecision,
} from "./merchant-teaching-understanding";
const text =
  "اعتمد هذه المعلومة لكل العملاء: الضمان سنتان، لكنه لا يشمل الكسر وسوء الاستخدام.";
const decision = (input = text) => ({
  version: 1,
  sourceHash: teachingTextHash(input),
  intent: "teach",
  scope: "general",
  confidence: 0.98,
  ambiguous: false,
  businessKnowledge: true,
  title: "شروط الضمان",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "central-selected-model",
  });
  mocks.call.mockResolvedValue(JSON.stringify(decision()));
});
describe("merchant teaching semantic admission", () => {
  it("passes the complete message through the central tenant-scoped provider and selected model", async () => {
    expect(await understandMerchantTeaching(41, text)).toEqual(decision());
    expect(mocks.context).toHaveBeenCalledWith({
      merchantId: 41,
      taskType: "sari.merchant.intent",
    });
    const [messages, options] = mocks.call.mock.calls[0];
    expect(JSON.parse(messages[1].content)).toEqual({
      sourceHash: teachingTextHash(text),
      message: text,
    });
    expect(options).toMatchObject({
      merchantId: 41,
      model: "central-selected-model",
      noRetry: true,
      temperature: 0,
    });
  });
  it.each([
    "لا تحفظ هذه المعلومة: الضمان سنتان",
    "هل أكتب #علم_ساري قبل المعلومة؟",
    "قال العميل «علم ساري أن الضمان سنتان»",
    "تمام",
    "لهذا العميل فقط قل له الخصم 20%",
    "إذا وافق المدير غدًا اعتمد الضمان سنتين",
  ])("respects non-teaching decisions: %s", async input => {
    mocks.call.mockResolvedValueOnce(
      JSON.stringify({
        ...decision(input),
        intent: "not_teaching",
        scope: "none",
        title: "",
      })
    );
    expect((await understandMerchantTeaching(41, input)).intent).toBe(
      "not_teaching"
    );
    expect(JSON.parse(mocks.call.mock.calls[0][0][1].content).message).toBe(
      input
    );
  });
  it.each([
    { confidence: 0.89 },
    { ambiguous: true },
    { scope: "single_case" },
    { scope: "none" },
    { businessKnowledge: false },
    { title: "" },
    { title: "x".repeat(501) },
    { sourceHash: "a".repeat(64) },
    { publish: true },
    { answer: "الضمان عشر سنوات" },
    { confidence: "1" },
    { version: 2 },
  ])("rejects unsafe/unbound output %j", patch => {
    expect(() =>
      validateTeachingDecision(
        JSON.stringify({ ...decision(), ...patch }),
        text
      )
    ).toThrow();
  });
  it.each(["not JSON", "```json\n{}\n```", "[]", "{}", "x".repeat(8001)])(
    "rejects malformed output without heuristic repair",
    raw => {
      expect(() => validateTeachingDecision(raw, text)).toThrow();
    }
  );
  it("uses the latest global model for each analysis", async () => {
    await understandMerchantTeaching(41, text);
    mocks.settings.mockResolvedValueOnce({
      isActive: true,
      model: "second-central-model",
      textGenerationProvider: "zahypi",
    });
    await understandMerchantTeaching(42, text);
    expect(mocks.call.mock.calls[1][1]).toMatchObject({
      merchantId: 42,
      model: "second-central-model",
    });
  });
  it.each([null, { isActive: false }])(
    "stops when the superadmin disables AI",
    async settings => {
      mocks.settings.mockResolvedValueOnce(settings);
      await expect(understandMerchantTeaching(41, text)).rejects.toThrow();
      expect(mocks.call).not.toHaveBeenCalled();
    }
  );
  it("does not fall back to regex or another model when the provider/budget rejects", async () => {
    mocks.call.mockRejectedValueOnce(Error("budget exhausted"));
    await expect(understandMerchantTeaching(41, text)).rejects.toThrow(
      "budget exhausted"
    );
    expect(mocks.call).toHaveBeenCalledOnce();
  });
  it.each(["", " ", "a\0b", "a".repeat(16001), "\\".repeat(10000)])(
    "rejects invalid/overflow input without truncation",
    async input => {
      await expect(understandMerchantTeaching(41, input)).rejects.toThrow();
      expect(mocks.call).not.toHaveBeenCalled();
    }
  );
  it.each([0, -1, 1.5, NaN])(
    "rejects invalid merchant %s",
    async merchantId => {
      await expect(
        understandMerchantTeaching(merchantId, text)
      ).rejects.toThrow();
      expect(mocks.call).not.toHaveBeenCalled();
    }
  );
});
