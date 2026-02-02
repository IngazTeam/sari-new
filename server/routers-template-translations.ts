/**
 * Template Translations Router Module
 * Handles template translations management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const templateTranslationsRouter = router({
    // Create translation
    create: adminProcedure
        .input(z.object({
            templateId: z.number(),
            language: z.enum(['ar', 'en']),
            templateName: z.string(),
            description: z.string().optional(),
            suitableFor: z.string().optional(),
            botPersonality: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const existing = await db.getTemplateTranslation(input.templateId, input.language);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Translation already exists for this language' });
            }

            const id = await db.createTemplateTranslation({
                templateId: input.templateId,
                language: input.language,
                templateName: input.templateName,
                description: input.description,
                suitableFor: input.suitableFor,
                botPersonality: input.botPersonality,
            });

            return { id, success: true };
        }),

    // Update translation
    update: adminProcedure
        .input(z.object({
            id: z.number(),
            templateName: z.string().optional(),
            description: z.string().optional(),
            suitableFor: z.string().optional(),
            botPersonality: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await db.updateTemplateTranslation(id, data);
            return { success: true };
        }),

    // Delete translation
    delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
            await db.deleteTemplateTranslation(input.id);
            return { success: true };
        }),

    // Get translations by template
    getByTemplate: adminProcedure
        .input(z.object({ templateId: z.number() }))
        .query(async ({ input }) => {
            return await db.getTemplateTranslationsByTemplateId(input.templateId);
        }),

    // Get all templates with translation status
    getAllWithStatus: adminProcedure
        .query(async () => {
            const templates = await db.getAllBusinessTemplates();

            const templatesWithStatus = await Promise.all(
                templates.map(async (template) => {
                    const translations = await db.getTemplateTranslationsByTemplateId(template.id);
                    return {
                        ...template,
                        hasArabic: translations.some(t => t.language === 'ar'),
                        hasEnglish: translations.some(t => t.language === 'en'),
                        translations,
                    };
                })
            );

            return templatesWithStatus;
        }),
});

export type TemplateTranslationsRouter = typeof templateTranslationsRouter;
