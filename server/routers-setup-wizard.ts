/**
 * Setup Wizard Router Module
 * Handles merchant onboarding wizard
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const setupWizardRouter = router({
    // Get wizard progress
    getProgress: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        let progress = await db.getSetupWizardProgress(merchant.id);
        if (!progress) {
            // Seed wizard data with info already provided during signup
            const initialData = JSON.stringify({
                businessName: merchant.businessName || '',
                phone: merchant.phone || '',
            });
            const progressId = await db.createSetupWizardProgress({
                merchantId: merchant.id,
                currentStep: 1,
                completedSteps: JSON.stringify([]),
                wizardData: initialData,
                isCompleted: 0,
            });
            progress = await db.getSetupWizardProgress(merchant.id);
        }
        return progress;
    }),

    // Save progress
    saveProgress: protectedProcedure
        .input(z.object({
            currentStep: z.number(),
            completedSteps: z.array(z.number()),
            wizardData: z.record(z.string(), z.any()),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            await db.updateSetupWizardProgress(merchant.id, {
                currentStep: input.currentStep,
                completedSteps: JSON.stringify(input.completedSteps),
                wizardData: JSON.stringify(input.wizardData),
            });

            return { success: true };
        }),

    // Complete setup
    completeSetup: protectedProcedure
        .input(z.object({
            businessType: z.enum(['store', 'services', 'both']).optional().default('store'),
            businessName: z.string().optional().default(''),
            phone: z.string().optional().default(''),
            address: z.string().optional(),
            description: z.string().optional(),
            workingHoursType: z.enum(['24_7', 'weekdays', 'custom']).optional().default('24_7'),
            workingHours: z.record(z.string(), z.any()).optional(),
            botTone: z.enum(['friendly', 'professional', 'casual']).optional(),
            botLanguage: z.enum(['ar', 'en', 'both']).optional(),
            welcomeMessage: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            await db.updateMerchant(merchant.id, {
                businessType: input.businessType,
                businessName: input.businessName,
                phone: input.phone,
                address: input.address,
                description: input.description,
                workingHoursType: input.workingHoursType,
                workingHours: input.workingHours ? JSON.stringify(input.workingHours) : undefined,
            });

            if (input.botTone || input.botLanguage || input.welcomeMessage) {
                await db.updateBotSettings(merchant.id, {
                    tone: input.botTone,
                    language: input.botLanguage,
                    welcomeMessage: input.welcomeMessage,
                });
            }

            await db.completeSetupWizard(merchant.id);

            return { success: true };
        }),

    // Get templates
    getTemplates: publicProcedure
        .input(z.object({
            businessType: z.enum(['store', 'services', 'both']).optional(),
            language: z.enum(['ar', 'en']).optional(),
        }))
        .query(async ({ input }) => {
            return await db.getBusinessTemplatesWithTranslations(input.language, input.businessType);
        }),

    // Apply template
    applyTemplate: protectedProcedure
        .input(z.object({
            templateId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const template = await db.getBusinessTemplateById(input.templateId);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

            const services = template.services ? JSON.parse(template.services) : [];
            const products = template.products ? JSON.parse(template.products) : [];
            const workingHours = template.working_hours ? JSON.parse(template.working_hours) : {};
            const botPersonality = template.bot_personality ? JSON.parse(template.bot_personality) : {};

            for (const service of services) {
                await db.createService({
                    merchantId: merchant.id,
                    ...service,
                });
            }

            for (const product of products) {
                await db.createProduct({
                    merchantId: merchant.id,
                    ...product,
                });
            }

            await db.updateMerchant(merchant.id, {
                workingHours: JSON.stringify(workingHours),
            });

            await db.updateBotSettings(merchant.id, botPersonality);
            await db.incrementTemplateUsage(input.templateId);

            return { success: true };
        }),

    // Reset wizard
    resetWizard: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        await db.updateSetupWizardProgress(merchant.id, {
            currentStep: 1,
            completedSteps: JSON.stringify([]),
            wizardData: JSON.stringify({}),
            isCompleted: 0,
        });

        return { success: true };
    }),
});

export type SetupWizardRouter = typeof setupWizardRouter;
