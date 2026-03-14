/**
 * Customers Router Module
 * Handles customer management and statistics
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * 
 * FIX #4: All endpoints now use merchantId (via getMerchantByUserId) instead of
 * directly passing ctx.user.id to DB functions that expect merchantId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const customersRouter = router({
    // Get all customers with stats
    list: protectedProcedure
        .input(z.object({
            search: z.string().optional(),
            status: z.enum(['all', 'active', 'new', 'inactive']).optional(),
        }))
        .query(async ({ ctx, input }) => {
            // FIX #4: Use merchantId, not userId
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            let customers = await db.getCustomersByMerchant(merchant.id);

            // Apply search filter
            if (input.search) {
                customers = await db.searchCustomers(merchant.id, input.search);
            }

            // Apply status filter
            if (input.status && input.status !== 'all') {
                customers = customers.filter(c => c.status === input.status);
            }

            return customers;
        }),

    // Get customer by phone
    getByPhone: protectedProcedure
        .input(z.object({ customerPhone: z.string() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const customer = await db.getCustomerByPhone(merchant.id, input.customerPhone);
            if (!customer) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'العميل غير موجود' });
            }
            return customer;
        }),

    // Get customer statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return await db.getCustomerStats(merchant.id);
    }),

    // Export customers data
    export: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const customers = await db.getCustomersByMerchant(merchant.id);
        return customers.map(c => ({
            الاسم: c.customerName || 'غير معروف',
            'رقم الجوال': c.customerPhone,
            'عدد الطلبات': c.orderCount,
            'إجمالي المشتريات': c.totalSpent,
            'نقاط الولاء': c.loyaltyPoints,
            الحالة: c.status === 'active' ? 'نشط' : c.status === 'new' ? 'جديد' : 'غير نشط',
            'آخر تفاعل': new Date(c.lastMessageAt).toLocaleDateString('ar-SA'),
        }));
    }),
});

export type CustomersRouter = typeof customersRouter;
