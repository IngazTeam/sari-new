import { router, permissionProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  loyaltyWorkspaceSelection,
  loyaltyActionInput,
} from '../shared/loyalty-workspace';
import {
  readLoyaltyWorkspace,
  readLoyaltyReceipt,
  applyLoyaltyAction,
  closeLoyaltyRequest,
} from './loyalty/workspace';
import {
  addPointsToCustomer,
  createLoyaltyReward,
  deductPointsFromCustomer,
  deleteLoyaltyReward,
  getAllCustomersPoints,
  getAllRedemptions,
  getAllTransactions,
  getCustomerPoints,
  getCustomerRedemptions,
  getCustomerTransactions,
  getLoyaltyRedemptionById,
  getLoyaltyRewardById,
  getLoyaltyRewards,
  getLoyaltySettings,
  getLoyaltyStats,
  getLoyaltyTierById,
  getLoyaltyTiers,
  redeemReward,
  updateLoyaltyRedemption,
  updateLoyaltyReward,
  updateLoyaltySettings,
  updateLoyaltyTier,
} from './db_loyalty';
import { withLoyaltyTransaction, loyaltyContext } from './loyalty/transaction';
import {
  loyaltyId,
  loyaltyPhone,
  loyaltyPage,
  loyaltySettingsInput,
  loyaltyTierInput,
  loyaltyRewardInput,
  loyaltyAdjustmentInput,
} from '../shared/loyalty-input';
const procedure = permissionProcedure('campaigns.manage');
const run = <T>(
  ctx: {
    user: { id: number };
    merchantId: number;
    session?: { sessionId?: string } | null;
  },
  action: () => Promise<T>
) =>
  withLoyaltyTransaction(ctx.merchantId, action, {
    merchantId: ctx.merchantId,
    actorId: ctx.user.id,
    sessionId: ctx.session?.sessionId || '',
    permission: 'campaigns.manage',
  });
