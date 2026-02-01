/**
 * Invoices tRPC Router
 * Handles invoice listing, details, and PDF generation/download
 */
import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import * as db from './db';
import { generateInvoicePDF } from './invoices/generator';

export const invoicesRouter = router({
    // List all invoices (admin only)
    list: protectedProcedure
        .input(z.object({
            status: z.enum(['all', 'draft', 'sent', 'paid', 'cancelled']).optional().default('all'),
            search: z.string().optional(),
            limit: z.number().min(1).max(100).optional().default(50),
            offset: z.number().min(0).optional().default(0),
        }))
        .query(async ({ ctx, input }) => {
            // Get all invoices using db function
            const allInvoices = await db.getAllInvoices({
                status: input.status !== 'all' ? input.status : undefined,
                limit: input.limit,
                offset: input.offset,
            });

            return allInvoices;
        }),

    // Get invoice by ID
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const invoice = await db.getInvoiceById(input.id);

            if (!invoice) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Invoice not found',
                });
            }

            // Get related data
            const merchant = await db.getMerchantById(invoice.merchantId);
            const payment = await db.getPaymentById(invoice.paymentId);

            let plan = null;
            if (invoice.subscriptionId) {
                const subscription = await db.getSubscriptionById(invoice.subscriptionId);
                if (subscription) {
                    plan = await db.getPlanById(subscription.planId);
                }
            }

            return {
                ...invoice,
                merchant,
                payment,
                plan,
            };
        }),

    // Get invoices for current merchant
    myInvoices: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);

        if (!merchant) {
            return [];
        }

        return await db.getInvoicesByMerchantId(merchant.id);
    }),

    // Get invoice statistics
    getStats: protectedProcedure.query(async () => {
        const stats = await db.getInvoiceStats();
        return stats;
    }),

    // Generate/regenerate PDF for invoice
    generatePDF: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            // Only admins can regenerate PDFs
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Admin access required',
                });
            }

            const invoice = await db.getInvoiceById(input.id);

            if (!invoice) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Invoice not found',
                });
            }

            // Generate PDF
            const pdfResult = await generateInvoicePDF(invoice as any);

            if (!pdfResult) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to generate PDF',
                });
            }

            // Update invoice with PDF info
            await db.updateInvoice(input.id, {
                pdfPath: pdfResult.pdfPath,
                pdfUrl: pdfResult.pdfUrl,
            });

            return {
                success: true,
                pdfUrl: pdfResult.pdfUrl,
            };
        }),

    // Update invoice status (admin only)
    updateStatus: protectedProcedure
        .input(z.object({
            id: z.number(),
            status: z.enum(['draft', 'sent', 'paid', 'cancelled']),
        }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== 'admin') {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Admin access required',
                });
            }

            await db.updateInvoice(input.id, { status: input.status });

            return { success: true };
        }),
});

export type InvoicesRouter = typeof invoicesRouter;
