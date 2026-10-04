import { createHash } from 'node:crypto';
import {
  loyaltyRequestOutcome,
  loyaltyClosedReceiptSchema,
} from '../../shared/loyalty-workspace';
import { TRPCError } from '@trpc/server';
import { and, eq, or, like, desc, sql } from 'drizzle-orm';
import {
  loyaltyPoints,
  loyaltyRewards,
  loyaltyTiers,
  products,
} from '../../drizzle/schema';
import {
  getLoyaltySettings,
  getLoyaltyStats,
  getCustomerPoints,
  getCustomerTransactions,
  getCustomerRedemptions,
  getLoyaltyTierById,
  getLoyaltyRewardById,
  getLoyaltyRedemptionById,
  updateLoyaltySettings,
  updateLoyaltyTier,
  createLoyaltyReward,
  updateLoyaltyReward,
  deleteLoyaltyReward,
  addPointsToCustomer,
  deductPointsFromCustomer,
  redeemReward,
  updateLoyaltyRedemption,
} from '../db_loyalty';
import {
  loyaltyDatabase,
  loyaltyContext,
  withLoyaltyTransaction,
  type LoyaltyScope,
} from './transaction';
import {
  loyaltyWorkspaceSelection,
  loyaltyWorkspaceSchema,
  loyaltyTierView,
  loyaltyRewardView,
  loyaltyCustomerView,
  loyaltyTransactionView,
  loyaltyRedemptionView,
  loyaltyActionInput,
  loyaltyReceiptSchema,
  type LoyaltySelection,
  type LoyaltyAction,
  type LoyaltyReceipt,
} from '../../shared/loyalty-workspace';
import {
  loyaltySettingsInput,
  loyaltyTierInput,
  loyaltyRewardInput,
  rewardAvailable,
} from '../../shared/loyalty-input';

