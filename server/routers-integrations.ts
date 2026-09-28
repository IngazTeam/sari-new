/**
 * Integrations Router Module
 * Handles platform integrations management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getMerchantByUserId, getProductsByMerchantId } from "./db";
import { getIntegrationAudienceCount } from "./integrations/audience-count";

export const integrationsRouter = router({
    // Get current connected platform
    getCurrentPlatform: protectedProcedure.query(async ({ ctx }) => {
        const { getCurrentPlatform } = await import('./integrations/platform-checker');
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await getCurrentPlatform(merchant.id);
    }),

    // Get all connected platforms (for debugging)
    getAllConnectedPlatforms: protectedProcedure.query(async ({ ctx }) => {
        const { getAllConnectedPlatforms } = await import('./integrations/platform-checker');
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await getAllConnectedPlatforms(merchant.id);
    }),

    // ═══════════════════════════════════════════════════════════════
    // Byaan Integration — Session-based (no API key needed)
    // ═══════════════════════════════════════════════════════════════

    /** Get Byaan connection status + sync stats for the current merchant */
    getByaanStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { getByaanConnection, getIntegrationSource, getTerminology } = await import('./integrations/byaan');
        const source = await getIntegrationSource(merchant.id);
        const connection = await getByaanConnection(merchant.id);
        const terminology = getTerminology(source);

        // Get product + customer counts
        const products = await getProductsByMerchantId(merchant.id);
        let customerCount = 0;
        try {
            customerCount = await getIntegrationAudienceCount(merchant.id, source);
        } catch { /* skip */ }

        return {
            source,
            isConnected: source === 'byaan' && Boolean(connection?.is_active && connection?.verified_at),
            verificationPending: Boolean(connection && !connection.verified_at),
            terminology,
            byaan: connection ? {
                tenantDomain: connection.tenant_domain,
                syncStatus: connection.sync_status,
                lastSyncAt: connection.last_sync_at,
                hasSyncErrors: !!connection.sync_errors,
            } : null,
            stats: {
                products: products.length,
                customers: customerCount,
            },
        };
    }),

    /** Connect this merchant to a Byaan tenant domain */
    connectByaan: protectedProcedure
        .input(z.object({
            tenantDomain: z.string().min(3).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'نطاق غير صالح'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Check no other platform is connected
            const { getCurrentPlatform } = await import('./integrations/platform-checker');
            const existing = await getCurrentPlatform(merchant.id);
            if (existing && existing.platform !== 'byaan') {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: `لديك منصة ${existing.name} مربوطة بالفعل. افصلها أولاً.`,
                });
            }

            const { createByaanConnection } = await import('./integrations/byaan');
            const connection = await createByaanConnection(merchant.id, input.tenantDomain);

            const connected = Boolean((connection as any)?.is_active && (connection as any)?.verified_at);
            return {
                success: connected,
                pendingVerification: !connected,
                tenantDomain: input.tenantDomain,
                connection,
            };
        }),

    /** Test Byaan connection — verify the tenant domain is reachable */
    testByaanConnection: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { getByaanConnection } = await import('./integrations/byaan');
        const connection = await getByaanConnection(merchant.id);

        if (!connection) {
            return { success: false, message: 'لا يوجد ربط مع بيان لهذا الحساب', status: 'not_connected' as const };
        }

        if (!connection.is_active || !connection.verified_at) {
            return {
                success: false,
                message: 'النطاق مسجل لكنه غير موثق. يجب أن يجيب تيننت بيان عن تحدي إثبات الملكية الموقع.',
                status: 'pending_verification' as const,
            };
        }

        const { getByaanHealth } = await import('./integrations/byaan');
        const health = await getByaanHealth(merchant.id);
        // Health never changes lastSyncAt: only acknowledged data sync does.
        return {
            success: health.success,
            message: health.success ? 'تم التحقق من اتصال بيان الموقّع' : 'تعذر التحقق من واجهة بيان الموقّعة',
            status: health.success ? 'active' as const : 'error' as const,
            tenantDomain: connection.tenant_domain,
            capabilities: health.capabilities,
            stats: { syncStatus: connection.sync_status, lastSyncAt: connection.last_sync_at },
        };
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;

