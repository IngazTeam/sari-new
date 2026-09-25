import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { createABTest, getABTests, getABTestById, declareABTestWinner, pauseABTest, resumeABTest } from './db/ab-tests';
import { abCreateInput, abReadInput, abListInput, abCloseInput, describeLegacyAB } from './ai/legacy-ab-contract';

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch { throw new TRPCError({ code: 'CONFLICT', message: 'Legacy A/B test state is unavailable' }); }
}
const procedure = permissionProcedure('bot_settings.manage');
export const abTestsRouter = router({
  create: procedure.input(abCreateInput).mutation(({ ctx, input }) => guarded(async () => ({
    testId: await createABTest({ ...input, merchantId: ctx.merchantId }), success: true,
  }))),
  list: procedure.input(abListInput).query(({ ctx, input }) => guarded(async () =>
    (await getABTests(ctx.merchantId, input.status)).map(describeLegacyAB))),
  getById: procedure.input(abReadInput).query(({ ctx, input }) => guarded(async () => {
    const test = await getABTestById(input.testId, ctx.merchantId);
    if (!test) throw new Error('Unavailable'); return describeLegacyAB(test);
  })),
  declareWinner: procedure.input(abCloseInput).mutation(({ ctx, input }) => guarded(async () => {
    await declareABTestWinner(input.testId, input.winner, ctx.merchantId);
    return { success: true, confidence: 0, selectionKind: 'manual_selection' as const,
      statisticalConfidence: null, activationAllowed: false as const };
  })),
  pause: procedure.input(abReadInput).mutation(({ ctx, input }) => guarded(async () => {
    await pauseABTest(input.testId, ctx.merchantId); return { success: true };
  })),
  resume: procedure.input(abReadInput).mutation(({ ctx, input }) => guarded(async () => {
    await resumeABTest(input.testId, ctx.merchantId); return { success: true };
  })),
});
export type ABTestsRouter = typeof abTestsRouter;
