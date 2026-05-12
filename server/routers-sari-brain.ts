/**
 * Sari Brain Management Router
 * Manages knowledge sources, brain reset, and activity logging
 * 
 * Security Hardened: PEN-BRAIN-01 through PEN-BRAIN-06
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// ─── PEN-BRAIN-02 FIX: Flag-based table initialization ───────────────────
let _activityTableCreated = false;

async function ensureActivityTable() {
  if (_activityTableCreated) return;
  try {
    const dbConn = await db.getDb();
    if (!dbConn) return;
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
    _activityTableCreated = true;
  } catch (e) {
    console.error('[SariBrain] Failed to create activity table:', e);
  }
}

// ─── PEN-BRAIN-04 FIX: Sanitize description ───────────────────────────────
function sanitizeLogText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .substring(0, 1000); // Limit length
}

// ─── PEN-BRAIN-05 FIX: Rate limiter for destructive ops ───────────────────
const destructiveRateLimit: Record<number, number> = {};
function checkDestructiveRateLimit(merchantId: number, cooldownMs: number = 30_000): void {
  const now = Date.now();
  const lastAction = destructiveRateLimit[merchantId];
  if (lastAction && now - lastAction < cooldownMs) {
    const waitSec = Math.ceil((cooldownMs - (now - lastAction)) / 1000);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `يرجى الانتظار ${waitSec} ثانية قبل تكرار هذا الإجراء`,
    });
  }
  destructiveRateLimit[merchantId] = now;
}

// Activity log helper — logs brain events via raw SQL (table created lazily)
export async function logBrainActivity(merchantId: number, actionType: string, description: string, details?: any) {
  try {
    await ensureActivityTable();
    const dbConn = await db.getDb();
    if (!dbConn) return;

    // PEN-BRAIN-04: Sanitize before insert
    const safeDescription = sanitizeLogText(description);
    const safeActionType = actionType.replace(/[^a-z_]/g, '').substring(0, 100);

    await (dbConn as any).execute(
      `INSERT INTO sari_activity_log (merchant_id, action_type, description, details) VALUES (?, ?, ?, ?)`,
      [merchantId, safeActionType, safeDescription, details ? JSON.stringify(details) : null]
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

      // PEN-BRAIN-05: Rate limit destructive operations (10s cooldown)
      checkDestructiveRateLimit(merchant.id, 10_000);

      switch (input.sourceType) {
        case 'document': {
          // PEN-BRAIN-03 FIX: Validate sourceId matches actual doc
          const doc = await db.getKnowledgeDocByMerchantId(merchant.id);
          if (!doc || `doc-${doc.id}` !== input.sourceId) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'المصدر غير موجود' });
          }
          await db.deleteKnowledgeDoc(doc.id);
          await logBrainActivity(merchant.id, 'document_deleted', 'تم حذف الملف التعريفي');
          break;
        }
        case 'products': {
          const count = (await db.getProductsByMerchantId(merchant.id)).length;
          if (count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'لا توجد منتجات للحذف' });
          }
          await db.deleteAllProductsByMerchantId(merchant.id);
          await logBrainActivity(merchant.id, 'products_deleted', `تم حذف ${count} منتج`, { count });
          break;
        }
        case 'website': {
          try {
            const dbConn = await db.getDb();
            if (dbConn) {
              const [result] = await (dbConn as any).execute(
                `DELETE FROM website_analyses WHERE merchant_id = ?`,
                [merchant.id]
              );
              if ((result as any)?.affectedRows === 0) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد تحليل موقع للحذف' });
              }
            }
          } catch (e: any) {
            if (e?.code === 'NOT_FOUND') throw e;
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

    // PEN-BRAIN-05: Rate limit — 60s cooldown for full reset
    checkDestructiveRateLimit(merchant.id, 60_000);

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
    // PEN-BRAIN-01 FIX: Clamp limit to 1-200
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        await ensureActivityTable();
        const dbConn = await db.getDb();
        if (!dbConn) return [];

        const [rows] = await (dbConn as any).execute(
          `SELECT id, action_type, description, details, created_at FROM sari_activity_log WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
          [merchant.id, input?.limit || 50]
        );

        // PEN-BRAIN-06: Cleanup old records (90 days TTL, async non-blocking)
        (dbConn as any).execute(
          `DELETE FROM sari_activity_log WHERE merchant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`,
          [merchant.id]
        ).catch(() => {}); // Fire-and-forget cleanup

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

  // ════════════════════════════════════════════════════════════════
  // Phase 2: Smart Intake — GPT-powered file analysis before approval
  // ════════════════════════════════════════════════════════════════
  analyzeContent: protectedProcedure
    .input(z.object({
      content: z.string().max(30_000, 'المحتوى طويل جداً'),
      contentType: z.enum(['document', 'products', 'custom']),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // Rate limit: max 3 analyses per minute per merchant
      checkDestructiveRateLimit(merchant.id, 20_000);

      try {
        const { invokeLLM } = await import('./_core/llm');

        // Get existing knowledge for conflict detection
        const existingProducts = await db.getProductsByMerchantId(merchant.id);
        const existingDoc = await db.getKnowledgeDocByMerchantId(merchant.id);

        const existingContext = [
          existingProducts.length > 0 ? `المنتجات الحالية (${existingProducts.length}): ${existingProducts.slice(0, 10).map(p => p.name).join('، ')}` : 'لا توجد منتجات حالية',
          existingDoc ? `ملف تعريفي موجود: ${existingDoc.fileName}` : 'لا يوجد ملف تعريفي',
          `اسم المتجر: ${merchant.businessName}`,
          merchant.industry ? `التخصص: ${merchant.industry}` : '',
          merchant.city ? `المدينة: ${merchant.city}` : '',
        ].filter(Boolean).join('\n');

        // Sanitize content for prompt injection
        const sanitizedContent = input.content
          .substring(0, 15000)
          .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
          .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
          .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
          .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
          .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
          .replace(/do\s+not\s+follow/gi, '[filtered]')
          .replace(/override\s+(system|all|your)/gi, '[filtered]');

        const aiResult = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `أنت محلل بيانات ذكي. مهمتك تحليل محتوى جديد يريد تاجر إضافته لبوت ساري AI.

قواعد التحليل:
1. حدد نوع المحتوى (منتجات/خدمات/سياسات/معلومات عامة)
2. اكتشف أي تعارضات مع البيانات الحالية
3. قيّم تأثير الإضافة على ردود البوت
4. اقترح 3 نماذج أسئلة وأجوبة

أجب بالعربية بتنسيق JSON فقط بهذا الشكل:
{
  "contentType": "products|services|policies|general",
  "summary": "ملخص من سطر واحد",
  "itemCount": 0,
  "conflicts": ["تعارض 1", "تعارض 2"],
  "impact": "وصف التأثير على ردود البوت",
  "riskLevel": "low|medium|high",
  "sampleQA": [
    {"question": "سؤال محتمل من عميل", "answer": "الرد المتوقع من ساري"},
    {"question": "سؤال 2", "answer": "رد 2"},
    {"question": "سؤال 3", "answer": "رد 3"}
  ],
  "recommendation": "approve|review|reject",
  "recommendationReason": "سبب التوصية"
}`
            },
            {
              role: 'user',
              content: `### بيانات التاجر الحالية:
${existingContext}

### المحتوى الجديد المراد إضافته (${input.contentType}):
اسم الملف: ${input.fileName || 'غير محدد'}

${sanitizedContent}`
            }
          ],
          maxTokens: 2000,
          responseFormat: { type: 'json_object' },
        });

        const responseText = typeof aiResult.choices[0]?.message?.content === 'string'
          ? aiResult.choices[0].message.content
          : '';

        let analysis;
        try {
          analysis = JSON.parse(responseText);
        } catch (e) {
          // If JSON parse fails, return a default analysis
          analysis = {
            contentType: input.contentType,
            summary: 'تم تحليل المحتوى',
            itemCount: 0,
            conflicts: [],
            impact: 'تأثير غير محدد',
            riskLevel: 'medium',
            sampleQA: [],
            recommendation: 'review',
            recommendationReason: 'تعذر التحليل التلقائي — يرجى المراجعة يدوياً',
          };
        }

        // Log the analysis
        await logBrainActivity(merchant.id, 'content_analyzed', `تم فحص "${input.fileName || 'محتوى جديد'}" — التوصية: ${analysis.recommendation}`, {
          fileName: input.fileName,
          contentType: input.contentType,
          riskLevel: analysis.riskLevel,
          recommendation: analysis.recommendation,
          conflictCount: analysis.conflicts?.length || 0,
        });

        return {
          success: true,
          analysis,
          tokensUsed: aiResult.usage?.total_tokens || 0,
        };
      } catch (error: any) {
        if (error?.code === 'TOO_MANY_REQUESTS') throw error;
        console.error('[SariBrain] Content analysis failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'فشل تحليل المحتوى. حاول مرة أخرى.',
        });
      }
    }),
});

export type SariBrainRouter = typeof sariBrainRouter;
