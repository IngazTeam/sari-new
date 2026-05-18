/**
 * Setup Wizard Router Module
 * Handles merchant onboarding wizard
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  completeSetupWizard,
  createProduct,
  createService,
  createSetupWizardProgress,
  deleteAllProductsByMerchantId,
  getBusinessTemplateById,
  getBusinessTemplatesWithTranslations,
  getMerchantByUserId,
  getSetupWizardProgress,
  incrementTemplateUsage,
  updateBotSettings,
  updateMerchant,
  updateSetupWizardProgress,
} from './db';

export const setupWizardRouter = router({
    // Get wizard progress
    getProgress: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        let progress = await getSetupWizardProgress(merchant.id);
        if (!progress) {
            // Seed wizard data with info already provided during signup
            const initialData = JSON.stringify({
                businessName: merchant.businessName || '',
                phone: merchant.phone || '',
            });
            const progressId = await createSetupWizardProgress({
                merchantId: merchant.id,
                currentStep: 1,
                completedSteps: JSON.stringify([]),
                wizardData: initialData,
                isCompleted: 0,
            });
            progress = await getSetupWizardProgress(merchant.id);
        }
        return progress;
    }),

    // Save progress
    saveProgress: protectedProcedure
        .input(z.object({
            currentStep: z.number().min(1).max(20),
            completedSteps: z.array(z.number().min(1).max(20)).max(20),
            wizardData: z.record(z.string(), z.any()),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // SEC-W3: Validate wizardData size to prevent JSON bomb / memory exhaustion
            const serializedData = JSON.stringify(input.wizardData);
            if (serializedData.length > 100_000) { // 100KB max
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'بيانات الويزرد كبيرة جداً.' });
            }

            await updateSetupWizardProgress(merchant.id, {
                currentStep: input.currentStep,
                completedSteps: JSON.stringify(input.completedSteps),
                wizardData: serializedData,
            });

            return { success: true };
        }),

    // Save products to DB immediately (so test chat can use them)
    saveProducts: protectedProcedure
        .input(z.object({
            products: z.array(z.object({
                name: z.string(),
                description: z.string().optional().default(''),
                price: z.string().optional().default('0'),
                currency: z.string().optional().default('SAR'),
                imageUrl: z.string().optional().default(''),
                productUrl: z.string().optional().default(''),
                category: z.string().optional().default(''),
            })).default([]),
        }))
        .mutation(async ({ ctx, input }) => {
            console.log(`[Wizard saveProducts] Called with ${input.products.length} products`);
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            console.log(`[Wizard saveProducts] Merchant ID: ${merchant.id}`);

            // Delete existing products (avoid duplicates if user re-runs wizard)
            await deleteAllProductsByMerchantId(merchant.id);
            console.log(`[Wizard saveProducts] Deleted old products for merchant ${merchant.id}`);

            // Save new products
            let savedCount = 0;
            for (const product of input.products) {
                if (!product.name.trim()) continue;
                try {
                    await createProduct({
                        merchantId: merchant.id,
                        name: product.name,
                        description: product.description || '',
                        price: Math.round(parseFloat(product.price || '0') * 100),
                        currency: (product.currency === 'USD' ? 'USD' : 'SAR') as 'SAR' | 'USD',
                        imageUrl: product.imageUrl || null,
                        productUrl: product.productUrl || null,
                        category: product.category || null,
                    });
                    savedCount++;
                } catch (err: any) {
                    console.error(`[Wizard saveProducts] Failed to create product "${product.name}":`, err.message);
                }
            }

            console.log(`[Wizard saveProducts] ✅ Saved ${savedCount}/${input.products.length} products for merchant ${merchant.id}`);
            return { success: true, count: savedCount };
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
            products: z.array(z.object({
                name: z.string(),
                description: z.string().optional().default(''),
                price: z.string().optional().default('0'),
                currency: z.string().optional().default('SAR'),
                imageUrl: z.string().optional().default(''),
                productUrl: z.string().optional().default(''),
                category: z.string().optional().default(''),
            })).optional().default([]),
            services: z.array(z.object({
                name: z.string(),
                description: z.string().optional().default(''),
                price: z.string().optional().default('0'),
            })).optional().default([]),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            await updateMerchant(merchant.id, {
                businessType: input.businessType,
                businessName: input.businessName,
                phone: input.phone,
                address: input.address,
                description: input.description,
                workingHoursType: input.workingHoursType,
                workingHours: input.workingHours ? JSON.stringify(input.workingHours) : undefined,
            });

            if (input.botTone || input.botLanguage || input.welcomeMessage) {
                await updateBotSettings(merchant.id, {
                    tone: input.botTone,
                    language: input.botLanguage,
                    welcomeMessage: input.welcomeMessage,
                });
            }

            // Save products to DB — only overwrite if we have products from the wizard
            // If products array is empty, DO NOT delete existing DB products
            // (they may have been saved by saveProducts from website scraping or template)
            if (input.products && input.products.length > 0) {
                const validProducts = input.products.filter(p => p.name.trim());
                if (validProducts.length > 0) {
                    await deleteAllProductsByMerchantId(merchant.id);
                    for (const product of validProducts) {
                        await createProduct({
                            merchantId: merchant.id,
                            name: product.name,
                            description: product.description || '',
                            price: Math.round(parseFloat(product.price || '0') * 100), // convert to cents
                            currency: (product.currency === 'USD' ? 'USD' : 'SAR') as 'SAR' | 'USD',
                            imageUrl: product.imageUrl || null,
                            productUrl: product.productUrl || null,
                            category: product.category || null,
                        });
                    }
                    console.log(`[Wizard] completeSetup: saved ${validProducts.length} products to DB`);
                }
            } else {
                console.log('[Wizard] completeSetup: no products in wizard data, keeping existing DB products');
            }

            // Save services to DB
            if (input.services && input.services.length > 0) {
                for (const service of input.services) {
                    if (!service.name.trim()) continue;
                    await createService({
                        merchantId: merchant.id,
                        name: service.name,
                        description: service.description || '',
                        basePrice: Math.round(parseFloat(service.price || '0') * 100),
                        priceType: 'fixed',
                        durationMinutes: 30,
                    });
                }
            }

            await completeSetupWizard(merchant.id);

            return { success: true };
        }),

    // Get templates
    getTemplates: publicProcedure
        .input(z.object({
            businessType: z.enum(['store', 'services', 'both']).optional(),
            language: z.enum(['ar', 'en']).optional(),
        }))
        .query(async ({ input }) => {
            return await getBusinessTemplatesWithTranslations(input.language, input.businessType);
        }),

    // Apply template
    applyTemplate: protectedProcedure
        .input(z.object({
            templateId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const template = await getBusinessTemplateById(input.templateId);
            if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

            const services = template.services ? JSON.parse(template.services) : [];
            const products = template.products ? JSON.parse(template.products) : [];
            const workingHours = template.working_hours ? JSON.parse(template.working_hours) : {};
            const botPersonality = template.bot_personality ? JSON.parse(template.bot_personality) : {};

            // Clear existing products/services before applying template
            await deleteAllProductsByMerchantId(merchant.id);

            for (const service of services) {
                await createService({
                    merchantId: merchant.id,
                    ...service,
                });
            }

            for (const product of products) {
                await createProduct({
                    merchantId: merchant.id,
                    ...product,
                });
            }

            await updateMerchant(merchant.id, {
                workingHours: JSON.stringify(workingHours),
            });

            await updateBotSettings(merchant.id, botPersonality);
            await incrementTemplateUsage(input.templateId);

            return { success: true };
        }),

    // Reset wizard
    resetWizard: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        await updateSetupWizardProgress(merchant.id, {
            currentStep: 1,
            completedSteps: JSON.stringify([]),
            wizardData: JSON.stringify({}),
            isCompleted: 0,
        });

        return { success: true };
    }),
});

export type SetupWizardRouter = typeof setupWizardRouter;
