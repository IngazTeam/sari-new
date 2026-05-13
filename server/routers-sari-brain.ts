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
// PEN-BRAIN-08 FIX: Separate rate limiter for test endpoint
const testRateLimit: Record<number, number> = {};

function checkRateLimit(map: Record<number, number>, merchantId: number, cooldownMs: number): void {
  const now = Date.now();
  const lastAction = map[merchantId];
  if (lastAction && now - lastAction < cooldownMs) {
    const waitSec = Math.ceil((cooldownMs - (now - lastAction)) / 1000);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `يرجى الانتظار ${waitSec} ثانية قبل تكرار هذا الإجراء`,
    });
  }
  map[merchantId] = now;

  // PEN-BRAIN-10 FIX: Cleanup stale entries every 100 calls
  const keys = Object.keys(map);
  if (keys.length > 500) {
    const cutoff = now - 120_000; // 2 min TTL
    for (const k of keys) {
      if (map[Number(k)] < cutoff) delete map[Number(k)];
    }
  }
}

function checkDestructiveRateLimit(merchantId: number, cooldownMs: number = 30_000): void {
  checkRateLimit(destructiveRateLimit, merchantId, cooldownMs);
}
function checkTestRateLimit(merchantId: number, cooldownMs: number = 5_000): void {
  checkRateLimit(testRateLimit, merchantId, cooldownMs);
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

    // 2. Products — PERF-02 FIX: use COUNT instead of fetching all rows
    const productCount = await db.getProductCountByMerchantId(merchant.id);
    if (productCount > 0) {
      sources.push({
        id: `products-${merchant.id}`,
        type: 'products',
        icon: '🛍️',
        name: `قائمة المنتجات (${productCount} منتج)`,
        status: 'active',
        hasContent: true,
        contentLength: productCount,
        date: new Date().toISOString(),
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

    // 4. FAQs (custom Q&A)
    try {
      const faqs = await db.getExtractedFaqsByMerchantId(merchant.id);
      if (faqs.length > 0) {
        const activeFaqs = faqs.filter((f: any) => f.isActive);
        sources.push({
          id: `faqs-${merchant.id}`,
          type: 'faqs',
          icon: '❓',
          name: `أسئلة شائعة (${faqs.length} سؤال — ${activeFaqs.length} نشط)`,
          status: 'active',
          hasContent: true,
          contentLength: faqs.length,
          date: faqs[0]?.extractedAt || new Date().toISOString(),
          deletable: true,
        });
      }
    } catch (e) { /* skip */ }

    // 5. Merchant Settings (non-deletable)
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
      sourceType: z.enum(['document', 'products', 'website', 'faqs']),
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
          // PERF-02 FIX: use COUNT instead of fetching all rows
          const count = await db.getProductCountByMerchantId(merchant.id);
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
        case 'faqs': {
          const faqCount = (await db.getExtractedFaqsByMerchantId(merchant.id)).length;
          if (faqCount === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'لا توجد أسئلة شائعة للحذف' });
          }
          await db.deleteAllExtractedFaqs(merchant.id);
          await logBrainActivity(merchant.id, 'faqs_deleted', `تم حذف ${faqCount} سؤال شائع`, { count: faqCount });
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

    // Delete all FAQs
    try {
      await db.deleteAllExtractedFaqs(merchant.id);
      deletedSources.push('faqs');
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

  // Re-analyze merchant's website
  reanalyzeWebsite: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    // Separate rate limiter — 20s cooldown (not shared with delete/reset)
    checkTestRateLimit(merchant.id, 20_000);

    // Schema column is websiteUrl, not website
    const websiteUrl = (merchant as any).websiteUrl || (merchant as any).website;
    if (!websiteUrl) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد رابط موقع في إعدادات المتجر. أضف رابط الموقع أولاً من صفحة الإعدادات.' });
    }

    try {
      const { analyzeWebsite } = await import('./_core/websiteAnalyzer');
      const result = await analyzeWebsite(websiteUrl);

      // Save to DB
      const dbConn = await db.getDb();
      if (dbConn) {
        // Delete old analyses first
        await (dbConn as any).execute(
          `DELETE FROM website_analyses WHERE merchant_id = ?`,
          [merchant.id]
        );

        // Insert new
        await (dbConn as any).execute(
          `INSERT INTO website_analyses (merchant_id, url, title, description, industry, language, seo_score, overall_score, status, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())`,
          [
            merchant.id,
            websiteUrl,
            result.title || '',
            result.description || '',
            result.industry || '',
            result.language || 'ar',
            result.seoScore || 0,
            result.overallScore || 0,
          ]
        );
      }

      await logBrainActivity(merchant.id, 'website_analyzed', `تم إعادة تحليل الموقع: ${websiteUrl}`, {
        url: websiteUrl,
        title: result.title,
        industry: result.industry,
        score: result.overallScore,
      });

      return { success: true, title: result.title, industry: result.industry, score: result.overallScore };
    } catch (error: any) {
      if (error?.code === 'TOO_MANY_REQUESTS') throw error;
      console.error('[SariBrain] Website re-analysis failed:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تحليل الموقع. تأكد من صحة الرابط وحاول مرة أخرى.' });
    }
  }),

  // Get brain summary — used by AI prompt builder
  getBrainSummary: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const sources = {
      hasDocument: false,
      hasProducts: false,
      hasWebsite: false,
      documentName: '',
      productCount: 0,
      websiteUrl: '',
    };

    const doc = await db.getKnowledgeDocByMerchantId(merchant.id);
    if (doc && doc.extractionStatus === 'completed') {
      sources.hasDocument = true;
      sources.documentName = doc.fileName || '';
    }

    // PERF-02 FIX: use COUNT instead of fetching all rows
    const prodCount = await db.getProductCountByMerchantId(merchant.id);
    if (prodCount > 0) {
      sources.hasProducts = true;
      sources.productCount = prodCount;
    }

    try {
      const dbConn = await db.getDb();
      if (dbConn) {
        const [analyses] = await (dbConn as any).execute(
          `SELECT url FROM website_analyses WHERE merchant_id = ? LIMIT 1`,
          [merchant.id]
        );
        if (analyses && (analyses as any[]).length > 0) {
          sources.hasWebsite = true;
          sources.websiteUrl = (analyses as any[])[0].url || '';
        }
      }
    } catch (e) { /* skip */ }

    return sources;
  }),

  // ════════════════════════════════════════════════════════════════
  // Test Sari — Let merchant ask a test question and see the response
  // ════════════════════════════════════════════════════════════════
  testSari: protectedProcedure
    .input(z.object({
      question: z.string().min(1).max(500, 'السؤال طويل جداً'),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-08 FIX: Separate rate limiter for test endpoint (5s cooldown)
      checkTestRateLimit(merchant.id, 5_000);

      try {
        const { chatWithSari } = await import('./ai/sari-personality');
        const response = await chatWithSari({
          merchantId: merchant.id,
          customerPhone: 'test-brain-preview',
          customerName: 'عميل تجريبي',
          message: input.question,
        });

        return {
          success: true,
          question: input.question,
          answer: response,
        };
      } catch (error: any) {
        if (error?.code === 'TOO_MANY_REQUESTS') throw error;
        console.error('[SariBrain] Test failed:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل الاختبار. حاول مرة أخرى.' });
      }
    }),

  // ════════════════════════════════════════════════════════════════
  // Phase 2: Smart Intake — GPT-powered file analysis before approval
  // ════════════════════════════════════════════════════════════════
  analyzeContent: protectedProcedure
    .input(z.object({
      // PEN-BRAIN-11 FIX: Require minimum 10 chars to prevent empty analysis
      content: z.string().min(10, 'المحتوى قصير جداً').max(30_000, 'المحتوى طويل جداً'),
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

        // PERF-02+05 FIX: fetch only count + first 10 names instead of all products
        const existingProductCount = await db.getProductCountByMerchantId(merchant.id);
        const existingProductSample = existingProductCount > 0
          ? await db.getProductsByMerchantId(merchant.id, { limit: 10 })
          : [];
        const existingDoc = await db.getKnowledgeDocByMerchantId(merchant.id);

        const existingContext = [
          existingProductCount > 0 ? `المنتجات الحالية (${existingProductCount}): ${existingProductSample.map(p => p.name).join('، ')}` : 'لا توجد منتجات حالية',
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

  // ════════════════════════════════════════════════════════════════
  // FAQ Management — CRUD for custom Q&A pairs
  // ════════════════════════════════════════════════════════════════
  getFaqs: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await db.getExtractedFaqsByMerchantId(merchant.id);
  }),

  createFaq: protectedProcedure
    .input(z.object({
      question: z.string().min(3).max(500),
      answer: z.string().min(3).max(2000),
      category: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-09 FIX: Cap FAQs at 50 per merchant
      const existingFaqs = await db.getExtractedFaqsByMerchantId(merchant.id);
      if (existingFaqs.length >= 50) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'الحد الأقصى 50 سؤال شائع. احذف بعض الأسئلة أولاً.' });
      }

      const id = await db.createExtractedFaq({
        merchantId: merchant.id,
        question: input.question,
        answer: input.answer,
        category: input.category || 'عام',
        isActive: true,
        useInBot: true,
      });

      await logBrainActivity(merchant.id, 'faq_created', `تم إضافة سؤال: "${input.question.substring(0, 50)}"`, {
        faqId: id,
        category: input.category,
      });

      return { success: true, id };
    }),

  updateFaq: protectedProcedure
    .input(z.object({
      id: z.number(),
      question: z.string().min(3).max(500).optional(),
      answer: z.string().min(3).max(2000).optional(),
      category: z.string().max(100).optional(),
      isActive: z.boolean().optional(),
      useInBot: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-07 FIX: Verify FAQ ownership before update
      const merchantFaqs = await db.getExtractedFaqsByMerchantId(merchant.id);
      if (!merchantFaqs.some((f: any) => f.id === input.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن تعديل سؤال لا يخصك' });
      }

      const { id, ...data } = input;
      await db.updateExtractedFaq(id, data);
      await logBrainActivity(merchant.id, 'faq_updated', `تم تحديث سؤال رقم ${id}`);

      return { success: true };
    }),

  deleteFaq: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-07 FIX: Verify FAQ ownership before delete
      const ownedFaqs = await db.getExtractedFaqsByMerchantId(merchant.id);
      if (!ownedFaqs.some((f: any) => f.id === input.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن حذف سؤال لا يخصك' });
      }

      await db.deleteExtractedFaq(input.id);
      await logBrainActivity(merchant.id, 'faq_deleted', `تم حذف سؤال رقم ${input.id}`);

      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════
  // API Key Management — Generate/revoke REST API keys
  // ════════════════════════════════════════════════════════════════
  generateApiKey: protectedProcedure
    .input(z.object({ label: z.string().max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const { generateApiKey } = await import('./api/rest');
      const result = await generateApiKey(merchant.id, input.label || 'Default Key');

      await logBrainActivity(merchant.id, 'api_key_created', `تم إنشاء مفتاح API: ${result.prefix}...`);

      return { success: true, key: result.key, prefix: result.prefix };
    }),

  listApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const dbConn = await db.getDb();
      if (!dbConn) return [];

      const [rows] = await (dbConn as any).execute(
        `SELECT id, key_prefix, label, is_active, last_used_at, created_at, expires_at FROM sari_api_keys WHERE merchant_id = ? ORDER BY created_at DESC`,
        [merchant.id]
      );

      return (rows as any[]).map((r: any) => ({
        id: r.id,
        prefix: r.key_prefix,
        label: r.label,
        isActive: r.is_active === 1,
        lastUsedAt: r.last_used_at,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }));
    } catch (e) {
      return [];
    }
  }),

  revokeApiKey: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        const dbConn = await db.getDb();
        if (!dbConn) throw new Error('DB error');

        // Verify ownership
        const [rows] = await (dbConn as any).execute(
          `SELECT id FROM sari_api_keys WHERE id = ? AND merchant_id = ?`,
          [input.keyId, merchant.id]
        );
        if (!rows || (rows as any[]).length === 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن إلغاء مفتاح لا يخصك' });
        }

        await (dbConn as any).execute(
          `UPDATE sari_api_keys SET is_active = 0 WHERE id = ?`,
          [input.keyId]
        );

        await logBrainActivity(merchant.id, 'api_key_revoked', `تم إلغاء مفتاح API رقم ${input.keyId}`);

        return { success: true };
      } catch (e: any) {
        if (e?.code === 'FORBIDDEN') throw e;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إلغاء المفتاح' });
      }
    }),
});

export type SariBrainRouter = typeof sariBrainRouter;
