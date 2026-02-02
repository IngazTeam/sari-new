/**
 * Staff Router Module
 * Handles staff member management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const staffRouter = router({
    // Create staff member
    create: protectedProcedure
        .input(z.object({
            name: z.string(),
            phone: z.string().optional(),
            email: z.string().email().optional(),
            role: z.string().optional(),
            workingHours: z.record(z.object({
                start: z.string(),
                end: z.string(),
            })).optional(),
            googleCalendarId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const staffId = await db.createStaffMember({
                merchantId: merchant.id,
                name: input.name,
                phone: input.phone,
                email: input.email,
                role: input.role,
                workingHours: input.workingHours ? JSON.stringify(input.workingHours) : undefined,
                googleCalendarId: input.googleCalendarId,
                isActive: 1,
            });

            return { success: true, staffId };
        }),

    // List staff members
    list: protectedProcedure
        .input(z.object({
            activeOnly: z.boolean().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const staff = input.activeOnly
                ? await db.getActiveStaffByMerchant(merchant.id)
                : await db.getStaffMembersByMerchant(merchant.id);

            return { staff };
        }),

    // Get staff member by ID
    getById: protectedProcedure
        .input(z.object({ staffId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const staff = await db.getStaffMemberById(input.staffId);
            if (!staff || staff.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
            }

            return { staff };
        }),

    // Update staff member
    update: protectedProcedure
        .input(z.object({
            staffId: z.number(),
            name: z.string().optional(),
            phone: z.string().optional(),
            email: z.string().email().optional(),
            role: z.string().optional(),
            workingHours: z.record(z.object({
                start: z.string(),
                end: z.string(),
            })).optional(),
            googleCalendarId: z.string().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const staff = await db.getStaffMemberById(input.staffId);
            if (!staff || staff.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
            }

            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.phone !== undefined) updateData.phone = input.phone;
            if (input.email !== undefined) updateData.email = input.email;
            if (input.role !== undefined) updateData.role = input.role;
            if (input.workingHours !== undefined) updateData.workingHours = JSON.stringify(input.workingHours);
            if (input.googleCalendarId !== undefined) updateData.googleCalendarId = input.googleCalendarId;
            if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

            await db.updateStaffMember(input.staffId, updateData);

            return { success: true };
        }),

    // Delete staff member
    delete: protectedProcedure
        .input(z.object({ staffId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const staff = await db.getStaffMemberById(input.staffId);
            if (!staff || staff.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
            }

            await db.deleteStaffMember(input.staffId);

            return { success: true };
        }),
});

export type StaffRouter = typeof staffRouter;
