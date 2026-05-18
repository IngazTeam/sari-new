/**
 * Orders Router Module
 * Handles order management, creation, and status updates
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  cancelOrder,
  getMerchantById,
  getOrderById,
  getOrderStats,
  getOrdersByMerchantId,
  getOrdersWithFilters,
  updateOrderStatus,
} from './db';

export const ordersRouter = router({
    // Create order from chat
    createFromChat: protectedProcedure
        .input(z.object({
            merchantId: z.number(),
            customerPhone: z.string(),
            customerName: z.string(),
            message: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { parseOrderMessage, createOrderFromChat, generateOrderConfirmationMessage, generateGiftOrderConfirmationMessage } = await import('./automation/order-from-chat');

            const parsedOrder = await parseOrderMessage(input.message, input.merchantId);
            if (!parsedOrder || parsedOrder.products.length === 0) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'لم نتمكن من فهم الطلب. يرجى توضيح المنتجات المطلوبة.'
                });
            }

            const result = await createOrderFromChat(
                input.merchantId,
                input.customerPhone,
                input.customerName,
                parsedOrder
            );

            if (!result) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل إنشاء الطلب'
                });
            }

            const order = await getOrderById(result.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const items = JSON.parse(order.items);

            const confirmationMessage = order.isGift
                ? generateGiftOrderConfirmationMessage(
                    order.orderNumber || '',
                    order.giftRecipientName || '',
                    items,
                    order.totalAmount,
                    result.paymentUrl || ''
                )
                : generateOrderConfirmationMessage(
                    order.orderNumber || '',
                    items,
                    order.totalAmount,
                    result.paymentUrl || ''
                );

            // Auto-sync to Google Sheets
            try {
                const { syncOrderToSheets } = await import('./sheetsSync');
                await syncOrderToSheets(result.orderId);
            } catch (error) {
                console.error('[Auto-Sync] Failed to sync order to Google Sheets:', error);
            }

            // Send new order notification
            try {
                const { notifyNewOrder } = await import('./_core/notificationService');
                await notifyNewOrder(input.merchantId, result.orderId, order.totalAmount);
            } catch (error) {
                console.error('[Notification] Failed to send new order notification:', error);
            }

            return {
                success: true,
                orderId: result.orderId,
                orderNumber: result.orderNumber,
                paymentUrl: result.paymentUrl,
                confirmationMessage
            };
        }),

    // Get order by ID
    getById: protectedProcedure
        .input(z.object({ orderId: z.number() }))
        .query(async ({ input, ctx }) => {
            const order = await getOrderById(input.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
            }

            const merchant = await getMerchantById(order.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return order;
        }),

    // List orders for merchant
    listByMerchant: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await getOrdersByMerchantId(input.merchantId);
        }),

    // Get orders with filters
    getWithFilters: protectedProcedure
        .input(z.object({
            merchantId: z.number(),
            status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            searchQuery: z.string().optional(),
            limit: z.number().min(1).max(100).optional().default(50),
            page: z.number().min(1).optional().default(1),
        }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const filters: any = {};
            if (input.status) filters.status = input.status;
            if (input.startDate) filters.startDate = new Date(input.startDate);
            if (input.endDate) filters.endDate = new Date(input.endDate);
            if (input.searchQuery) filters.searchQuery = input.searchQuery;
            filters.limit = input.limit;
            filters.offset = (input.page - 1) * input.limit;

            return await getOrdersWithFilters(input.merchantId, filters);
        }),

    // Get order statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await getOrderStats(input.merchantId);
        }),

    // Cancel order
    cancel: protectedProcedure
        .input(z.object({
            orderId: z.number(),
            reason: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const order = await getOrderById(input.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const merchant = await getMerchantById(order.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await cancelOrder(input.orderId, input.reason);

            return { success: true, message: 'تم إلغاء الطلب' };
        }),

    // Update order status
    updateStatus: protectedProcedure
        .input(z.object({
            orderId: z.number(),
            status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']),
            trackingNumber: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const order = await getOrderById(input.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const merchant = await getMerchantById(order.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await updateOrderStatus(input.orderId, input.status, input.trackingNumber);

            // FIX #9: Wrap notification in try/catch so notification error doesn't break order update
            try {
                const { sendOrderNotification } = await import('./notifications/order-notifications');
                await sendOrderNotification(
                    input.orderId,
                    order.merchantId,
                    order.customerPhone,
                    input.status,
                    {
                        customerName: order.customerName || 'عزيزي العميل',
                        storeName: merchant.businessName,
                        orderNumber: order.orderNumber || `ORD-${order.id}`,
                        total: order.totalAmount,
                        trackingNumber: input.trackingNumber,
                    }
                );
            } catch (error) {
                console.error('[Order] Failed to send status notification:', error);
            }

            return { success: true, message: 'تم تحديث حالة الطلب' };
        }),
});

export type OrdersRouter = typeof ordersRouter;
