import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ instance: vi.fn(), settings: vi.fn(), relay: vi.fn(), notify: vi.fn(), conversations: vi.fn(), send: vi.fn(), ownership: vi.fn(),
  update: vi.fn(), message: vi.fn(), messages: vi.fn(), resolve: vi.fn(), correction: vi.fn(), feedback: vi.fn() }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(),
  getWhatsAppInstanceByInstanceId: mocks.instance, getBotSettings: mocks.settings, getConversationsByMerchantId: mocks.conversations,
  updateConversation: mocks.update, createMessage: mocks.message, getMessagesByConversationId: mocks.messages }));
vi.mock('../ai/learning-engine', () => ({ captureMerchantCorrection: mocks.correction }));
vi.mock('../db/learning', () => ({ resolveEscalation: mocks.resolve }));
vi.mock('../ai/openai', () => ({ callGPT4: mocks.feedback }));
vi.mock('../ai/smart-escalation', () => ({ handleMerchantEscalationReply: mocks.relay }));
vi.mock('../ai/conversation-handoff', () => ({ transitionConversationOwnership: mocks.ownership }));
vi.mock('../ai/sari-personality', () => ({ chatWithSari: vi.fn(), clearEscalationHold: vi.fn() }));
vi.mock('../_core/notificationService', () => ({ notifyNewMessage: mocks.notify }));
vi.mock('../whatsapp', () => ({ sendMessageWithCredentials: mocks.send, sendTextMessage: mocks.send }));
import { handleGreenAPIWebhook } from './greenapi';
const payload = () => ({ typeWebhook: 'outgoingMessageReceived', instanceData: { idInstance: 123 }, idMessage: 'manual-receipt',
  chatId: '966500000082@c.us', messageData: { typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'الموعد الخميس', stanzaId: 'alert-receipt' },
    quotedMessage: { stanzaId: 'alert-receipt', textMessage: 'تنبيه — سؤال عميل ومعلومات خاصة' } } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.instance.mockResolvedValue({ id: 8, merchantId: 12 }); mocks.settings.mockResolvedValue({ takeoverCommandsEnabled: true });
  mocks.notify.mockResolvedValue(undefined); mocks.relay.mockResolvedValue({ handled: true, accepted: true, status: 'accepted' });
  mocks.update.mockResolvedValue(undefined); mocks.message.mockResolvedValue(99); mocks.resolve.mockResolvedValue(null);
  mocks.feedback.mockResolvedValue('تمت مراجعة الرد للاطلاع فقط');
  mocks.messages.mockResolvedValue([{ direction: 'incoming', content: 'تفاصيل الطلب' }, { direction: 'outgoing', content: 'رد الموظف الحالي', senderType: 'merchant' }]);
});
describe('Green API escalation ingress', () => {
  it.each(['شكرًا، تم إرسال التفاصيل', 'تم تجهيز الطلب', 'تصحيح: راجع الشروط قبل التأكيد'])(
    'records manual ownership and the actual author without inventing a correction: %s', async text => {
      mocks.settings.mockResolvedValue({ takeoverCommandsEnabled: false });
      mocks.conversations.mockResolvedValue([{ id: 9, customerPhone: '966500000082' }]);
      const request = { ...payload(), messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } } };
      expect(await handleGreenAPIWebhook(request)).toMatchObject({ success: true });
      expect(mocks.update).toHaveBeenCalledWith(9, expect.objectContaining({ humanTakeover: 1, humanExpiresAt: expect.any(Date) }));
      expect(mocks.message).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 9, senderType: 'merchant', direction: 'outgoing', content: text }));
      expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 12, conversationId: 9, merchantAnswer: text }));
      expect(mocks.correction).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
    });
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
