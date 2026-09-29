import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  instance: vi.fn(),
  settings: vi.fn(),
  group: vi.fn(),
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getWhatsAppInstanceByInstanceId: mock.instance,
  getBotSettings: mock.settings,
}));
vi.mock("./messaging/group-handler", () => ({
  handleContextualGroup: mock.group,
}));
import { handleGreenAPIWebhook } from "./webhooks/greenapi";
// Ingress routing is pure here. Real queue/conversation/outbox contracts live in
// messaging/group-understanding.mysql.test.ts and ai/reply-reservation.mysql.test.ts.
// Never select an arbitrary merchant or use live credentials in webhook tests.
const payload = () => ({
  typeWebhook: "incomingMessageReceived",
  instanceData: { idInstance: "synthetic" },
  idMessage: "event",
  timestamp: 1,
  senderData: { chatId: "120363000000001@g.us", sender: "966500000111@c.us" },
  messageData: {
    typeMessage: "textMessage",
    textMessageData: { textMessage: "أي خيار يناسب احتياجي؟" },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.instance.mockResolvedValue({
    id: 1,
    merchantId: 2,
    status: "active",
    instanceId: "synthetic",
  });
  mock.settings.mockResolvedValue({ groupMode: "disabled" });
  mock.group.mockResolvedValue({
    success: true,
    message: "contextual handler",
  });
});
describe("isolated Green API ingress routing", () => {
  it("ignores non-message events before any account lookup", async () => {
    expect(
      await handleGreenAPIWebhook({ typeWebhook: "statusInstanceChanged" })
    ).toMatchObject({ success: true, message: "Non-message webhook ignored" });
    expect(mock.instance).not.toHaveBeenCalled();
    expect(mock.group).not.toHaveBeenCalled();
  });
  it("keeps disabled groups silent", async () => {
    expect(await handleGreenAPIWebhook(payload())).toMatchObject({
      success: true,
      message: "Group message ignored (disabled)",
    });
    expect(mock.group).not.toHaveBeenCalled();
  });
  it.each(["mention_only", "keyword_only", "private_redirect"])(
    "delegates %s without a lexical or private-send branch",
    async mode => {
      mock.settings.mockResolvedValue({ groupMode: mode });
      const p = payload();
      expect(await handleGreenAPIWebhook(p)).toEqual({
        success: true,
        message: "contextual handler",
      });
      expect(mock.group).toHaveBeenCalledExactlyOnceWith(p);
      expect(mock.settings).toHaveBeenCalledWith(2);
    }
  );
  it.each(["extendedTextMessage", "imageMessage", "audioMessage"])(
    "keeps group %s in the group handler",
    async type => {
      mock.settings.mockResolvedValue({ groupMode: "keyword_only" });
      const p = payload();
      p.messageData.typeMessage = type;
      expect((await handleGreenAPIWebhook(p)).success).toBe(true);
      expect(mock.group).toHaveBeenCalledExactlyOnceWith(p);
    }
  );
  it.each([undefined, { id: 1, merchantId: 2, status: "inactive" }])(
    "rejects unavailable group accounts",
    async instance => {
      mock.instance.mockResolvedValue(instance);
      expect(await handleGreenAPIWebhook(payload())).toMatchObject({
        success: false,
        message: "Group account unavailable",
      });
      expect(mock.group).not.toHaveBeenCalled();
    }
  );
  it("preserves a contextual handler failure for queue review", async () => {
    mock.settings.mockResolvedValue({ groupMode: "keyword_only" });
    mock.group.mockResolvedValue({
      success: false,
      message: "review required",
    });
    expect(await handleGreenAPIWebhook(payload())).toEqual({
      success: false,
      message: "review required",
    });
    expect(mock.group).toHaveBeenCalledOnce();
  });
  it("rejects an unknown private account without entering group logic", async () => {
    mock.instance.mockResolvedValue(undefined);
    const p = payload();
    p.senderData.chatId = p.senderData.sender;
    expect(await handleGreenAPIWebhook(p)).toMatchObject({
      success: false,
      message: "No merchant found for this instance",
    });
    expect(mock.group).not.toHaveBeenCalled();
  });
  it("rejects a malformed incoming payload", async () => {
    expect(
      (await handleGreenAPIWebhook({ typeWebhook: "incomingMessageReceived" }))
        .success
    ).toBe(false);
    expect(mock.group).not.toHaveBeenCalled();
  });
});
