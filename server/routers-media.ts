import {z} from 'zod';
import {TRPCError} from '@trpc/server';
import {router,permissionProcedure} from './_core/trpc';
import {mediaWorkspaceInput,mediaId,mediaCategories} from '../shared/media-workspace';
import {readMediaWorkspace,MediaWorkspaceError} from './media-workspace';
import {mediaUploadInput,mediaRemoveInput,mediaReceiptInput} from '../shared/media-actions';
import {uploadMediaReviewed,removeMediaReviewed,readMediaReceipt,closeMediaRequest} from './media-actions';
const reloadWorkspace=():never=>{throw new TRPCError({code:'PRECONDITION_FAILED',message:'media_workspace:reload_reviewed_workspace'});};
const mediaActionError = (error: unknown) => new TRPCError({ code: error instanceof MediaWorkspaceError
  ? error.reason === 'forbidden' ? 'FORBIDDEN' : error.reason === 'invalid' ? 'BAD_REQUEST' : error.reason === 'missing' ? 'NOT_FOUND'
    : ['stale', 'reused'].includes(error.reason) ? 'CONFLICT' : error.reason === 'limit' ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR'
  : 'INTERNAL_SERVER_ERROR', message: error instanceof MediaWorkspaceError ? error.message : 'media_workspace:unavailable' });
export const mediaRouter = router({
  uploadReviewed: permissionProcedure('analytics.read').input(mediaUploadInput).mutation(async ({ctx,input}) => {
    try { return await uploadMediaReviewed(ctx.user.id,ctx.merchantId,input); } catch (error) { throw mediaActionError(error); }
  }),
  removeReviewed: permissionProcedure('analytics.read').input(mediaRemoveInput).mutation(async ({ctx,input}) => {
    try { return await removeMediaReviewed(ctx.user.id,ctx.merchantId,input); } catch (error) { throw mediaActionError(error); }
  }),
  requestReceipt: permissionProcedure('analytics.read').input(mediaReceiptInput).query(async ({ctx,input}) => {
    try { return await readMediaReceipt(ctx.user.id,ctx.merchantId,input); } catch (error) { throw mediaActionError(error); }
  }),
  closeRequest: permissionProcedure('analytics.read').input(mediaReceiptInput).mutation(async ({ctx,input}) => {
    try { return await closeMediaRequest(ctx.user.id,ctx.merchantId,input); } catch (error) { throw mediaActionError(error); }
  }),
  workspace: permissionProcedure('analytics.read').input(mediaWorkspaceInput).query(async ({ctx, input}) => {
    try { return await readMediaWorkspace(ctx.user.id, ctx.merchantId, input); }
    catch (error) { throw new TRPCError({ code: error instanceof MediaWorkspaceError && error.reason === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', message: 'media_workspace:unavailable' }); }
  }),

  // Retained route names cannot create fresh unreviewed writes or incomplete reads.
  upload:permissionProcedure('products.manage').input(z.object({fileBase64:z.string().max(7500000),originalName:z.string().min(1).max(255),mimeType:z.string().min(1).max(100),category:z.enum(mediaCategories).default('general')}).strict()).mutation(reloadWorkspace),
  delete:permissionProcedure('products.manage').input(z.object({id:mediaId}).strict()).mutation(reloadWorkspace),
  list:permissionProcedure('analytics.read').input(z.object({category:z.enum(mediaCategories).optional(),limit:z.number().int().min(1).max(500).optional()}).strict().optional()).query(reloadWorkspace),
  getStats:permissionProcedure('analytics.read').query(reloadWorkspace),
});
export type MediaRouter=typeof mediaRouter;
