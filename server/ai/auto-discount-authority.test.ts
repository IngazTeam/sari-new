import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ settings: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock('../db', () => ({
  getBotSettings: calls.settings,
  getDiscountCodesByMerchantId: calls.list,
  createDiscountCode: calls.create,
}));
import { generateAutoDiscount } from './auto-discount';
let seq = 0;
const request = () => ({
  merchantId: 7,
  customerPhone: '966550' + String(++seq).padStart(6, '0'),
  customerMessage: 'ممكن خصم؟',
});
beforeEach(() => {
  vi.clearAllMocks();
  calls.settings.mockResolvedValue({
    autoDiscountEnabled: 1,
    autoDiscountMaxPercent: 3,
    autoDiscountExpireHours: 24,
  });
  calls.list.mockResolvedValue([]);
  calls.create.mockResolvedValue({ id: 1 });
});
describe('merchant authority over automatic offers', () => {
  it('does not silently raise an authorized ceiling below 5 percent', async () => {
    const result = await generateAutoDiscount(request());
    expect(result?.value).toBe(3);
    expect(calls.create.mock.calls[0][0].value).toBe(3);
  });
  it('supports an explicit English coupon request within the same merchant ceiling', async () => {
    expect((await generateAutoDiscount({ ...request(), customerMessage: 'Any coupon code?' }))?.value).toBe(
      3,
    );
  });
  it.each([0, -1, 51, 1.5, NaN, '10'])('does not manufacture a default from invalid max %s', async (max) => {
    calls.settings.mockResolvedValue({
      autoDiscountEnabled: 1,
      autoDiscountMaxPercent: max,
      autoDiscountExpireHours: 24,
    });
    expect(await generateAutoDiscount(request())).toBeNull();
    expect(calls.create).not.toHaveBeenCalled();
  });
  it.each([0, -1, 169, 1.5, NaN, '24'])('rejects invalid expiration %s', async (hours) => {
    calls.settings.mockResolvedValue({
      autoDiscountEnabled: 1,
      autoDiscountMaxPercent: 10,
      autoDiscountExpireHours: hours,
    });
    expect(await generateAutoDiscount(request())).toBeNull();
    expect(calls.create).not.toHaveBeenCalled();
  });
  it.each(['غالي', 'لا أريد الشراء ولو بخصم', 'بدون خصم'])(
    'does not grant an incentive because of %s',
    async (customerMessage) => {
      expect(await generateAutoDiscount({ ...request(), customerMessage })).toBeNull();
      expect(calls.settings).not.toHaveBeenCalled();
      expect(calls.create).not.toHaveBeenCalled();
    },
  );
  it('respects disabled merchant policy', async () => {
    calls.settings.mockResolvedValue({ autoDiscountEnabled: 0 });
    expect(await generateAutoDiscount(request())).toBeNull();
    expect(calls.create).not.toHaveBeenCalled();
  });
  it.each(['group_966550000001', '966550000001@g.us', 'invalid'])(
    'does not create private offers for invalid recipient %s',
    async (customerPhone) => {
      expect(await generateAutoDiscount({ ...request(), customerPhone })).toBeNull();
      expect(calls.create).not.toHaveBeenCalled();
    },
  );
});
