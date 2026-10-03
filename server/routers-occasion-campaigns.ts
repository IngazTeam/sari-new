/** Tenant-scoped reviewed occasion actions. Old clients must reload. */
import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {permissionProcedure,router} from './_core/trpc';
import {occasionWorkspaceInput} from '../shared/occasion-workspace';
import {readOccasionWorkspace,OccasionWorkspaceError} from './occasion-workspace-store';
import {occasionActionTarget,occasionActionApply} from '../shared/occasion-actions';
import {reviewOccasionAction,applyOccasionAction,OccasionActionError} from './occasion-actions';
const reloadWorkspace=():never=>{throw new TRPCError({code:'PRECONDITION_FAILED',message:'occasion_action:reload_reviewed_workspace'});};
const legacyId=z.number().int().positive().max(2147483647);
export const occasionCampaignsRouter=router({
 reviewAction:permissionProcedure('campaigns.manage').input(occasionActionTarget).query(async({ctx,input})=>{
  try{return await reviewOccasionAction(ctx.user.id,ctx.merchantId,input);}catch(error){throw actionError(error);}
 }),
 applyAction:permissionProcedure('campaigns.manage').input(occasionActionApply).mutation(async({ctx,input})=>{
  try{return await applyOccasionAction(ctx.user.id,ctx.merchantId,input);}catch(error){throw actionError(error);}
 }),
 workspace:permissionProcedure('analytics.read').input(occasionWorkspaceInput).query(async({ctx,input})=>{
  try{return await readOccasionWorkspace(ctx.user.id,ctx.merchantId,input);}catch(error){throw new TRPCError({code:error instanceof OccasionWorkspaceError&&error.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'تعذر قراءة حملات المناسبات لهذا المتجر. حدّث الصفحة وحاول مجددًا.'});}
 }),
 // Never promote an old request into a new write without its review.
 list:permissionProcedure('analytics.read').query(reloadWorkspace),
 getStats:permissionProcedure('analytics.read').query(reloadWorkspace),
 getUpcoming:permissionProcedure('analytics.read').query(reloadWorkspace),
 toggle:permissionProcedure('campaigns.manage').input(z.object({campaignId:legacyId,enabled:z.boolean()}).strict()).mutation(reloadWorkspace),
 create:permissionProcedure('campaigns.manage').input(z.object({occasionType:z.enum(['ramadan','eid_fitr','eid_adha','national_day','new_year','hijri_new_year']),year:z.number().int().min(1900).max(9999)}).strict()).mutation(reloadWorkspace),
});
export type OccasionCampaignsRouter=typeof occasionCampaignsRouter;
function actionError(error:unknown){
 const reason=error instanceof OccasionActionError?error.reason:'unavailable';
 return new TRPCError({code:reason==='forbidden'?'FORBIDDEN':reason==='missing'?'NOT_FOUND':reason==='stale'||reason==='duplicate'?'CONFLICT':reason==='invalid'?'BAD_REQUEST':'INTERNAL_SERVER_ERROR',message:`occasion_action:${reason}`});
}
