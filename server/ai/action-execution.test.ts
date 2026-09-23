import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ products: vi.fn(), orders: vi.fn(), followup: vi.fn() }));
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
vi.mock('../db', () => ({ getProductsByMerchantId: mocks.products, getOrdersByCustomerPhone: mocks.orders }));
vi.mock('./proactive-followup', () => ({ scheduleFollowUp: mocks.followup }));
import { executeAction } from './action-selector';
import { withInboundExecution, type InboundExecution } from '../messaging/inbound-context';
const context = (): InboundExecution => ({ id: 1, merchantId: 7, instanceId: 1, token: 'fixture',
  eventKey: 'event', partitionKey: 'conversation', sendOrdinal: 0, assertOwned: vi.fn().mockResolvedValue(undefined) });
const request = () => ({ merchantId: 7, conversationId: 8, customerPhone: '966500000009', sendMessage: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => { vi.clearAllMocks(); });

// Order-effect tests now run against real SQL in checkout-agreements.mysql.test.ts,
// including exact amounts, choices, stock, consent, concurrent INSERT and replay.
describe('supplementary actions cannot bypass checkout agreements', () => {
  it('does not execute a legacy model-supplied order action', async () => {
    const input = request();
    await executeAction({ ...input, action: { type: 'confirm_order', items: ['منتج'] } as any });
    expect(mocks.products).not.toHaveBeenCalled(); expect(input.sendMessage).not.toHaveBeenCalled();
  });
  it('propagates failed scheduling instead of marking inbound processing successful', async () => {
    const ctx = context(); mocks.followup.mockRejectedValue(new Error('schedule unavailable'));
    await expect(withInboundExecution(ctx, () => executeAction({ ...request(),
      action: { type: 'schedule_followup', delayHours: 2, reason: 'fixture' },
    }))).rejects.toThrow('schedule unavailable');
    expect(ctx.uncertainEffect).toBe(true);
  });
  it('does not begin an action after worker ownership has expired', async () => {
    const ctx = context(); vi.mocked(ctx.assertOwned).mockRejectedValue(new Error('lease lost'));
    await expect(withInboundExecution(ctx, () => executeAction({ ...request(),
      action: { type: 'send_catalog', category: 'all' },
    }))).rejects.toThrow('lease lost');
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it('does not call catalog ordering popularity evidence', async () => {
    mocks.products.mockResolvedValue([{ id: 4, name: 'منتج', price: 9999, priceUnit: 'minor', currency: 'SAR', isActive: 1, trackInventory: 0 }]);
    const input = request(); await executeAction({ ...input, action: { type: 'send_catalog', category: 'all' } });
    expect(input.sendMessage.mock.calls[0][1]).toContain('من منتجاتنا');
    expect(input.sendMessage.mock.calls[0][1]).not.toContain('الأكثر طلباً');
  });
  it('does not report an order status when reading canonical orders fails', async () => {
    mocks.orders.mockRejectedValue(new Error('status unavailable')); const input = request();
    await expect(executeAction({ ...input, action: { type: 'check_order_status' } })).rejects.toThrow('status unavailable');
    expect(input.sendMessage).not.toHaveBeenCalled();
  });
});
