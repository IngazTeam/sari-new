import { beforeEach, describe, it, expect, vi } from "vitest";
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
  runWithZahyPiContext: (ctx: unknown, run: () => unknown) => {
    mocks.context(ctx);
    return run();
  },
}));
import {
  understandMerchantDirective,
  validateDirectiveDecision,
  directiveMessages,
  directiveHash,
  type DirectiveInput,
} from "./merchant-directive-understanding";
const input = (
  text = "راجعت المحادثة، أعد تشغيل الرد للعميل 966500000090"
): DirectiveInput => ({
  basisHash: "a".repeat(64),
  text,
  targets: [
    {
      id: 9,
      phone: "966500000090",
      name: null,
      version: 2,
      takeover: true,
      lastMessageId: 4,
      cutoff: 0,
      quoted: false,
      messages: [
        {
          id: 3,
          direction: "incoming",
          senderType: "customer",
          content: "هل يمكن إكمال الطلب؟",
          createdAt: "2026-09-29T00:00:00.000Z",
        },
        {
          id: 4,
          direction: "outgoing",
          senderType: "merchant",
          content: "سأراجعه",
          createdAt: "2026-09-29T00:01:00.000Z",
        },
      ],
    },
  ],
});
const decision = (i = input(), patch = {}) => ({
  version: 1,
  basisHash: i.basisHash,
  intent: "resume",
  targetId: 9,
  confidence: 0.99,
  explicit: true,
  ambiguous: false,
  conditional: false,
  reviewed: true,
  scope: "one",
  evidence: i.text,
  replyText: null,
  reportPeriod: "none",
  rationale: "طلب صريح بعد المراجعة",
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue({ isActive: true, model: "central-model" });
  mocks.call.mockResolvedValue(JSON.stringify(decision()));
});
describe("contextual merchant directive contract", () => {
  it("uses full message, both speakers and selected central model with tenant/task scope", async () => {
    await expect(understandMerchantDirective(7, input())).resolves.toEqual(
      decision()
    );
    const [messages, options] = mocks.call.mock.calls[0];
    expect(JSON.parse(messages[1].content).targets).toEqual(input().targets);
    expect(options).toMatchObject({
      merchantId: 7,
      taskType: "sari.merchant.intent",
      model: "central-model",
      noRetry: true,
    });
    expect(mocks.context).toHaveBeenCalledWith({
      merchantId: 7,
      taskType: "sari.merchant.intent",
    });
  });
  it.each([
    { basisHash: "b".repeat(64) },
    { confidence: 0.89 },
    { ambiguous: true },
    { conditional: true },
    { explicit: false },
    { scope: "all" },
    { targetId: 42 },
    { reviewed: false },
    { evidence: "invented" },
    { replyText: "unexpected" },
    { extra: "injected" },
  ])("rejects unsafe decision %j", patch => {
    expect(() =>
      validateDirectiveDecision(
        JSON.stringify(decision(input(), patch)),
        input()
      )
    ).toThrow();
  });
  it.each([
    "لا توقف الرد على هذا العميل",
    "العميل قال «لا ترد» ولا أطلب إيقافه",
    "استأنف إذا وافق الموظف",
    "كيف أوقف الرد؟",
    "الكل وليس عميلًا واحدًا",
  ])(
    "never converts a clarification from AI into a keyword action: %s",
    async text => {
      const i = input(text),
        d = decision(i, {
          intent: "clarify",
          targetId: null,
          scope: "none",
          explicit: false,
          reviewed: false,
        });
      mocks.call.mockResolvedValueOnce(JSON.stringify(d));
      expect(await understandMerchantDirective(7, i)).toEqual(d);
    }
  );
  it("requires an owned quoted target and an original contiguous reply", () => {
    const i = input("قول للعميل: الموعد الخميس بشرط السداد");
    const d = decision(i, {
      intent: "relay",
      replyText: "الموعد الخميس بشرط السداد",
    });
    expect(() => validateDirectiveDecision(JSON.stringify(d), i)).toThrow();
    i.targets[0].quoted = true;
    expect(validateDirectiveDecision(JSON.stringify(d), i)).toEqual(d);
    expect(() =>
      validateDirectiveDecision(
        JSON.stringify({ ...d, replyText: "الموعد مؤكد الخميس" }),
        i
      )
    ).toThrow();
  });
  it("rejects a relay that drops a condition at the end of the original message", () => {
    const i = input("قل للعميل الموعد الخميس بشرط السداد");
    i.targets[0].quoted = true;
    expect(() =>
      validateDirectiveDecision(
        JSON.stringify(
          decision(i, { intent: "relay", replyText: "الموعد الخميس" })
        ),
        i
      )
    ).toThrow();
  });
  it("rejects duplicate phone identities without a quoted conversation", () => {
    const i = input();
    i.targets.push({ ...i.targets[0], id: 10 });
    expect(() =>
      validateDirectiveDecision(JSON.stringify(decision(i)), i)
    ).toThrow();
  });
  it("never executes a report for a different period as today", () => {
    const i = input("تقرير الشهر");
    expect(() =>
      validateDirectiveDecision(
        JSON.stringify(
          decision(i, {
            intent: "report",
            targetId: null,
            scope: "none",
            reportPeriod: "unsupported",
          })
        ),
        i
      )
    ).toThrow();
  });
  it("preserves a long source, conditions and emoji across transport parts", () => {
    const i = input("راجع ".repeat(2200) + " الشرط الأخير 🧠");
    i.targets[0].messages[0].content = "سياق 🧠 ".repeat(1700);
    const messages = directiveMessages(i);
    expect(messages.length).toBeGreaterThan(2);
    expect(messages.every(m => (m.content as string).length <= 16000)).toBe(
      true
    );
    const content = messages
      .slice(1)
      .map(m => JSON.parse(m.content as string).data)
      .join("");
    expect(JSON.parse(content)).toEqual({
      basisHash: i.basisHash,
      merchantMessage: i.text,
      targets: i.targets,
    });
  });
  it.each(["disabled", "provider", "malformed"])(
    "has no fallback when AI is %s",
    async reason => {
      if (reason === "disabled")
        mocks.settings.mockResolvedValueOnce({ isActive: false });
      if (reason === "provider")
        mocks.call.mockRejectedValueOnce(Error("budget unavailable"));
      if (reason === "malformed") mocks.call.mockResolvedValueOnce("resume");
      await expect(understandMerchantDirective(7, input())).rejects.toThrow();
      expect(mocks.call.mock.calls.length).toBeLessThanOrEqual(1);
    }
  );
  it("bounds text instead of truncating it", async () => {
    await expect(
      understandMerchantDirective(7, input("ن".repeat(16001)))
    ).rejects.toThrow();
    expect(mocks.call).not.toHaveBeenCalled();
  });
});
