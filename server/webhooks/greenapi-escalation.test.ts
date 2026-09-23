import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ instance: vi.fn(), settings: vi.fn(), relay: vi.fn(), notify: vi.fn(), conversations: vi.fn(), send: vi.fn(), ownership: vi.fn() }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(),
  getWhatsAppInstanceByInstanceId: mocks.instance, getBotSettings: mocks.settings, getConversationsByMerchantId: mocks.conversations }));
vi.mock('../ai/smart-escalation', () => ({ handleMerchantEscalationReply: mocks.relay }));
vi.mock('../ai/conversation-handoff', () => ({ transitionConversationOwnership: mocks.ownership }));
vi.mock('../ai/sari-personality', () => ({ chatWithSari: vi.fn() }));
vi.mock('../_core/notificationService', () => ({ notifyNewMessage: mocks.notify }));
vi.mock('../whatsapp', () => ({ sendMessageWithCredentials: mocks.send, sendTextMessage: mocks.send }));
import { handleGreenAPIWebhook } from './greenapi';
const payload = () => ({ typeWebhook: 'outgoingMessageReceived', instanceData: { idInstance: 123 }, idMessage: 'manual-receipt',
  chatId: '966500000082@c.us', messageData: { typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'الموعد الخميس', stanzaId: 'alert-receipt' },
    quotedMessage: { stanzaId: 'alert-receipt', textMessage: 'تنبيه — سؤال عميل ومعلومات خاصة' } } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.instance.mockResolvedValue({ id: 8, merchantId: 12 }); mocks.settings.mockResolvedValue({ takeoverCommandsEnabled: true });
  mocks.notify.mockResolvedValue(undefined); mocks.relay.mockResolvedValue({ handled: true, accepted: true, status: 'accepted' });
});
describe('Green API escalation ingress', () => {
  it.each(['outgoingAPIMessageReceived', 'outgoingAPIMessageWebhook'].flatMap(type => [
    [type, { typeMessage: 'textMessage', textMessageData: { textMessage: '#start' } }],
    [type, { typeMessage: 'imageMessage', fileMessageData: { caption: '#stop' } }],
  ]))('ignores API callbacks before takeover commands: %s %j', async (typeWebhook, messageData) => {
    expect(await handleGreenAPIWebhook({ ...payload(), typeWebhook, messageData })).toMatchObject({ success: true, message: 'System message ignored' });
    expect(mocks.settings).not.toHaveBeenCalled(); expect(mocks.ownership).not.toHaveBeenCalled(); expect(mocks.relay).not.toHaveBeenCalled();
  });
  it('routes the exact receipt and new text without forwarding private quoted context', async () => {
    expect(await handleGreenAPIWebhook(payload())).toMatchObject({ success: true, message: 'Escalation reply accepted' });
    expect(mocks.relay).toHaveBeenCalledWith({ merchantId: 12, instanceRecordId: 8, merchantPhone: '966500000082', quotedMessageId: 'alert-receipt', replyText: 'الموعد الخميس' });
    expect(mocks.notify).toHaveBeenCalledWith(12, 'تم قبول الرد', expect.any(String));
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.conversations).not.toHaveBeenCalled();
  });
  it('requires review for a forged quote instead of falling back to a recent conversation', async () => {
    mocks.relay.mockResolvedValue({ handled: false, accepted: false, status: 'unavailable' });
    expect(await handleGreenAPIWebhook(payload())).toMatchObject({ message: 'Escalation reply needs review' });
    expect(mocks.notify).toHaveBeenCalledWith(12, 'الرد يحتاج مراجعة', expect.any(String));
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.conversations).not.toHaveBeenCalled(); expect(mocks.ownership).not.toHaveBeenCalled();
  });
  it('does not lose the accepted result when the merchant notification fails', async () => {
    mocks.notify.mockRejectedValue(new Error('notification unavailable'));
    expect(await handleGreenAPIWebhook(payload())).toMatchObject({ success: true, message: 'Escalation reply accepted' });
    expect(mocks.relay).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('fails closed after a relay storage error without an unguarded second send', async () => {
    mocks.relay.mockRejectedValue(new Error('fixture database failure'));
    expect(await handleGreenAPIWebhook(payload())).toMatchObject({ success: false });
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.conversations).not.toHaveBeenCalled(); expect(mocks.ownership).not.toHaveBeenCalled();
  });
});
