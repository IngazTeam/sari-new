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
import { merchantMembers, merchantInvitations, merchants, users } from "../drizzle/schema";
import { INVITABLE_ROLES, getRoleInfo, type MerchantRole } from "./_core/permissions";
import crypto from "crypto";

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
      email: z.string().email("بريد إلكتروني غير صالح"),
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

      // Check for existing pending invitation
      const existingInvite = await db.select().from(merchantInvitations)
        .where(and(
          eq(merchantInvitations.merchantId, merchant.id),
          eq(merchantInvitations.email, input.email),
          eq(merchantInvitations.status, 'pending'),
        )).limit(1);

      if (existingInvite.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'توجد دعوة معلقة لهذا البريد بالفعل' });
      }

      // Generate secure token (48 bytes = 64 hex chars)
      const token = crypto.randomBytes(32).toString('hex');

      // Invitation expires in 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(merchantInvitations).values({
        merchantId: merchant.id,
        email: input.email,
        role: input.role,
        token,
        invitedBy: ctx.user!.id,
        expiresAt: expiresAt.toISOString().slice(0, 19).replace('T', ' '),
        status: 'pending',
      });

      // Build invite link
      const baseUrl = process.env.APP_URL || 'https://sary.live';
      const inviteLink = `${baseUrl}/accept-invite?token=${token}`;

      // Try to send email (non-blocking)
      try {
        const { sendEmail } = await import('./_core/emailService');
        await sendEmail({
          to: input.email,
          subject: `دعوة للانضمام لفريق "${merchant.businessName}" على ساري`,
          html: `
            <div dir="rtl" style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2>مرحباً! 👋</h2>
              <p>تم دعوتك للانضمام لفريق عمل <strong>"${merchant.businessName}"</strong> على منصة ساري.</p>
              <p>الصلاحية: <strong>${getRoleInfo(input.role).label}</strong></p>
              <p style="margin: 24px 0;">
                <a href="${inviteLink}" style="background: #16a34a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; display: inline-block;">
                  قبول الدعوة
                </a>
              </p>
              <p style="color: #666; font-size: 13px;">هذا الرابط صالح لمدة 7 أيام.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.warn('[Team] Email send failed:', emailErr);
      }

      return { success: true, inviteLink, expiresAt: expiresAt.toISOString() };
    }),

  /**
   * Accept an invitation (public — user may not be logged in yet).
   */
  acceptInvite: publicProcedure
    .input(z.object({
      token: z.string().min(32),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const invitation = await db.select({
        id: merchantInvitations.id,
        merchantId: merchantInvitations.merchantId,
        email: merchantInvitations.email,
        role: merchantInvitations.role,
        status: merchantInvitations.status,
        expiresAt: merchantInvitations.expiresAt,
        merchantName: merchants.businessName,
      })
      .from(merchantInvitations)
      .innerJoin(merchants, eq(merchantInvitations.merchantId, merchants.id))
      .where(eq(merchantInvitations.token, input.token))
      .limit(1);

      if (!invitation.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الدعوة غير موجودة أو منتهية' });
      }

      const inv = invitation[0];

      if (inv.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذه الدعوة تم قبولها أو إلغاؤها مسبقاً' });
      }

      if (new Date(inv.expiresAt!) < new Date()) {
        // Mark as expired
        await db.update(merchantInvitations).set({ status: 'expired' }).where(eq(merchantInvitations.id, inv.id));
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'انتهت صلاحية هذه الدعوة' });
      }

      return {
        valid: true,
        merchantName: inv.merchantName,
        email: inv.email,
        role: inv.role,
        roleInfo: getRoleInfo(inv.role as MerchantRole),
      };
    }),

  /**
   * Confirm invite acceptance (authenticated user).
   */
  confirmInvite: protectedProcedure
    .input(z.object({
      token: z.string().min(32),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const invitation = await db.select().from(merchantInvitations)
        .where(and(
          eq(merchantInvitations.token, input.token),
          eq(merchantInvitations.status, 'pending'),
        )).limit(1);

      if (!invitation.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الدعوة غير موجودة' });
      }

      const inv = invitation[0];

      if (new Date(inv.expiresAt!) < new Date()) {
        await db.update(merchantInvitations).set({ status: 'expired' }).where(eq(merchantInvitations.id, inv.id));
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'انتهت صلاحية هذه الدعوة' });
      }

      // Add user as merchant member
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.insert(merchantMembers).values({
        merchantId: inv.merchantId,
        userId: ctx.user!.id,
        role: inv.role,
        invitedBy: inv.invitedBy,
        acceptedAt: now,
        isActive: 1,
      });

      // Mark invitation as accepted
      await db.update(merchantInvitations).set({
        status: 'accepted',
        acceptedAt: now,
      }).where(eq(merchantInvitations.id, inv.id));

      return { success: true, merchantId: inv.merchantId };
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

      await db.update(merchantInvitations).set({ status: 'revoked' })
        .where(and(
          eq(merchantInvitations.id, input.invitationId),
          eq(merchantInvitations.merchantId, merchant.id),
          eq(merchantInvitations.status, 'pending'),
        ));

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