function stable(value: any): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, v[k]])
        )
      : v
  );
}
export function loyaltyVersion(
  merchantId: number,
  kind: string,
  value: unknown
) {
  return createHash('sha256')
    .update(stable({ version: 1, merchantId, kind, value }))
    .digest('hex');
}
function date(v: string | Date | null | undefined) {
  if (v == null) return null;
  const d =
    v instanceof Date
      ? v
      : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : v.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(d.getTime()))
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'loyalty:invalid_data',
    });
  return d.toISOString();
}
function tierView(
  merchantId: number,
  row: Awaited<ReturnType<typeof getLoyaltyTierById>>
) {
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  return loyaltyTierView.parse({
    ...loyaltyTierInput.parse(row),
    id: row.id,
    revision: loyaltyVersion(merchantId, 'tier', row),
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
  });
}
function customerView(
  merchantId: number,
  row: Awaited<ReturnType<typeof getCustomerPoints>> | null,
  tiers: Array<{ id: number; minPoints: number }>
) {
  if (!row) return null;
  return loyaltyCustomerView.parse({
    id: row.id,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    totalPoints: row.totalPoints,
    lifetimePoints: row.lifetimePoints,
    tierId:
      [...tiers]
        .sort((a, b) => b.minPoints - a.minPoints || a.id - b.id)
        .find(t => t.minPoints <= row.lifetimePoints)?.id ?? null,
    lastPointsEarnedAt: date(row.lastPointsEarnedAt),
    lastPointsRedeemedAt: date(row.lastPointsRedeemedAt),
    revision: loyaltyVersion(merchantId, 'customer', row),
  });
}
function rewardView(
  merchantId: number,
  row: NonNullable<Awaited<ReturnType<typeof getLoyaltyRewardById>>>,
  customer: Awaited<ReturnType<typeof getCustomerPoints>> | null,
  settings: Awaited<ReturnType<typeof getLoyaltySettings>>
) {
  const values = loyaltyRewardInput.parse({
    ...row,
    validFrom: date(row.validFrom),
    validUntil: date(row.validUntil),
  });
  return loyaltyRewardView.parse({
    ...values,
    id: row.id,
    revision: loyaltyVersion(merchantId, 'reward', row),
    currentRedemptions: row.currentRedemptions,
    available: settings?.isEnabled === 1 && rewardAvailable(row),
    redemptionRevision: customer
      ? loyaltyVersion(merchantId, 'redeem', { row, customer, settings })
      : null,
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
  });
}
function transactionView(
  row: Awaited<ReturnType<typeof getCustomerTransactions>>[number]
) {
  const {
    id,
    type,
    points,
    reason,
    reasonAr,
    balanceBefore,
    balanceAfter,
    orderId,
    rewardId,
    redemptionId,
  } = row;
  return loyaltyTransactionView.parse({
    id,
    type,
    points,
    reason,
    reasonAr,
    balanceBefore,
    balanceAfter,
    orderId,
    rewardId,
    redemptionId,
    expiresAt: date(row.expiresAt),
    createdAt: date(row.createdAt),
  });
}
function redemptionView(
  merchantId: number,
  row: NonNullable<Awaited<ReturnType<typeof getLoyaltyRedemptionById>>>
) {
  const { id, rewardId, pointsSpent, status, orderId, notes } = row;
  return loyaltyRedemptionView.parse({
    id,
    rewardId,
    pointsSpent,
    status,
    orderId,
    notes,
    usedAt: date(row.usedAt),
    expiresAt: date(row.expiresAt),
    createdAt: date(row.createdAt),
    revision: loyaltyVersion(merchantId, 'redemption', row),
  });
}
export async function readLoyaltyWorkspace(
  scope: LoyaltyScope,
  raw: LoyaltySelection
) {
  const selection = loyaltyWorkspaceSelection.parse(raw);
  return withLoyaltyTransaction(
    scope.merchantId,
    async () => {
      const merchantId = scope.merchantId,
        db = await loyaltyDatabase(),
        settings = await getLoyaltySettings(merchantId),
        tiers = await db
          .select()
          .from(loyaltyTiers)
          .where(eq(loyaltyTiers.merchantId, merchantId))
          .orderBy(loyaltyTiers.minPoints, loyaltyTiers.id)
          .limit(1001);
      if (tiers.length > 1000)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'loyalty:tier_limit',
        });
      const focus = selection.customerPhone
        ? await getCustomerPoints(merchantId, selection.customerPhone)
        : null;
      const escaped =
        '%' + selection.search.replace(/[\\%_]/g, m => '\\' + m) + '%';
      const customerWhere = and(
        eq(loyaltyPoints.merchantId, merchantId),
        selection.search
          ? or(
              like(loyaltyPoints.customerName, escaped),
              like(loyaltyPoints.customerPhone, escaped)
            )
          : undefined
      );
      const rewardWhere = and(
        eq(loyaltyRewards.merchantId, merchantId),
        selection.search
          ? or(
              like(loyaltyRewards.title, escaped),
              like(loyaltyRewards.titleAr, escaped)
            )
          : undefined
      );
      const customers =
        selection.view === 'customers'
          ? await db
              .select()
              .from(loyaltyPoints)
              .where(customerWhere)
              .orderBy(
                desc(loyaltyPoints.lifetimePoints),
                desc(loyaltyPoints.id)
              )
              .limit(26)
              .offset(selection.offset)
          : [];
      const rewards =
        selection.view === 'rewards' || !!selection.customerPhone
          ? await db
              .select()
              .from(loyaltyRewards)
              .where(rewardWhere)
              .orderBy(loyaltyRewards.pointsCost, loyaltyRewards.id)
              .limit(26)
              .offset(selection.offset)
          : [];
      const totalRows =
        selection.view === 'customers'
          ? await db
              .select({ n: sql<number>`count(*)` })
              .from(loyaltyPoints)
              .where(customerWhere)
          : selection.view === 'rewards'
            ? await db
                .select({ n: sql<number>`count(*)` })
                .from(loyaltyRewards)
                .where(rewardWhere)
            : [{ n: tiers.length }];
      const stats = await getLoyaltyStats(merchantId),
        transactions = selection.customerPhone
          ? await getCustomerTransactions(
              merchantId,
              selection.customerPhone,
              26,
              selection.historyOffset
            )
          : [],
        redemptions = selection.customerPhone
          ? await getCustomerRedemptions(
              merchantId,
              selection.customerPhone,
              26,
              selection.historyOffset
            )
          : [];
      const productFields = {
        id: products.id,
        name: products.name,
        nameAr: products.nameAr,
        sku: products.sku,
        isActive: products.isActive,
      };
      const productSearch =
        '%' + selection.productSearch.replace(/[\\%_]/g, m => '\\' + m) + '%';
      const productRows = await db
        .select(productFields)
        .from(products)
        .where(
          and(
            eq(products.merchantId, merchantId),
            selection.productSearch
              ? or(
                  like(products.name, productSearch),
                  like(products.nameAr, productSearch),
                  like(products.sku, productSearch)
                )
              : undefined
          )
        )
        .orderBy(products.id)
        .limit(26);
      const selectedProduct = selection.productId
        ? ((
            await db
              .select(productFields)
              .from(products)
              .where(
                and(
                  eq(products.merchantId, merchantId),
                  eq(products.id, selection.productId)
                )
              )
              .limit(1)
          )[0] ?? null)
        : null;
      return loyaltyWorkspaceSchema.parse({
        products: productRows.slice(0, 25),
        hasMoreProducts: productRows.length > 25,
        selectedProduct,
        hasMoreRewards: rewards.length > 25,
        actorId: scope.actorId,
        merchantId,
        selection,
        settings: settings ? loyaltySettingsInput.parse(settings) : null,
        settingsRevision: loyaltyVersion(merchantId, 'settings', settings),
        tiers: tiers.map(t => tierView(merchantId, t)),
        customers: customers
          .slice(0, 25)
          .map(c => customerView(merchantId, c, tiers)),
        rewards: rewards
          .slice(0, 25)
          .map(r => rewardView(merchantId, r, focus, settings)),
        total: Number(totalRows[0].n),
        hasMore:
          selection.view === 'customers'
            ? customers.length > 25
            : rewards.length > 25,
        stats: {
          totalCustomers: Number(stats.totalCustomers),
          totalPointsDistributed: Number(stats.totalPointsDistributed),
          totalPointsRedeemed: Number(stats.totalPointsRedeemed),
          totalRedemptions: Number(stats.totalRedemptions),
        },
        customer: customerView(merchantId, focus, tiers),
        customerRevision: loyaltyVersion(merchantId, 'customer', focus),
        transactions: transactions.slice(0, 25).map(transactionView),
        redemptions: redemptions
          .slice(0, 25)
          .map(r => redemptionView(merchantId, r)),
        hasMoreTransactions: transactions.length > 25,
        hasMoreRedemptions: redemptions.length > 25,
      });
    },
    scope
  );
}
function unchanged(
  scope: LoyaltyScope,
  kind: string,
  value: unknown,
  expected: string
) {
  if (loyaltyVersion(scope.merchantId, kind, value) !== expected)
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'loyalty:review_changed',
    });
}
function found<T>(value: T | null): T {
  if (!value)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'loyalty:not_found' });
  return value;
}
async function storedReceipt(
  scope: LoyaltyScope,
  requestId: string,
  digest?: string
) {
  const [rows] = await loyaltyContext()!.tx.execute<any[]>(
    'SELECT actor_id,request_digest,result_json FROM loyalty_action_receipts WHERE merchant_id=? AND request_key=? LIMIT 2',
    [scope.merchantId, requestId]
  );
  if (!rows.length) return null;
  if (
    rows.length !== 1 ||
    rows[0].actor_id !== scope.actorId ||
    (digest && rows[0].request_digest !== digest)
  )
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'loyalty:request_changed',
    });
  const value = loyaltyRequestOutcome.parse(
    typeof rows[0].result_json === 'string'
      ? JSON.parse(rows[0].result_json)
      : rows[0].result_json
  );
  if (
    value.actorId !== scope.actorId ||
    value.merchantId !== scope.merchantId ||
    value.requestId !== requestId
  )
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'loyalty:invalid_receipt',
    });
  return value;
}
/** A tombstone serializes against late requests; absence alone cannot cancel an in-flight write. */
export function closeLoyaltyRequest(scope: LoyaltyScope, requestId: string) {
  return withLoyaltyTransaction(
    scope.merchantId,
    async () => {
      const previous = await storedReceipt(scope, requestId);
      if (previous) return previous;
      const closed = loyaltyClosedReceiptSchema.parse({
        closed: true,
        actorId: scope.actorId,
        merchantId: scope.merchantId,
        requestId,
      });
      const [result] = await loyaltyContext()!.tx.execute<any>(
        'INSERT INTO loyalty_action_receipts(merchant_id,actor_id,request_key,request_digest,result_json) VALUES (?,?,?,?,?)',
        [
          scope.merchantId,
          scope.actorId,
          requestId,
          '0'.repeat(64),
          JSON.stringify(closed),
        ]
      );
      if (
        result.affectedRows !== 1 ||
        !Number.isSafeInteger(Number(result.insertId)) ||
        Number(result.insertId) < 1
      )
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return closed;
    },
    scope
  );
}
export function readLoyaltyReceipt(scope: LoyaltyScope, requestId: string) {
  return withLoyaltyTransaction(
    scope.merchantId,
    () => storedReceipt(scope, requestId),
    scope
  );
}
/** Receipt and data changes commit together; retrying the same reviewed request cannot apply it twice. */
export function applyLoyaltyAction(scope: LoyaltyScope, raw: LoyaltyAction) {
  const input = loyaltyActionInput.parse(raw),
    digest = createHash('sha256').update(stable(input)).digest('hex');
  return withLoyaltyTransaction(
    scope.merchantId,
    async () => {
      const previous = await storedReceipt(scope, input.requestId, digest);
      if (previous) {
        if ('closed' in previous)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'loyalty:request_closed',
          });
        return previous;
      }
      let targetId: number | null = 'id' in input ? input.id : null,
        newBalance: number | null = null;
      const merchantId = scope.merchantId;
      if (input.kind === 'settings') {
        unchanged(
          scope,
          'settings',
          await getLoyaltySettings(merchantId),
          input.expectedVersion
        );
        await updateLoyaltySettings(merchantId, input.values);
      } else if (input.kind === 'tier') {
        const tier = found(await getLoyaltyTierById(input.id, merchantId));
        unchanged(scope, 'tier', tier, input.expectedVersion);
        await updateLoyaltyTier(input.id, input.values);
      } else if (input.kind === 'createReward') {
        const inserted = await createLoyaltyReward({
          ...input.values,
          merchantId,
          currentRedemptions: 0,
        });
        targetId = Number(inserted.insertId);
      } else if (input.kind === 'reward' || input.kind === 'deleteReward') {
        const reward = found(await getLoyaltyRewardById(input.id, merchantId));
        unchanged(scope, 'reward', reward, input.expectedVersion);
        if (input.kind === 'reward')
          await updateLoyaltyReward(input.id, input.values);
        else await deleteLoyaltyReward(input.id);
      } else if (input.kind === 'points') {
        unchanged(
          scope,
          'customer',
          await getCustomerPoints(merchantId, input.customerPhone),
          input.expectedVersion
        );
        const result =
          input.mode === 'credit'
            ? await addPointsToCustomer(
                merchantId,
                input.customerPhone,
                input.points,
                input.reason,
                input.reasonAr
              )
            : await deductPointsFromCustomer(
                merchantId,
                input.customerPhone,
                input.points,
                input.reason,
                input.reasonAr
              );
        newBalance = result.newBalance;
        targetId = (await getCustomerPoints(merchantId, input.customerPhone))!
          .id;
      } else if (input.kind === 'redeem') {
        const row = found(await getLoyaltyRewardById(input.id, merchantId)),
          customer = found(
            await getCustomerPoints(merchantId, input.customerPhone)
          ),
          settings = await getLoyaltySettings(merchantId);
        unchanged(
          scope,
          'redeem',
          { row, customer, settings },
          input.expectedVersion
        );
        const result = await redeemReward(
          merchantId,
          input.customerPhone,
          customer.customerName || '',
          input.id
        );
        targetId = Number(result.insertId);
        newBalance = (await getCustomerPoints(merchantId, input.customerPhone))!
          .totalPoints;
      } else {
        const record = found(
          await getLoyaltyRedemptionById(input.id, merchantId)
        );
        unchanged(scope, 'redemption', record, input.expectedVersion);
        const transitions: Record<string, string[]> = {
          pending: ['approved', 'cancelled', 'expired'],
          approved: ['used', 'cancelled', 'expired'],
          used: [],
          cancelled: [],
          expired: [],
        };
        if (
          input.status !== record.status &&
          !transitions[record.status].includes(input.status)
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'loyalty:status_changed',
          });
        if (
          input.status === 'used' &&
          record.expiresAt &&
          new Date(date(record.expiresAt)!).getTime() <= Date.now()
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'loyalty:redemption_expired',
          });
        if (input.orderId) {
          const [orders] = await loyaltyContext()!.tx.execute<any[]>(
            'SELECT id FROM orders WHERE id=? AND merchantId=? AND customerPhone=? FOR SHARE',
            [input.orderId, merchantId, record.customerPhone]
          );
          if (orders.length !== 1) throw new TRPCError({ code: 'NOT_FOUND' });
        }
        await updateLoyaltyRedemption(input.id, {
          status: input.status,
          notes: input.notes,
          orderId: input.orderId,
          usedAt:
            input.status === 'used'
              ? record.usedAt ||
                new Date().toISOString().slice(0, 19).replace('T', ' ')
              : record.usedAt,
        });
      }
      const receipt: LoyaltyReceipt = loyaltyReceiptSchema.parse({
        success: true,
        actorId: scope.actorId,
        merchantId,
        requestId: input.requestId,
        kind: input.kind,
        targetId,
        customerPhone: 'customerPhone' in input ? input.customerPhone : null,
        newBalance,
      });
      const [result] = await loyaltyContext()!.tx.execute<any>(
        'INSERT INTO loyalty_action_receipts(merchant_id,actor_id,request_key,request_digest,result_json) VALUES (?,?,?,?,?)',
        [
          merchantId,
          scope.actorId,
          input.requestId,
          digest,
          JSON.stringify(receipt),
        ]
      );
      if (
        result.affectedRows !== 1 ||
        !Number.isSafeInteger(Number(result.insertId)) ||
        Number(result.insertId) < 1
      )
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'loyalty:receipt_unconfirmed',
        });
      return receipt;
    },
    scope
  );
}
