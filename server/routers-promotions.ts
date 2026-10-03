import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {router,permissionProcedure} from './_core/trpc';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
import {promotionId,promotionCreateInput,promotionUpdateInput} from '../shared/promotion-write';
import {readPromotionWorkspace,PromotionWorkspaceError} from './promotion-workspace-store';
import {writePromotion,PromotionWriteError} from './promotion-writes';
import {getPromotionById,getPromotionsByMerchant,countActivePromotions} from './db';
import {databaseTimeEpoch} from './db/time';
const error=(e:unknown)=>new TRPCError({code:e instanceof PromotionWriteError?e.reason==='forbidden'?'FORBIDDEN':e.reason==='missing'?'NOT_FOUND':e.reason==='invalid'?'BAD_REQUEST':e.reason==='limit'?'PRECONDITION_FAILED':'INTERNAL_SERVER_ERROR':'INTERNAL_SERVER_ERROR',message:e instanceof PromotionWriteError?e.message:'promotion_write:unavailable'});
export const promotionsRouter=router({
 workspace:permissionProcedure('analytics.read').input(promotionWorkspaceInput).query(async({ctx,input})=>{
  try{return await readPromotionWorkspace(ctx.user.id,ctx.merchantId,input);}catch(e){throw new TRPCError({code:e instanceof PromotionWorkspaceError&&e.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'promotion_workspace:unavailable'});}
 }),
 // Compatibility for the current editor; reviewed actions will replace these calls.
 list:permissionProcedure('analytics.read').input(z.object({activeOnly:z.boolean().optional()}).strict().optional()).query(async({ctx,input})=>{
  const all=await getPromotionsByMerchant(ctx.merchantId),now=Date.now();return input?.activeOnly?all.filter(p=>p.isActive===1&&(!p.startsAt||databaseTimeEpoch(p.startsAt)<=now)&&(!p.expiresAt||databaseTimeEpoch(p.expiresAt)>now)):all;
 }),
 getById:permissionProcedure('analytics.read').input(z.object({id:promotionId}).strict()).query(async({ctx,input})=>{const row=await getPromotionById(input.id);if(!row||row.merchantId!==ctx.merchantId)throw new TRPCError({code:'NOT_FOUND',message:'promotion_write:missing'});return row;}),
 create:permissionProcedure('campaigns.manage').input(promotionCreateInput).mutation(async({ctx,input})=>{try{return await writePromotion(ctx.user.id,ctx.merchantId,{action:'create',data:input});}catch(e){throw error(e);}}),
 update:permissionProcedure('campaigns.manage').input(promotionUpdateInput).mutation(async({ctx,input})=>{try{return await writePromotion(ctx.user.id,ctx.merchantId,{action:'update',data:input});}catch(e){throw error(e);}}),
 toggleActive:permissionProcedure('campaigns.manage').input(z.object({id:promotionId}).strict()).mutation(async({ctx,input})=>{try{return await writePromotion(ctx.user.id,ctx.merchantId,{action:'toggle',id:input.id});}catch(e){throw error(e);}}),
 delete:permissionProcedure('campaigns.manage').input(z.object({id:promotionId}).strict()).mutation(async({ctx,input})=>{try{return await writePromotion(ctx.user.id,ctx.merchantId,{action:'delete',id:input.id});}catch(e){throw error(e);}}),
 getStats:permissionProcedure('analytics.read').query(async({ctx})=>{const all=await getPromotionsByMerchant(ctx.merchantId),active=await countActivePromotions(ctx.merchantId);return {total:all.length,active,maxActive:5,totalViews:all.reduce((n,p)=>n+p.viewCount,0),totalClicks:all.reduce((n,p)=>n+p.clickCount,0),conversionRate:null};}),
});
