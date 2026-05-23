/**
 * Email Templates Router Module
 * Handles email template management (Admin)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { getAllEmailTemplates, getEmailTemplateById, updateEmailTemplate } from './db';

export const emailTemplatesRouter = router({
    list: adminProcedure.query(async () => {
        return await getAllEmailTemplates();
    }),

    get: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const template = await getEmailTemplateById(input.id);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
            return template;
        }),

    update: adminProcedure
        .input(z.object({
            id: z.number(),
            subject: z.string().optional(),
            body: z.string().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await updateEmailTemplate(id, data);
            return { success: true };
        }),

    // Reset template to default
    reset: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
            const template = await getEmailTemplateById(input.id);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

            // Reset by marking as not custom
            const { getDb } = await import('./db');
            const { emailTemplates } = await import('../drizzle/schema');
            const { eq } = await import('drizzle-orm');
            const dbConn = await getDb();
            if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

            await dbConn.update(emailTemplates)
                .set({ isCustom: 0 })
                .where(eq(emailTemplates.id, input.id));

            return { success: true };
        }),

    test: adminProcedure
        .input(z.object({
            id: z.number(),
            email: z.string().email(),
        }))
        .mutation(async ({ input }) => {
            const template = await getEmailTemplateById(input.id);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

            // @ts-ignore
            const { sendTestEmail } = await import('./_core/email');
            await sendTestEmail({
                to: input.email,
                subject: template.subject || 'Test Email',
                // @ts-ignore
                body: template.body || 'This is a test email.',
            });

            return { success: true };
        }),
});

export type EmailTemplatesRouter = typeof emailTemplatesRouter;