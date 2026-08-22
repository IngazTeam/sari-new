/**
 * WhatsApp Instances Router Module
 * Handles WhatsApp instance management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { completeMetaEmbeddedSignup as completeMetaEmbeddedSignupService } from './channels/whatsapp/meta-embedded-signup';
import {
  createWhatsAppInstance,
  deleteWhatsAppInstance,
  getActiveInstanceByPhoneNumber,
  getActiveWhatsAppInstancesCount,
  getExpiringWhatsAppInstances,
  getMerchantById,
  getMerchantByUserId,
  getMerchantCurrentSubscription,
  getPrimaryWhatsAppInstance,
  getSubscriptionPlanById,
  getWhatsAppInstanceById,
  getWhatsAppInstanceByInstanceId,
  getWhatsAppInstancesByMerchantId,
  setWhatsAppInstanceAsPrimary,
  updateWhatsAppInstance,
} from './db';

function toPublicInstance(instance: any) {
    if (!instance) return instance;
    const { token: _token, webhookTokenHash: _webhookTokenHash, metadata: _metadata, ...safe } = instance;
    return {
        ...safe,
        hasCredential: Boolean(_token),
        webhookAuthenticated: Boolean(_webhookTokenHash) || instance.provider === 'green_api',
    };
}

export const whatsappInstancesRouter = router({
    // Tokens are server-only; no protected tRPC response may expose them.
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return (await getWhatsAppInstancesByMerchantId(input.merchantId)).map(toPublicInstance);
        }),

    // List instances for merchant dashboard (SAFE — no tokens, no API keys)
    listSafe: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
            // Strip sensitive fields
            return instances.map((i: any) => ({
                id: i.id,
                merchantId: i.merchantId,
                provider: i.provider || 'green_api',
                phoneNumber: i.phoneNumber,
                status: i.status,
                isPrimary: i.isPrimary,
                connectedAt: i.connectedAt,
                createdAt: i.createdAt,
                expiresAt: i.expiresAt,
            }));
        }),

    // Toggle instance status (activate / deactivate)
    toggleStatus: protectedProcedure
        .input(z.object({
            id: z.number(),
            merchantId: z.number(),
            newStatus: z.enum(['active', 'inactive']),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            // If activating, check subscription limit + phone conflict
            if (input.newStatus === 'active') {
                const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
                // Only check limit if adding a NEW active one (not reactivating the same)
                if (instance.status !== 'active') {
                    try {
                        await checkWhatsAppNumberLimit(input.merchantId);
                    } catch (err) {
                        throw new TRPCError({
                            code: 'FORBIDDEN',
                            message: 'لقد وصلت للحد الأقصى من الأرقام النشطة في باقتك. أوقف رقماً آخر أو قم بالترقية.',
                        });
                    }
                }

                const { getWhatsAppProvider } = await import('./channels/whatsapp/providers');
                const provider = getWhatsAppProvider((instance.provider || 'green_api') as 'green_api' | 'meta_cloud' | 'mock');
                const health = await provider.health({
                    provider: (instance.provider || 'green_api') as 'green_api' | 'meta_cloud' | 'mock',
                    instanceId: instance.instanceId,
                    token: instance.token,
                    apiUrl: instance.apiUrl,
                    phoneNumberId: instance.phoneNumberId,
                    providerAccountId: instance.providerAccountId,
                });
                if (!health.healthy) {
                    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر تفعيل الرقم قبل نجاح فحص المزود' });
                }

                // A tenant can never transfer another tenant's number by toggling its own record.
                if (instance.phoneNumber) {
                    const conflicting = await getActiveInstanceByPhoneNumber(instance.phoneNumber);
                    if (conflicting && conflicting.id !== instance.id) {
                        throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقلًا إداريًا موثقًا' });
                    }
                }
            }

            // If deactivating primary, ensure another active instance becomes primary
            if (input.newStatus === 'inactive' && instance.isPrimary) {
                const allInstances = await getWhatsAppInstancesByMerchantId(input.merchantId);
                const anotherActive = allInstances.find((i: any) => i.id !== input.id && i.status === 'active');
                if (anotherActive) {
                    await setWhatsAppInstanceAsPrimary(anotherActive.id, input.merchantId);
                }
            }

            await updateWhatsAppInstance(input.id, { status: input.newStatus });
            return { success: true };
        }),

    // Get WhatsApp number usage vs plan limit
    getUsage: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const subscription = await getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                return { current: 0, max: 1, remaining: 1, percentage: 0 };
            }

            // @ts-ignore
            const plan = await getSubscriptionPlanById(subscription.planId);
            if (!plan) {
                return { current: 0, max: 1, remaining: 1, percentage: 0 };
            }

            const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
            const activeCount = instances.filter((i: any) => i.status === 'active').length;
            const totalCount = instances.length;

            return {
                current: activeCount,
                total: totalCount,
                max: plan.maxWhatsAppNumbers,
                remaining: Math.max(0, plan.maxWhatsAppNumbers - activeCount),
                percentage: Math.min(100, (activeCount / plan.maxWhatsAppNumbers) * 100),
                planName: plan.name,
            };
        }),


    // Get primary instance
    getPrimary: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return toPublicInstance(await getPrimaryWhatsAppInstance(input.merchantId));
        }),

    // Create new instance
    create: adminProcedure
        .input(
            z.object({
                merchantId: z.number(),
                provider: z.enum(['green_api', 'meta_cloud', 'mock']).default('green_api'),
                instanceId: z.string().min(1),
                token: z.string().min(1),
                apiUrl: z.string().url().optional(),
                providerAccountId: z.string().max(255).optional(),
                phoneNumberId: z.string().regex(/^\d{5,30}$/).optional(),
                phoneNumber: z.string().optional(),
                webhookUrl: z.string().url().optional(),
                isPrimary: z.boolean().optional(),
                expiresAt: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            if (input.provider === 'mock' && process.env.NODE_ENV !== 'test') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mock provider is disabled outside tests' });
            }
            if (input.provider === 'meta_cloud' && (!input.phoneNumberId || input.instanceId !== input.phoneNumberId || !input.providerAccountId)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Meta WABA ID and matching phone number ID are required' });
            }
            let providerApiUrl = input.provider === 'meta_cloud' ? 'https://graph.facebook.com' : (input.apiUrl || 'https://api.green-api.com');
            if (input.provider === 'green_api') {
                const parsed = new URL(providerApiUrl);
                const allowed = ['api.green-api.com', 'api.greenapi.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
                if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowed) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only HTTPS Green API endpoints are allowed' });
                }
                providerApiUrl = parsed.origin;
            }

            // Check: instanceId must be unique
            const existingById = await getWhatsAppInstanceByInstanceId(input.instanceId);
            if (existingById) {
                // If same instanceId exists for ANOTHER merchant, deactivate it
                if (existingById.merchantId !== input.merchantId) {
                    throw new TRPCError({ code: 'CONFLICT', message: 'هوية مزود واتساب مرتبطة بحساب آخر وتتطلب نقلًا إداريًا موثقًا' });
                } else {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الرقم مسجل بالفعل في حسابك' });
                }
            }

            // A duplicate active phone requires a separately verified transfer.
            if (input.phoneNumber) {
                const conflicting = await getActiveInstanceByPhoneNumber(input.phoneNumber);
                if (conflicting) {
                    throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقلًا إداريًا موثقًا' });
                }
            }

            const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
            await checkWhatsAppNumberLimit(input.merchantId);

            const instance = await createWhatsAppInstance({
                merchantId: input.merchantId,
                provider: input.provider,
                instanceId: input.instanceId,
                token: input.token,
                apiUrl: providerApiUrl,
                providerAccountId: input.providerAccountId || null,
                phoneNumberId: input.phoneNumberId || null,
                phoneNumber: input.phoneNumber || null,
                webhookUrl: input.webhookUrl || null,
                status: 'pending',
                isPrimary: input.isPrimary ? 1 : 0,
                expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : null,
                metadata: null,
            });

            if (input.isPrimary && instance) {
                await setWhatsAppInstanceAsPrimary(instance.id, input.merchantId);
            }

            return toPublicInstance(instance);
        }),

    // Official Meta Embedded Signup completion. The browser only supplies the
    // one-time code and IDs; the app secret and resulting access token stay server-side.
    completeMetaEmbeddedSignup: protectedProcedure
        .input(z.object({
            merchantId: z.number().int().positive(),
            code: z.string().min(20).max(2048),
            wabaId: z.string().regex(/^\d{5,30}$/),
            phoneNumberId: z.string().regex(/^\d{5,30}$/),
        }))
        .mutation(async ({ input, ctx }) => completeMetaEmbeddedSignupService({
            userId: ctx.user.id,
            ...input,
        })),

    // Update instance
    update: adminProcedure
        .input(
            z.object({
                id: z.number(),
                merchantId: z.number(),
                instanceId: z.string().optional(),
                token: z.string().optional(),
                apiUrl: z.string().url().optional(),
                phoneNumber: z.string().optional(),
                webhookUrl: z.string().url().optional(),
                status: z.enum(['active', 'inactive', 'pending', 'expired']).optional(),
                expiresAt: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const instance = await getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            await updateWhatsAppInstance(input.id, {
                instanceId: input.instanceId,
                token: input.token,
                apiUrl: input.apiUrl,
                phoneNumber: input.phoneNumber,
                webhookUrl: input.webhookUrl,
                status: input.status,
                expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : undefined,
            });

            return toPublicInstance(await getWhatsAppInstanceById(input.id));
        }),

    // Set as primary
    setPrimary: protectedProcedure
        .input(
            z.object({
                id: z.number(),
                merchantId: z.number(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            await setWhatsAppInstanceAsPrimary(input.id, input.merchantId);
            return { success: true };
        }),

    // Delete instance
    delete: adminProcedure
        .input(
            z.object({
                id: z.number(),
                merchantId: z.number(),
            })
        )
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const instance = await getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            if (instance.isPrimary) {
                const count = await getActiveWhatsAppInstancesCount(input.merchantId);
                if (count <= 1) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the only active instance' });
                }
            }

            await deleteWhatsAppInstance(input.id);
            return { success: true };
        }),

    // Test connection
    testConnection: protectedProcedure
        .input(
            z.object({
                provider: z.enum(['green_api', 'meta_cloud']).default('green_api'),
                instanceId: z.string(),
                token: z.string(),
                apiUrl: z.string().url().optional(),
                phoneNumberId: z.string().regex(/^\d{5,30}$/).optional(),
                providerAccountId: z.string().max(255).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // SEC-P3-001: Verify caller has a merchant account
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant not found' });
            }

            try {
                const { getWhatsAppProvider } = await import('./channels/whatsapp/providers');
                const provider = getWhatsAppProvider(input.provider);
                const health = await provider.health({
                    provider: input.provider,
                    instanceId: input.instanceId,
                    token: input.token,
                    apiUrl: input.provider === 'meta_cloud' ? 'https://graph.facebook.com' : (input.apiUrl || 'https://api.green-api.com'),
                    phoneNumberId: input.phoneNumberId,
                    providerAccountId: input.providerAccountId,
                });
                return {
                    success: health.healthy,
                    status: health.healthy ? 'connected' : 'error',
                    message: health.healthy ? 'Connection successful' : 'Provider rejected the connection',
                };
            } catch {
                return {
                    success: false,
                    status: 'error',
                    message: 'Connection test failed',
                };
            }
        }),

    // Get instance statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
            const activeCount = instances.filter(i => i.status === 'active').length;
            const inactiveCount = instances.filter(i => i.status === 'inactive').length;
            const expiredCount = instances.filter(i => i.status === 'expired').length;
            const primary = instances.find(i => i.isPrimary);

            return {
                total: instances.length,
                active: activeCount,
                inactive: inactiveCount,
                expired: expiredCount,
                primary: primary ? toPublicInstance(primary) : null,
            };
        }),

    // Get expiring instances
    getExpiring: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { expiring7Days, expiring3Days, expiring1Day, expired } = await getExpiringWhatsAppInstances();

            return {
                expiring7Days: expiring7Days.filter(i => i.merchantId === input.merchantId).map(toPublicInstance),
                expiring3Days: expiring3Days.filter(i => i.merchantId === input.merchantId).map(toPublicInstance),
                expiring1Day: expiring1Day.filter(i => i.merchantId === input.merchantId).map(toPublicInstance),
                expired: expired.filter(i => i.merchantId === input.merchantId).map(toPublicInstance),
            };
        }),
});

export type WhatsAppInstancesRouter = typeof whatsappInstancesRouter;
