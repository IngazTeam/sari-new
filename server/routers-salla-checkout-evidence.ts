import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput } from '../shared/salla-checkout-evidence';
import { inspectSallaCheckoutEvidence } from './integrations/salla-checkout-evidence';

export const sallaCheckoutEvidenceProcedures = {
  inspectSallaCheckoutEvidence: permissionProcedure('orders.manage').input(sallaCheckoutEvidenceInput).query(async ({ctx,input}) => {
    try {
      const result = sallaCheckoutEvidenceOutput.parse(await inspectSallaCheckoutEvidence(ctx.merchantId,ctx.user.id,input));
      if (result.requestId !== input.requestId || result.order.orderId !== input.orderId
        || (result.transaction?.transactionId ?? undefined) !== input.transactionId) throw Error('Evidence request mismatch');
      return result;
    }
    catch { throw new TRPCError({code:'NOT_FOUND',message:'Salla checkout evidence unavailable'}); }
  }),
};
