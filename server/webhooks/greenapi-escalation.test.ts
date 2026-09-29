import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ instance: vi.fn(), settings: vi.fn(), relay: vi.fn(), notify: vi.fn(), conversations: vi.fn(), send: vi.fn(), ownership: vi.fn(),
  update: vi.fn(), message: vi.fn(), messages: vi.fn(), resolve: vi.fn(), correction: vi.fn(), feedback: vi.fn(), command: vi.fn() }));
vi.mock('../ai/whatsapp-ownership-command', async original => ({ ...await original<typeof import('../ai/whatsapp-ownership-command')>(), applyWhatsAppOwnershipCommand: mocks.command }));
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
  mocks.command.mockReset().mockResolvedValue({ changed: true, duplicate: false, action: 'resume', conversationId: 9, version: 2 });
  mocks.conversations.mockResolvedValue([{ id: 9, customerPhone: '966500000082' }]);
  mocks.messages.mockResolvedValue([{ direction: 'incoming', content: 'تفاصيل الطلب' }, { direction: 'outgoing', content: 'رد الموظف الحالي', senderType: 'merchant' }]);
});
describe('Green API escalation ingress', () => {
  const direct = (text: string) => ({ ...payload(), messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } } });
  it.each(['يسعدنا خدمتكم', 'لا تكتب يسعدنا خدمتكم الآن', 'سأتولى المحادثة لاحقًا', 'لن أقول ساتولى المحادثة',
    'Glad to help with the next step', "I will take over later", "Don't say I'll take over", '#start بعد المراجعة',
    'لا تستخدم #stop', '⚠️ *تنبيه من ساري:* راجع الشروط', '⚠️ *تنبيه:* راجع الشروط'])(
    'keeps ordinary prose as an authored manual reply, without executing a control: %s', async text => {
      expect(await handleGreenAPIWebhook(direct(text))).toMatchObject({ success: true, message: 'Human takeover activated' });
      expect(mocks.command).not.toHaveBeenCalled(); expect(mocks.ownership).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith(9, expect.objectContaining({ humanExpiresAt: expect.any(Date) }));
      expect(mocks.message).toHaveBeenCalledWith(expect.objectContaining({ content: text, senderType: 'merchant' }));
      expect(mocks.correction).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
    });
  it.each(['#stop', ' #STOP ', '#start', '\n#START\n'])('dispatches only a standalone control with its source receipt: %s', async text => {
    expect(await handleGreenAPIWebhook(direct(text))).toMatchObject({ success: true });
    expect(mocks.command).toHaveBeenCalledWith({ merchantId: 12, instanceRecordId: 8, customerPhone: '966500000082', messageId: 'manual-receipt', text });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.message).not.toHaveBeenCalled();
    expect(mocks.feedback).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    { quotedMessage: {} }, { quotedMessage: null },
    { extendedTextMessageData: { text: '#start', stanzaId: '' } },
    { extendedTextMessageData: { text: '#start', stanzaId: 'invalid quote' } },
    { extendedTextMessageData: { text: '#start', quotedMessage: {} } },
    { typeMessage: 'imageMessage', fileMessageData: { caption: '#start' } },
    { typeMessage: 'quotedMessage' },
  ])('does not execute a command from quote structures or media: %j', async extra => {
    const request = direct('#start'); request.messageData = { ...request.messageData, ...extra } as any;
    await handleGreenAPIWebhook(request);
    expect(mocks.command).not.toHaveBeenCalled(); expect(mocks.ownership).not.toHaveBeenCalled();
  });
  it('keeps disabled controls in the ordinary manual workflow', async () => {
    mocks.settings.mockResolvedValue({ takeoverCommandsEnabled: false });
    await handleGreenAPIWebhook(direct('#start'));
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.message).toHaveBeenCalledWith(expect.objectContaining({ content: '#start' }));
  });
  it('reports a duplicate without claiming that the current ownership changed', async () => {
    mocks.command.mockResolvedValue({ changed: false, duplicate: true, action: 'resume' });
    expect(await handleGreenAPIWebhook(direct('#start'))).toMatchObject({ success: true, message: 'Ownership command already observed' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reports unchanged ownership without claiming a new resume', async () => {
    mocks.command.mockResolvedValue({ changed: false, duplicate: false, action: 'resume' });
    expect(await handleGreenAPIWebhook(direct('#start'))).toMatchObject({ success: true, message: 'Ownership unchanged' });
  });
  it.each(['Command conversation unavailable', 'Command receipt conflict', 'fixture storage failure'])(
    'does not fall back to a second ownership write after command failure: %s', async reason => {
      mocks.command.mockRejectedValue(new Error(reason));
      expect(await handleGreenAPIWebhook(direct('#start'))).toMatchObject({ success: false });
      expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.message).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
    });
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
    expect(mocks.command).not.toHaveBeenCalled();
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
