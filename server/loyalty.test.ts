import { beforeEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  settings: vi.fn(),
  add: vi.fn(),
  send: vi.fn(),
}));
vi.mock('./db_loyalty', () => ({
  getLoyaltySettings: m.settings,
  addPointsToCustomer: m.add,
}));
vi.mock('./whatsapp', () => ({ sendTextMessage: m.send }));
import {
  calculatePointsFromOrder,
  awardPointsForOrder,
} from './loyalty-integration';
import { rewardAvailable } from './loyalty/sales-evidence';
import {
  loyaltySettingsInput,
  loyaltyDefaults,
  validLoyaltyReward,
} from '../shared/loyalty-input';
beforeEach(() => {
  vi.clearAllMocks();
  m.settings.mockResolvedValue({
    ...loyaltyDefaults,
    isEnabled: 1,
    pointsPerCurrency: 2,
  });
});
describe('Loyalty calculation and sales evidence', () => {
  it('calculates whole points without increasing fractional earnings', async () => {
    expect(await calculatePointsFromOrder(7, 10.75)).toBe(21);
  });
  it.each([-1, NaN, Infinity, 100000000])(
    'refuses unsafe order amount %s',
    async amount => {
      expect(await calculatePointsFromOrder(7, amount)).toBe(0);
    }
  );
  it('has no points promise when settings are absent or disabled', async () => {
    m.settings
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...loyaltyDefaults });
    expect(await calculatePointsFromOrder(7, 10)).toBe(0);
    expect(await calculatePointsFromOrder(7, 10)).toBe(0);
  });
  it('returns the actual balance and suppresses duplicate order notifications', async () => {
    m.add
      .mockResolvedValueOnce({
        newBalance: 250,
        newTier: null,
        tierUpgraded: false,
        alreadyApplied: false,
      })
      .mockResolvedValueOnce({
        newBalance: 250,
        newTier: null,
        tierUpgraded: false,
        alreadyApplied: true,
      });
    const params = {
      merchantId: 7,
      customerPhone: '966500000007',
      orderId: 9,
      orderTotal: 10,
    };
    expect(await awardPointsForOrder(params)).toMatchObject({
      points: 20,
      newBalance: 250,
    });
    expect(await awardPointsForOrder(params)).toBeNull();
    expect(m.send).not.toHaveBeenCalled();
  });
  const sample = {
    isActive: 1,
    pointsCost: 50,
    maxRedemptions: null,
    currentRedemptions: 0,
    validFrom: null,
    validUntil: null,
  };
  it.each([
    { isActive: 0 },
    { pointsCost: -5 },
    { pointsCost: 0.5 },
    { currentRedemptions: -1 },
    { maxRedemptions: 1, currentRedemptions: 1 },
    { validFrom: '2030-01-01 00:00:00' },
    { validUntil: '2025-01-01 00:00:00' },
    { validUntil: 'invalid' },
  ])('excludes unavailable reward %j', input => {
    expect(rewardAvailable({ ...sample, ...input }, Date.UTC(2026, 9, 4))).toBe(
      false
    );
  });
  it('handles UTC database dates and the exact expiry boundary', () => {
    const until = '2026-10-04 12:00:00';
    expect(
      rewardAvailable(
        { ...sample, validUntil: until },
        Date.UTC(2026, 9, 4, 11, 59)
      )
    ).toBe(true);
    expect(
      rewardAvailable(
        { ...sample, validUntil: until },
        Date.UTC(2026, 9, 4, 12)
      )
    ).toBe(false);
  });
  it('preserves zero-valued settings and validates conditional reward fields', () => {
    expect(
      loyaltySettingsInput.parse({
        ...loyaltyDefaults,
        pointsExpiryDays: 0,
        referralBonusPoints: 0,
      })
    ).toMatchObject({ pointsExpiryDays: 0, referralBonusPoints: 0 });
    expect(() =>
      validLoyaltyReward({
        title: 'A',
        titleAr: 'أ',
        type: 'discount',
        pointsCost: 1,
        discountAmount: 101,
        discountType: 'percentage',
      })
    ).toThrow();
    expect(() =>
      validLoyaltyReward({
        title: 'A',
        titleAr: 'أ',
        type: 'free_product',
        pointsCost: 1,
      })
    ).toThrow();
  });
});
