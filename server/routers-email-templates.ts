/**
 * Email Templates Router Module
 * Handles email template management (Admin)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const emailTemplatesRouter = router({
    list: adminProcedure.query(async () => {
        return await db.getAllEmailTemplates();
    }),

    get: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const template = await db.getEmailTemplateById(input.id);
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
            await db.updateEmailTemplate(id, data);
            return { success: true };
        }),

    test: adminProcedure
        .input(z.object({
            id: z.number(),
            email: z.string().email(),
        }))
        .mutation(async ({ input }) => {
            const template = await db.getEmailTemplateById(input.id);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

            const { sendTestEmail } = await import('./_core/email');
            await sendTestEmail({
                to: input.email,
                subject: template.subject || 'Test Email',
                body: template.body || 'This is a test email.',
            });

            return { success: true };
        }),
});

export type EmailTemplatesRouter = typeof emailTemplatesRouter;
