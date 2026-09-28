import { TRPCError } from '@trpc/server';
import { permissionProcedure,merchantProcedure } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput, sallaCheckoutCartListInput, sallaCheckoutCartListOutput, sallaCheckoutEvidenceAccess } from '../shared/salla-checkout-evidence';
import { inspectSallaCheckoutEvidence,listSallaCheckoutCarts } from './integrations/salla-checkout-evidence';

export const sallaCheckoutEvidenceProcedures = {
  checkoutEvidenceAccess:merchantProcedure.query(({ctx})=>sallaCheckoutEvidenceAccess.parse({canInspect:hasPermission(ctx.merchantRole,'orders.manage'),merchantId:ctx.merchantId})),
  listSallaCheckoutCarts:permissionProcedure('orders.manage').input(sallaCheckoutCartListInput).query(async({ctx,input})=>{
    try {
      const result=sallaCheckoutCartListOutput.parse(await listSallaCheckoutCarts(ctx.merchantId,ctx.user.id,input));
      if(result.merchantId!==ctx.merchantId||input.beforeId&&result.items.some(i=>i.id>=input.beforeId!))throw Error('Cart scope mismatch');
      return result;
    }catch{throw new TRPCError({code:'NOT_FOUND',message:'Salla checkout evidence unavailable'});}
  }),
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
