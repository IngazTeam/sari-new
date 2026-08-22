/**
 * Canonical Setup Wizard Router
 *
 * The wizard draft is tenant-scoped and temporary. Merchant/profile fields are
 * committed only by completeSetup, after the final review succeeds.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from './_core/trpc';
import {
  completeSetupWizard,
  createProduct,
  createService,
  createSetupWizardProgress,
  getBusinessTemplateById,
  getBusinessTemplatesWithTranslations,
  getMerchantByUserId,
  getMerchantWebsiteInfo,
  getProductsByMerchantId,
  getServicesByMerchant,
  getSetupWizardProgress,
  incrementTemplateUsage,
  updateBotSettings,
  updateMerchant,
  updateMerchantWebsiteInfo,
  updateSetupWizardProgress,
} from './db';

const TOTAL_STEPS = 10;
const MAX_WIZARD_DRAFT_BYTES = 1_000_000;

const optionalWebUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Invalid web URL');

const requiredWebUrl = z.string().trim().url().max(500).refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' || url.protocol === 'http:';
}, 'Invalid website URL');

const setupProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().default(''),
  priceMinor: z.number().int().nonnegative().max(100_000_000),
  currency: z.enum(['SAR', 'USD']).optional().default('SAR'),
  imageUrl: optionalWebUrl.optional().default(''),
  productUrl: optionalWebUrl.optional().default(''),
  category: z.string().trim().max(100).optional().default(''),
});

const setupServiceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().default(''),
  priceMinor: z.number().int().nonnegative().max(100_000_000),
});

const websiteConfirmationSchema = z.object({
  websiteUrl: requiredWebUrl,
  platform: z.enum(['salla', 'zid', 'shopify', 'woocommerce', 'custom', 'unknown']),
});

function normalizeCatalogName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
}

function parseDraft(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function merchantDraftDefaults(merchant: Awaited<ReturnType<typeof getMerchantByUserId>>): Record<string, unknown> {
  if (!merchant) return {};
  return {
    businessType: merchant.businessType || 'store',
    businessName: merchant.businessName || '',
    phone: merchant.phone || '',
    address: merchant.address || '',
    description: merchant.description || '',
    workingHoursType: merchant.workingHoursType || 'weekdays',
  };
}

function serializeDraft(draft: Record<string, unknown>): string {
  const serialized = JSON.stringify(draft);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_WIZARD_DRAFT_BYTES) {
    throw new TRPCError({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'بيانات الإعداد أكبر من الحد المسموح. قلّل حجم كتالوج الموقع ثم أعد المحاولة.',
    });
  }
  return serialized;
}

function parseTemplateArray(value: string | null | undefined): Array<Record<string, any>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Template data is invalid' });
  }
}

export const setupWizardRouter = router({
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    let progress = await getSetupWizardProgress(merchant.id);
    const defaults = merchantDraftDefaults(merchant);

    if (!progress) {
      await createSetupWizardProgress({
        merchantId: merchant.id,
        currentStep: 1,
        completedSteps: JSON.stringify([]),
        wizardData: serializeDraft(defaults),
        isCompleted: 0,
      });
      progress = await getSetupWizardProgress(merchant.id);
    }

    if (!progress) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to initialize setup progress' });
    }

    return {
      ...progress,
      // Existing merchant fields seed missing draft keys, while explicit draft
      // edits always win until final review.
      wizardData: serializeDraft({ ...defaults, ...parseDraft(progress.wizardData) }),
    };
  }),

  saveProgress: protectedProcedure
    .input(z.object({
      currentStep: z.number().int().min(1).max(TOTAL_STEPS),
      completedSteps: z.array(z.number().int().min(1).max(TOTAL_STEPS)).max(TOTAL_STEPS),
      wizardData: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const completedSteps = Array.from(new Set(input.completedSteps)).sort((a, b) => a - b);
      await updateSetupWizardProgress(merchant.id, {
        currentStep: input.currentStep,
        completedSteps: JSON.stringify(completedSteps),
        wizardData: serializeDraft(input.wizardData),
      });

      return { success: true };
    }),

  completeSetup: protectedProcedure
    .input(z.object({
      businessType: z.enum(['store', 'services', 'both']).optional().default('store'),
      businessName: z.string().trim().min(2).max(255),
      phone: z.string().trim().min(7).max(20).regex(/^[+0-9][0-9\s()\-]+$/),
      address: z.string().trim().max(500).optional(),
      description: z.string().trim().max(10_000).optional(),
      workingHoursType: z.enum(['24_7', 'weekdays', 'custom']).optional().default('24_7'),
      workingHours: z.record(z.string(), z.unknown()).optional(),
      botTone: z.enum(['friendly', 'professional', 'casual']).optional(),
      botLanguage: z.enum(['ar', 'en', 'fr', 'tr', 'es', 'it', 'both']).optional(),
      welcomeMessage: z.string().trim().max(2000).optional(),
      products: z.array(setupProductSchema).max(100).optional().default([]),
      services: z.array(setupServiceSchema).max(100).optional().default([]),
      websiteAnalysis: websiteConfirmationSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      if (input.websiteAnalysis) {
        const pendingWebsite = await getMerchantWebsiteInfo(merchant.id);
        if (
          !pendingWebsite ||
          pendingWebsite.websiteUrl !== input.websiteAnalysis.websiteUrl ||
          !['pending', 'completed'].includes(String(pendingWebsite.analysisStatus))
        ) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'أعد تحليل رابط الموقع قبل اعتماد النتيجة.',
          });
        }
      }

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

      const existingProducts = await getProductsByMerchantId(merchant.id);
      const productNames = new Set(existingProducts.map(product => normalizeCatalogName(product.name)));
      let productsCreated = 0;
      let productsSkipped = 0;
      for (const product of input.products) {
        const normalizedName = normalizeCatalogName(product.name);
        if (productNames.has(normalizedName)) {
          productsSkipped += 1;
          continue;
        }

        const created = await createProduct({
          merchantId: merchant.id,
          name: product.name,
          description: product.description || null,
          price: product.priceMinor,
          currency: product.currency,
          imageUrl: product.imageUrl || null,
          productUrl: product.productUrl || null,
          category: product.category || null,
          isActive: 1,
          status: 'active',
        });
        if (!created) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to save product: ${product.name}` });
        }
        productNames.add(normalizedName);
        productsCreated += 1;
      }

      const existingServices = await getServicesByMerchant(merchant.id);
      const serviceNames = new Set(existingServices.map(service => normalizeCatalogName(service.name)));
      let servicesCreated = 0;
      let servicesSkipped = 0;
      for (const service of input.services) {
        const normalizedName = normalizeCatalogName(service.name);
        if (serviceNames.has(normalizedName)) {
          servicesSkipped += 1;
          continue;
        }

        const serviceId = await createService({
          merchantId: merchant.id,
          name: service.name,
          description: service.description || null,
          basePrice: service.priceMinor,
          priceType: 'fixed',
          durationMinutes: 30,
          isActive: 1,
        });
        if (!serviceId) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to save service: ${service.name}` });
        }
        serviceNames.add(normalizedName);
        servicesCreated += 1;
      }

      if (input.websiteAnalysis) {
        await updateMerchantWebsiteInfo({
          merchantId: merchant.id,
          websiteUrl: input.websiteAnalysis.websiteUrl,
          platformType: input.websiteAnalysis.platform,
          analysisStatus: 'completed',
          lastAnalysisDate: new Date(),
        });
      }

      // Completion is the last write: no UI success is returned before the
      // canonical profile, catalog, bot settings, and website confirmation save.
      await completeSetupWizard(merchant.id);

      return {
        success: true,
        catalog: { productsCreated, productsSkipped, servicesCreated, servicesSkipped },
        websiteConfirmed: Boolean(input.websiteAnalysis),
      };
    }),

  getTemplates: publicProcedure
    .input(z.object({
      businessType: z.enum(['store', 'services', 'both']).optional(),
      language: z.enum(['ar', 'en']).optional(),
    }))
    .query(async ({ input }) => getBusinessTemplatesWithTranslations(input.language, input.businessType)),

  applyTemplate: protectedProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const template = await getBusinessTemplateById(input.templateId);
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });

      const templateServices = parseTemplateArray(template.services);
      const templateProducts = parseTemplateArray(template.products);
      const existingProducts = await getProductsByMerchantId(merchant.id);
      const existingServices = await getServicesByMerchant(merchant.id);
      const productNames = new Set(existingProducts.map(product => normalizeCatalogName(product.name)));
      const serviceNames = new Set(existingServices.map(service => normalizeCatalogName(service.name)));

      for (const service of templateServices) {
        const name = String(service.name || '').trim();
        if (!name || serviceNames.has(normalizeCatalogName(name))) continue;
        await createService({
          merchantId: merchant.id,
          name: name.slice(0, 255),
          description: String(service.description || '').slice(0, 5000),
          basePrice: Math.max(0, Math.round(Number(service.price || 0) * 100)),
          priceType: 'fixed',
          durationMinutes: Number(service.durationMinutes || 30),
          category: service.category ? String(service.category).slice(0, 100) : null,
        });
        serviceNames.add(normalizeCatalogName(name));
      }

      for (const product of templateProducts) {
        const name = String(product.name || '').trim();
        if (!name || productNames.has(normalizeCatalogName(name))) continue;
        await createProduct({
          merchantId: merchant.id,
          name: name.slice(0, 255),
          description: String(product.description || '').slice(0, 5000),
          price: Math.max(0, Math.round(Number(product.price || 0) * 100)),
          currency: product.currency === 'USD' ? 'USD' : 'SAR',
          isActive: 1,
          status: 'active',
        });
        productNames.add(normalizeCatalogName(name));
      }

      let workingHours: Record<string, unknown> = {};
      let botPersonality: Record<string, unknown> = {};
      try {
        workingHours = template.working_hours ? JSON.parse(template.working_hours) : {};
        botPersonality = template.bot_personality ? JSON.parse(template.bot_personality) : {};
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Template settings are invalid' });
      }

      await updateMerchant(merchant.id, { workingHours: JSON.stringify(workingHours) });
      await updateBotSettings(merchant.id, botPersonality);
      await incrementTemplateUsage(input.templateId);

      return { success: true };
    }),

  resetWizard: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    await updateSetupWizardProgress(merchant.id, {
      currentStep: 1,
      completedSteps: JSON.stringify([]),
      wizardData: serializeDraft(merchantDraftDefaults(merchant)),
      isCompleted: 0,
    });

    return { success: true };
  }),
});

export type SetupWizardRouter = typeof setupWizardRouter;
