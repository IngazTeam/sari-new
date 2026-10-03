import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {router,permissionProcedure} from './_core/trpc';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
import {promotionId,promotionCreateInput,promotionUpdateInput} from '../shared/promotion-write';
import {readPromotionWorkspace,PromotionWorkspaceError} from './promotion-workspace-store';
import {PromotionWriteError} from './promotion-writes';
import {promotionActionTarget,promotionActionApply,promotionReceiptInput} from '../shared/promotion-actions';
import {reviewPromotionAction,applyPromotionAction,readPromotionActionReceipt,resolvePromotionActionReceipt} from './promotion-actions';
import {promotionTargetSelection} from '../shared/promotion-targets';
import {readPromotionTargets} from './promotion-targets';
import {promotionTargetNamesInput} from '../shared/promotion-target-names';
import {readPromotionTargetNames} from './promotion-target-names';
const error=(e:unknown)=>new TRPCError({code:e instanceof PromotionWriteError?e.reason==='forbidden'?'FORBIDDEN':e.reason==='missing'?'NOT_FOUND':e.reason==='stale'||e.reason==='reused'||e.reason==='cancelled'?'CONFLICT':e.reason==='invalid'||e.reason.startsWith('code_')?'BAD_REQUEST':e.reason==='limit'?'PRECONDITION_FAILED':'INTERNAL_SERVER_ERROR':'INTERNAL_SERVER_ERROR',message:e instanceof PromotionWriteError?e.message:'promotion_write:unavailable'});
const reloadWorkspace=():never=>{throw new TRPCError({code:'PRECONDITION_FAILED',message:'promotion_write:reload_reviewed_workspace'});};
export const promotionsRouter=router({
 targetNames:permissionProcedure('analytics.read').input(promotionTargetNamesInput).query(async({ctx,input})=>{try{return await readPromotionTargetNames(ctx.user.id,ctx.merchantId,input);}catch(e){throw new TRPCError({code:e instanceof PromotionWorkspaceError&&e.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'promotion_workspace:unavailable'});}}),
 targetChoices:permissionProcedure('campaigns.manage').input(promotionTargetSelection).query(async({ctx,input})=>{try{return await readPromotionTargets(ctx.user.id,ctx.merchantId,input);}catch(e){throw error(e);}}),
 resolveActionReceipt:permissionProcedure('campaigns.manage').input(promotionReceiptInput).mutation(async({ctx,input})=>{try{return await resolvePromotionActionReceipt(ctx.user.id,ctx.merchantId,input);}catch(e){throw error(e);}}),
 reviewAction:permissionProcedure('campaigns.manage').input(promotionActionTarget).mutation(async({ctx,input})=>{try{return await reviewPromotionAction(ctx.user.id,ctx.merchantId,input);}catch(e){throw error(e);}}),
 applyAction:permissionProcedure('campaigns.manage').input(promotionActionApply).mutation(async({ctx,input})=>{try{return await applyPromotionAction(ctx.user.id,ctx.merchantId,input);}catch(e){throw error(e);}}),
 actionReceipt:permissionProcedure('campaigns.manage').input(promotionReceiptInput).query(async({ctx,input})=>{try{return await readPromotionActionReceipt(ctx.user.id,ctx.merchantId,input);}catch(e){throw error(e);}}),
 workspace:permissionProcedure('analytics.read').input(promotionWorkspaceInput).query(async({ctx,input})=>{
  try{return await readPromotionWorkspace(ctx.user.id,ctx.merchantId,input);}catch(e){throw new TRPCError({code:e instanceof PromotionWorkspaceError&&e.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'promotion_workspace:unavailable'});}
 }),
 // Old clients must reload; never turn an old call into an unreviewed write.
 list:permissionProcedure('analytics.read').input(z.object({activeOnly:z.boolean().optional()}).strict().optional()).query(reloadWorkspace),
 getById:permissionProcedure('analytics.read').input(z.object({id:promotionId}).strict()).query(reloadWorkspace),
 create:permissionProcedure('campaigns.manage').input(promotionCreateInput).mutation(reloadWorkspace),
 update:permissionProcedure('campaigns.manage').input(promotionUpdateInput).mutation(reloadWorkspace),
 toggleActive:permissionProcedure('campaigns.manage').input(z.object({id:promotionId}).strict()).mutation(reloadWorkspace),
 delete:permissionProcedure('campaigns.manage').input(z.object({id:promotionId}).strict()).mutation(reloadWorkspace),
 getStats:permissionProcedure('analytics.read').query(reloadWorkspace),
});
