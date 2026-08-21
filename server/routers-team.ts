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
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { eq, and, sql } from "drizzle-orm";
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

const TEAM_INVITATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const teamRouter = router({

  /**
   * List all team members for the current merchant.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { getMerchantByUserId } = await import('./db');
    const merchant = await getMerchantByUserId(ctx.user!.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير موجود' });

    const db = await getDb();
    if (!db) return { members: [], invitations: [] };

    // Get members
    let members: any[] = [];
    try {
      const result = await db.select({
        id: merchantMembers.id,
        userId: merchantMembers.userId,
        role: merchantMembers.role,
        invitedAt: merchantMembers.invitedAt,
        acceptedAt: merchantMembers.acceptedAt,
        isActive: merchantMembers.isActive,
        userName: users.name,
        userEmail: users.email,
      })
      .from(merchantMembers)
      .innerJoin(users, eq(merchantMembers.userId, users.id))
      .where(eq(merchantMembers.merchantId, merchant.id));

      members = result.map(m => ({
        ...m,
        roleInfo: getRoleInfo(m.role as MerchantRole),
      }));
    } catch {
      // Table doesn't exist yet — return owner only
      members = [{
        id: 0,
        userId: ctx.user!.id,
        role: 'owner',
        invitedAt: merchant.createdAt,
        acceptedAt: merchant.createdAt,
        isActive: 1,
        userName: ctx.user!.name,
        userEmail: ctx.user!.email,
        roleInfo: getRoleInfo('owner'),
      }];
    }

    // Get pending invitations
    let invitations: any[] = [];
    try {
      invitations = await db.select({
        id: merchantInvitations.id,
        email: merchantInvitations.email,
        role: merchantInvitations.role,
        status: merchantInvitations.status,
        expiresAt: merchantInvitations.expiresAt,
        createdAt: merchantInvitations.createdAt,
      })
      .from(merchantInvitations)
      .where(and(
        eq(merchantInvitations.merchantId, merchant.id),
        eq(merchantInvitations.status, 'pending'),
      ));
    } catch { /* table doesn't exist yet */ }

    return { members, invitations };
  }),

  /**
   * Invite a new member to the merchant team.
   * Generates a secure token and stores the invitation.
   */
  invite: protectedProcedure
    .input(z.object({
      email: z.string().trim().email("بريد إلكتروني غير صالح").max(320).transform(value => value.toLowerCase()),
      role: z.enum(['manager', 'sales_supervisor', 'viewer']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getMerchantByUserId } = await import('./db');
      const merchant = await getMerchantByUserId(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير موجود' });

      // Verify caller has team.manage permission
      // For now, only the merchant owner can invite (legacy check)
      if (merchant.userId !== ctx.user!.id) {
        // Check merchant_members for permission
        const db = await getDb();
        if (db) {
          try {
            const membership = await db.select().from(merchantMembers)
              .where(and(
                eq(merchantMembers.merchantId, merchant.id),
                eq(merchantMembers.userId, ctx.user!.id),
                eq(merchantMembers.isActive, 1),
              )).limit(1);
            
            if (!membership.length || !['owner', 'manager'].includes(membership[0].role)) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية دعوة أعضاء' });
            }
          } catch (e) {
            if (e instanceof TRPCError) throw e;
          }
        }
      }

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
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'TEAM_INVITATION_ALREADY_PENDING') {
          throw new TRPCError({ code: 'CONFLICT', message: 'توجد دعوة معلقة لهذا البريد بالفعل' });
        }
        throw error;
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

      return { success: true, delivered: true, expiresAt: invitation.expiresAt.toISOString() };
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
  updateRole: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      role: z.enum(['owner', 'manager', 'sales_supervisor', 'viewer']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getMerchantByUserId } = await import('./db');
      const merchant = await getMerchantByUserId(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND' });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Cannot change owner to another role if they're the last owner
      const member = await db.select().from(merchantMembers)
        .where(eq(merchantMembers.id, input.memberId)).limit(1);

      if (!member.length || member[0].merchantId !== merchant.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'العضو غير موجود' });
      }

      if (member[0].role === 'owner' && input.role !== 'owner') {
        const ownerCount = await db.select({ count: sql<number>`COUNT(*)` }).from(merchantMembers)
          .where(and(
            eq(merchantMembers.merchantId, merchant.id),
            eq(merchantMembers.role, 'owner'),
            eq(merchantMembers.isActive, 1),
          ));
        if ((ownerCount[0]?.count || 0) <= 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكن تغيير صلاحية آخر مالك — أضف مالكاً آخر أولاً' });
        }
      }

      await db.update(merchantMembers).set({ role: input.role }).where(eq(merchantMembers.id, input.memberId));

      return { success: true };
    }),

  /**
   * Remove a member from the team.
   */
  remove: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getMerchantByUserId } = await import('./db');
      const merchant = await getMerchantByUserId(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND' });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const member = await db.select().from(merchantMembers)
        .where(eq(merchantMembers.id, input.memberId)).limit(1);

      if (!member.length || member[0].merchantId !== merchant.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'العضو غير موجود' });
      }

      // Cannot remove last owner
      if (member[0].role === 'owner') {
        const ownerCount = await db.select({ count: sql<number>`COUNT(*)` }).from(merchantMembers)
          .where(and(
            eq(merchantMembers.merchantId, merchant.id),
            eq(merchantMembers.role, 'owner'),
            eq(merchantMembers.isActive, 1),
          ));
        if ((ownerCount[0]?.count || 0) <= 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكن حذف آخر مالك للمتجر' });
        }
      }

      // Cannot remove yourself
      if (member[0].userId === ctx.user!.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك حذف نفسك — اطلب من مالك آخر' });
      }

      await db.delete(merchantMembers).where(eq(merchantMembers.id, input.memberId));

      return { success: true };
    }),

  /**
   * Revoke a pending invitation.
   */
  revokeInvite: protectedProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getMerchantByUserId } = await import('./db');
      const merchant = await getMerchantByUserId(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND' });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const revoked = await db.update(merchantInvitations).set({ status: 'revoked', recipientHash: null })
        .where(and(
          eq(merchantInvitations.id, input.invitationId),
          eq(merchantInvitations.merchantId, merchant.id),
          eq(merchantInvitations.status, 'pending'),
        ));

      const affectedRows = Number((revoked[0] as { affectedRows?: number }).affectedRows || 0);
      if (affectedRows !== 1) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدعوة المعلقة غير موجودة' });
      return { success: true };
    }),

  /**
   * Get current user's role info (for sidebar gating).
   */
  myRole: protectedProcedure.query(async ({ ctx }) => {
    const { getMerchantByUserId, getMerchantMemberByUserId } = await import('./db');

    // Try merchant_members first
    try {
      const membership = await getMerchantMemberByUserId(ctx.user!.id);
      if (membership) {
        return {
          role: membership.role as MerchantRole,
          roleInfo: getRoleInfo(membership.role as MerchantRole),
          merchantId: membership.merchantId,
        };
      }
    } catch { /* table doesn't exist */ }

    // Legacy fallback
    const merchant = await getMerchantByUserId(ctx.user!.id);
    if (merchant) {
      return {
        role: 'owner' as MerchantRole,
        roleInfo: getRoleInfo('owner'),
        merchantId: merchant.id,
      };
    }

    return null;
  }),
});

export type TeamRouter = typeof teamRouter;
