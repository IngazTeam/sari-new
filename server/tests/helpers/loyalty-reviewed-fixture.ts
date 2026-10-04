import { randomUUID } from 'node:crypto';
import type { loyaltyRouter } from '../../routers-loyalty';
import { loyaltyDefaults, loyaltyPhone } from '../../../shared/loyalty-input';
type Caller = ReturnType<typeof loyaltyRouter.createCaller>;
/** Test-only convenience: obtain a real snapshot, then call the production reviewed endpoint.
 * Direct ledger/concurrent worker tests call the domain transaction explicitly instead.
 */
export function reviewedLoyaltyFixture(caller: Caller, fallbackPhone: string) {
  const base = () => ({ reviewed: true as const, requestId: randomUUID() });
  const read = (customerPhone = fallbackPhone) =>
    caller.workspace({
      view: 'customers',
      customerPhone: loyaltyPhone.safeParse(customerPhone).success
        ? customerPhone
        : fallbackPhone,
    });
  const tierDefault = {
    name: 'Tier',
    nameAr: 'مستوى',
    minPoints: 0,
    discountPercentage: 0,
    freeShipping: 0,
    priority: 0,
    color: '#000000',
    icon: '★',
    benefits: null,
  };
  const rewardDefault = {
    title: 'Reward',
    titleAr: 'مكافأة',
    type: 'gift' as const,
    pointsCost: 1,
    isActive: 1,
  };
  return {
    async addPoints(input: any) {
      const d = await read(input.customerPhone);
      return caller.reviewedAction({
        ...base(),
        kind: 'points',
        mode: 'credit',
        customerPhone: input.customerPhone,
        points: input.points,
        reason: input.reason,
        reasonAr: input.reasonAr,
        expectedVersion: d.customerRevision,
      });
    },
    async deductPoints(input: any) {
      const d = await read(input.customerPhone);
      return caller.reviewedAction({
        ...base(),
        kind: 'points',
        mode: 'debit',
        customerPhone: input.customerPhone,
        points: input.points,
        reason: input.reason,
        reasonAr: input.reasonAr,
        expectedVersion: d.customerRevision,
      });
    },
    async updateSettings(input: any) {
      const d = await read();
      return caller.reviewedAction({
        ...base(),
        kind: 'settings',
        expectedVersion: d.settingsRevision,
        values: { ...loyaltyDefaults, ...d.settings, ...input },
      });
    },
    async updateTier(input: any) {
      const d = await read(),
        row = d.tiers.find(t => t.id === input.id);
      return caller.reviewedAction({
        ...base(),
        kind: 'tier',
        id: input.id,
        expectedVersion: row?.revision || '0'.repeat(64),
        values: { ...tierDefault, ...row, ...input },
      });
    },
    async createReward(input: any) {
      const result = await caller.reviewedAction({
        ...base(),
        kind: 'createReward',
        values: input,
      });
      return { insertId: result.targetId };
    },
    async updateReward(input: any) {
      const d = await read(),
        row = d.rewards.find(r => r.id === input.id);
      return caller.reviewedAction({
        ...base(),
        kind: 'reward',
        id: input.id,
        expectedVersion: row?.revision || '0'.repeat(64),
        values: { ...rewardDefault, ...row, ...input },
      });
    },
    async deleteReward(input: any) {
      const d = await read(),
        row = d.rewards.find(r => r.id === input.id);
      return caller.reviewedAction({
        ...base(),
        kind: 'deleteReward',
        id: input.id,
        expectedVersion: row?.revision || '0'.repeat(64),
      });
    },
    async redeemReward(input: any) {
      const d = await read(input.customerPhone),
        row = d.rewards.find(r => r.id === input.rewardId);
      return caller.reviewedAction({
        ...base(),
        kind: 'redeem',
        id: input.rewardId,
        customerPhone: input.customerPhone,
        expectedVersion: row?.redemptionRevision || '0'.repeat(64),
      });
    },
    async updateRedemption(input: any) {
      const d = await read(),
        row = d.redemptions.find(r => r.id === input.id);
      return caller.reviewedAction({
        ...base(),
        kind: 'redemption',
        id: input.id,
        expectedVersion: row?.revision || '0'.repeat(64),
        status: input.status || row?.status || 'approved',
        notes: input.notes ?? row?.notes ?? '',
        orderId: input.orderId ?? row?.orderId ?? null,
      });
    },
  };
}
