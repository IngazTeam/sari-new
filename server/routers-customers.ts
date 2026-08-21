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
import {
  getCustomerByPhone,
  getCustomerStats,
  getCustomersByMerchant,
  getMerchantByUserId,
  searchCustomers,
} from './db';

export const customersRouter = router({
    // Get all customers with stats
    list: protectedProcedure
        .input(z.object({
            search: z.string().optional(),
            status: z.enum(['all', 'active', 'new', 'inactive']).optional(),
        }))
        .query(async ({ ctx, input }) => {
            // FIX #4: Use merchantId, not userId
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            let customers = await getCustomersByMerchant(merchant.id);

            // Apply search filter
            if (input.search) {
                customers = await searchCustomers(merchant.id, input.search);
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
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const customer = await getCustomerByPhone(merchant.id, input.customerPhone);
            if (!customer) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'العميل غير موجود' });
            }
            return customer;
        }),

    // Get customer statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return await getCustomerStats(merchant.id);
    }),

    // Export customers data
    export: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const customers = await getCustomersByMerchant(merchant.id);
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

    exportCsv: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const customers = await getCustomersByMerchant(merchant.id);
        const { buildCsv } = await import('./utils/csv');
        const data = buildCsv(
            ['الاسم', 'رقم الجوال', 'عدد الطلبات', 'إجمالي المشتريات', 'نقاط الولاء', 'الحالة', 'آخر تفاعل'],
            customers.map(customer => [
                customer.customerName || 'غير معروف',
                customer.customerPhone,
                customer.orderCount || 0,
                customer.totalSpent || 0,
                customer.loyaltyPoints || 0,
                customer.status === 'active' ? 'نشط' : customer.status === 'new' ? 'جديد' : 'غير نشط',
                customer.lastMessageAt ? new Date(customer.lastMessageAt).toISOString() : '',
            ]),
        );

        return {
            filename: `customers-${merchant.id}-${new Date().toISOString().slice(0, 10)}.csv`,
            mimeType: 'text/csv;charset=utf-8',
            count: customers.length,
            data,
        };
    }),
});

export type CustomersRouter = typeof customersRouter;
