import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), handle: vi.fn(), status: vi.fn() }));
vi.mock('./inbound-jobs', () => ({ enqueueInbound: mocks.enqueue }));
vi.mock('../webhooks/greenapi', () => ({ handleGreenAPIWebhook: mocks.handle }));
vi.mock('../channels/whatsapp/service', () => ({ updateWhatsAppDeliveryStatus: mocks.status }));
import { acceptWhatsAppEvent } from './ingress';

describe('unified WhatsApp ingress', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.enqueue.mockResolvedValue({ id: 1, duplicate: false }); mocks.handle.mockResolvedValue({ success: true }); });
  it.each(['webhook', 'polling', 'meta'] as const)('%s persists before success and never runs the AI inline', async source => {
    const payload = { typeWebhook: 'incomingMessageReceived', idMessage: 'fixture' };
    let release!: () => void;
    mocks.enqueue.mockImplementation(() => new Promise(resolve => { release = () => resolve({ id: 1, duplicate: false }); }));
    let accepted = false;
    const pending = acceptWhatsAppEvent(payload, source, 19).then(result => { accepted = true; return result; });
    await Promise.resolve();
    expect(accepted).toBe(false); expect(mocks.handle).not.toHaveBeenCalled();
    release(); await expect(pending).resolves.toMatchObject({ success: true });
    expect(mocks.enqueue).toHaveBeenCalledWith({ payload, source, expectedMerchantId: 19 });
  });
  it('never acknowledges a failed persistence operation', async () => {
    mocks.enqueue.mockRejectedValue(new Error('Database unavailable'));
    await expect(acceptWhatsAppEvent({ typeWebhook: 'incomingMessageReceived' }, 'webhook')).rejects.toThrow('Database unavailable');
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it('acknowledges a durable duplicate without a second processor invocation', async () => {
    mocks.enqueue.mockResolvedValue({ id: 1, duplicate: true });
    expect(await acceptWhatsAppEvent({ typeWebhook: 'incomingMessageReceived' }, 'polling')).toMatchObject({ success: true, message: 'Message already queued' });
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it('applies manual takeover immediately rather than waiting behind an AI reply', async () => {
    const payload = { typeWebhook: 'outgoingMessageReceived' };
    await acceptWhatsAppEvent(payload, 'webhook');
    expect(mocks.handle).toHaveBeenCalledWith(payload); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('projects provider status without invoking a conversation handler', async () => {
    await acceptWhatsAppEvent({ typeWebhook: 'outgoingMessageStatus', instanceData: { idInstance: 'account' }, idMessage: 'receipt', status: 'read' }, 'polling');
    expect(mocks.status).toHaveBeenCalledWith({ provider: 'green_api', providerAccount: 'account', providerMessageId: 'receipt', status: 'read' });
    expect(mocks.handle).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
