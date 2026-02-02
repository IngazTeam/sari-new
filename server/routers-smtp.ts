/**
 * SMTP Router Module
 * Handles SMTP email settings (Admin only)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";

export const smtpRouter = router({
    // Get SMTP settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getSmtpSettings } = await import('./db_smtp');
        const settings = await getSmtpSettings();
        if (!settings) return null;
        return {
            ...settings,
            password: undefined,
        };
    }),

    // Update SMTP settings
    updateSettings: protectedProcedure
        .input(
            z.object({
                host: z.string(),
                port: z.number(),
                username: z.string(),
                password: z.string().optional(),
                fromEmail: z.string().email(),
                fromName: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { upsertSmtpSettings } = await import('./db_smtp');
            await upsertSmtpSettings(input);
            return { success: true };
        }),

    // Test SMTP connection
    testConnection: protectedProcedure
        .input(
            z.object({
                email: z.string().email(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { testSmtpConnection } = await import('./_core/smtpEmail');
            const { createEmailLog, updateEmailLogStatus } = await import('./db_smtp');

            const [logResult] = await createEmailLog({
                toEmail: input.email,
                subject: 'اختبار SMTP - ساري',
                body: 'رسالة تجريبية للتحقق من إعدادات SMTP',
                status: 'pending',
            });

            try {
                await testSmtpConnection(input.email);
                await updateEmailLogStatus(logResult.insertId, 'sent');
                return { success: true };
            } catch (error) {
                await updateEmailLogStatus(
                    logResult.insertId,
                    'failed',
                    error instanceof Error ? error.message : 'Unknown error'
                );
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to send test email',
                });
            }
        }),

    // Get email logs
    getEmailLogs: protectedProcedure
        .input(
            z.object({
                limit: z.number().default(50),
            })
        )
        .query(async ({ ctx, input }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { getEmailLogs } = await import('./db_smtp');
            return await getEmailLogs(input.limit);
        }),

    // Get email stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getEmailStats } = await import('./db_smtp');
        return await getEmailStats();
    }),
});

export type SmtpRouter = typeof smtpRouter;
