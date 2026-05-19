/**
 * Sari Brain Management Router
 * Manages knowledge sources, brain reset, and activity logging
 * 
 * Security Hardened: PEN-BRAIN-01 through PEN-BRAIN-06
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createExtractedFaq,
  createWebsiteAnalysis,
  deleteAllExtractedFaqs,
  deleteAllProductsByMerchantId,
  deleteExtractedFaq,
  deleteKnowledgeDoc,
  deleteKnowledgeDocsByMerchantId,
  deleteWebsiteAnalysis,
  getDb,
  getExtractedFaqsByMerchantId,
  getKnowledgeDocByMerchantId,
  getMerchantByUserId,
  getPool,
  getProductCountByMerchantId,
  getProductsByMerchantId,
  getWebsiteAnalysesByMerchant,
  updateExtractedFaq,
  updateWebsiteAnalysis,
} from './db';

// ─── PEN-BRAIN-02 FIX: Flag-based table initialization ───────────────────
let _activityTableCreated = false;

/**
 * Get the raw mysql2 pool for direct SQL execution.
 * CRITICAL: getDb() returns Drizzle ORM whose .execute() does NOT support
 * parameterized `?` placeholders. Use this for all raw SQL with parameters.
 */
async function getRawPool() {
  return await getPool();
}

