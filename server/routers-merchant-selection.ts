import { router, protectedProcedure } from './_core/trpc';
import { listMerchantAccess } from './accounts/merchant-access';
export const merchantSelectionRouter = router({
  list: protectedProcedure.query(({ ctx }) => listMerchantAccess(ctx.user.id)),
});
