/**
 * Integrations Router Module
 * Handles platform integrations management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getMerchantByUserId, getProductsByMerchantId, getPool } from "./db";

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
            const pool = await getPool();
            if (pool) {
                const [rows] = await pool.execute(
                    `SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = ?`,
                    [merchant.id]
                );
                customerCount = (rows as any[])?.[0]?.cnt || 0;
            }
        } catch { /* skip */ }

        return {
            source,
            isConnected: source === 'byaan' && !!connection,
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
            console.log('[connectByaan] STEP 1: Starting...');
            
            let merchant;
            try {
                merchant = await getMerchantByUserId(ctx.user.id);
                console.log('[connectByaan] STEP 2: getMerchantByUserId OK, id=', merchant?.id);
            } catch (e: any) {
                console.error('[connectByaan] STEP 2 FAILED:', e?.message, e?.stack);
                throw e;
            }
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            try {
                console.log('[connectByaan] STEP 3: importing platform-checker...');
                const { getCurrentPlatform } = await import('./integrations/platform-checker');
                console.log('[connectByaan] STEP 3: import OK, calling getCurrentPlatform...');
                const existing = await getCurrentPlatform(merchant.id);
                console.log('[connectByaan] STEP 3: getCurrentPlatform OK, existing=', existing?.platform);
                if (existing && existing.platform !== 'byaan') {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: `لديك منصة ${existing.name} مربوطة بالفعل. افصلها أولاً.`,
                    });
                }
            } catch (e: any) {
                console.error('[connectByaan] STEP 3 FAILED:', e?.message, e?.stack);
                throw e;
            }

            try {
                console.log('[connectByaan] STEP 4: importing byaan...');
                const { createByaanConnection } = await import('./integrations/byaan');
                console.log('[connectByaan] STEP 4: import OK, calling createByaanConnection...');
                const connection = await createByaanConnection(merchant.id, input.tenantDomain);
                console.log('[connectByaan] STEP 4: createByaanConnection OK');
                
                return {
                    success: true,
                    tenantDomain: input.tenantDomain,
                    connection,
                };
            } catch (e: any) {
                console.error('[connectByaan] STEP 4 FAILED:', e?.message, e?.stack);
                throw e;
            }
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

        // Try to reach the Byaan tenant
        try {
            const axios = (await import('axios')).default;
            const testUrl = `https://${connection.tenant_domain}`;
            const response = await axios.get(testUrl, {
                timeout: 10000,
                validateStatus: () => true,
                maxRedirects: 3,
            });

            const isReachable = response.status >= 200 && response.status < 500;

            // Update sync status based on test
            const { updateByaanSyncStatus } = await import('./integrations/byaan');
            if (isReachable) {
                await updateByaanSyncStatus(merchant.id, 'active');
            } else {
                await updateByaanSyncStatus(merchant.id, 'error', `Domain returned ${response.status}`);
            }

            return {
                success: isReachable,
                message: isReachable
                    ? `✅ النطاق ${connection.tenant_domain} يعمل — الربط نشط`
                    : `❌ النطاق ${connection.tenant_domain} أرجع حالة ${response.status}`,
                status: isReachable ? 'active' as const : 'error' as const,
                httpStatus: response.status,
                tenantDomain: connection.tenant_domain,
                stats: {
                    syncStatus: connection.sync_status,
                    lastSyncAt: connection.last_sync_at,
                },
            };
        } catch (e: any) {
            const { updateByaanSyncStatus } = await import('./integrations/byaan');
            await updateByaanSyncStatus(merchant.id, 'error', e?.message || 'Connection failed');

            return {
                success: false,
                message: `فشل الاتصال بـ ${connection.tenant_domain}: ${e?.message || 'خطأ غير معروف'}`,
                status: 'error' as const,
                tenantDomain: connection.tenant_domain,
            };
        }
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;

