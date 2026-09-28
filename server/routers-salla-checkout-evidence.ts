import { TRPCError } from '@trpc/server';
import { permissionProcedure,merchantProcedure } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput, sallaCheckoutCartListInput, sallaCheckoutCartListOutput, sallaCheckoutEvidenceAccess } from '../shared/salla-checkout-evidence';
import { inspectSallaCheckoutEvidence,listSallaCheckoutCarts } from './integrations/salla-checkout-evidence';
import { sallaCheckoutAuditInput,sallaCheckoutAuditItem,sallaCheckoutAuditListInput,sallaCheckoutAuditPage } from '../shared/salla-checkout-audit';
import { saveSallaCheckoutAudit,listSallaCheckoutAudits } from './integrations/salla-checkout-audit';
import { sallaCartProblemListInput,sallaCartProblemPage,sallaCartRecoveryInput,sallaCartRecoveryOutput } from '../shared/salla-cart-recovery';
import { listSallaCartProblems,recoverSallaCart } from './integrations/salla-cart-recovery';

export const sallaCheckoutEvidenceProcedures = {
  listSallaCartProblems:permissionProcedure('orders.manage').input(sallaCartProblemListInput).query(async({ctx,input})=>{
    try{
      const result=sallaCartProblemPage.parse(await listSallaCartProblems(ctx.merchantId,ctx.user.id,input));
      if(result.merchantId!==ctx.merchantId||result.items.some(i=>i.state!==input.state||input.beforeId&&i.id>=input.beforeId))throw Error('Cart problem scope mismatch');
      return result;
    }catch{throw new TRPCError({code:'NOT_FOUND',message:'Salla cart recovery unavailable'});}
  }),
  recoverSallaCart:permissionProcedure('orders.manage').input(sallaCartRecoveryInput).mutation(async({ctx,input})=>{
    try{
      const result=sallaCartRecoveryOutput.parse(await recoverSallaCart(ctx.merchantId,ctx.user.id,input));
      if(result.merchantId!==ctx.merchantId||result.requestId!==input.requestId)throw Error('Cart recovery scope mismatch');
      return result;
    }catch{throw new TRPCError({code:'NOT_FOUND',message:'Salla cart recovery unavailable'});}
  }),
  saveSallaCheckoutAudit:permissionProcedure('orders.manage').input(sallaCheckoutAuditInput).mutation(async({ctx,input})=>{
    try {
      const result=sallaCheckoutAuditItem.parse(await saveSallaCheckoutAudit(ctx.merchantId,ctx.user.id,input));
      if(result.merchantId!==ctx.merchantId||result.reviewerUserId!==ctx.user.id||result.reviewId!==input.reviewId
        ||result.evidence.requestId!==input.evidence.requestId||result.evidence.order.orderId!==input.evidence.orderId
        ||(result.evidence.transaction?.transactionId??undefined)!==input.evidence.transactionId)throw Error('Audit scope mismatch');
      return result;
    }catch{throw new TRPCError({code:'NOT_FOUND',message:'Salla checkout audit unavailable'});}
  }),
  listSallaCheckoutAudits:permissionProcedure('orders.manage').input(sallaCheckoutAuditListInput).query(async({ctx,input})=>{
    try {
      const result=sallaCheckoutAuditPage.parse(await listSallaCheckoutAudits(ctx.merchantId,ctx.user.id,input));
      if(result.merchantId!==ctx.merchantId||input.beforeId&&result.items.some(i=>i.id>=input.beforeId!))throw Error('Audit page scope mismatch');
      return result;
    }catch{throw new TRPCError({code:'NOT_FOUND',message:'Salla checkout audit unavailable'});}
  }),
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
