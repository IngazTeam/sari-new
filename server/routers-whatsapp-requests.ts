/**
 * WhatsApp Requests Router Module
 * Handles WhatsApp connection requests
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  approveWhatsAppRequest,
  completeWhatsAppRequest,
  createWhatsAppInstance,
  createWhatsAppRequest,
  getAllWhatsAppRequests,
  getMerchantById,
  getPendingWhatsAppRequests,
  getUserById,
  getWhatsAppRequestById,
  getWhatsAppRequestsByMerchantId,
  rejectWhatsAppRequest,
  updateWhatsAppRequest,
} from './db';

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
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const existingRequests = await getWhatsAppRequestsByMerchantId(input.merchantId);
            const pendingRequest = existingRequests.find((r: any) => r.status === 'pending');
            if (pendingRequest) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
            }

            const request = await createWhatsAppRequest({
                merchantId: input.merchantId,
                phoneNumber: input.phoneNumber,
                businessName: input.businessName || merchant.businessName,
                status: 'pending',
            });

            try {
                const { notifyWhatsAppConnectionRequest } = await import('./_core/emailNotifications');
                const user = await getUserById(merchant.userId);
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

            return getAllWhatsAppRequests();
        }),

    // Get pending requests (admin only)
    listPending: protectedProcedure
        .query(async ({ ctx }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }

            return getPendingWhatsAppRequests();
        }),

    // Get merchant's requests
    listMine: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return getWhatsAppRequestsByMerchantId(input.merchantId);
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

            // Auto-derive api_url from instanceId if default was used
            let resolvedApiUrl = input.apiUrl;
            if (resolvedApiUrl === 'https://api.green-api.com' || resolvedApiUrl === 'https://api.greenapi.com') {
              const prefix = input.instanceId.substring(0, 4);
              resolvedApiUrl = `https://${prefix}.api.greenapi.com`;
              console.log(`[approve] Auto-derived api_url: ${resolvedApiUrl} from instanceId: ${input.instanceId}`);
            }

            const request = await approveWhatsAppRequest(
                input.requestId,
                input.instanceId,
                input.token,
                resolvedApiUrl,
                ctx.user.id
            );

            if (input.adminNotes) {
                await updateWhatsAppRequest(input.requestId, { adminNotes: input.adminNotes });
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

            return rejectWhatsAppRequest(
                input.requestId,
                input.rejectionReason,
                ctx.user.id
            );
        }),

    // Get QR code for approved request (merchant)
    getQRCode: protectedProcedure
        .input(z.object({ requestId: z.number() }))
        .query(async ({ input, ctx }) => {
            const request = await getWhatsAppRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            const merchant = await getMerchantById(request.merchantId);
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
                // Auto-derive correct API URL from instanceId prefix
                let baseUrl = request.apiUrl || 'https://api.green-api.com';
                if (baseUrl === 'https://api.green-api.com' || baseUrl === 'https://api.greenapi.com') {
                    const prefix = request.instanceId.substring(0, 4);
                    baseUrl = `https://${prefix}.api.greenapi.com`;
                }
                const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.token}`;

                console.log(`[WhatsApp QR] Fetching QR from: ${url}`);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                const data = await response.json();

                if (response.ok && data.type === 'qrCode') {
                    await updateWhatsAppRequest(request.id, {
                        qrCodeUrl: data.message,
                        qrCodeExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
                    });

                    return {
                        qrCodeUrl: data.message,
                        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
                    };
                } else if (response.ok && data.type === 'alreadyLogged') {
                    return {
                        qrCodeUrl: null,
                        alreadyConnected: true,
                        message: 'الرقم مربوط بالفعل',
                    };
                } else {
                    console.error('[WhatsApp QR] Unexpected response:', data);
                    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `فشل جلب QR Code: ${data.type || 'unknown response'}` });
                }
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error('[WhatsApp QR] Error:', error instanceof Error ? error.message : error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل الاتصال بخدمة الواتساب. حاول مرة أخرى.',
                });
            }
        }),

    // Check connection status (merchant)
    checkConnection: protectedProcedure
        .input(z.object({ requestId: z.number() }))
        .query(async ({ input, ctx }) => {
            const request = await getWhatsAppRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            const merchant = await getMerchantById(request.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (!request.instanceId || !request.token) {
                return { connected: false, status: 'pending' };
            }

            try {
                // Auto-derive correct API URL from instanceId prefix
                let baseUrl = request.apiUrl || 'https://api.green-api.com';
                if (baseUrl === 'https://api.green-api.com' || baseUrl === 'https://api.greenapi.com') {
                    const prefix = request.instanceId.substring(0, 4);
                    baseUrl = `https://${prefix}.api.greenapi.com`;
                }
                const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.token}`;

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                const data = await response.json();

                if (response.ok && data.stateInstance === 'authorized') {
                    if (request.status === 'approved') {
                        const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
                        await checkWhatsAppNumberLimit(request.merchantId);

                        // Auto-derive api_url for new instance
                        let instanceApiUrl = request.apiUrl || 'https://api.greenapi.com';
                        if (instanceApiUrl === 'https://api.green-api.com' || instanceApiUrl === 'https://api.greenapi.com') {
                          const prefix = request.instanceId.substring(0, 4);
                          instanceApiUrl = `https://${prefix}.api.greenapi.com`;
                        }

                        await createWhatsAppInstance({
                            merchantId: request.merchantId,
                            instanceId: request.instanceId,
                            token: request.token,
                            apiUrl: instanceApiUrl,
                            status: 'active',
                            isPrimary: true,
                            connectedAt: new Date(),
                        });

                        await completeWhatsAppRequest(request.id, data.phoneNumber || '');
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