const history = loyaltyPage.extend({ customerPhone: loyaltyPhone.optional() });
const found = <T>(value: T | null | undefined): T => {
  if (!value)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'loyalty:not_found' });
  return value;
};
export const loyaltyRouter = router({
  closeRequest:procedure.input(z.object({requestId:z.string().uuid(),reviewed:z.literal(true)})).mutation(({ctx,input})=>closeLoyaltyRequest({merchantId:ctx.merchantId,actorId:ctx.user.id,sessionId:ctx.session?.sessionId||'',permission:'campaigns.manage'},input.requestId)),
  workspace: procedure
    .input(loyaltyWorkspaceSelection)
    .query(({ ctx, input }) =>
      readLoyaltyWorkspace(
        {
          merchantId: ctx.merchantId,
          actorId: ctx.user.id,
          sessionId: ctx.session?.sessionId || '',
          permission: 'campaigns.manage',
        },
        input
      )
    ),
  reviewedAction: procedure
    .input(loyaltyActionInput)
    .mutation(({ ctx, input }) =>
      applyLoyaltyAction(
        {
          merchantId: ctx.merchantId,
          actorId: ctx.user.id,
          sessionId: ctx.session?.sessionId || '',
          permission: 'campaigns.manage',
        },
        input
      )
    ),
  receipt: procedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      readLoyaltyReceipt(
        {
          merchantId: ctx.merchantId,
          actorId: ctx.user.id,
          sessionId: ctx.session?.sessionId || '',
          permission: 'campaigns.manage',
        },
        input.requestId
      )
    ),
  getSettings: procedure.query(({ ctx }) =>
    run(ctx, () => getLoyaltySettings(ctx.merchantId))
  ),
  updateSettings: procedure
    .input(loyaltySettingsInput.partial())
    .mutation(({ ctx, input }) =>
      run(ctx, () => updateLoyaltySettings(ctx.merchantId, input))
    ),
  getTiers: procedure.query(({ ctx }) =>
    run(ctx, () => getLoyaltyTiers(ctx.merchantId))
  ),
  updateTier: procedure
    .input(loyaltyTierInput.partial().extend({ id: loyaltyId }))
    .mutation(({ ctx, input }) =>
      run(ctx, async () => {
        found(await getLoyaltyTierById(input.id, ctx.merchantId));
        const { id, ...data } = input;
        return updateLoyaltyTier(id, data);
      })
    ),
  getCustomerPoints: procedure
    .input(z.object({ customerPhone: loyaltyPhone }))
    .query(({ ctx, input }) =>
      run(ctx, async () => {
        const points = await getCustomerPoints(
          ctx.merchantId,
          input.customerPhone
        );
        if (!points) return null;
        return {
          ...points,
          tier: points.currentTierId
            ? await getLoyaltyTierById(points.currentTierId, ctx.merchantId)
            : null,
        };
      })
    ),
  addPoints: procedure
    .input(loyaltyAdjustmentInput)
    .mutation(({ ctx, input }) =>
      run(ctx, () =>
        addPointsToCustomer(
          ctx.merchantId,
          input.customerPhone,
          input.points,
          input.reason,
          input.reasonAr,
          input.orderId
        )
      )
    ),
  deductPoints: procedure
    .input(loyaltyAdjustmentInput.omit({ orderId: true }))
    .mutation(({ ctx, input }) =>
      run(ctx, () =>
        deductPointsFromCustomer(
          ctx.merchantId,
          input.customerPhone,
          input.points,
          input.reason,
          input.reasonAr
        )
      )
    ),
  getAllCustomersPoints: procedure.input(loyaltyPage).query(({ ctx, input }) =>
    run(ctx, async () => {
      const customers = await getAllCustomersPoints(
          ctx.merchantId,
          input.limit,
          input.offset
        ),
        tiers = await getLoyaltyTiers(ctx.merchantId),
        byId = new Map(tiers.map(t => [t.id, t]));
      return customers.map(c => ({
        ...c,
        tier: c.currentTierId ? byId.get(c.currentTierId) || null : null,
      }));
    })
  ),
  getTransactions: procedure
    .input(history)
    .query(({ ctx, input }) =>
      run(ctx, () =>
        input.customerPhone
          ? getCustomerTransactions(
              ctx.merchantId,
              input.customerPhone,
              input.limit,
              input.offset
            )
          : getAllTransactions(ctx.merchantId, input.limit, input.offset)
      )
    ),
  getRewards: procedure
    .input(z.object({ activeOnly: z.boolean().default(false) }))
    .query(({ ctx, input }) =>
      run(ctx, () => getLoyaltyRewards(ctx.merchantId, input.activeOnly))
    ),
  createReward: procedure.input(loyaltyRewardInput).mutation(({ ctx, input }) =>
    run(ctx, () =>
      createLoyaltyReward({
        ...input,
        merchantId: ctx.merchantId,
        currentRedemptions: 0,
      })
    )
  ),
  updateReward: procedure
    .input(loyaltyRewardInput.partial().extend({ id: loyaltyId }))
    .mutation(({ ctx, input }) =>
      run(ctx, async () => {
        found(await getLoyaltyRewardById(input.id, ctx.merchantId));
        const { id, ...data } = input;
        return updateLoyaltyReward(id, data);
      })
    ),
  deleteReward: procedure
    .input(z.object({ id: loyaltyId }))
    .mutation(({ ctx, input }) =>
      run(ctx, async () => {
        await deleteLoyaltyReward(input.id);
        return { success: true as const };
      })
    ),
  redeemReward: procedure
    .input(
      z.object({
        customerPhone: loyaltyPhone,
        customerName: z.string().trim().max(255),
        rewardId: loyaltyId,
      })
    )
    .mutation(({ ctx, input }) =>
      run(ctx, () =>
        redeemReward(
          ctx.merchantId,
          input.customerPhone,
          input.customerName,
          input.rewardId
        )
      )
    ),
  getRedemptions: procedure
    .input(history)
    .query(({ ctx, input }) =>
      run(ctx, () =>
        input.customerPhone
          ? getCustomerRedemptions(
              ctx.merchantId,
              input.customerPhone,
              input.limit,
              input.offset
            )
          : getAllRedemptions(ctx.merchantId, input.limit, input.offset)
      )
    ),
  updateRedemption: procedure
    .input(
      z.object({
        id: loyaltyId,
        status: z
          .enum(['pending', 'approved', 'used', 'cancelled', 'expired'])
          .optional(),
        orderId: loyaltyId.optional(),
        usedAt: z.string().datetime({ offset: true }).optional(),
        notes: z.string().max(10000).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      run(ctx, async () => {
        const record = found(
          await getLoyaltyRedemptionById(input.id, ctx.merchantId)
        );
        const transitions: Record<string, string[]> = {
          pending: ['approved', 'cancelled', 'expired'],
          approved: ['used', 'cancelled', 'expired'],
          used: [],
          cancelled: [],
          expired: [],
        };
        if (
          input.status &&
          input.status !== record.status &&
          !transitions[record.status].includes(input.status)
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'loyalty:status_changed',
          });
        if (input.orderId) {
          const [rows] = await loyaltyContext()!.tx.execute<any[]>(
            'SELECT id FROM orders WHERE id=? AND merchantId=? FOR SHARE',
            [input.orderId, ctx.merchantId]
          );
          if (rows.length !== 1) throw new TRPCError({ code: 'NOT_FOUND' });
        }
        // A caller cannot forge use dates or resurrect a terminal redemption. Cancellation does not award points.
        if (input.usedAt && input.status !== 'used')
          throw new TRPCError({ code: 'BAD_REQUEST' });
        const { id, ...data } = input;
        return updateLoyaltyRedemption(id, {
          ...data,
          usedAt:
            input.status === 'used'
              ? new Date().toISOString().slice(0, 19).replace('T', ' ')
              : record.usedAt,
        });
      })
    ),
  getStats: procedure.query(({ ctx }) =>
    run(ctx, () => getLoyaltyStats(ctx.merchantId))
  ),
});
