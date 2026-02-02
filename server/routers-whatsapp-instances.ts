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
    // List all instances for merchant
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getWhatsAppInstancesByMerchantId(input.merchantId);
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

            const existing = await db.getWhatsAppInstanceByInstanceId(input.instanceId);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already exists' });
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
        .mutation(async ({ input }) => {
            try {
                const baseUrl = input.apiUrl || 'https://api.green-api.com';
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