async function ensureActivityTable() {
  if (_activityTableCreated) return;
  try {
    const pool = await getRawPool();
    if (!pool) return;
    await pool.execute(`
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

// ─── Async Analysis Status Tracker ─────────────────────────────────────
// Tracks in-progress website analyses to avoid 504 Nginx timeouts.
// The mutation returns immediately; frontend polls getAnalysisStatus.
interface AnalysisStatus {
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  currentStep?: string;  // scraping | processing | knowledge | embedding
  progress?: number;     // 0-100 real progress
  result?: any;
  error?: string;
}
const analysisStatusMap: Record<number, AnalysisStatus> = {};

// PEN-SYNC-02 FIX: Periodic cleanup of stale analysis entries (>10 min)
function cleanupAnalysisStatusMap() {
  const now = Date.now();
  const keys = Object.keys(analysisStatusMap);
  if (keys.length > 50) {
    for (const k of keys) {
      const entry = analysisStatusMap[Number(k)];
      // Remove non-running entries older than 10 minutes
      if (entry && entry.status !== 'running' && now - entry.startedAt > 600_000) {
        delete analysisStatusMap[Number(k)];
      }
      // Force-expire running entries older than 15 minutes (safety net)
      if (entry && entry.status === 'running' && now - entry.startedAt > 900_000) {
        analysisStatusMap[Number(k)] = { status: 'error', startedAt: entry.startedAt, error: 'انتهت مهلة التحليل' };
      }
    }
  }
}

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
    const dbConn = await getRawPool();
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

/**
 * UNIVERSAL tRPC Serialization Safety Net
 * MySQL returns Date objects, BLOB Buffers, BigInt, Decimal strings
 * that superjson can't serialize → "Unable to transform response".
 * This function deep-cleans ANY data for safe tRPC transmission.
 */
function sanitizeForTRPC(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Buffer || data instanceof Uint8Array) return undefined;
  if (data instanceof Date) return data.toISOString();
  if (typeof data === 'bigint') return Number(data);
  if (Array.isArray(data)) return data.map(sanitizeForTRPC);
  if (typeof data === 'object') {
    const clean: any = {};
    for (const [key, val] of Object.entries(data)) {
      // Skip binary embedding fields
      if (key === 'embedding' || key === 'questionEmbedding' || key === 'question_embedding') continue;
      const sanitized = sanitizeForTRPC(val);
      if (sanitized !== undefined) clean[key] = sanitized;
    }
    return clean;
  }
  return data;
}

/**
 * Background analysis runner — fire-and-forget.
 * Stores result in analysisStatusMap for frontend polling via getAnalysisStatus.
 */
async function runAnalysisInBackground(merchant: any, websiteUrl: string) {
  const updateProgress = (step: string, progress: number) => {
    const existing = analysisStatusMap[merchant.id];
    if (existing) { existing.currentStep = step; existing.progress = progress; }
  };
  try {
    updateProgress('scraping', 10);
    const { analyzeWebsite } = await import('./_core/websiteAnalyzer');
    updateProgress('scraping', 20);
    const result = await analyzeWebsite(websiteUrl);
    updateProgress('processing', 40);

    // Delete old analyses, create new
    try {
      const existingAnalyses = await getWebsiteAnalysesByMerchant(merchant.id);
      for (const old of existingAnalyses) { await deleteWebsiteAnalysis(old.id); }
    } catch { /* first run */ }

    const analysisId = await createWebsiteAnalysis({
      merchantId: merchant.id, url: websiteUrl,
      title: result.title || '', description: result.description || '',
      industry: result.industry || '', language: result.language || 'ar',
      seoScore: result.seoScore || 0, seoIssues: result.seoIssues || [],
      metaTags: result.metaTags || {}, performanceScore: result.performanceScore || 0,
      loadTime: result.loadTime, pageSize: result.pageSize,
      uxScore: result.uxScore || 0, mobileOptimized: result.mobileOptimized,
      hasContactInfo: result.hasContactInfo, hasWhatsapp: result.hasWhatsapp,
      contentQuality: result.contentQuality || 0, wordCount: result.wordCount || 0,
      imageCount: result.imageCount || 0, videoCount: result.videoCount || 0,
      overallScore: result.overallScore || 0, status: 'completed',
    });

    await updateWebsiteAnalysis(analysisId, {
      scrapedContent: (result._scrapedText || '') + '\n\n' + (result._enrichedText || ''),
    });

    // Save crawled pages
    if ((result as any)._crawledPages?.length > 0) {
      try {
        const dbConn = await getRawPool();
        if (dbConn) {
          await (dbConn as any).execute(`DELETE FROM discovered_pages WHERE merchant_id = ?`, [merchant.id]);
          const enumSet = new Set(['about', 'shipping', 'returns', 'faq', 'contact', 'privacy', 'terms', 'other']);
          for (const page of (result as any)._crawledPages) {
            if (!page.success) continue;
            const safeType = enumSet.has(page.pageType) ? page.pageType : 'other';
            try {
              await (dbConn as any).execute(
                `INSERT INTO discovered_pages (merchant_id, page_type, title, url, content, is_active, use_in_bot, discovered_at) VALUES (?, ?, ?, ?, ?, 1, 1, NOW())`,
                [merchant.id, safeType, (page.title || '').substring(0, 500), (page.url || '').substring(0, 1000), (page.content || '').substring(0, 65000)]
              );
            } catch { /* skip */ }
          }
        }
      } catch (e: any) { console.warn('[SariBrain] Pages save failed:', e.message); }
    }

    await logBrainActivity(merchant.id, 'website_analyzed', `تم تحليل الموقع: ${websiteUrl}`, {
      url: websiteUrl, title: result.title, score: result.overallScore,
    });

    // Knowledge Engine v4
    let evolveResult = null;
    let knowledgeError: string | null = null;
    try {
      let scrapedText = (result._scrapedText || '') + '\n' + (result._enrichedText || '');
      const profileParts: string[] = [];
      if (merchant.businessName) profileParts.push(`اسم النشاط: ${merchant.businessName}`);
      if ((merchant as any).description) profileParts.push(`الوصف: ${(merchant as any).description}`);
      if ((merchant as any).phone) profileParts.push(`هاتف: ${(merchant as any).phone}`);
      if ((merchant as any).websiteUrl) profileParts.push(`الموقع: ${(merchant as any).websiteUrl}`);
      const profileContext = profileParts.length > 0 ? `\n--- بيانات التاجر ---\n${profileParts.join('\n')}\n` : '';

      // SPA Fallback
      if (scrapedText.trim().length < 200) {
        const fb: string[] = [];
        if (result.title) fb.push(`اسم النشاط: ${result.title}`);
        if (result.description) fb.push(`وصف: ${result.description}`);
        if ((result as any)._crawledPages?.length > 0) {
          for (const page of (result as any)._crawledPages) {
            if (page.success && page.content?.trim().length > 50) {
              fb.push(`\n[${page.title}]\n${page.content.substring(0, 5000)}`);
            }
          }
        }
        const fallbackText = fb.join('\n');
        if (fallbackText.trim().length > scrapedText.trim().length) scrapedText = fallbackText;
      }

      scrapedText = profileContext + scrapedText;

      if (scrapedText.trim().length > 30) {
        updateProgress('knowledge', 60);
        const { ingestContent } = await import('./ai/knowledge-engine');
        const ingestionResult = await ingestContent(
          merchant.id, scrapedText, 'website',
          { businessName: merchant.businessName, industry: result.industry }, websiteUrl
        );
        evolveResult = ingestionResult.evolveResult;

        try { updateProgress('embedding', 85); const { embedAllSections } = await import('./ai/rag-engine'); await embedAllSections(merchant.id); } catch { /* non-blocking */ }
        try { const knowledgeDb = await import('./db/knowledge'); await knowledgeDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      } else {
        knowledgeError = 'الموقع لا يحتوي على محتوى نصي كافٍ';
      }
    } catch (keErr: any) {
      knowledgeError = keErr.message?.substring(0, 200);
    }

    // Build sales intel summary
    let salesIntelSummary = null;
    try {
      const knowledgeDb = await import('./db/knowledge');
      const allSections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
      salesIntelSummary = {
        totalSections: allSections.filter((s: any) => !['sales_intel', 'opportunities'].includes(s.section_type || s.sectionType || '')).length,
        hasIntel: !!allSections.find((s: any) => (s.section_type || s.sectionType) === 'sales_intel'),
        hasOpportunities: !!allSections.find((s: any) => (s.section_type || s.sectionType) === 'opportunities'),
      };
    } catch { /* non-blocking */ }

    updateProgress('completed', 100);
    analysisStatusMap[merchant.id] = {
      status: 'completed', startedAt: Date.now(), currentStep: 'completed', progress: 100,
      result: { success: true, title: result.title, industry: result.industry, score: result.overallScore, knowledgeEvolution: evolveResult, salesIntelSummary, knowledgeError, crawlStats: (result as any)._crawlStats || null },
    };
    console.log(`[SariBrain] ✅ Background analysis completed for merchant ${merchant.id}`);
  } catch (error: any) {
    console.error('[SariBrain] ❌ Background analysis failed:', error.message);
    let reason = error?.message?.substring(0, 150) || 'خطأ غير معروف';
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('timeout')) reason = 'الموقع لم يستجب (timeout)';
    else if (msg.includes('enotfound')) reason = 'الموقع غير موجود';
    else if (msg.includes('cloudflare') || msg.includes('403')) reason = 'الموقع محمي بجدار حماية';
    analysisStatusMap[merchant.id] = { status: 'error', startedAt: Date.now(), error: `فشل تحليل الموقع: ${reason}` };
  }
}

export const sariBrainRouter = router({
  // Get all knowledge sources for the merchant
  getSources: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const sources: any[] = [];

    // 1. Knowledge Document (uploaded PDF/DOCX)
    const knowledgeDoc = await getKnowledgeDocByMerchantId(merchant.id);
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
    const productCount = await getProductCountByMerchantId(merchant.id);
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
      const dbConn = await getRawPool();
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
      const faqs = await getExtractedFaqsByMerchantId(merchant.id);
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

    return sanitizeForTRPC(sources);
  }),

  // Delete a specific knowledge source
  deleteSource: protectedProcedure
    .input(z.object({
      sourceId: z.string(),
      sourceType: z.enum(['document', 'products', 'website', 'faqs']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-05: Rate limit destructive operations (10s cooldown)
      checkDestructiveRateLimit(merchant.id, 10_000);

      switch (input.sourceType) {
        case 'document': {
          // PEN-BRAIN-03 FIX: Validate sourceId matches actual doc
          const doc = await getKnowledgeDocByMerchantId(merchant.id);
          if (!doc || `doc-${doc.id}` !== input.sourceId) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'المصدر غير موجود' });
          }
          await deleteKnowledgeDoc(doc.id);
          // CASCADE: Delete knowledge sections from document source
          try {
            const knowledgeDb = await import('./db/knowledge');
            await knowledgeDb.deleteSectionsBySource(merchant.id, 'document');
          } catch { /* non-blocking */ }
          await logBrainActivity(merchant.id, 'document_deleted', 'تم حذف الملف التعريفي وأقسام المعرفة المرتبطة');
          break;
        }
        case 'products': {
          // PERF-02 FIX: use COUNT instead of fetching all rows
          const count = await getProductCountByMerchantId(merchant.id);
          if (count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'لا توجد منتجات للحذف' });
          }
          await deleteAllProductsByMerchantId(merchant.id);
          await logBrainActivity(merchant.id, 'products_deleted', `تم حذف ${count} منتج`, { count });
          break;
        }
        case 'website': {
          try {
            const dbConn = await getRawPool();
            if (dbConn) {
              const [result] = await (dbConn as any).execute(
                `DELETE FROM website_analyses WHERE merchant_id = ?`,
                [merchant.id]
              );
              if ((result as any)?.affectedRows === 0) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد تحليل موقع للحذف' });
              }
              // CASCADE: Delete discovered pages
              await (dbConn as any).execute(
                `DELETE FROM discovered_pages WHERE merchant_id = ?`,
                [merchant.id]
              );
            }
          } catch (e: any) {
            if (e?.code === 'NOT_FOUND') throw e;
            console.error('[SariBrain] Failed to delete website analysis:', e);
          }
          // CASCADE: Delete knowledge sections from website source
          try {
            const knowledgeDb = await import('./db/knowledge');
            await knowledgeDb.deleteSectionsBySource(merchant.id, 'website');
          } catch { /* non-blocking */ }
          await logBrainActivity(merchant.id, 'website_deleted', 'تم حذف تحليل الموقع وجميع البيانات المرتبطة');
          break;
        }
        case 'faqs': {
          const faqCount = (await getExtractedFaqsByMerchantId(merchant.id)).length;
          if (faqCount === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'لا توجد أسئلة شائعة للحذف' });
          }
          await deleteAllExtractedFaqs(merchant.id);
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
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    // PEN-BRAIN-05: Rate limit — 60s cooldown for full reset
    checkDestructiveRateLimit(merchant.id, 60_000);

    let deletedSources: string[] = [];

    // Delete knowledge documents
    try {
      await deleteKnowledgeDocsByMerchantId(merchant.id);
      deletedSources.push('document');
    } catch (e) { /* skip */ }

    // Delete all products
    try {
      await deleteAllProductsByMerchantId(merchant.id);
      deletedSources.push('products');
    } catch (e) { /* skip */ }

    // Delete website analyses + discovered pages
    try {
      const dbConn = await getRawPool();
      if (dbConn) {
        await (dbConn as any).execute(
          `DELETE FROM website_analyses WHERE merchant_id = ?`,
          [merchant.id]
        );
        await (dbConn as any).execute(
          `DELETE FROM discovered_pages WHERE merchant_id = ?`,
          [merchant.id]
        );
        deletedSources.push('website');
      }
    } catch (e) { /* skip */ }

    // Delete all FAQs
    try {
      await deleteAllExtractedFaqs(merchant.id);
      deletedSources.push('faqs');
    } catch (e) { /* skip */ }

    // Delete all knowledge sections + changelog
    try {
      const knowledgeDb = await import('./db/knowledge');
      await knowledgeDb.deleteAllSections(merchant.id);
      deletedSources.push('knowledge_sections');
    } catch (e) { /* skip */ }

    await logBrainActivity(merchant.id, 'brain_reset', 'تم إعادة ضبط عقل ساري بالكامل', { deletedSources });

    return { success: true, deletedSources };
  }),

  // Get activity log
  getActivityLog: protectedProcedure
    // PEN-BRAIN-01 FIX: Clamp limit to 1-200
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        await ensureActivityTable();
        const dbConn = await getRawPool();
        if (!dbConn) return [];

        // SEC-FIX: MySQL doesn't support LIMIT ? in prepared statements
        const safeLimit = Math.min(Math.max(1, Number(input?.limit) || 50), 200);
        const [rows] = await (dbConn as any).execute(
          `SELECT id, action_type, description, details, created_at FROM sari_activity_log WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
          [merchant.id]
        );

        // PEN-BRAIN-06: Cleanup old records (90 days TTL, async non-blocking)
        (dbConn as any).execute(
          `DELETE FROM sari_activity_log WHERE merchant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`,
          [merchant.id]
        ).catch(() => {}); // Fire-and-forget cleanup

        return sanitizeForTRPC((rows as any[]).map((row: any) => ({
          id: row.id,
          actionType: row.action_type,
          description: row.description,
          details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : null,
          createdAt: row.created_at,
        })));
      } catch (error) {
        console.error('[SariBrain] Failed to get activity log:', error);
        return [];
      }
    }),

  // Re-analyze merchant's website
  reanalyzeWebsite: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    // Separate rate limiter — 20s cooldown (not shared with delete/reset)
    checkTestRateLimit(merchant.id, 20_000);

    // Schema column is websiteUrl, not website
    const websiteUrl = (merchant as any).websiteUrl || (merchant as any).website;
    if (!websiteUrl) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد رابط موقع في إعدادات المتجر. أضف رابط الموقع أولاً من صفحة الإعدادات.' });
    }

    // Check if already running
    const existing = analysisStatusMap[merchant.id];
    if (existing && existing.status === 'running' && Date.now() - existing.startedAt < 300_000) {
      return { started: true, alreadyRunning: true };
    }

    // Mark as running and return immediately — heavy work runs in background
    analysisStatusMap[merchant.id] = { status: 'running', startedAt: Date.now() };

    // Fire-and-forget background task
    runAnalysisInBackground(merchant, websiteUrl);

    return { started: true, alreadyRunning: false };
  }),

  // Poll for async website analysis status
  getAnalysisStatus: protectedProcedure.query(async ({ ctx }) => {
    cleanupAnalysisStatusMap(); // PEN-SYNC-02: periodic bulk cleanup
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const status = analysisStatusMap[merchant.id];
    if (!status) return { status: 'idle' as const };

    // Cleanup stale entries (>5 min old and not running)
    if (Date.now() - status.startedAt > 300_000 && status.status !== 'running') {
      delete analysisStatusMap[merchant.id];
      return { status: 'idle' as const };
    }

    if (status.status === 'completed') {
      const result = status.result;
      delete analysisStatusMap[merchant.id]; // Consume once
      return { status: 'completed' as const, ...result };
    }

    if (status.status === 'error') {
      const error = status.error;
      delete analysisStatusMap[merchant.id]; // Consume once
      return { status: 'error' as const, error };
    }

    return { status: 'running' as const, elapsedMs: Date.now() - status.startedAt, currentStep: status.currentStep || 'scraping', progress: status.progress || 0 };
  }),

  // Get brain summary — used by AI prompt builder
  getBrainSummary: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const sources = {
      hasDocument: false,
      hasProducts: false,
      hasWebsite: false,
      documentName: '',
      productCount: 0,
      websiteUrl: '',
    };

    const doc = await getKnowledgeDocByMerchantId(merchant.id);
    if (doc && doc.extractionStatus === 'completed') {
      sources.hasDocument = true;
      sources.documentName = doc.fileName || '';
    }

    // PERF-02 FIX: use COUNT instead of fetching all rows
    const prodCount = await getProductCountByMerchantId(merchant.id);
    if (prodCount > 0) {
      sources.hasProducts = true;
      sources.productCount = prodCount;
    }

    try {
      const dbConn = await getRawPool();
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
      const merchant = await getMerchantByUserId(ctx.user.id);
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
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // Rate limit: max 3 analyses per minute per merchant
      checkDestructiveRateLimit(merchant.id, 20_000);

      try {
        const { invokeLLM } = await import('./_core/llm');

        // PERF-02+05 FIX: fetch only count + first 10 names instead of all products
        const existingProductCount = await getProductCountByMerchantId(merchant.id);
        const existingProductSample = existingProductCount > 0
          ? await getProductsByMerchantId(merchant.id, { limit: 10 })
          : [];
        const existingDoc = await getKnowledgeDocByMerchantId(merchant.id);

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
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return sanitizeForTRPC(await getExtractedFaqsByMerchantId(merchant.id));
  }),

  createFaq: protectedProcedure
    .input(z.object({
      question: z.string().min(3).max(500),
      answer: z.string().min(3).max(2000),
      category: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-09 FIX: Cap FAQs at 50 per merchant
      const existingFaqs = await getExtractedFaqsByMerchantId(merchant.id);
      if (existingFaqs.length >= 50) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'الحد الأقصى 50 سؤال شائع. احذف بعض الأسئلة أولاً.' });
      }

      const id = await createExtractedFaq({
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
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-07 FIX: Verify FAQ ownership before update
      const merchantFaqs = await getExtractedFaqsByMerchantId(merchant.id);
      if (!merchantFaqs.some((f: any) => f.id === input.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن تعديل سؤال لا يخصك' });
      }

      const { id, ...data } = input;
      await updateExtractedFaq(id, data);
      await logBrainActivity(merchant.id, 'faq_updated', `تم تحديث سؤال رقم ${id}`);

      return { success: true };
    }),

  deleteFaq: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-BRAIN-07 FIX: Verify FAQ ownership before delete
      const ownedFaqs = await getExtractedFaqsByMerchantId(merchant.id);
      if (!ownedFaqs.some((f: any) => f.id === input.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن حذف سؤال لا يخصك' });
      }

      await deleteExtractedFaq(input.id);
      await logBrainActivity(merchant.id, 'faq_deleted', `تم حذف سؤال رقم ${input.id}`);

      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════
  // API Key Management — Generate/revoke REST API keys
  // ════════════════════════════════════════════════════════════════
  generateApiKey: protectedProcedure
    .input(z.object({ label: z.string().max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const { generateApiKey } = await import('./api/rest');
      const result = await generateApiKey(merchant.id, input.label || 'Default Key');

      await logBrainActivity(merchant.id, 'api_key_created', `تم إنشاء مفتاح API: ${result.prefix}...`);

      return { success: true, key: result.key, prefix: result.prefix };
    }),

  listApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const dbConn = await getRawPool();
      if (!dbConn) return [];

      const [rows] = await (dbConn as any).execute(
        `SELECT id, key_prefix, label, is_active, last_used_at, created_at, expires_at FROM sari_api_keys WHERE merchant_id = ? ORDER BY created_at DESC`,
        [merchant.id]
      );

      return sanitizeForTRPC((rows as any[]).map((r: any) => ({
        id: r.id,
        prefix: r.key_prefix,
        label: r.label,
        isActive: r.is_active === 1,
        lastUsedAt: r.last_used_at,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })));
    } catch (e) {
      return [];
    }
  }),

  revokeApiKey: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        const dbConn = await getRawPool();
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

  // ═══════════════════════════════════════════
  // Website Knowledge Dashboard Endpoints
  // ═══════════════════════════════════════════

  /**
   * Get detailed website knowledge data for the dashboard
   * Returns: analysis overview, crawled pages list, categories, coverage score
   */
  getWebsiteKnowledge: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const dbConn = await getRawPool();
      if (!dbConn) return null;

      // 1. Get latest analysis — this is the primary data source
      const [analyses] = await (dbConn as any).execute(
        `SELECT id, url, title, description, industry, language, overall_score, word_count, 
                seo_score, performance_score, ux_score, content_quality,
                has_contact_info, has_whatsapp, analyzed_at, status
         FROM website_analyses WHERE merchant_id = ? ORDER BY analyzed_at DESC LIMIT 1`,
        [merchant.id]
      );
      const analysis = (analyses as any[])?.[0];
      if (!analysis) return null;

      // 2. Get discovered pages — RESILIENT: if table doesn't exist or is empty, continue with empty array
      let discoveredPages: any[] = [];
      try {
        const [pages] = await (dbConn as any).execute(
          `SELECT id, page_type, title, url, LENGTH(content) as content_length, 
                  is_active, use_in_bot, discovered_at
           FROM discovered_pages WHERE merchant_id = ? ORDER BY page_type, title`,
          [merchant.id]
        );
        discoveredPages = (pages as any[]).map((p: any) => ({
          id: p.id,
          pageType: p.page_type,
          title: p.title,
          url: p.url,
          contentLength: p.content_length || 0,
          wordCount: Math.round((p.content_length || 0) / 5), // Approximate
          isActive: !!p.is_active,
          useInBot: !!p.use_in_bot,
          discoveredAt: p.discovered_at,
        }));
      } catch (pageErr) {
        console.warn('[SariBrain] discovered_pages query failed (table may not exist yet):', (pageErr as any)?.message);
        // Continue with empty pages — dashboard will still show analysis data
      }

      // 3. Get FAQs count
      let faqs: any[] = [];
      try {
        faqs = await getExtractedFaqsByMerchantId(merchant.id);
      } catch { /* table may not exist */ }

      // 4. Calculate content categories
      const PAGE_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
        about: { label: 'من نحن', icon: '🏢' },
        contact: { label: 'تواصل معنا', icon: '📞' },
        faq: { label: 'أسئلة شائعة', icon: '❓' },
        shipping: { label: 'الشحن والتوصيل', icon: '🚚' },
        returns: { label: 'الإرجاع والاستبدال', icon: '🔄' },
        privacy: { label: 'سياسة الخصوصية', icon: '🔒' },
        terms: { label: 'الشروط والأحكام', icon: '📋' },
        services: { label: 'الخدمات', icon: '⚙️' },
        products: { label: 'المنتجات', icon: '🛍️' },
        courses: { label: 'الدورات', icon: '🎓' },
        portfolio: { label: 'الأعمال', icon: '💼' },
        content: { label: 'محتوى عام', icon: '📄' },
        other: { label: 'صفحات أخرى', icon: '📑' },
      };

      const categories = Object.entries(
        discoveredPages.reduce((acc: Record<string, number>, p: any) => {
          acc[p.pageType] = (acc[p.pageType] || 0) + 1;
          return acc;
        }, {})
      ).map(([type, count]) => ({
        type,
        count,
        ...(PAGE_TYPE_LABELS[type] || PAGE_TYPE_LABELS.other),
      }));

      // 5. Calculate Knowledge Coverage Score
      const importantTypes = ['about', 'contact', 'faq', 'shipping', 'returns'];
      const coveredTypes = importantTypes.filter(t => discoveredPages.some((p: any) => p.pageType === t));
      const typeCoverage = coveredTypes.length / importantTypes.length;
      const totalWords = analysis.word_count || 0;
      const wordCoverage = Math.min(totalWords / 2000, 1); // 2000 words = 100%
      const faqCoverage = Math.min(faqs.length / 10, 1); // 10 FAQs = 100%
      const knowledgeScore = Math.round((typeCoverage * 40 + wordCoverage * 35 + faqCoverage * 25));

      // 6. Identify what Sari can now answer about
      const coverageTopics: string[] = [];
      if (discoveredPages.some((p: any) => p.pageType === 'about')) coverageTopics.push('معلومات عن الشركة والنشاط');
      if (discoveredPages.some((p: any) => p.pageType === 'contact')) coverageTopics.push('بيانات التواصل والموقع');
      if (discoveredPages.some((p: any) => p.pageType === 'faq') || faqs.length > 0) coverageTopics.push('الأسئلة الشائعة');
      if (discoveredPages.some((p: any) => p.pageType === 'shipping')) coverageTopics.push('الشحن والتوصيل');
      if (discoveredPages.some((p: any) => p.pageType === 'returns')) coverageTopics.push('سياسة الإرجاع');
      if (discoveredPages.some((p: any) => p.pageType === 'privacy' || p.pageType === 'terms')) coverageTopics.push('السياسات والشروط');
      if (discoveredPages.some((p: any) => p.pageType === 'content' || p.pageType === 'other')) coverageTopics.push('محتوى وخدمات عامة');
      // If no discovered pages but we have word count, the analysis itself provides general knowledge
      if (discoveredPages.length === 0 && totalWords > 50) coverageTopics.push('محتوى الموقع الرئيسي');

      const missingTopics: string[] = [];
      if (!discoveredPages.some((p: any) => p.pageType === 'about')) missingTopics.push('من نحن');
      if (!discoveredPages.some((p: any) => p.pageType === 'contact')) missingTopics.push('تواصل معنا');
      if (!discoveredPages.some((p: any) => p.pageType === 'faq') && faqs.length === 0) missingTopics.push('أسئلة شائعة');
      if (!discoveredPages.some((p: any) => p.pageType === 'shipping')) missingTopics.push('الشحن والتوصيل');

      return sanitizeForTRPC({
        analysis: {
          url: analysis.url,
          title: analysis.title,
          description: analysis.description,
          industry: analysis.industry,
          language: analysis.language,
          overallScore: analysis.overall_score,
          wordCount: analysis.word_count,
          seoScore: analysis.seo_score,
          performanceScore: analysis.performance_score,
          uxScore: analysis.ux_score,
          contentQuality: analysis.content_quality,
          hasContactInfo: !!analysis.has_contact_info,
          hasWhatsapp: !!analysis.has_whatsapp,
          analyzedAt: analysis.analyzed_at,
          status: analysis.status,
        },
        pages: discoveredPages,
        categories,
        faqCount: faqs.length,
        knowledgeScore,
        coverageTopics,
        missingTopics,
        totalPages: discoveredPages.length,
        activePages: discoveredPages.filter((p: any) => p.useInBot).length,
      });
    } catch (error) {
      console.error('[SariBrain] getWebsiteKnowledge failed:', error);
      return null;
    }
  }),

  /** جلب محتوى صفحة مخزنة (للعرض في popup) */
  getPageContent: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const dbConn = await getRawPool();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const [rows] = await (dbConn as any).execute(
        `SELECT id, title, url, content, page_type, use_in_bot, discovered_at FROM discovered_pages WHERE id = ? AND merchant_id = ?`,
        [input.pageId, merchant.id]
      );
      if (!rows || (rows as any[]).length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      }
      const page = (rows as any[])[0];
      const content = (page.content || '').toString();
      return {
        id: page.id,
        title: page.title,
        url: page.url,
        content,
        wordCount: content.trim().split(/\s+/).filter(Boolean).length,
        pageType: page.page_type,
        useInBot: !!page.use_in_bot,
        discoveredAt: page.discovered_at,
      };
    }),

  /** معاينة رابط قبل إضافته — يسحب المحتوى بدون حفظ */
  previewUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      checkTestRateLimit(merchant.id, 10_000); // 10s cooldown

      const { isUrlSafe, scrapeWebsite } = await import('./_core/websiteAnalyzer');
      if (!isUrlSafe(input.url)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط غير مسموح به' });
      }

      try {
        const { text } = await scrapeWebsite(input.url);
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

        if (wordCount < 10) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'الصفحة فارغة أو لا تحتوي على محتوى كافي' });
        }

        // Auto-detect title from URL
        const title = new URL(input.url).pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'صفحة مخصصة';

        return {
          url: input.url,
          title,
          content: text.substring(0, 65000),
          wordCount,
        };
      } catch (error: any) {
        if (error?.code === 'BAD_REQUEST' || error?.code === 'TOO_MANY_REQUESTS') throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل سحب الصفحة: ' + (error?.message || 'خطأ').substring(0, 100) });
      }
    }),

  /**
   * Add a custom URL to the knowledge base
   * Crawls the URL and saves its content as a discovered page
   */
  addCustomUrl: protectedProcedure
    .input(z.object({
      url: z.string().url(),
      title: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      checkTestRateLimit(merchant.id, 10_000); // 10s cooldown

      // SSRF guard
      const { isUrlSafe, scrapeWebsite } = await import('./_core/websiteAnalyzer');
      if (!isUrlSafe(input.url)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط غير مسموح به' });
      }

      try {
        // PEN-KD-03: Enforce max page limit per merchant (DoS prevention)
        const dbConn = await getRawPool();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

        const [countResult] = await (dbConn as any).execute(
          `SELECT COUNT(*) as cnt FROM discovered_pages WHERE merchant_id = ?`,
          [merchant.id]
        );
        if ((countResult as any[])?.[0]?.cnt >= 50) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'وصلت للحد الأقصى (50 صفحة). احذف صفحات قبل إضافة جديدة.' });
        }

        // PEN-KD-04: Check for duplicate URL
        const [dupCheck] = await (dbConn as any).execute(
          `SELECT id FROM discovered_pages WHERE merchant_id = ? AND url = ?`,
          [merchant.id, input.url.substring(0, 1000)]
        );
        if ((dupCheck as any[])?.length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الرابط مضاف مسبقاً' });
        }

        // Scrape the page
        const { text } = await scrapeWebsite(input.url);
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

        if (wordCount < 10) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'الصفحة فارغة أو لا تحتوي على محتوى كافي' });
        }

        // Auto-detect page title from URL if not provided
        const rawTitle = input.title || new URL(input.url).pathname.split('/').filter(Boolean).pop() || 'صفحة مخصصة';
        // PEN-KD-01: Sanitize title — strip SQL/HTML dangerous chars
        const pageTitle = rawTitle.replace(/[<>"'`;\\]/g, '').substring(0, 500);

        await (dbConn as any).execute(
          `INSERT INTO discovered_pages (merchant_id, page_type, title, url, content, is_active, use_in_bot, discovered_at) VALUES (?, 'other', ?, ?, ?, 1, 1, NOW())`,
          [merchant.id, pageTitle, input.url.substring(0, 1000), text.substring(0, 65000)]
        );

        // PEN-KD-01 FIX: Append to scraped_content — fully parameterized (was SQL injection via ${pageTitle})
        try {
          await (dbConn as any).execute(
            `UPDATE website_analyses SET scraped_content = CONCAT(IFNULL(scraped_content, ''), '\n\n--- ', ?, ' ---\n', ?) WHERE merchant_id = ? ORDER BY analyzed_at DESC LIMIT 1`,
            [pageTitle, text.substring(0, 65000), merchant.id]
          );
        } catch { /* skip if no analysis exists */ }

        await logBrainActivity(merchant.id, 'content_analyzed', `تم إضافة صفحة مخصصة: ${pageTitle} (${wordCount} كلمة)`, {
          url: input.url,
          wordCount,
        });

        return { success: true, title: pageTitle, wordCount };
      } catch (error: any) {
        if (error?.code === 'BAD_REQUEST' || error?.code === 'TOO_MANY_REQUESTS') throw error;
        console.error('[SariBrain] addCustomUrl failed:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل سحب الصفحة: ' + (error?.message || 'خطأ').substring(0, 100) });
      }
    }),

  /**
   * Toggle whether a discovered page is used in bot responses
   */
  togglePageInBot: protectedProcedure
    .input(z.object({
      pageId: z.number(),
      useInBot: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const dbConn = await getRawPool();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      // Verify ownership
      const [rows] = await (dbConn as any).execute(
        `SELECT id, title FROM discovered_pages WHERE id = ? AND merchant_id = ?`,
        [input.pageId, merchant.id]
      );
      if (!rows || (rows as any[]).length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      }

      // PEN-KD-02 FIX: Defense-in-depth — include merchant_id in UPDATE too
      await (dbConn as any).execute(
        `UPDATE discovered_pages SET use_in_bot = ? WHERE id = ? AND merchant_id = ?`,
        [input.useInBot ? 1 : 0, input.pageId, merchant.id]
      );

      const page = (rows as any[])[0];
      await logBrainActivity(merchant.id, input.useInBot ? 'faq_updated' : 'faq_updated',
        `${input.useInBot ? 'تفعيل' : 'إيقاف'} الصفحة "${page.title}" في ردود ساري`
      );

      return { success: true };
    }),

  /** حذف صفحة مسحوبة من ذاكرة ساري بالكامل */
  deleteDiscoveredPage: protectedProcedure
    .input(z.object({
      pageId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // PEN-DELETE-01: Rate limit — 2s cooldown to prevent mass-deletion abuse
      checkRateLimit(destructiveRateLimit, merchant.id, 2000);

      const dbConn = await getRawPool();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      // Verify ownership & get page info
      const [rows] = await (dbConn as any).execute(
        `SELECT id, title, url FROM discovered_pages WHERE id = ? AND merchant_id = ?`,
        [input.pageId, merchant.id]
      );
      if (!rows || (rows as any[]).length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      }
      const page = (rows as any[])[0];

      // 1. Delete from discovered_pages
      await (dbConn as any).execute(
        `DELETE FROM discovered_pages WHERE id = ? AND merchant_id = ?`,
        [input.pageId, merchant.id]
      );

      // 2. Also delete related FAQs linked to this page
      try {
        await (dbConn as any).execute(
          `DELETE FROM extracted_faqs WHERE page_id = ? AND merchant_id = ?`,
          [input.pageId, merchant.id]
        );
      } catch { /* table may not have merchant_id column */ }

      // 3. Also remove knowledge_sections sourced from this URL
      try {
        const knowledgeDb = await import('./db/knowledge');
        const sections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
        for (const section of sections) {
          const sourceUrl = (section as any).source_url || (section as any).sourceUrl || '';
          if (sourceUrl && page.url && sourceUrl === page.url) {
            await knowledgeDb.deleteSection((section as any).id, merchant.id);
          }
        }
      } catch (knErr: any) {
        console.warn('[SariBrain] Failed to cleanup knowledge sections:', knErr.message);
      }

      await logBrainActivity(merchant.id, 'document_deleted',
        `تم حذف الصفحة "${page.title}" (${page.url}) من ذاكرة ساري`
      );

      console.log(`[SariBrain] Deleted discovered page ${input.pageId} (${page.url}) for merchant ${merchant.id}`);
      return { success: true, deletedTitle: page.title };
    }),

  // ═══════════════════════════════════════════════════════════════
  // Knowledge Engine v4 — Sections, Health, Changelog, Evolve
  // ═══════════════════════════════════════════════════════════════

  /** Get all knowledge sections (hierarchical) */
  getKnowledgeSections: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const knowledgeDb = await import('./db/knowledge');
      const sections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
      
      // Whitelist approach: only include fields we KNOW are safe
      const safe = sections.map((s: any) => ({
        id: Number(s.id),
        merchantId: Number(s.merchant_id ?? s.merchantId),
        parentId: s.parent_id ?? s.parentId ?? null,
        sectionType: s.section_type ?? s.sectionType ?? 'custom',
        section_type: s.section_type ?? s.sectionType ?? 'custom',
        title: String(s.title || ''),
        content: String(s.content || ''),
        summary: s.summary ? String(s.summary) : null,
        source: String(s.source || 'manual'),
        sourceUrl: s.source_url ?? s.sourceUrl ?? null,
        source_url: s.source_url ?? s.sourceUrl ?? null,
        confidence: Number(s.confidence) || 0.9,
        status: String(s.status || 'auto_approved'),
        useInBot: !!(s.use_in_bot ?? s.useInBot),
        use_in_bot: !!(s.use_in_bot ?? s.useInBot),
        injectAs: s.inject_as ?? s.injectAs ?? 'fact',
        inject_as: s.inject_as ?? s.injectAs ?? 'fact',
        sortOrder: Number(s.sort_order ?? s.sortOrder ?? 0),
        sort_order: Number(s.sort_order ?? s.sortOrder ?? 0),
        merchantEdited: !!(s.merchant_edited ?? s.merchantEdited),
        merchant_edited: !!(s.merchant_edited ?? s.merchantEdited),
        createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at ?? s.createdAt ?? ''),
        created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at ?? s.createdAt ?? ''),
        updatedAt: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at ?? s.updatedAt ?? ''),
        updated_at: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at ?? s.updatedAt ?? ''),
        // NO embedding field - explicitly excluded
      }));

      return safe;
    } catch (err: any) {
      console.error('[getKnowledgeSections] SERIALIZATION ERROR:', err.message, err.stack?.substring(0, 300));
      return []; // Return empty array instead of crashing
    }
  }),

  /** Get knowledge health score */
  getHealthScore: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const knowledgeDb = await import('./db/knowledge');
    return sanitizeForTRPC(await knowledgeDb.calculateHealthScore(merchant.id));
  }),

  /** Get integration sync status — what data is currently loaded for the merchant */
  getIntegrationSyncStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const dbConn = await getRawPool();
    if (!dbConn) return null;

    try {
      // Products
      const products = await getProductsByMerchantId(merchant.id);
      const productNames = products.slice(0, 20).map((p: any) => p.name);

      // FAQs
      let faqCount = 0;
      let faqCategories: string[] = [];
      try {
        const [faqRows] = await (dbConn as any).execute(
          `SELECT COUNT(*) as cnt FROM extracted_faqs WHERE merchant_id = ?`, [merchant.id]
        );
        faqCount = (faqRows as any[])?.[0]?.cnt || 0;
        const [catRows] = await (dbConn as any).execute(
          `SELECT DISTINCT category FROM extracted_faqs WHERE merchant_id = ? AND category IS NOT NULL`, [merchant.id]
        );
        faqCategories = (catRows as any[])?.map((r: any) => r.category).filter(Boolean) || [];
      } catch { /* skip */ }

      // Knowledge sections
      let knowledgeSectionCount = 0;
      try {
        const knowledgeDb = await import('./db/knowledge');
        const sections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
        knowledgeSectionCount = sections.length;
      } catch { /* skip */ }

      // Discovered pages
      let discoveredPages: { title: string; pageType: string }[] = [];
      try {
        const [dpRows] = await (dbConn as any).execute(
          `SELECT title, page_type FROM discovered_pages WHERE merchant_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 20`,
          [merchant.id]
        );
        discoveredPages = (dpRows as any[])?.map((r: any) => ({
          title: r.title || r.page_type || '',
          pageType: r.page_type || 'other',
        })) || [];
      } catch { /* skip */ }

      // Customers
      let customerCount = 0;
      try {
        const [rows] = await (dbConn as any).execute(
          `SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = ?`, [merchant.id]
        );
        customerCount = (rows as any[])?.[0]?.cnt || 0;
      } catch { /* skip */ }

      // Last sync time from byaan_connections
      let lastSyncAt: string | null = null;
      let integrationPlatform: string | null = null;
      try {
        const { getByaanConnection } = await import('./integrations/byaan');
        const conn = await getByaanConnection(merchant.id);
        lastSyncAt = conn?.last_sync_at || null;
        integrationPlatform = conn?.platform || null;
      } catch { /* skip */ }

      return {
        products: products.length,
        productNames,
        faqs: faqCount,
        faqCategories,
        knowledgeSections: knowledgeSectionCount,
        discoveredPages: discoveredPages.length,
        discoveredPageTitles: discoveredPages.map(p => p.title),
        customers: customerCount,
        lastSyncAt,
        integrationPlatform,
        hasData: products.length > 0 || faqCount > 0 || knowledgeSectionCount > 0 || discoveredPages.length > 0,
      };
    } catch (error) {
      console.error('[SariBrain] getIntegrationSyncStatus failed:', error);
      return null;
    }
  }),

  /** Get pending review sections (conflicts) */
  getPendingReviews: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const knowledgeDb = await import('./db/knowledge');
      const sections = await knowledgeDb.getPendingReviewSections(merchant.id);
      return sections.map((s: any) => ({
        id: Number(s.id),
        merchantId: Number(s.merchant_id ?? s.merchantId),
        parentId: s.parent_id ?? s.parentId ?? null,
        sectionType: s.section_type ?? s.sectionType ?? 'custom',
        section_type: s.section_type ?? s.sectionType ?? 'custom',
        title: String(s.title || ''),
        content: String(s.content || ''),
        summary: s.summary ? String(s.summary) : null,
        source: String(s.source || 'manual'),
        sourceUrl: s.source_url ?? s.sourceUrl ?? null,
        confidence: Number(s.confidence) || 0.9,
        status: String(s.status || 'pending_review'),
        useInBot: !!(s.use_in_bot ?? s.useInBot),
        injectAs: s.inject_as ?? s.injectAs ?? 'fact',
        sortOrder: Number(s.sort_order ?? s.sortOrder ?? 0),
        merchantEdited: !!(s.merchant_edited ?? s.merchantEdited),
        createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at ?? s.createdAt ?? ''),
        updatedAt: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at ?? s.updatedAt ?? ''),
      }));
    } catch (err: any) {
      console.error('[getPendingReviews] ERROR:', err.message);
      return [];
    }
  }),

  /** Get knowledge changelog */
  getChangelog: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        const knowledgeDb = await import('./db/knowledge');
        const rows = await knowledgeDb.getChangelog(merchant.id, input.limit || 50);
        return rows.map((r: any) => ({
          id: Number(r.id),
          merchantId: Number(r.merchant_id ?? r.merchantId),
          sectionId: r.section_id ?? r.sectionId ?? null,
          action: String(r.action || ''),
          reason: r.reason ? String(r.reason) : null,
          oldContent: r.old_content ?? r.oldContent ?? null,
          newContent: r.new_content ?? r.newContent ?? null,
          source: r.source ? String(r.source) : null,
          resolved: !!(r.resolved),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? r.createdAt ?? ''),
        }));
      } catch (err: any) {
        console.error('[getChangelog] ERROR:', err.message);
        return [];
      }
    }),

  /** Create a manual knowledge section */
  createSection: protectedProcedure
    .input(z.object({
      sectionType: z.enum(['identity', 'services', 'policies', 'faq', 'contact', 'team', 'achievements', 'custom']),
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(50000),
      parentId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const knowledgeDb = await import('./db/knowledge');
      const sectionId = await knowledgeDb.createSection({
        merchantId: merchant.id,
        sectionType: input.sectionType,
        title: input.title,
        content: input.content,
        parentId: input.parentId,
        source: 'manual',
        merchantEdited: true,
        status: 'approved',
      });

      await knowledgeDb.logChange({
        merchantId: merchant.id,
        sectionId,
        action: 'manual_edit',
        reason: `إضافة يدوية: ${input.title}`,
        newContent: input.content,
        source: 'manual',
      });

      // Generate embedding for the new section
      try {
        const ragEngine = await import('./ai/rag-engine');
        const section = await knowledgeDb.getSectionById(sectionId, merchant.id);
        if (section) await ragEngine.embedSection(section, merchant.id);
      } catch { /* non-blocking */ }

      await logBrainActivity(merchant.id, 'section_created', `إضافة قسم: ${input.title}`);
      return { success: true, sectionId };
    }),

  /** Update a knowledge section */
  updateSection: protectedProcedure
    .input(z.object({
      sectionId: z.number(),
      title: z.string().min(1).max(500).optional(),
      content: z.string().min(1).max(50000).optional(),
      useInBot: z.boolean().optional(),
      status: z.enum(['auto_approved', 'approved', 'pending_review']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const knowledgeDb = await import('./db/knowledge');
      
      // Verify ownership
      const existing = await knowledgeDb.getSectionById(input.sectionId, merchant.id);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'القسم غير موجود' });

      const oldContent = existing.content || (existing as any).content;

      await knowledgeDb.updateSection(input.sectionId, merchant.id, {
        ...(input.title && { title: input.title }),
        ...(input.content && { content: input.content }),
        ...(input.useInBot !== undefined && { useInBot: input.useInBot }),
        ...(input.status && { status: input.status }),
        merchantEdited: true,
      });

      if (input.content) {
        await knowledgeDb.logChange({
          merchantId: merchant.id,
          sectionId: input.sectionId,
          action: 'manual_edit',
          reason: `تعديل يدوي: ${input.title || existing.title || (existing as any).title}`,
          oldContent,
          newContent: input.content,
          source: 'manual',
        });

        // Re-embed after content change
        try {
          const ragEngine = await import('./ai/rag-engine');
          const updated = await knowledgeDb.getSectionById(input.sectionId, merchant.id);
          if (updated) await ragEngine.embedSection(updated, merchant.id);
        } catch { /* non-blocking */ }

        // ARCH-03 FIX: Invalidate stale cached responses when knowledge changes
        try { await knowledgeDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      }

      await logBrainActivity(merchant.id, 'section_updated', `تعديل قسم: ${input.title || existing.title || (existing as any).title}`);
      return { success: true };
    }),

  /** Delete a knowledge section */
  deleteSection: protectedProcedure
    .input(z.object({ sectionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      checkDestructiveRateLimit(merchant.id);

      const knowledgeDb = await import('./db/knowledge');
      const existing = await knowledgeDb.getSectionById(input.sectionId, merchant.id);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'القسم غير موجود' });

      await knowledgeDb.logChange({
        merchantId: merchant.id,
        sectionId: input.sectionId,
        action: 'delete',
        reason: `حذف: ${existing.title || (existing as any).title}`,
        oldContent: existing.content || (existing as any).content,
      });

      await knowledgeDb.deleteSection(input.sectionId, merchant.id);

      // ARCH-03 FIX: Purge stale cache after knowledge deletion
      try { await knowledgeDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }

      await logBrainActivity(merchant.id, 'section_deleted', `حذف قسم: ${existing.title || (existing as any).title}`);
      return { success: true };
    }),

  /** Approve a pending review section (resolve conflict) */
  approveSection: protectedProcedure
    .input(z.object({
      sectionId: z.number(),
      action: z.enum(['approve', 'reject']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const knowledgeDb = await import('./db/knowledge');
      const section = await knowledgeDb.getSectionById(input.sectionId, merchant.id);
      if (!section) throw new TRPCError({ code: 'NOT_FOUND', message: 'القسم غير موجود' });

      if (input.action === 'approve') {
        await knowledgeDb.updateSection(input.sectionId, merchant.id, {
          status: 'approved',
          useInBot: true,
        });
        // Embed the newly approved section
        try {
          const ragEngine = await import('./ai/rag-engine');
          const updated = await knowledgeDb.getSectionById(input.sectionId, merchant.id);
          if (updated) await ragEngine.embedSection(updated, merchant.id);
        } catch { /* non-blocking */ }
      } else {
        await knowledgeDb.deleteSection(input.sectionId, merchant.id);
      }

      // Resolve related changelog conflicts
      const changelog = await knowledgeDb.getUnresolvedConflicts(merchant.id);
      for (const entry of changelog) {
        if ((entry as any).section_id === input.sectionId || entry.sectionId === input.sectionId) {
          await knowledgeDb.resolveConflict(entry.id, merchant.id);
        }
      }

      await logBrainActivity(merchant.id, 'conflict_resolved',
        `${input.action === 'approve' ? 'قبول' : 'رفض'} تعارض: ${section.title || (section as any).title}`
      );
      return { success: true };
    }),

  /** Trigger re-embedding of all sections */
  reembedSections: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    checkDestructiveRateLimit(merchant.id, 60_000); // 1 min cooldown

    const ragEngine = await import('./ai/rag-engine');
    const count = await ragEngine.embedAllSections(merchant.id);
    
    await logBrainActivity(merchant.id, 'sections_reembedded', `إعادة تحويل ${count} قسم إلى vectors`);
    return { success: true, embeddedCount: count };
  }),

  // ═══════════════════════════════════════════════════════════════
  // Quality Metrics — Dashboard, Weekly Reports
  // ═══════════════════════════════════════════════════════════════

  /** Get quality dashboard */
  getQualityDashboard: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const qualityDb = await import('./db/quality-metrics');
      return sanitizeForTRPC(await qualityDb.getQualityDashboard(merchant.id, input.days || 30));
    }),

  /** Get weekly reports history */
  getWeeklyReports: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(52).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const qualityDb = await import('./db/quality-metrics');
      return sanitizeForTRPC(await qualityDb.getWeeklyReports(merchant.id, input.limit || 12));
    }),

  /** Generate weekly report (manual trigger) */
  generateWeeklyReport: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    checkTestRateLimit(merchant.id, 30_000);

    const qualityDb = await import('./db/quality-metrics');
    const report = await qualityDb.generateWeeklyReport(merchant.id);
    if (!report) {
      return { success: false, message: 'لا توجد بيانات كافية أو التقرير موجود بالفعل' };
    }
    return sanitizeForTRPC({ success: true, report });
  }),

  // ═══════════════════════════════════════════════════════════════
  // Sales Quotations — Create, Track, Manage
  // ═══════════════════════════════════════════════════════════════

  /** Create a quotation */
  createQuotation: protectedProcedure
    .input(z.object({
      customerPhone: z.string().max(20).optional(),
      customerName: z.string().max(255).optional(),
      items: z.array(z.object({
        name: z.string().min(1).max(500),
        description: z.string().max(1000).optional(),
        quantity: z.number().min(1).max(99999),
        unitPrice: z.number().min(0),
        total: z.number().min(0),
      })).min(1).max(50),
      taxRate: z.number().min(0).max(1).optional(),
      currency: z.string().max(3).optional(),
      validDays: z.number().min(1).max(365).optional(),
      conversationId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // SEC-V4-03 FIX: Rate limit — max 1 quotation per 2 seconds
      checkTestRateLimit(merchant.id, 2_000);

      const quotationsDb = await import('./db/sales-quotations');
      const quotation = await quotationsDb.createQuotation({
        merchantId: merchant.id,
        ...input,
      });

      await logBrainActivity(merchant.id, 'quotation_created',
        `إنشاء عرض سعر #${quotation.quotationNumber} — ${quotation.total} ${quotation.currency}`
      );

      return sanitizeForTRPC(quotation);
    }),

  /** Get quotations list */
  getQuotations: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      return sanitizeForTRPC(await quotationsDb.getQuotations(merchant.id, input.limit || 50));
    }),

  /** Get quotation stats */
  getQuotationStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const quotationsDb = await import('./db/sales-quotations');
    return sanitizeForTRPC(await quotationsDb.getQuotationStats(merchant.id));
  }),

  /** Update quotation status */
  updateQuotationStatus: protectedProcedure
    .input(z.object({
      quotationId: z.number(),
      status: z.enum(['sent', 'viewed', 'accepted', 'rejected', 'expired']),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      await quotationsDb.updateQuotationStatus(input.quotationId, merchant.id, input.status);

      await logBrainActivity(merchant.id, 'quotation_updated',
        `تحديث حالة عرض سعر #${input.quotationId} → ${input.status}`
      );
      return { success: true };
    }),

  /** Format quotation for WhatsApp */
  formatQuotationForWhatsApp: protectedProcedure
    .input(z.object({ quotationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      const quotation = await quotationsDb.getQuotationById(input.quotationId, merchant.id);
      if (!quotation) throw new TRPCError({ code: 'NOT_FOUND', message: 'عرض السعر غير موجود' });

      // Get default template
      const templates = await quotationsDb.getTemplates(merchant.id);
      const defaultTemplate = templates.find(t => t.isDefault) || templates[0] || null;

      const message = quotationsDb.formatQuotationMessage(quotation, merchant.businessName, defaultTemplate);
      return sanitizeForTRPC({ message, quotation });
    }),

  // ─── Sales Targets ─────────────────────────────

  /** Get current target */
  getCurrentTarget: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const quotationsDb = await import('./db/sales-quotations');
    return sanitizeForTRPC(await quotationsDb.getCurrentTarget(merchant.id));
  }),

  /** Set monthly target */
  setMonthlyTarget: protectedProcedure
    .input(z.object({ targetAmount: z.number().min(0).max(999999999) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      const target = await quotationsDb.setMonthlyTarget(merchant.id, input.targetAmount);

      await logBrainActivity(merchant.id, 'target_set',
        `تحديد هدف مبيعات شهري: ${input.targetAmount} ر.س`
      );
      return sanitizeForTRPC(target);
    }),

  /** Get target history */
  getTargetHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(24).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      return sanitizeForTRPC(await quotationsDb.getTargetHistory(merchant.id, input.limit || 12));
    }),

  // ─── Quotation Templates ─────────────────────────

  /** Get templates */
  getQuotationTemplates: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const quotationsDb = await import('./db/sales-quotations');
    return sanitizeForTRPC(await quotationsDb.getTemplates(merchant.id));
  }),

  /** Create template */
  createQuotationTemplate: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      footerText: z.string().max(5000).optional(),
      termsText: z.string().max(5000).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      const id = await quotationsDb.createTemplate({
        merchantId: merchant.id,
        ...input,
      });
      return { success: true, templateId: id };
    }),

  /** Delete template */
  deleteQuotationTemplate: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      await quotationsDb.deleteTemplate(input.templateId, merchant.id);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // Learning Engine — Continuous Learning Dashboard
  // ═══════════════════════════════════════════════════════════════

  /** Get learning maturity dashboard */
  getLearningDashboard: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const learningDb = await import('./db/learning');

    const [totalSignals, totalConversations, generation, signalDistribution, activeDNA] = await Promise.all([
      learningDb.getTotalSignals(merchant.id),
      learningDb.getTotalConversations(merchant.id),
      learningDb.getDNAGeneration(merchant.id),
      learningDb.getSignalDistribution(merchant.id, 30),
      learningDb.getActiveDNA(merchant.id),
    ]);

    // Calculate maturity level based on signals and generation
    const maturityLevel = generation === 0 ? 'newborn'
      : generation <= 2 ? 'learning'
      : generation <= 5 ? 'growing'
      : generation <= 10 ? 'experienced'
      : 'expert';

    // Sanitize DNA for frontend (no BLOBs, whitelist fields)
    const dnaInsights = activeDNA.map((d: any) => ({
      dimension: d.dimension,
      insight: d.insight,
      confidence: Number(d.confidence) || 0,
      evidenceCount: Number(d.evidence_count || d.evidenceCount) || 0,
      autoApplied: !!(d.auto_applied || d.autoApplied),
      generation: Number(d.generation) || 0,
    }));

    return {
      totalSignals,
      totalConversations,
      generation,
      maturityLevel,
      signalDistribution,
      dnaInsights,
    };
  }),

  /** Manually trigger learning analysis */
  triggerLearningAnalysis: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const learningDb = await import('./db/learning');
    const unanalyzed = await learningDb.countUnanalyzedSignals(merchant.id);

    if (unanalyzed < 5) {
      return {
        success: false,
        message: `يوجد فقط ${unanalyzed} إشارات جديدة — تحتاج 5 إشارات على الأقل للتحليل`,
        signalCount: unanalyzed,
      };
    }

    // Trigger analysis in background
    const { triggerPatternAnalysis } = await import('./ai/learning-engine');
    triggerPatternAnalysis(merchant.id).catch(err =>
      console.error('[Learning] Manual trigger failed:', err)
    );

    return {
      success: true,
      message: `جاري تحليل ${unanalyzed} إشارة — ستظهر النتائج خلال دقيقة`,
      signalCount: unanalyzed,
    };
  }),
});

export type SariBrainRouter = typeof sariBrainRouter;
