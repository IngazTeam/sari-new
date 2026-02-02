/**
 * WhatsApp Requests Router Module
 * Handles WhatsApp connection requests
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const whatsappRequestsRouter = router({
    // Create new request (merchant)
    create: protectedProcedure
        .input(
            z.object({
                merchantId: z.number(),
                phoneNumber: z.string().optional(),
                businessName: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const existingRequests = await db.getWhatsAppRequestsByMerchantId(input.merchantId);
            const pendingRequest = existingRequests.find((r: any) => r.status === 'pending');
            if (pendingRequest) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
            }

            const request = await db.createWhatsAppRequest({
                merchantId: input.merchantId,
                phoneNumber: input.phoneNumber,
                businessName: input.businessName || merchant.businessName,
                status: 'pending',
            });

            try {
                const { notifyWhatsAppConnectionRequest } = await import('./_core/emailNotifications');
                const user = await db.getUserById(merchant.userId);
                await notifyWhatsAppConnectionRequest({
                    merchantName: user?.name || merchant.businessName,
                    merchantEmail: user?.email || '',
                    businessName: merchant.businessName,
                    phoneNumber: input.phoneNumber || '',
                    requestedAt: new Date(),
                });
            } catch (error) {
                console.error('Failed to send WhatsApp connection request notification:', error);
            }

            return request;
        }),

    // Get all requests (admin only)
    listAll: protectedProcedure
        .query(async ({ ctx }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }

            return db.getAllWhatsAppRequests();
        }),

    // Get pending requests (admin only)
    listPending: protectedProcedure
        .query(async ({ ctx }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }

            return db.getPendingWhatsAppRequests();
        }),

    // Get merchant's requests
    listMine: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return db.getWhatsAppRequestsByMerchantId(input.merchantId);
        }),

    // Approve request (admin only)
    approve: protectedProcedure
        .input(
            z.object({
                requestId: z.number(),
                instanceId: z.string(),
                token: z.string(),
                apiUrl: z.string().url().default('https://api.green-api.com'),
                adminNotes: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }

            const request = await db.approveWhatsAppRequest(
                input.requestId,
                input.instanceId,
                input.token,
                input.apiUrl,
                ctx.user.id
            );

            if (input.adminNotes) {
                await db.updateWhatsAppRequest(input.requestId, { adminNotes: input.adminNotes });
            }

            return request;
        }),

    // Reject request (admin only)
    reject: protectedProcedure
        .input(
            z.object({
                requestId: z.number(),
                rejectionReason: z.string(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }

            return db.rejectWhatsAppRequest(
                input.requestId,
                input.rejectionReason,
                ctx.user.id
            );
        }),

    // Get QR code for approved request (merchant)
    getQRCode: protectedProcedure
        .input(z.object({ requestId: z.number() }))
        .query(async ({ input, ctx }) => {
            const request = await db.getWhatsAppRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            const merchant = await db.getMerchantById(request.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (request.status !== 'approved') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request not approved yet' });
            }

            if (!request.instanceId || !request.token) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance details not set' });
            }

            try {
                const baseUrl = request.apiUrl || 'https://api.green-api.com';
                const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.token}`;

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.type === 'qrCode') {
                    await db.updateWhatsAppRequest(request.id, {
                        qrCodeUrl: data.message,
                        qrCodeExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
                    });

                    return {
                        qrCodeUrl: data.message,
                        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
                    };
                } else {
                    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get QR code' });
                }
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }),

    // Check connection status (merchant)
    checkConnection: protectedProcedure
        .input(z.object({ requestId: z.number() }))
        .query(async ({ input, ctx }) => {
            const request = await db.getWhatsAppRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            const merchant = await db.getMerchantById(request.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (!request.instanceId || !request.token) {
                return { connected: false, status: 'pending' };
            }

            try {
                const baseUrl = request.apiUrl || 'https://api.green-api.com';
                const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.token}`;

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.stateInstance === 'authorized') {
                    if (request.status === 'approved') {
                        const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
                        await checkWhatsAppNumberLimit(request.merchantId);

                        await db.createWhatsAppInstance({
                            merchantId: request.merchantId,
                            instanceId: request.instanceId,
                            token: request.token,
                            apiUrl: request.apiUrl || 'https://api.green-api.com',
                            status: 'active',
                            isPrimary: true,
                            connectedAt: new Date(),
                        });

                        await db.completeWhatsAppRequest(request.id, data.phoneNumber || '');
                    }

                    return {
                        connected: true,
                        status: 'authorized',
                        phoneNumber: data.phoneNumber,
                    };
                } else {
                    return {
                        connected: false,
                        status: data.stateInstance || 'unknown',
                    };
                }
            } catch (error) {
                return {
                    connected: false,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        }),
});

export type WhatsAppRequestsRouter = typeof whatsappRequestsRouter;
