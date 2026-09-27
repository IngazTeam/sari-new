import { TRPCError } from '@trpc/server';
import { merchantProcedure, permissionProcedure } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { sallaEffectListInput, sallaEffectCheckInput, sallaEffectAuditListInput, sallaEffectPage, sallaEffectAuditPage, sallaEffectAuditItem } from '../shared/salla-effect-review';
import { listSallaEffects, listSallaEffectReviews, checkSallaEffect } from './integrations/salla-effect-review';

export const sallaEffectReviewProcedures = {
  effectReviewAccess: merchantProcedure.query(({ctx})=>({canReview:hasPermission(ctx.merchantRole,'integrations.manage')})),
  listEffects: permissionProcedure('integrations.manage').input(sallaEffectListInput).query(async({ctx,input})=>{
    try { return sallaEffectPage.parse(await listSallaEffects(ctx.merchantId,ctx.user.id,input)); }
    catch { throw new TRPCError({code:'NOT_FOUND',message:'Salla effects unavailable'}); }
  }),
  listEffectReviews: permissionProcedure('integrations.manage').input(sallaEffectAuditListInput).query(async({ctx,input})=>{
    try { return sallaEffectAuditPage.parse(await listSallaEffectReviews(ctx.merchantId,ctx.user.id,input)); }
    catch { throw new TRPCError({code:'NOT_FOUND',message:'Salla effect history unavailable'}); }
  }),
  checkEffect: permissionProcedure('integrations.manage').input(sallaEffectCheckInput).mutation(async({ctx,input})=>{
    try { return sallaEffectAuditItem.parse(await checkSallaEffect(ctx.merchantId,ctx.user.id,input)); }
    catch { throw new TRPCError({code:'CONFLICT',message:'Salla effect review could not be confirmed'}); }
  }),
};
