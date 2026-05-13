/**
 * WhatsApp Instances Router Module
 * Handles WhatsApp instance management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const whatsappInstancesRouter = router({
    // List all instances for merchant (INTERNAL — used by system, returns full data including tokens)
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getWhatsAppInstancesByMerchantId(input.merchantId);
        }),

    // List instances for merchant dashboard (SAFE — no tokens, no API keys)
    listSafe: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instances = await db.getWhatsAppInstancesByMerchantId(input.merchantId);
            // Strip sensitive fields
            return instances.map((i: any) => ({
                id: i.id,
                merchantId: i.merchantId,
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
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await db.getWhatsAppInstanceById(input.id);
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

                // Phone conflict: if this number is active for another merchant, deactivate it there
                if (instance.phoneNumber) {
                    const conflicting = await db.getActiveInstanceByPhoneNumber(instance.phoneNumber, input.merchantId);
                    if (conflicting) {
                        console.log(`[WhatsApp] Phone ${instance.phoneNumber} was active for merchant ${conflicting.merchantId}, deactivating for transfer to merchant ${input.merchantId}`);
                        await db.deactivateInstancesByPhoneNumber(instance.phoneNumber, input.merchantId);
                    }
                }
            }

            // If deactivating primary, ensure another active instance becomes primary
            if (input.newStatus === 'inactive' && instance.isPrimary) {
                const allInstances = await db.getWhatsAppInstancesByMerchantId(input.merchantId);
                const anotherActive = allInstances.find((i: any) => i.id !== input.id && i.status === 'active');
                if (anotherActive) {
                    await db.setWhatsAppInstanceAsPrimary(anotherActive.id, input.merchantId);
                }
            }

            await db.updateWhatsAppInstance(input.id, { status: input.newStatus });
            return { success: true };
        }),

    // Get WhatsApp number usage vs plan limit
    getUsage: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const subscription = await db.getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                return { current: 0, max: 1, remaining: 1, percentage: 0 };
            }

            const plan = await db.getSubscriptionPlanById(subscription.planId);
            if (!plan) {
                return { current: 0, max: 1, remaining: 1, percentage: 0 };
            }

            const instances = await db.getWhatsAppInstancesByMerchantId(input.merchantId);
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
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getPrimaryWhatsAppInstance(input.merchantId);
        }),

    // Create new instance
    create: protectedProcedure
        .input(
            z.object({
                merchantId: z.number(),
                instanceId: z.string().min(1),
                token: z.string().min(1),
                apiUrl: z.string().url().optional(),
                phoneNumber: z.string().optional(),
                webhookUrl: z.string().url().optional(),
                isPrimary: z.boolean().optional(),
                expiresAt: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            // Check: instanceId must be unique
            const existingById = await db.getWhatsAppInstanceByInstanceId(input.instanceId);
            if (existingById) {
                // If same instanceId exists for ANOTHER merchant, deactivate it
                if (existingById.merchantId !== input.merchantId) {
                    console.log(`[WhatsApp] Instance ${input.instanceId} was used by merchant ${existingById.merchantId}, deactivating for transfer to merchant ${input.merchantId}`);
                    await db.updateWhatsAppInstance(existingById.id, { status: 'inactive', isPrimary: false });
                } else {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الرقم مسجل بالفعل في حسابك' });
                }
            }

            // Check: if phone number is already active elsewhere, deactivate it
            if (input.phoneNumber) {
                const conflicting = await db.getActiveInstanceByPhoneNumber(input.phoneNumber, input.merchantId);
                if (conflicting) {
                    console.log(`[WhatsApp] Phone ${input.phoneNumber} was active for merchant ${conflicting.merchantId}, deactivating for transfer to merchant ${input.merchantId}`);
                    await db.deactivateInstancesByPhoneNumber(input.phoneNumber, input.merchantId);
                }
            }

            const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
            await checkWhatsAppNumberLimit(input.merchantId);

            const instance = await db.createWhatsAppInstance({
                merchantId: input.merchantId,
                instanceId: input.instanceId,
                token: input.token,
                apiUrl: input.apiUrl || 'https://api.green-api.com',
                phoneNumber: input.phoneNumber || null,
                webhookUrl: input.webhookUrl || null,
                status: 'pending',
                isPrimary: input.isPrimary || false,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                metadata: null,
            });

            if (input.isPrimary && instance) {
                await db.setWhatsAppInstanceAsPrimary(instance.id, input.merchantId);
            }

            return instance;
        }),

    // Update instance
    update: protectedProcedure
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
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await db.getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            await db.updateWhatsAppInstance(input.id, {
                instanceId: input.instanceId,
                token: input.token,
                apiUrl: input.apiUrl,
                phoneNumber: input.phoneNumber,
                webhookUrl: input.webhookUrl,
                status: input.status,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            });

            return await db.getWhatsAppInstanceById(input.id);
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
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await db.getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            await db.setWhatsAppInstanceAsPrimary(input.id, input.merchantId);
            return { success: true };
        }),

    // Delete instance
    delete: protectedProcedure
        .input(
            z.object({
                id: z.number(),
                merchantId: z.number(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instance = await db.getWhatsAppInstanceById(input.id);
            if (!instance || instance.merchantId !== input.merchantId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
            }

            if (instance.isPrimary) {
                const count = await db.getActiveWhatsAppInstancesCount(input.merchantId);
                if (count <= 1) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the only active instance' });
                }
            }

            await db.deleteWhatsAppInstance(input.id);
            return { success: true };
        }),

    // Test connection
    testConnection: protectedProcedure
        .input(
            z.object({
                instanceId: z.string(),
                token: z.string(),
                apiUrl: z.string().url().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // SEC-P3-001: Verify caller has a merchant account
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant not found' });
            }

            try {
                const baseUrl = input.apiUrl || 'https://api.green-api.com';

                // SEC-P2-001: SSRF guard — only allow Green API domains
                try {
                    const parsed = new URL(baseUrl);
                    const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
                    const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
                    if (!isAllowed || !['https:', 'http:'].includes(parsed.protocol)) {
                        return {
                            success: false,
                            status: 'error',
                            message: 'Only Green API URLs are allowed',
                        };
                    }
                } catch {
                    return {
                        success: false,
                        status: 'error',
                        message: 'Invalid API URL format',
                    };
                }

                const url = `${baseUrl}/waInstance${input.instanceId}/getStateInstance/${input.token}`;

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.stateInstance) {
                    return {
                        success: true,
                        status: data.stateInstance,
                        message: 'Connection successful',
                    };
                } else {
                    return {
                        success: false,
                        status: 'error',
                        message: 'Failed to connect to instance',
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        }),

    // Get instance statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const instances = await db.getWhatsAppInstancesByMerchantId(input.merchantId);
            const activeCount = instances.filter(i => i.status === 'active').length;
            const inactiveCount = instances.filter(i => i.status === 'inactive').length;
            const expiredCount = instances.filter(i => i.status === 'expired').length;
            const primary = instances.find(i => i.isPrimary);

            return {
                total: instances.length,
                active: activeCount,
                inactive: inactiveCount,
                expired: expiredCount,
                primary: primary || null,
            };
        }),

    // Get expiring instances
    getExpiring: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { expiring7Days, expiring3Days, expiring1Day, expired } = await db.getExpiringWhatsAppInstances();

            return {
                expiring7Days: expiring7Days.filter(i => i.merchantId === input.merchantId),
                expiring3Days: expiring3Days.filter(i => i.merchantId === input.merchantId),
                expiring1Day: expiring1Day.filter(i => i.merchantId === input.merchantId),
                expired: expired.filter(i => i.merchantId === input.merchantId),
            };
        }),
});

export type WhatsAppInstancesRouter = typeof whatsappInstancesRouter;
