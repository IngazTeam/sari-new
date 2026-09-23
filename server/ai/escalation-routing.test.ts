import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ relay: vi.fn(), send: vi.fn(), conversations: vi.fn(), ai: vi.fn() }));
vi.mock('./escalation-relay', () => ({ relayEscalationReply: mocks.relay }));
vi.mock('../whatsapp', () => ({ sendMessageWithCredentials: mocks.send }));
vi.mock('../db/learning', () => ({ getActiveEscalationForMerchant: async () => ({ id: 99 }) }));
vi.mock('../db', () => ({ getConversationsByMerchantId: mocks.conversations }));
vi.mock('./openai', () => ({ callGPT4: mocks.ai }));
import { handleMerchantChat } from './merchant-mode';
const input = () => ({ merchantId: 1, merchantPhone: '966500000082', message: 'الموعد مساء الخميس', quotedText: 'تنبيه — سؤال عميل',
  quotedMessageId: 'alert-receipt', instanceRecordId: 8, instanceId: 'fixture', token: 'fixture', apiUrl: 'http://127.0.0.1' });
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ success: true }); });
describe('merchant escalation reply routing', () => {
  it('forwards only the bound quote and the employee text and confirms provider acceptance', async () => {
    mocks.relay.mockResolvedValue({ handled: true, accepted: true, status: 'accepted' });
    expect(await handleMerchantChat(input())).toEqual({ action: 'escalation_reply_accepted' });
    expect(mocks.relay).toHaveBeenCalledWith({ merchantId: 1, merchantPhone: '966500000082', instanceRecordId: 8, quotedMessageId: 'alert-receipt', replyText: 'الموعد مساء الخميس' });
    expect(mocks.send.mock.calls[0][4]).toContain('قُبل ردك'); expect(mocks.ai).not.toHaveBeenCalled();
  });
  it('does not claim success or suggest automatic resend for an uncertain outcome', async () => {
    mocks.relay.mockResolvedValue({ handled: true, accepted: false, status: 'unknown' });
    expect(await handleMerchantChat(input())).toEqual({ action: 'escalation_reply_review_required' });
    expect(mocks.send.mock.calls[0][4]).toContain('تعذر حسم'); expect(mocks.send.mock.calls[0][4]).not.toContain('قُبل ردك');
  });
  it('strips an explicit reply command without guessing its customer', async () => {
    mocks.relay.mockResolvedValue({ handled: true, accepted: true, status: 'accepted' });
    await handleMerchantChat({ ...input(), message: 'قول للعميل الموعد مساء الخميس' });
    expect(mocks.relay.mock.calls[0][0].replyText).toBe('الموعد مساء الخميس'); expect(mocks.conversations).not.toHaveBeenCalled();
  });
  it.each(['قول للعميل الموعد متاح', 'موافق', '1'])('requires a reference for an ambiguous command: %s', async message => {
    mocks.relay.mockResolvedValue({ handled: false, accepted: false, status: 'unavailable' });
    await handleMerchantChat({ ...input(), message, quotedText: '', quotedMessageId: undefined });
    expect(mocks.conversations).not.toHaveBeenCalled(); expect(mocks.send.mock.calls[0][4]).toContain('الرد بالاقتباس');
  });
});
