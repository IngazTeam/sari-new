import {
  loyaltyActionInput,
  loyaltyWorkspaceSchema,
  loyaltyWorkspaceSelection,
  type LoyaltyAction,
  type LoyaltyReceipt,
} from '../../../shared/loyalty-workspace';
import {
  loyaltyDefaults,
  rewardAvailable,
  validLoyaltyReward,
} from '../../../shared/loyalty-input';
const stamp = (n: number) => n.toString(16).padStart(64, '0');
const fault = (code = 'CONFLICT', message = 'Local loyalty simulation') => ({
  data: { code },
  message,
});
const date = '2026-10-04T10:00:00.000Z';
/** In-memory merchant sample only. No external writes, points, notices, or real redemptions. */
export class LoyaltyPreviewStore {
  private defaultTiers: any[] = [];
  private revision = 1;
  private next = 100;
  private settings: any = { ...loyaltyDefaults, isEnabled: 1 };
  private tiers: any[] = [];
  private customers: any[] = [];
  private rewards: any[] = [];
  private transactions: any[] = [];
  private redemptions: any[] = [];
  private receipts = new Map<string, { digest: string; value: any }>();
  writes = 0;
  constructor(
    private actorId: number,
    private merchantId: number,
    private mode: () => string
  ) {
    this.tiers = [
      {
        id: 1,
        name: 'Bronze',
        nameAr: 'برونزي',
        minPoints: 0,
        discountPercentage: 5,
        freeShipping: 0,
        priority: 1,
        color: '#A96F45',
        icon: '🥉',
        benefits: null,
      },
      {
        id: 2,
        name: 'Silver',
        nameAr: 'فضي',
        minPoints: 500,
        discountPercentage: 10,
        freeShipping: 1,
        priority: 2,
        color: '#687C80',
        icon: '🥈',
        benefits: null,
      },
      {
        id: 3,
        name: 'Gold',
        nameAr: 'ذهبي',
        minPoints: 1500,
        discountPercentage: 15,
        freeShipping: 1,
        priority: 3,
        color: '#9C791D',
        icon: '🥇',
        benefits: null,
      },
    ];
    this.customers = Array.from({ length: 28 }, (_, i) => ({
      id: i + 1,
      customerName:
        i === 0
          ? 'نورة · Noura'
          : i === 1
            ? 'محمد · Mohammed'
            : 'عميل تجريبي · Sample ' + (i + 1),
      customerPhone: '9665' + String(i + 10000000),
      totalPoints: 500 - i * 10,
      lifetimePoints: 750 + i * 40,
      lastPointsEarnedAt: date,
      lastPointsRedeemedAt: null,
    }));
    this.rewards = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      title:
        i === 0
          ? 'A small thank-you'
          : i === 1
            ? 'A 10% discount'
            : 'Seasonal gift ' + (i + 1),
      titleAr:
        i === 0
          ? 'هدية شكر صغيرة'
          : i === 1
            ? 'خصم 10%'
            : 'هدية موسمية ' + (i + 1),
      type: i === 1 ? 'discount' : 'gift',
      pointsCost: i === 0 ? 100 : 200 + i * 10,
      discountAmount: i === 1 ? 10 : null,
      discountType: i === 1 ? 'percentage' : null,
      productId: null,
      maxRedemptions: i === 0 ? 20 : 0,
      currentRedemptions: 0,
      isActive: 1,
      description: 'A local sample reward for review.',
      descriptionAr: 'مكافأة توضيحية للمراجعة والتجربة.',
      validFrom: null,
      validUntil: null,
      imageUrl: null,
      termsAndConditions: null,
      termsAndConditionsAr: null,
    }));
    this.defaultTiers = this.tiers.map(t => ({ ...t }));
    this.transactions = [
      {
        id: 1,
        customerPhone: this.customers[0].customerPhone,
        type: 'earn',
        points: 500,
        reason: 'A sample credit',
        reasonAr: 'إضافة توضيحية',
        balanceBefore: 0,
        balanceAfter: 500,
        orderId: null,
        rewardId: null,
        redemptionId: null,
        expiresAt: null,
        createdAt: date,
      },
    ];
    if (this.mode() === 'empty') {
      this.settings = null;
      this.tiers = [];
      this.customers = [];
      this.rewards = [];
      this.transactions = [];
    }
  }
  read(name: string, input: any) {
    if (name === 'loyalty.receipt')
      return this.receipts.get(input.requestId)?.value ?? null;
    const selection = loyaltyWorkspaceSelection.parse(input),
      empty = this.mode() === 'empty' && this.writes === 0,
      revision = stamp(this.revision),
      settings = empty ? null : this.settings,
      tiers = empty
        ? []
        : this.tiers.map(t => ({
            ...t,
            revision,
            createdAt: date,
            updatedAt: date,
          }));
    const customers = empty
        ? []
        : this.customers.map(c => ({
            ...c,
            tierId:
              [...tiers].reverse().find(t => c.lifetimePoints >= t.minPoints)
                ?.id ?? null,
            revision,
          })),
      customer =
        customers.find(c => c.customerPhone === selection.customerPhone) ??
        null;
    const rewards = empty
      ? []
      : this.rewards.map(r => ({
          ...r,
          revision,
          available: settings?.isEnabled === 1 && rewardAvailable(r),
          redemptionRevision: customer ? revision : null,
          createdAt: date,
          updatedAt: date,
        }));
    const term = selection.search.toLocaleLowerCase(),
      filteredCustomers = customers.filter(c =>
        (c.customerName + ' ' + c.customerPhone)
          .toLocaleLowerCase()
          .includes(term)
      ),
      filteredRewards = rewards.filter(r =>
        (r.title + ' ' + r.titleAr).toLocaleLowerCase().includes(term)
      );
    const transactions = this.transactions
        .filter(t => t.customerPhone === selection.customerPhone)
        .map(({ customerPhone, ...t }) => t)
        .reverse(),
      redemptions = this.redemptions
        .filter(r => r.customerPhone === selection.customerPhone)
        .map(({ customerPhone, ...r }) => ({ ...r, revision }))
        .reverse();
    const products = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        name: 'Sample product ' + (i + 1),
        nameAr: 'منتج تجريبي ' + (i + 1),
        sku: 'LOCAL-' + (i + 1),
        isActive: 1,
      })),
      productTerm = selection.productSearch.toLowerCase(),
      matches = products.filter(p =>
        (p.name + p.nameAr + p.sku).toLowerCase().includes(productTerm)
      );
    return loyaltyWorkspaceSchema.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      selection,
      products: matches.slice(0, 25),
      selectedProduct: products.find(p => p.id === selection.productId) ?? null,
      hasMoreProducts: matches.length > 25,
      settings,
      settingsRevision: revision,
      tiers,
      customers: filteredCustomers.slice(
        selection.offset,
        selection.offset + 25
      ),
      rewards: filteredRewards.slice(selection.offset, selection.offset + 25),
      total:
        selection.view === 'customers'
          ? filteredCustomers.length
          : filteredRewards.length,
      hasMore:
        (selection.view === 'customers' ? filteredCustomers : filteredRewards)
          .length >
        selection.offset + 25,
      hasMoreRewards: filteredRewards.length > selection.offset + 25,
      stats: {
        totalCustomers: customers.length,
        totalPointsDistributed: customers.reduce(
          (n, c) => n + c.lifetimePoints,
          0
        ),
        totalPointsRedeemed: this.transactions
          .filter(t => t.points < 0)
          .reduce((n, t) => n - t.points, 0),
        totalRedemptions: this.redemptions.length,
      },
      customer,
      customerRevision: revision,
      transactions: transactions.slice(
        selection.historyOffset,
        selection.historyOffset + 25
      ),
      redemptions: redemptions.slice(
        selection.historyOffset,
        selection.historyOffset + 25
      ),
      hasMoreTransactions: transactions.length > selection.historyOffset + 25,
      hasMoreRedemptions: redemptions.length > selection.historyOffset + 25,
    });
  }
  mutate(name: string, input: any) {
    if (name === 'loyalty.closeRequest') {
      if (input.reviewed !== true) throw fault('BAD_REQUEST');
      const previous = this.receipts.get(input.requestId);
      if (previous) return previous.value;
      const value = {
        closed: true,
        actorId: this.actorId,
        merchantId: this.merchantId,
        requestId: input.requestId,
      };
      this.receipts.set(input.requestId, { digest: 'closed', value });
      return value;
    }
    const i = loyaltyActionInput.parse(input),
      digest = JSON.stringify(i),
      prior = this.receipts.get(i.requestId);
    if (prior) {
      if (prior.digest !== digest) throw fault();
      return prior.value;
    }
    if ('expectedVersion' in i && i.expectedVersion !== stamp(this.revision))
      throw fault();
    let targetId: number | null = 'id' in i ? i.id : null,
      newBalance: number | null = null;
    if (i.kind === 'settings') {
      this.settings = i.values;
      if (!this.tiers.length)
        this.tiers = this.defaultTiers.map(t => ({ ...t }));
    } else if (i.kind === 'tier') {
      const row = this.tiers.find(t => t.id === i.id);
      if (!row) throw fault('NOT_FOUND');
      Object.assign(row, i.values);
    } else if (i.kind === 'createReward') {
      validLoyaltyReward(i.values);
      targetId = this.next++;
      this.rewards.push({
        ...i.values,
        id: targetId,
        currentRedemptions: 0,
        description: i.values.description ?? null,
        descriptionAr: i.values.descriptionAr ?? null,
        discountAmount: i.values.discountAmount ?? null,
        discountType: i.values.discountType ?? null,
        productId: i.values.productId ?? null,
        maxRedemptions: i.values.maxRedemptions ?? null,
        validFrom: i.values.validFrom ?? null,
        validUntil: i.values.validUntil ?? null,
        imageUrl: i.values.imageUrl ?? null,
        termsAndConditions: i.values.termsAndConditions ?? null,
        termsAndConditionsAr: i.values.termsAndConditionsAr ?? null,
      });
    } else if (i.kind === 'reward') {
      validLoyaltyReward(i.values);
      const row = this.rewards.find(r => r.id === i.id);
      if (!row) throw fault('NOT_FOUND');
      Object.assign(row, i.values);
    } else if (i.kind === 'deleteReward') {
      if (this.redemptions.some(r => r.rewardId === i.id))
        throw fault('PRECONDITION_FAILED', 'loyalty:reward_has_history');
      this.rewards = this.rewards.filter(r => r.id !== i.id);
    } else if (i.kind === 'points' || i.kind === 'redeem') {
      let customer = this.customers.find(
          c => c.customerPhone === i.customerPhone
        ),
        cost = 0,
        redemptionId: number | null = null,
        rewardId: number | null = null,
        reason = '',
        reasonAr = '';
      if (i.kind === 'redeem') {
        const reward = this.rewards.find(r => r.id === i.id);
        if (
          !reward ||
          !rewardAvailable(reward) ||
          this.settings?.isEnabled !== 1
        )
          throw fault('PRECONDITION_FAILED');
        cost = -reward.pointsCost;
        rewardId = reward.id;
        reason = 'Redeemed: ' + reward.title;
        reasonAr = 'استبدال: ' + reward.titleAr;
      } else {
        cost = i.mode === 'credit' ? i.points : -i.points;
        reason = i.reason;
        reasonAr = i.reasonAr;
      }
      if (!customer) {
        if (cost < 0) throw fault('PRECONDITION_FAILED');
        customer = {
          id: this.next++,
          customerName: null,
          customerPhone: i.customerPhone,
          totalPoints: 0,
          lifetimePoints: 0,
          lastPointsEarnedAt: null,
          lastPointsRedeemedAt: null,
        };
        this.customers.push(customer);
      }
      const before = customer.totalPoints;
      const after = Number(before) + cost;
      if (after < 0) throw fault('PRECONDITION_FAILED');
      newBalance = after;
      customer.totalPoints = newBalance;
      if (cost > 0) {
        customer.lifetimePoints += cost;
        customer.lastPointsEarnedAt = date;
      } else customer.lastPointsRedeemedAt = date;
      targetId = customer.id;
      if (i.kind === 'redeem') {
        redemptionId = this.next++;
        targetId = redemptionId;
        this.rewards.find(r => r.id === i.id).currentRedemptions++;
        this.redemptions.push({
          id: redemptionId,
          customerPhone: i.customerPhone,
          rewardId,
          pointsSpent: -cost,
          status: 'approved',
          orderId: null,
          usedAt: null,
          expiresAt: '2026-11-03T10:00:00.000Z',
          notes: null,
          createdAt: date,
        });
      }
      this.transactions.push({
        id: this.next++,
        customerPhone: i.customerPhone,
        type: cost > 0 ? 'earn' : 'redeem',
        points: cost,
        reason,
        reasonAr,
        balanceBefore: before,
        balanceAfter: newBalance,
        orderId: null,
        rewardId,
        redemptionId,
        expiresAt: null,
        createdAt: date,
      });
    } else {
      const row = this.redemptions.find(r => r.id === i.id);
      if (!row) throw fault('NOT_FOUND');
      if (
        ['used', 'cancelled', 'expired'].includes(row.status) &&
        i.status !== row.status
      )
        throw fault();
      Object.assign(row, {
        status: i.status,
        notes: i.notes,
        orderId: i.orderId,
        usedAt: i.status === 'used' ? date : row.usedAt,
      });
    }
    const receipt: LoyaltyReceipt = {
      success: true,
      actorId: this.actorId,
      merchantId: this.merchantId,
      requestId: i.requestId,
      kind: i.kind,
      targetId,
      customerPhone: 'customerPhone' in i ? i.customerPhone : null,
      newBalance,
    };
    this.receipts.set(i.requestId, { digest, value: receipt });
    this.revision++;
    this.writes++;
    return receipt;
  }
}
