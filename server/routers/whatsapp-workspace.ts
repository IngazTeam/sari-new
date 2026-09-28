import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import { getMerchantByUserId } from '../db';
import { confirmWorkspaceRequest, listWorkspaceRequests, workspaceQR } from '../whatsapp/tenant-workspace';

const ref = z.object({ requestId: z.number().int().positive(), source: z.enum(['current', 'legacy']).default('current') }).strict();
async function merchantId(userId: number) {
  const merchant = await getMerchantByUserId(userId);
  if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
  return merchant.id;
}
export const whatsappWorkspaceRouter = router({
  requests: protectedProcedure.query(async ({ ctx }) => listWorkspaceRequests(await merchantId(ctx.user.id))),
  qr: protectedProcedure.input(ref).query(async ({ ctx, input }) => workspaceQR(await merchantId(ctx.user.id), input)),
  confirm: protectedProcedure.input(ref).query(async ({ ctx, input }) => confirmWorkspaceRequest(await merchantId(ctx.user.id), input)),
});
