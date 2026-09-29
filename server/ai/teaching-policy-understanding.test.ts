import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  gpt: vi.fn(),
  context: vi.fn((_c: any, run: any) => run()),
}));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("./openai", () => ({ callGPT4: mocks.gpt }));
vi.mock("./zahypi-client", () => ({ runWithZahyPiContext: mocks.context }));
import {
  policyHash,
  teachingPolicyMessages,
  validateTeachingPolicy,
  understandTeachingPolicy,
  type TeachingPolicyInput,
} from "./teaching-policy-understanding";
const input = (): TeachingPolicyInput => ({
  basisHash: "a".repeat(64),
  proposal: { title: "الضمان", content: "الضمان سنتان عدا الكسر" },
  candidates: [
    {
      key: "section:1",
      title: "ضمان قديم",
      content: "الضمان سنة",
      replaceable: true,
    },
  ],
});
const valid = () => ({
  version: 1,
  basisHash: "a".repeat(64),
  coherent: true,
  businessKnowledge: true,
  confidence: 0.99,
  reason: "تغيير مدة الضمان",
  comparisons: [
    {
      key: "section:1",
      relation: "replace",
      reason: "استبدال كامل",
      currentEvidence: "الضمان سنة",
      proposedEvidence: "الضمان سنتان",
    },
  ],
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "super-admin-selected",
  });
  mocks.gpt.mockResolvedValue(JSON.stringify(valid()));
});
it("routes semantic comparison through the central model with complete original context", async () => {
  const result = await understandTeachingPolicy(9, input());
  expect(result.comparisons[0].relation).toBe("replace");
  expect(mocks.context).toHaveBeenCalledWith(
    { merchantId: 9, taskType: "sari.merchant.intent" },
    expect.any(Function)
  );
  expect(mocks.gpt).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({
      merchantId: 9,
      model: "super-admin-selected",
      noRetry: true,
    })
  );
});
it.each([
  "basis",
  "missing",
  "duplicate",
  "foreign",
  "old-evidence",
  "new-evidence",
  "nonreplaceable",
  "extra",
] as const)("rejects %s without inventing a replacement", mode => {
  const i = input(),
    d: any = valid();
  if (mode === "basis") d.basisHash = "b".repeat(64);
  if (mode === "missing") d.comparisons = [];
  if (mode === "duplicate") d.comparisons.push(d.comparisons[0]);
  if (mode === "foreign") d.comparisons[0].key = "section:99";
  if (mode === "old-evidence")
    d.comparisons[0].currentEvidence = "ضمان خمس سنوات";
  if (mode === "new-evidence")
    d.comparisons[0].proposedEvidence = "ضمان خمس سنوات";
  if (mode === "nonreplaceable") i.candidates[0].replaceable = false;
  if (mode === "extra") d.publish = true;
  expect(() => validateTeachingPolicy(JSON.stringify(d), i)).toThrow();
});
it("requires verbatim evidence from both texts before proposing a replacement", () => {
  const d = valid();
  d.comparisons[0].currentEvidence = "";
  expect(() => validateTeachingPolicy(JSON.stringify(d), input())).toThrow();
});
it("retains uncertainty for the review gate rather than converting it to approval", () => {
  const d = valid();
  d.coherent = false;
  d.confidence = 0.4;
  expect(validateTeachingPolicy(JSON.stringify(d), input())).toMatchObject({
    coherent: false,
    confidence: 0.4,
  });
});
it("produces a stable basis digest after MySQL JSON key ordering", () =>
  expect(policyHash({ a: 1, b: { x: 2, y: 3 } })).toBe(
    policyHash({ b: { y: 3, x: 2 }, a: 1 })
  ));
it("binds future expiry changes as well as current eligibility", () => {
  expect(policyHash({ expires: new Date("2030-01-01T00:00:00Z") })).not.toBe(
    policyHash({ expires: new Date("2031-01-01T00:00:00Z") })
  );
});
it("preserves trailing exceptions and escaped Unicode across transport parts", () => {
  const i = input();
  i.proposal.content = '"\\😀\n'.repeat(9000) + "ولا يشمل الكسر";
  const messages = teachingPolicyMessages(i),
    parts = messages.slice(1).map(m => JSON.parse(m.content as string));
  expect(messages.every(m => (m.content as string).length <= 16000)).toBe(true);
  expect(JSON.parse(parts.map(p => p.data).join(""))).toEqual(i);
});
it.each(["disabled", "invalid", "offline"])(
  "fails closed for %s AI without a keyword fallback",
  async mode => {
    if (mode === "disabled")
      mocks.settings.mockResolvedValue({ isActive: false });
    if (mode === "invalid") mocks.gpt.mockResolvedValue("invalid");
    if (mode === "offline") mocks.gpt.mockRejectedValue(Error("offline"));
    await expect(understandTeachingPolicy(9, input())).rejects.toThrow();
  }
);
