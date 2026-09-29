import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  instance: vi.fn(),
  chain: vi.fn(),
  teach: vi.fn(),
  coaching: vi.fn(),
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
}));
vi.mock("../ai/merchant-mode", () => ({ handleMerchantChat: mocks.chat }));
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
  it("lets a confident non-teaching interpretation continue to coaching without a teaching acknowledgement", async () => {
    mocks.teach.mockResolvedValueOnce({ handled: false });
    await handleGreenAPIWebhook(payload("هذا جوابي عن سؤال التدريب"));
    expect(mocks.coaching).toHaveBeenCalledWith(
      12,
      "هذا جوابي عن سؤال التدريب"
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
});
