/**
 * Scheduled Messages Router Module
 * Handles scheduled message management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  getMerchantByUserId,
  getScheduledMessages,
  toggleScheduledMessage,
  updateScheduledMessage,
} from './db';

export const scheduledMessagesRouter = router({
    // List all scheduled messages
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getScheduledMessages(merchant.id);
    }),

    // Create new scheduled message
    create: protectedProcedure
        .input(z.object({
            title: z.string().min(1).max(255),
            message: z.string().min(1),
            dayOfWeek: z.number().min(0).max(6),
            time: z.string().regex(/^\d{2}:\d{2}$/),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await createScheduledMessage({
                ...input,
                merchantId: merchant.id,
            });
        }),

    // Update scheduled message
    update: protectedProcedure
        .input(z.object({
            id: z.number(),
            title: z.string().min(1).max(255).optional(),
            message: z.string().min(1).optional(),
            dayOfWeek: z.number().min(0).max(6).optional(),
            time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const { id, ...data } = input;
            return await updateScheduledMessage(id, merchant.id, data);
        }),

    // Delete scheduled message
    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            await deleteScheduledMessage(input.id, merchant.id);
            return { success: true };
        }),

    // Toggle active status
    toggle: protectedProcedure
        .input(z.object({ id: z.number(), isActive: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await toggleScheduledMessage(input.id, merchant.id, input.isActive);
        }),
});

export type ScheduledMessagesRouter = typeof scheduledMessagesRouter;
