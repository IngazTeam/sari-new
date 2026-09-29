import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  instance: vi.fn(),
  chain: vi.fn(),
  teach: vi.fn(),
  coaching: vi.fn(),
  next: vi.fn(),
  send: vi.fn(),
  chat: vi.fn(),
  createConversation: vi.fn(),
  instances: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../db", async original => ({
  ...(await original<typeof import("../db")>()),
  getPool: async () => null,
  getWhatsAppInstanceByInstanceId: mocks.instance,
  getWhatsAppInstancesByMerchantId: mocks.instances,
  createConversation: mocks.createConversation,
  getBotSettings: mocks.settings,
}));
vi.mock("../ai/smart-escalation", () => ({
  isPhoneInEscalationChain: mocks.chain,
}));
vi.mock("../ai/coaching-engine", () => ({
  handleTeachCommand: mocks.teach,
  handleCoachingReply: mocks.coaching,
  sendCurrentCoachingQuestion: mocks.next,
}));
vi.mock("../ai/merchant-mode", () => ({ handleMerchantChat: mocks.chat }));
vi.mock("../automation/onboarding-interview", () => ({
  isOnboardingActive: async () => false,
  handleOnboardingReply: vi.fn(),
  handleUpdateCommand: vi.fn(),
}));
vi.mock("../whatsapp", () => ({
  sendMessageWithCredentials: mocks.send,
  sendTextMessage: mocks.send,
}));
import { handleGreenAPIWebhook } from "./greenapi";
const payload = (text: string) => ({
  typeWebhook: "incomingMessageReceived",
  instanceData: { idInstance: "chosen-instance" },
  idMessage: "synthetic-inbound",
  senderData: { sender: "966500000023@c.us", chatId: "966500000023@c.us" },
  messageData: {
    typeMessage: "textMessage",
    textMessageData: { textMessage: text },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.instance.mockResolvedValue({
    id: 8,
    merchantId: 12,
    status: "active",
    instanceId: "chosen-instance",
    token: "synthetic-account-token",
    apiUrl: "https://api.green-api.com",
  });
  mocks.chain.mockResolvedValue(true);
  mocks.teach.mockResolvedValue({ handled: true, response: "تعليمة محفوظة" });
  mocks.coaching.mockResolvedValue({ handled: true });
  mocks.send.mockResolvedValue({ success: true, messageId: "receipt" });
  mocks.chat.mockResolvedValue({ action: "escalation_reply_accepted" });
  mocks.settings.mockResolvedValue({ groupMode: "disabled" });
});
describe("semantic teaching webhook dispatch", () => {
  it.each([
    "السياسة الجديدة التي أريد اعتمادها لجميع العملاء هي الضمان سنتان",
    "#علم_ساري الضمان سنتان",
    "لا تحفظ ما نقلته لك عن العميل",
  ])(
    "passes the complete merchant message to analysis without a keyword gate: %s",
    async text => {
      expect(await handleGreenAPIWebhook(payload(text))).toMatchObject({
        success: true,
        message: "Merchant teaching analysis processed",
      });
      expect(mocks.teach).toHaveBeenCalledWith(12, text);
      expect(mocks.coaching).not.toHaveBeenCalled();
      expect(mocks.send).toHaveBeenCalledWith(
        "chosen-instance",
        "synthetic-account-token",
        "https://api.green-api.com",
        "966500000023",
        "تعليمة محفوظة"
      );
      expect(mocks.instances).not.toHaveBeenCalled();
      expect(mocks.createConversation).not.toHaveBeenCalled();
    }
  );
  it("keeps unquoted non-teaching messages out of coaching and continues to merchant chat", async () => {
    mocks.teach.mockResolvedValueOnce({ handled: false });
    await handleGreenAPIWebhook(payload("هذا جوابي عن سؤال التدريب"));
    expect(mocks.coaching).not.toHaveBeenCalled();
    expect(mocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 12,
        message: "هذا جوابي عن سؤال التدريب",
      })
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not fall through after analysis ambiguity or failure", async () => {
    mocks.teach.mockResolvedValueOnce({
      handled: true,
      response: "لم أحفظ؛ أحتاج توضيحًا",
    });
    await handleGreenAPIWebhook(payload("اعتمد نفس الشيء"));
    expect(mocks.coaching).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });
  it("keeps a durable quoted escalation ahead of teaching analysis", async () => {
    mocks.coaching.mockResolvedValueOnce({ handled: false });
    const value: any = payload("هذا الرد خاص بالعميل");
    value.messageData.quotedMessage = { stanzaId: "alert-reference" };
    await handleGreenAPIWebhook(value);
    expect(mocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({ quotedMessageId: "alert-reference" })
    );
    expect(mocks.teach).not.toHaveBeenCalled();
  });
  it.each(["rejected", "thrown"])(
    "does not claim delivery or enter customer flow after an acknowledgement is %s",
    async mode => {
      if (mode === "rejected")
        mocks.send.mockResolvedValueOnce({ success: false });
      else
        mocks.send.mockRejectedValueOnce(
          Error("fixture transport unavailable")
        );
      expect(
        await handleGreenAPIWebhook(payload("اعتمد الضمان سنتان"))
      ).toMatchObject({ success: false });
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.createConversation).not.toHaveBeenCalled();
      expect(mocks.coaching).not.toHaveBeenCalled();
    }
  );
  it("does not run private teaching in a group", async () => {
    const value = payload("اعتمد الضمان سنتان");
    value.senderData.chatId = "12345@g.us";
    await handleGreenAPIWebhook(value);
    expect(mocks.teach).not.toHaveBeenCalled();
    expect(mocks.chain).not.toHaveBeenCalled();
  });
  it("routes a matched quoted coaching review before teaching or escalation and sends the next question only after acknowledgement", async () => {
    mocks.coaching.mockResolvedValueOnce({
      handled: true,
      response: "حفظت المراجعة",
      nextSessionId: 17,
    });
    mocks.next.mockResolvedValueOnce(true);
    const value: any = payload("الدورة عن بعد");
    value.messageData.quotedMessage = { stanzaId: "coaching-receipt" };
    expect(await handleGreenAPIWebhook(value)).toMatchObject({
      success: true,
      message: "Coaching quoted review processed",
    });
    expect(mocks.coaching).toHaveBeenCalledWith(
      12,
      "الدورة عن بعد",
      "coaching-receipt"
    );
    expect(mocks.teach).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledWith(12, 17);
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.next.mock.invocationCallOrder[0]
    );
  });
  it.each(["acknowledgement", "next_question"])(
    "does not claim a coaching delivery succeeded after %s fails",
    async stage => {
      mocks.coaching.mockResolvedValueOnce({
        handled: true,
        response: "حفظت المراجعة",
        nextSessionId: 17,
      });
      mocks.next.mockResolvedValueOnce(false);
      if (stage === "acknowledgement")
        mocks.send.mockResolvedValueOnce({ success: false });
      const value: any = payload("راجع جوابي");
      value.messageData.quotedMessage = { stanzaId: "coaching-receipt" };
      expect(await handleGreenAPIWebhook(value)).toMatchObject({
        success: false,
      });
      expect(mocks.teach).not.toHaveBeenCalled();
      expect(mocks.chat).not.toHaveBeenCalled();
      if (stage === "acknowledgement")
        expect(mocks.next).not.toHaveBeenCalled();
    }
  );
});
