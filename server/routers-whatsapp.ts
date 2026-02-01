/**
 * WhatsApp Integration Router
 * Extracted from routers.ts for better maintainability
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from './_core/trpc';
import * as db from './db';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx });
});

export const whatsappRouter = router({
    // Request WhatsApp connection
    requestConnection: protectedProcedure
        .input(z.object({
            countryCode: z.string(),
            phoneNumber: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // Check if merchant has an active subscription
            const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'يجب اختيار باقة اشتراك أولاً لربط رقم الواتساب'
                });
            }

            // Check if there's already a pending request
            const existingRequest = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
            if (existingRequest && existingRequest.status === 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
            }

            // Create new request
            const fullNumber = `${input.countryCode}${input.phoneNumber}`;
            const request = await db.createWhatsAppConnectionRequest({
                merchantId: merchant.id,
                countryCode: input.countryCode,
                phoneNumber: input.phoneNumber,
                fullNumber,
                status: 'pending',
            });

            // Notify admin
            const notifyOwner = await import('./_core/notification');
            await notifyOwner.notifyOwner({
                title: 'طلب ربط واتساب جديد',
                content: `التاجر ${merchant.businessName} يطلب ربط رقم الواتساب: ${fullNumber}`,
            });

            return { success: true, request };
        }),

    // Get current connection request status
    getRequestStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
    }),

    // Disconnect WhatsApp (Reset)
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const existingRequest = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
        if (!existingRequest) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'No WhatsApp connection found' });
        }

        await db.deleteWhatsAppConnectionRequest(existingRequest.id);

        const instances = await db.getWhatsAppInstancesByMerchantId(merchant.id);
        for (const instance of instances) {
            await db.deleteWhatsAppInstance(instance.id);
        }

        const notifyOwner = await import('./_core/notification');
        await notifyOwner.notifyOwner({
            title: 'فك ربط واتساب',
            content: `التاجر ${merchant.businessName} قام بفك ربط رقم الواتساب: ${existingRequest.fullNumber}`,
        });

        try {
            const { notifyWhatsAppDisconnect } = await import('./_core/notificationService');
            await notifyWhatsAppDisconnect(merchant.id);
        } catch (error) {
            console.error('[Notification] Failed to send WhatsApp disconnect notification:', error);
        }

        return { success: true };
    }),

    // Get all connection requests (Admin only)
    listRequests: adminProcedure
        .input(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }))
        .query(async ({ input }) => {
            return await db.getAllWhatsAppConnectionRequests(input.status);
        }),

    // Approve connection request (Admin only)
    approveRequest: adminProcedure
        .input(z.object({
            requestId: z.number(),
            instanceId: z.string().min(1, 'Instance ID is required'),
            apiToken: z.string().min(1, 'API Token is required'),
            apiUrl: z.string().url().optional().default('https://api.green-api.com'),
        }))
        .mutation(async ({ input, ctx }) => {
            const request = await db.getWhatsAppConnectionRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            if (request.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
            }

            const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
            await db.approveWhatsAppConnectionRequest(
                input.requestId,
                userId,
                input.instanceId,
                input.apiToken,
                input.apiUrl
            );

            // Register Webhook URL
            try {
                const { setWebhookUrl } = await import('./whatsapp');
                const baseUrl = process.env.VITE_APP_URL || 'https://sary.live';
                const webhookUrl = `${baseUrl}/api/webhooks/greenapi`;

                const webhookResult = await setWebhookUrl(
                    input.instanceId,
                    input.apiToken,
                    webhookUrl,
                    input.apiUrl
                );

                if (webhookResult.success) {
                    console.log(`Webhook URL registered successfully for instance ${input.instanceId}: ${webhookUrl}`);
                } else {
                    console.error(`Failed to register webhook URL: ${webhookResult.error}`);
                }
            } catch (webhookError) {
                console.error('Error registering webhook URL:', webhookError);
            }

            // Send notification to merchant
            try {
                await db.createNotification({
                    userId: request.merchantId,
                    title: 'تمت الموافقة على طلب ربط الواتساب',
                    message: `تمت الموافقة على طلب ربط رقم الواتساب ${request.phoneNumber}. يمكنك الآن ربط الرقم عبر مسح QR Code من لوحة التحكم.`,
                    type: 'success',
                    link: '/merchant/whatsapp',
                });
            } catch (notifError) {
                console.error('Failed to send notification to merchant:', notifError);
            }

            return { success: true };
        }),

    // Reject connection request (Admin only)
    rejectRequest: adminProcedure
        .input(z.object({ requestId: z.number(), reason: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const request = await db.getWhatsAppConnectionRequestById(input.requestId);
            if (!request) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
            }

            if (request.status !== 'pending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
            }

            const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
            await db.rejectWhatsAppConnectionRequest(input.requestId, userId, input.reason);

            return { success: true };
        }),

    // Get QR Code for connection
    getQRCode: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const request = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
        if (!request) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'No WhatsApp request found' });
        }

        if (request.status !== 'approved' && request.status !== 'connected') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request not approved yet' });
        }

        if (!request.instanceId || !request.apiToken) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance credentials not set by admin' });
        }

        try {
            const axios = await import('axios');
            const instancePrefix = request.instanceId.substring(0, 4);
            const baseUrl = `https://${instancePrefix}.api.greenapi.com`;
            const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.apiToken}`;

            const response = await axios.default.get(url, { timeout: 15000 });

            if (response.data && response.data.type === 'qrCode') {
                return {
                    success: true,
                    qrCode: response.data.message,
                    message: 'Scan this QR code with WhatsApp',
                };
            } else if (response.data && response.data.type === 'alreadyLogged') {
                return {
                    success: true,
                    alreadyConnected: true,
                    message: 'WhatsApp is already connected',
                };
            } else {
                throw new Error('Unexpected response from Green API');
            }
        } catch (error: any) {
            console.error('[QR Code] Error:', error.message);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: error.response?.data?.message || error.message || 'Failed to get QR code',
            });
        }
    }),

    // Get connection status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const request = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
        if (!request || !request.instanceId || !request.apiToken) {
            return { connected: false, status: 'no_credentials' };
        }

        if (request.status !== 'approved' && request.status !== 'connected') {
            return { connected: false, status: request.status };
        }

        try {
            const axios = await import('axios');
            const instancePrefix = request.instanceId.substring(0, 4);
            const baseUrl = `https://${instancePrefix}.api.greenapi.com`;
            const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.apiToken}`;

            const response = await axios.default.get(url, { timeout: 10000 });

            if (response.data && response.data.stateInstance === 'authorized') {
                if (request.status !== 'connected') {
                    await db.updateWhatsAppConnectionRequest(request.id, {
                        status: 'connected',
                        connectedAt: new Date(),
                    });
                }
                return {
                    connected: true,
                    status: 'authorized',
                    phoneNumber: response.data.phoneNumber,
                };
            } else {
                return {
                    connected: false,
                    status: response.data?.stateInstance || 'unknown',
                };
            }
        } catch (error: any) {
            console.error('[WhatsApp Status] Error:', error.message);
            return {
                connected: false,
                status: 'error',
                error: error.message,
            };
        }
    }),

    // Send text message
    sendMessage: protectedProcedure
        .input(z.object({
            phoneNumber: z.string(),
            message: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const whatsapp = await import('./whatsapp');
            return await whatsapp.sendTextMessage(input.phoneNumber, input.message);
        }),

    // Send image message
    sendImage: protectedProcedure
        .input(z.object({
            phoneNumber: z.string(),
            imageUrl: z.string(),
            caption: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const whatsapp = await import('./whatsapp');
            return await whatsapp.sendImageMessage(input.phoneNumber, input.imageUrl, input.caption);
        }),

    // Test connection with custom credentials
    testConnection: protectedProcedure
        .input(z.object({
            instanceId: z.string(),
            token: z.string(),
        }))
        .mutation(async ({ input }) => {
            const axios = await import('axios');
            const instancePrefix = input.instanceId.substring(0, 4);
            const url = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}/getStateInstance/${input.token}`;

            const requestDetails = {
                url,
                method: 'GET',
                instanceId: input.instanceId,
                tokenPreview: input.token.substring(0, 10) + '...',
                timestamp: new Date().toISOString(),
            };

            console.log('[Green API Test] Request Details:', JSON.stringify(requestDetails, null, 2));

            try {
                const response = await axios.default.get(url, { timeout: 15000 });
                console.log('[Green API Test] Response:', response.data);

                const isConnected = response.data.stateInstance === 'authorized';
                return {
                    success: isConnected,
                    status: response.data.stateInstance || 'unknown',
                    phoneNumber: response.data.phoneNumber,
                    debug: {
                        url,
                        method: 'GET',
                        responseStatus: response.status,
                        responseData: response.data,
                    },
                };
            } catch (error: any) {
                const errorDetails = {
                    url,
                    method: 'GET',
                    errorMessage: error.message,
                    errorCode: error.code,
                    responseStatus: error.response?.status,
                    responseStatusText: error.response?.statusText,
                    responseData: error.response?.data,
                    timestamp: new Date().toISOString(),
                };

                console.error('[Green API Test] Error Details:', JSON.stringify(errorDetails, null, 2));

                let errorMessage = 'فشل الاتصال';
                if (error.response?.status === 401 || error.response?.status === 403) {
                    errorMessage = 'Instance ID أو Token غير صحيح';
                } else if (error.response?.status === 404) {
                    errorMessage = 'Instance غير موجود';
                } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    errorMessage = 'انتهى وقت الاتصال';
                }

                return {
                    success: false,
                    status: 'error',
                    error: errorMessage,
                    debug: errorDetails,
                };
            }
        }),

    // Send test message
    sendTestMessage: protectedProcedure
        .input(z.object({
            instanceId: z.string(),
            token: z.string(),
            phoneNumber: z.string(),
            message: z.string(),
        }))
        .mutation(async ({ input }) => {
            const axios = await import('axios');
            const instancePrefix = input.instanceId.substring(0, 4);
            const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}`;

            const response = await axios.default.post(`${baseURL}/sendMessage/${input.token}`, {
                chatId: `${input.phoneNumber}@c.us`,
                message: input.message,
            });

            return response.data;
        }),

    // Send test image
    sendTestImage: protectedProcedure
        .input(z.object({
            instanceId: z.string(),
            token: z.string(),
            phoneNumber: z.string(),
            imageUrl: z.string(),
            caption: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const axios = await import('axios');
            const instancePrefix = input.instanceId.substring(0, 4);
            const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}`;

            const response = await axios.default.post(`${baseURL}/sendFileByUrl/${input.token}`, {
                chatId: `${input.phoneNumber}@c.us`,
                urlFile: input.imageUrl,
                fileName: 'image.jpg',
                caption: input.caption || '',
            });

            return response.data;
        }),

    // Save WhatsApp instance
    saveInstance: protectedProcedure
        .input(z.object({
            instanceId: z.string(),
            token: z.string(),
            phoneNumber: z.string().optional(),
            expiresAt: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const existing = await db.getWhatsAppInstanceByInstanceId(input.instanceId);

            if (!existing) {
                const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
                await checkWhatsAppNumberLimit(merchant.id);
            }
            if (existing && existing.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already in use' });
            }

            if (existing) {
                await db.updateWhatsAppInstance(existing.id, {
                    token: input.token,
                    phoneNumber: input.phoneNumber,
                    status: 'active',
                    connectedAt: new Date(),
                    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
                });
                return { success: true, instanceId: existing.id };
            } else {
                const instance = await db.createWhatsAppInstance({
                    merchantId: merchant.id,
                    instanceId: input.instanceId,
                    token: input.token,
                    phoneNumber: input.phoneNumber,
                    status: 'active',
                    isPrimary: true,
                    connectedAt: new Date(),
                    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
                });
                return { success: true, instanceId: instance?.id };
            }
        }),

    // Get primary WhatsApp instance
    getPrimaryInstance: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getPrimaryWhatsAppInstance(merchant.id);
    }),

    // Get all WhatsApp instances
    listInstances: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getWhatsAppInstancesByMerchantId(merchant.id);
    }),

    // Delete WhatsApp instance
    deleteInstance: protectedProcedure
        .input(z.object({ instanceId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const instance = await db.getWhatsAppInstanceById(input.instanceId);
            if (!instance || instance.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
            }

            await db.deleteWhatsAppInstance(input.instanceId);
            return { success: true };
        }),
});
