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
  getAllCustomersPoints,
  getAllRedemptions,
  getAllTransactions,
  getCustomerPoints,
  getCustomerRedemptions,
  getCustomerTransactions,
  getLoyaltyRewards,
  getLoyaltySettings,
  getLoyaltyStats,
  getLoyaltyTierById,
  getLoyaltyTiers,
} from './db_loyalty';
import { withLoyaltyTransaction } from './loyalty/transaction';
import { loyaltyPhone, loyaltyPage } from '../shared/loyalty-input';
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
/** Old tabs must refresh into reviewedAction; an old payload can never change balances or benefits. */
const legacyWriteRetired = (): never => {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'loyalty:reviewed_action_required',
  });
};
export const loyaltyRouter = router({
  closeRequest: procedure
    .input(
      z.object({ requestId: z.string().uuid(), reviewed: z.literal(true) })
    )
    .mutation(({ ctx, input }) =>
      closeLoyaltyRequest(
        {
          merchantId: ctx.merchantId,
          actorId: ctx.user.id,
          sessionId: ctx.session?.sessionId || '',
          permission: 'campaigns.manage',
        },
        input.requestId
      )
    ),
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
  updateSettings: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  getTiers: procedure.query(({ ctx }) =>
    run(ctx, () => getLoyaltyTiers(ctx.merchantId))
  ),
  updateTier: procedure.input(z.unknown()).mutation(legacyWriteRetired),
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
  addPoints: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  deductPoints: procedure.input(z.unknown()).mutation(legacyWriteRetired),
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
  createReward: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  updateReward: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  deleteReward: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  redeemReward: procedure.input(z.unknown()).mutation(legacyWriteRetired),
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
  updateRedemption: procedure.input(z.unknown()).mutation(legacyWriteRetired),
  getStats: procedure.query(({ ctx }) =>
    run(ctx, () => getLoyaltyStats(ctx.merchantId))
  ),
});
