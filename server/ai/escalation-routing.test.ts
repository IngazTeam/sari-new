import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  send: vi.fn(),
  source: vi.fn(),
  read: vi.fn(),
  receipt: vi.fn(),
  recheck: vi.fn(),
  commit: vi.fn(),
  understand: vi.fn(),
  ai: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("./escalation-relay", () => ({ relayEscalationReply: mocks.relay }));
vi.mock("../whatsapp", () => ({ sendMessageWithCredentials: mocks.send }));
vi.mock("../knowledge/whatsapp-teaching-source", () => ({
  readTeachingSource: mocks.source,
}));
vi.mock("./merchant-directive-store", () => ({
  readMerchantDirectiveContext: mocks.read,
  findMerchantDirectiveReceipt: mocks.receipt,
  recheckMerchantDirective: mocks.recheck,
  commitMerchantOwnership: mocks.commit,
  directiveInput: (c: any) => ({
    basisHash: c.basisHash,
    text: c.source.text,
    targets: c.targets,
  }),
}));
vi.mock("./merchant-directive-understanding", () => ({
  understandMerchantDirective: mocks.understand,
}));
vi.mock("../db", () => ({
  getWhatsAppInstanceById: async () => ({
    id: 8,
    merchantId: 1,
    status: "active",
    instanceId: "stored-account",
    token: "stored-test-token",
    apiUrl: "http://127.0.0.1",
  }),
  getMerchantById: async () => ({ businessName: "fixture" }),
}));
vi.mock("./sari-personality", () => ({
  buildEnhancedContextPrompt: async () => "معرفة معتمدة",
}));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("./openai", () => ({ callGPT4: mocks.ai }));
vi.mock("./zahypi-client", () => ({
  runWithZahyPiContext: (_: unknown, run: () => unknown) => run(),
}));
import { handleMerchantChat } from "./merchant-mode";
const input = (message = "الموعد مساء الخميس") => ({
  merchantId: 1,
  merchantPhone: "966500000082",
  message,
  quotedText: "نص مقتبس غير موثوق",
  quotedMessageId: "alert-receipt",
  instanceRecordId: 8,
  instanceId: "untrusted-account",
  token: "untrusted-test-token",
  apiUrl: "http://127.0.0.2",
});
const source = (text = input().message) => ({
  merchantId: 1,
  instanceId: 8,
  inboundId: 4,
  eventKey: "a".repeat(64),
  digest: "b".repeat(64),
  text,
  authorPhone: input().merchantPhone,
  quotedMessageId: "alert-receipt",
});
const decision = (intent = "relay", extra = {}) => ({
  version: 1,
  basisHash: "c".repeat(64),
  intent,
  targetId: 9,
  replyText: input().message,
  ...extra,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.source.mockImplementation(async (_: unknown, text: string) =>
    source(text)
  );
  mocks.read.mockImplementation(async (_: unknown, text: string) => ({
    source: source(text),
    basisHash: "c".repeat(64),
    targets: [{ id: 9, phone: "966500000090" }],
  }));
  mocks.receipt.mockResolvedValue(null);
  mocks.understand.mockResolvedValue(decision());
  mocks.recheck.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ success: true });
  mocks.relay.mockResolvedValue({ accepted: true, status: "accepted" });
  mocks.commit.mockResolvedValue({ changed: true, replayed: false });
  mocks.settings.mockResolvedValue({
    isActive: true,
    model: "selected-central",
  });
  mocks.ai.mockResolvedValue("هذه معلومة النشاط");
});
describe("contextual merchant directive dispatch", () => {
  it("classifies quoted text before relaying and passes the exact reviewed content and proof", async () => {
    expect(await handleMerchantChat(input())).toEqual({
      action: "escalation_reply_accepted",
    });
    expect(mocks.understand.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.relay.mock.invocationCallOrder[0]
    );
    expect(mocks.relay).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 1,
        merchantPhone: input().merchantPhone,
        instanceRecordId: 8,
        quotedMessageId: "alert-receipt",
        replyText: input().message,
        directive: expect.objectContaining({ decision: decision() }),
      })
    );
    expect(mocks.send.mock.calls[0].slice(0, 3)).toEqual([
      "stored-account",
      "stored-test-token",
      "http://127.0.0.1",
    ]);
  });
  it.each(["pause", "resume"])(
    "does not forward a quoted %s instruction to the customer",
    async intent => {
      mocks.understand.mockResolvedValue(decision(intent, { replyText: null }));
      await handleMerchantChat(input("لا ترسل هذا الكلام للعميل"));
      expect(mocks.relay).not.toHaveBeenCalled();
      expect(mocks.commit).toHaveBeenCalledOnce();
    }
  );
  it.each([
    "لا توقف الرد",
    "العميل قال استأنف",
    "كيف أرسل للعميل؟",
    "نعم",
    "استأنف الجميع",
  ])("does not use keyword actions after clarify: %s", async text => {
    mocks.understand.mockResolvedValue(
      decision("clarify", { targetId: null, replyText: null })
    );
    await handleMerchantChat({ ...input(text), quotedMessageId: undefined });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls[0][4]).toContain("لم أنفذ");
  });
  it("never confirms failed persistence", async () => {
    mocks.understand.mockResolvedValue(decision("pause"));
    mocks.commit.mockRejectedValue(Error("storage down"));
    expect(await handleMerchantChat(input())).toEqual({
      action: "merchant_directive_unavailable",
    });
    expect(mocks.send.mock.calls[0][4]).toContain("لم أؤكد");
  });
  it("rechecks the context after AI and never dispatches changed evidence", async () => {
    mocks.recheck.mockRejectedValue(Error("changed"));
    await handleMerchantChat(input());
    expect(mocks.relay).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("does not repeat an event or reclassify a previously reserved relay", async () => {
    mocks.receipt.mockResolvedValue({ intent: "relay" });
    expect(await handleMerchantChat(input())).toEqual({
      action: "merchant_directive_replayed",
    });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.understand).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
  it("does not claim success after an unknown customer delivery", async () => {
    mocks.relay.mockResolvedValue({ accepted: false, status: "unknown" });
    await handleMerchantChat(input());
    expect(mocks.send.mock.calls[0][4]).toContain("تعذر حسم");
  });
  it.each(["rejected", "thrown"])(
    "propagates acknowledgement failure (%s) without a second success or error message",
    async mode => {
      if (mode === "rejected") mocks.send.mockResolvedValue({ success: false });
      else mocks.send.mockRejectedValue(Error("provider error"));
      await expect(handleMerchantChat(input())).rejects.toThrow(
        "acknowledgement"
      );
      expect(mocks.send).toHaveBeenCalledOnce();
    }
  );
  it("refuses a mismatched route before AI or sending", async () => {
    await expect(
      handleMerchantChat({ ...input(), merchantPhone: "966500000099" })
    ).rejects.toThrow("identity");
    expect(mocks.understand).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed when AI is unavailable and never treats the text as a command", async () => {
    mocks.understand.mockRejectedValue(Error("budget"));
    await handleMerchantChat(input("لا ترد"));
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
  it("keeps the full merchant question and central model in the assistant path", async () => {
    mocks.understand.mockResolvedValue(
      decision("chat", { targetId: null, replyText: null })
    );
    const text = "تفاصيل ".repeat(160) + "شرط أخير";
    await handleMerchantChat({ ...input(text), quotedMessageId: undefined });
    expect(mocks.ai.mock.calls[0][0].at(-1).content).toBe(text);
    expect(mocks.ai.mock.calls[0][1]).toMatchObject({
      merchantId: 1,
      model: "selected-central",
      taskType: "sari.merchant.assistant",
      noRetry: true,
    });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});
