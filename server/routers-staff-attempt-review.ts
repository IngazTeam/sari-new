import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { staffAttemptListInput, staffAttemptCheckInput, staffAttemptPage, staffAttemptCheckResult, staffAttemptSnapshot } from '../shared/staff-attempt-review';
import { listStaffAttempts, checkStaffAttempt } from './ai/staff-attempt-review';
import {hasPermission} from './_core/permissions';
import {staffTeamListInput,staffTeamCheckInput,staffTeamPage,staffTeamAuditPage,staffTeamCheckResult,staffTeamContext,staffTeamSnapshotInput,staffTeamSnapshot} from '../shared/staff-team-review';
import {listTeamStaffAttempts,listStaffTeamReviews,checkTeamStaffAttempt} from './ai/staff-team-review';

export const staffAttemptReviewProcedures = {
  staffTeamContext: permissionProcedure('conversations.read').query(({ctx})=>staffTeamContext.parse({merchantId:ctx.merchantId,actorUserId:ctx.user.id,canReview:hasPermission(ctx.merchantRole,'conversations.review')})),
  staffTeamSnapshot: permissionProcedure('conversations.review').input(staffTeamSnapshotInput).query(async({ctx,input})=>{
    const {mode,...filters}=input;
    try { return staffTeamSnapshot.parse({merchantId:ctx.merchantId,actorUserId:ctx.user.id,mode,kind:filters.kind,
      conversationId:filters.conversationId??null,authorUserId:filters.authorUserId??null,beforeId:filters.beforeId??null,
      page:await (mode==='history'?listStaffTeamReviews:listTeamStaffAttempts)(ctx.merchantId,ctx.user.id,filters)}); }
    catch { throw new TRPCError({code:'NOT_FOUND',message:'Team review unavailable'}); }
  }),
  staffAttemptSnapshot: permissionProcedure('conversations.reply').input(staffAttemptListInput).query(async ({ ctx, input }) => {
    try {
      return staffAttemptSnapshot.parse({ merchantId: ctx.merchantId, actorUserId: ctx.user.id,
        conversationId: input.conversationId, kind: input.kind, beforeId: input.beforeId ?? null,
        page: await listStaffAttempts(ctx.merchantId, ctx.user.id, input) });
    } catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff attempts unavailable' }); }
  }),
  staffTeamReviewAccess: permissionProcedure('conversations.read').query(({ctx})=>({canReview:hasPermission(ctx.merchantRole,'conversations.review')})),
  listTeamStaffAttempts: permissionProcedure('conversations.review').input(staffTeamListInput).query(async({ctx,input})=>{
    try{return staffTeamPage.parse(await listTeamStaffAttempts(ctx.merchantId,ctx.user.id,input));}
    catch{throw new TRPCError({code:'NOT_FOUND',message:'Team attempts unavailable'});}
  }),
  listStaffTeamReviews: permissionProcedure('conversations.review').input(staffTeamListInput).query(async({ctx,input})=>{
    try{return staffTeamAuditPage.parse(await listStaffTeamReviews(ctx.merchantId,ctx.user.id,input));}
    catch{throw new TRPCError({code:'NOT_FOUND',message:'Team review history unavailable'});}
  }),
  checkTeamStaffAttempt: permissionProcedure('conversations.review').input(staffTeamCheckInput).mutation(async({ctx,input})=>{
    try{return staffTeamCheckResult.parse(await checkTeamStaffAttempt(ctx.merchantId,ctx.user.id,input));}
    catch{throw new TRPCError({code:'CONFLICT',message:'Team attempt could not be reviewed'});}
  }),
  listStaffAttempts: permissionProcedure('conversations.reply').input(staffAttemptListInput).query(async ({ ctx, input }) => {
    try { return staffAttemptPage.parse(await listStaffAttempts(ctx.merchantId, ctx.user.id, input)); }
    catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff attempts unavailable' }); }
  }),
  checkStaffAttempt: permissionProcedure('conversations.reply').input(staffAttemptCheckInput).mutation(async ({ ctx, input }) => {
    try { return staffAttemptCheckResult.parse(await checkStaffAttempt(ctx.merchantId, ctx.user.id, input)); }
    catch { throw new TRPCError({ code: 'CONFLICT', message: 'Staff attempt could not be checked' }); }
  }),
};
