/**
 * Team Router — Manage merchant team members & invitations
 * 
 * Handles:
 * - Listing team members
 * - Inviting new members by email
 * - Accepting invitations (public)
 * - Updating member roles
 * - Removing members
 * - Revoking pending invitations
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, permissionProcedure, router } from "./_core/trpc";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { merchantMembers, merchantInvitations, users } from "../drizzle/schema";
import { getRoleInfo, type MerchantRole } from "./_core/permissions";
import {
  acceptTeamInvitation,
  inspectTeamInvitation,
  issueTeamInvitation,
  revokeIssuedTeamInvitation,
  TeamInvitationError,
} from './accounts/team-invitations';
import { buildPublicUrl } from './utils/public-url';
import { changeTeamMember } from './accounts/team-members';
import {readTeamWorkspace,revokeTeamInvitation,type TeamScope} from './accounts/team-workspace';
import {reserveApiRateLimit} from './api/distributed-rate-limit';
import {getPool} from './db/connection';
import {assertTeamSession} from './accounts/team-session';

import {teamInviteEmail} from '../shared/team-workspace';

const TEAM_INVITATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function teamScope(ctx:any):TeamScope{return {actorId:ctx.user.id,merchantId:ctx.merchantId,sessionId:ctx.session?.sessionId||''};}
async function limitTeamInvitation(ctx:any){
 const pool=await getPool();if(!pool)throw new TRPCError({code:'INTERNAL_SERVER_ERROR'});
 await assertTeamSession(pool,ctx.user.id,ctx.session?.sessionId||'');
 const limit=await reserveApiRateLimit({namespace:'team:invite',identity:String(ctx.merchantId),maxRequests:10,windowMs:60000});
 if(!limit.allowed)throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'team:rate_limit'});
}
export const teamRouter = router({

  /**
   * List all team members for the current merchant.
   */
  list: permissionProcedure('team.manage').query(async ({ctx})=>{
    const data=await readTeamWorkspace(teamScope(ctx));
    return {...data,members:data.members.map(m=>({...m,roleInfo:m.role?getRoleInfo(m.role):null}))};
  }),
  workspace: permissionProcedure('team.manage').query(({ctx})=>readTeamWorkspace(teamScope(ctx))),

  /**
   * Invite a new member to the merchant team.
   * Generates a secure token and stores the invitation.
   */
  invite: permissionProcedure('team.manage')
    .input(z.object({
      email: teamInviteEmail,
      role: z.enum(['manager', 'sales_supervisor', 'viewer']),
      reviewed:z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await limitTeamInvitation(ctx);
      const { getMerchantById } = await import('./db');
      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير موجود' });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'خطأ في قاعدة البيانات' });

      // Check if email is already a member
      const existingUser = await db.select({ id: users.id }).from(users)
        .where(eq(users.email, input.email)).limit(1);

      if (existingUser.length > 0) {
        const existingMember = await db.select().from(merchantMembers)
          .where(and(
            eq(merchantMembers.merchantId, merchant.id),
            eq(merchantMembers.userId, existingUser[0].id),
            eq(merchantMembers.isActive, 1),
          )).limit(1);

        if (existingMember.length > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'هذا المستخدم عضو بالفعل في متجرك' });
        }
      }

      let invitation;
      try {
        invitation = await issueTeamInvitation({
          merchantId: merchant.id,
          email: input.email,
          role: input.role,
          invitedBy: ctx.user!.id,
          sessionId:ctx.session?.sessionId||'',
        });
      } catch (error) {
        if(error instanceof TRPCError)throw error;
        if(error instanceof Error&&error.message==='TEAM_ALREADY_MEMBER')throw new TRPCError({code:'CONFLICT',message:'team:already_member'});
        if (error instanceof Error && error.message === 'TEAM_INVITATION_ALREADY_PENDING') {
          throw new TRPCError({ code: 'CONFLICT', message: 'توجد دعوة معلقة لهذا البريد بالفعل' });
        }
        throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'team:unavailable'});
      }

      const inviteLink = `${buildPublicUrl('/accept-invite')}#token=${invitation.token}`;
      const safeBusinessName = escapeHtml(merchant.businessName);
      const safeRole = escapeHtml(getRoleInfo(input.role).label);
      const safeSubjectName = merchant.businessName.replace(/[\r\n]/g, ' ').trim().slice(0, 120);
      try {
        const { sendEmail } = await import('./_core/emailService');
        const delivered = await sendEmail({
          to: invitation.email,
          subject: `دعوة للانضمام إلى فريق ${safeSubjectName} على ساري`,
          html: `
            <div dir="rtl" style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2>مرحباً! 👋</h2>
              <p>تم دعوتك للانضمام لفريق عمل <strong>"${safeBusinessName}"</strong> على منصة ساري.</p>
              <p>الصلاحية: <strong>${safeRole}</strong></p>
              <p style="margin: 24px 0;">
                <a href="${inviteLink}" style="background: #16a34a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; display: inline-block;">
                  قبول الدعوة
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">هذا الرابط صالح لمدة 7 أيام.</p>
            </div>
          `,
        });
        if (!delivered) throw new Error('TEAM_INVITATION_DELIVERY_FAILED');
      } catch {
        await revokeIssuedTeamInvitation(invitation.token);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر إرسال الدعوة، ولم يُترك رابط صالح مخفيًا' });
      }

      return { success: true, delivered: true, actorId:ctx.user.id,merchantId:ctx.merchantId,email:input.email,role:input.role, expiresAt: invitation.expiresAt.toISOString() };
    }),

  /**
   * Accept an invitation (public — user may not be logged in yet).
   */
  acceptInvite: publicProcedure
    .input(z.object({
      token: z.string().length(64).regex(TEAM_INVITATION_TOKEN_PATTERN),
    }))
    .mutation(async ({ input }) => {
      try {
        const invitation = await inspectTeamInvitation(input.token);
        return {
          valid: true,
          merchantName: invitation.merchantName,
          role: invitation.role,
          roleInfo: getRoleInfo(invitation.role as MerchantRole),
        };
      } catch {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الدعوة غير صالحة أو منتهية' });
      }
    }),

  /**
   * Confirm invite acceptance (authenticated user).
   */
  confirmInvite: protectedProcedure
    .input(z.object({
      token: z.string().length(64).regex(TEAM_INVITATION_TOKEN_PATTERN),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const accepted = await acceptTeamInvitation({ token: input.token, userId: ctx.user!.id });
        return { success: true, ...accepted };
      } catch (error) {
        if (error instanceof TeamInvitationError && error.code === 'verification_required') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'أكد بريد حسابك أولاً ثم أعد قبول الدعوة' });
        }
        if (error instanceof TeamInvitationError && error.code === 'recipient_mismatch') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'سجل الدخول بالبريد الذي استلم الدعوة' });
        }
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الدعوة غير صالحة أو منتهية' });
      }
    }),

  /**
   * Update a member's role.
   */
  updateRole: permissionProcedure('team.manage')
    .input(z.object({ memberId: z.number().int().positive(), role: z.enum(['owner', 'manager', 'sales_supervisor', 'viewer']), expectedRole:z.enum(['owner','manager','sales_supervisor','viewer']),reviewed:z.literal(true) }).strict())
    .mutation(({ ctx, input }) => changeTeamMember({ merchantId: ctx.merchantId, actorId: ctx.user.id,
      memberId: input.memberId,sessionId:ctx.session?.sessionId||'',expectedRole:input.expectedRole, change: { kind: 'role', role: input.role } })),

  remove: permissionProcedure('team.manage')
    .input(z.object({ memberId: z.number().int().positive(),expectedRole:z.enum(['owner','manager','sales_supervisor','viewer']),reviewed:z.literal(true) }).strict())
    .mutation(({ ctx, input }) => changeTeamMember({ merchantId: ctx.merchantId, actorId: ctx.user.id,
      memberId: input.memberId,sessionId:ctx.session?.sessionId||'',expectedRole:input.expectedRole, change: { kind: 'remove' } })),

  /**
   * Revoke a pending invitation.
   */
  revokeInvite: permissionProcedure('team.manage')
    .input(z.object({invitationId:z.number().int().positive(),reviewed:z.literal(true)}).strict())
    .mutation(({ctx,input})=>revokeTeamInvitation(teamScope(ctx),input.invitationId)),

  /**
   * Get current user's role info (for sidebar gating).
   */
  myRole: protectedProcedure.query(async ({ ctx }) => {
    const { resolveMerchantAccess } = await import('./accounts/merchant-access');
    const membership = await resolveMerchantAccess(ctx.user.id);
    if (!membership) return null;
    return { role: membership.role, roleInfo: getRoleInfo(membership.role), merchantId: membership.merchantId };
  }),
});

export type TeamRouter = typeof teamRouter;
