/**
 * Sari Brain Management Router
 * Manages knowledge sources, brain reset, and activity logging
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// Activity log helper — logs brain events via raw SQL (table created lazily)
export async function logBrainActivity(merchantId: number, actionType: string, description: string, details?: any) {
  try {
    const dbConn = await db.getDb();
    if (!dbConn) return;

    // Ensure table exists (safe to call repeatedly — CREATE TABLE IF NOT EXISTS)
    await (dbConn as any).execute(`
      CREATE TABLE IF NOT EXISTS sari_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_date (merchant_id, created_at DESC)
      )
    `);

    await (dbConn as any).execute(
      `INSERT INTO sari_activity_log (merchant_id, action_type, description, details) VALUES (?, ?, ?, ?)`,
      [merchantId, actionType, description, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('[SariBrain] Failed to log activity:', error);
  }
}

export const sariBrainRouter = router({
  // Get all knowledge sources for the merchant
  getSources: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const sources: any[] = [];

    // 1. Knowledge Document (uploaded PDF/DOCX)
    const knowledgeDoc = await db.getKnowledgeDocByMerchantId(merchant.id);
    if (knowledgeDoc) {
      sources.push({
        id: `doc-${knowledgeDoc.id}`,
        type: 'document',
        icon: '📄',
        name: knowledgeDoc.fileName || 'ملف تعريفي',
        status: knowledgeDoc.extractionStatus,
        hasContent: !!knowledgeDoc.extractedText,
        contentLength: knowledgeDoc.extractedText?.length || 0,
        date: knowledgeDoc.uploadedAt,
        deletable: true,
      });
    }

    // 2. Products
    const products = await db.getProductsByMerchantId(merchant.id);
    if (products.length > 0) {
      sources.push({
        id: `products-${merchant.id}`,
        type: 'products',
        icon: '🛍️',
        name: `قائمة المنتجات (${products.length} منتج)`,
        status: 'active',
        hasContent: true,
        contentLength: products.length,
        date: products[0]?.createdAt || new Date().toISOString(),
        deletable: true,
      });
    }

    // 3. Website Analysis
    try {
      const dbConn = await db.getDb();
      if (dbConn) {
        const [analyses] = await (dbConn as any).execute(
          `SELECT id, url, title, industry, analyzed_at, overall_score FROM website_analyses WHERE merchant_id = ? ORDER BY analyzed_at DESC LIMIT 1`,
          [merchant.id]
        );
        if (analyses && (analyses as any[]).length > 0) {
          const analysis = (analyses as any[])[0];
          sources.push({
            id: `website-${analysis.id}`,
            type: 'website',
            icon: '🌐',
            name: analysis.title || analysis.url || 'تحليل الموقع',
            status: 'active',
            hasContent: true,
            contentLength: 1,
            date: analysis.analyzed_at,
            deletable: true,
            meta: { url: analysis.url, industry: analysis.industry, score: analysis.overall_score },
          });
        }
      }
    } catch (e) {
      // website_analyses table may not exist — skip silently
    }

    // 4. Merchant Settings (non-deletable)
    sources.push({
      id: `settings-${merchant.id}`,
      type: 'settings',
      icon: '⚙️',
      name: `إعدادات المتجر (${merchant.businessName})`,
      status: 'active',
      hasContent: true,
      contentLength: 1,
      date: merchant.createdAt,
      deletable: false,
    });

    return sources;
  }),

  // Delete a specific knowledge source
  deleteSource: protectedProcedure
    .input(z.object({
      sourceId: z.string(),
      sourceType: z.enum(['document', 'products', 'website']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      switch (input.sourceType) {
        case 'document': {
          await db.deleteKnowledgeDocsByMerchantId(merchant.id);
          await logBrainActivity(merchant.id, 'document_deleted', 'تم حذف الملف التعريفي');
          break;
        }
        case 'products': {
          const count = (await db.getProductsByMerchantId(merchant.id)).length;
          await db.deleteAllProductsByMerchantId(merchant.id);
          await logBrainActivity(merchant.id, 'products_deleted', `تم حذف ${count} منتج`, { count });
          break;
        }
        case 'website': {
          try {
            const dbConn = await db.getDb();
            if (dbConn) {
              await (dbConn as any).execute(
                `DELETE FROM website_analyses WHERE merchant_id = ?`,
                [merchant.id]
              );
            }
          } catch (e) {
            console.error('[SariBrain] Failed to delete website analysis:', e);
          }
          await logBrainActivity(merchant.id, 'website_deleted', 'تم حذف تحليل الموقع');
          break;
        }
        default:
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع المصدر غير صالح' });
      }

      return { success: true };
    }),

  // Full brain reset
  resetBrain: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    let deletedSources: string[] = [];

    // Delete knowledge documents
    try {
      await db.deleteKnowledgeDocsByMerchantId(merchant.id);
      deletedSources.push('document');
    } catch (e) { /* skip */ }

    // Delete all products
    try {
      await db.deleteAllProductsByMerchantId(merchant.id);
      deletedSources.push('products');
    } catch (e) { /* skip */ }

    // Delete website analyses
    try {
      const dbConn = await db.getDb();
      if (dbConn) {
        await (dbConn as any).execute(
          `DELETE FROM website_analyses WHERE merchant_id = ?`,
          [merchant.id]
        );
        deletedSources.push('website');
      }
    } catch (e) { /* skip */ }

    await logBrainActivity(merchant.id, 'brain_reset', 'تم إعادة ضبط عقل ساري بالكامل', { deletedSources });

    return { success: true, deletedSources };
  }),

  // Get activity log
  getActivityLog: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        const dbConn = await db.getDb();
        if (!dbConn) return [];

        // Ensure table exists
        await (dbConn as any).execute(`
          CREATE TABLE IF NOT EXISTS sari_activity_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            merchant_id INT NOT NULL,
            action_type VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            details JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_merchant_date (merchant_id, created_at DESC)
          )
        `);

        const [rows] = await (dbConn as any).execute(
          `SELECT id, action_type, description, details, created_at FROM sari_activity_log WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
          [merchant.id, input?.limit || 50]
        );

        return (rows as any[]).map((row: any) => ({
          id: row.id,
          actionType: row.action_type,
          description: row.description,
          details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : null,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error('[SariBrain] Failed to get activity log:', error);
        return [];
      }
    }),
});

export type SariBrainRouter = typeof sariBrainRouter;
