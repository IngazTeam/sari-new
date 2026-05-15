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

/**
 * Get the raw mysql2 pool for direct SQL execution.
 * CRITICAL: db.getDb() returns Drizzle ORM whose .execute() does NOT support
 * parameterized `?` placeholders. Use this for all raw SQL with parameters.
 */
async function getRawPool() {
  return await db.getPool();
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

    return sanitizeForTRPC(sources);
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
      await db.deleteAllExtractedFaqs(merchant.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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

      // Delete old analyses, then create new one using the proper Drizzle ORM functions
      // (same path as routers-website-analysis.ts — single source of truth)
      try {
        const existingAnalyses = await db.getWebsiteAnalysesByMerchant(merchant.id);
        for (const old of existingAnalyses) {
          await db.deleteWebsiteAnalysis(old.id);
        }
      } catch { /* table may not exist yet — first run */ }

      const analysisId = await db.createWebsiteAnalysis({
        merchantId: merchant.id,
        url: websiteUrl,
        title: result.title || '',
        description: result.description || '',
        industry: result.industry || '',
        language: result.language || 'ar',
        seoScore: result.seoScore || 0,
        seoIssues: result.seoIssues || [],
        metaTags: result.metaTags || {},
        performanceScore: result.performanceScore || 0,
        loadTime: result.loadTime,
        pageSize: result.pageSize,
        uxScore: result.uxScore || 0,
        mobileOptimized: result.mobileOptimized,
        hasContactInfo: result.hasContactInfo,
        hasWhatsapp: result.hasWhatsapp,
        contentQuality: result.contentQuality || 0,
        wordCount: result.wordCount || 0,
        imageCount: result.imageCount || 0,
        videoCount: result.videoCount || 0,
        overallScore: result.overallScore || 0,
        status: 'completed',
      });

      // Save scraped content separately (createWebsiteAnalysis doesn't accept this field)
      await db.updateWebsiteAnalysis(analysisId, {
        scrapedContent: (result._scrapedText || '') + '\n\n' + (result._enrichedText || ''),
      });

      // Save crawled pages to discovered_pages (Knowledge Dashboard)
      if ((result as any)._crawledPages?.length > 0) {
        try {
          const dbConn = await getRawPool();
          if (dbConn) {
            await (dbConn as any).execute(`DELETE FROM discovered_pages WHERE merchant_id = ?`, [merchant.id]);
            const validTypes = ['about', 'shipping', 'returns', 'faq', 'contact', 'privacy', 'terms', 'other'];
            for (const page of (result as any)._crawledPages) {
              if (!page.success) continue;
              const safeType = validTypes.includes(page.pageType) ? page.pageType : 'other';
              await (dbConn as any).execute(
                `INSERT INTO discovered_pages (merchant_id, page_type, title, url, content, is_active, use_in_bot, discovered_at) VALUES (?, ?, ?, ?, ?, 1, 1, NOW())`,
                [merchant.id, safeType, page.title.substring(0, 500), page.url.substring(0, 1000), page.content.substring(0, 65000)]
              );
            }
            console.log(`[SariBrain] Saved ${(result as any)._crawledPages.filter((p: any) => p.success).length} discovered pages`);
          }
        } catch (pageErr: any) {
          console.warn('[SariBrain] Failed to save discovered pages:', pageErr.message);
        }
      }

      await logBrainActivity(merchant.id, 'website_analyzed', `تم إعادة تحليل الموقع: ${websiteUrl}`, {
        url: websiteUrl,
        title: result.title,
        industry: result.industry,
        score: result.overallScore,
      });

      // === Knowledge Engine v4: Classify scraped content into structured sections ===
      let evolveResult = null;
      let knowledgeError: string | null = null;
      try {
        let scrapedText = (result._scrapedText || '') + '\n' + (result._enrichedText || '');
        console.log(`[SariBrain] Knowledge Engine input: scrapedText=${result._scrapedText?.length || 0} chars, enrichedText=${result._enrichedText?.length || 0} chars, combined=${scrapedText.trim().length} chars`);
        
        // === ALWAYS inject merchant profile data as baseline context ===
        const profileParts: string[] = [];
        if (merchant.businessName) profileParts.push(`اسم النشاط التجاري: ${merchant.businessName}`);
        if ((merchant as any).industry) profileParts.push(`المجال: ${(merchant as any).industry}`);
        if ((merchant as any).description) profileParts.push(`الوصف: ${(merchant as any).description}`);
        if ((merchant as any).phone) profileParts.push(`هاتف: ${(merchant as any).phone}`);
        if ((merchant as any).email) profileParts.push(`بريد: ${(merchant as any).email}`);
        if ((merchant as any).city) profileParts.push(`المدينة: ${(merchant as any).city}`);
        if ((merchant as any).address) profileParts.push(`العنوان: ${(merchant as any).address}`);
        if ((merchant as any).websiteUrl || (merchant as any).website) profileParts.push(`الموقع: ${(merchant as any).websiteUrl || (merchant as any).website}`);
        const profileContext = profileParts.length > 0 ? `\n--- بيانات التاجر ---\n${profileParts.join('\n')}\n` : '';
        
        // === SPA Fallback: If scraped text is empty (SPA/Vue/Zid/React sites), build context from available data ===
        if (scrapedText.trim().length < 200) {
          console.log(`[SariBrain] Primary scrape returned low text (${scrapedText.trim().length} chars) — SPA likely. Building fallback context...`);
          const fallbackParts: string[] = [];
          
          // 1. Basic business info (always available from meta tags)
          if (result.title) fallbackParts.push(`اسم النشاط: ${result.title}`);
          if (result.description) fallbackParts.push(`وصف النشاط: ${result.description}`);
          if (result.industry && result.industry !== 'غير محدد') fallbackParts.push(`المجال: ${result.industry}`);
          
          // 2. Meta tags (og:title, keywords, etc.)
          const meta = result.metaTags;
          if (meta?.ogTitle && meta.ogTitle !== result.title) fallbackParts.push(`عنوان بديل: ${meta.ogTitle}`);
          if (meta?.ogDescription && meta.ogDescription !== result.description) fallbackParts.push(`وصف بديل: ${meta.ogDescription}`);
          if (meta?.keywords) fallbackParts.push(`كلمات مفتاحية: ${meta.keywords}`);
          
          // 3. Contact info (from UX analysis)
          if (result.contactInfo) {
            const ci = result.contactInfo;
            if (ci.phones?.length > 0) fallbackParts.push(`هواتف التواصل: ${ci.phones.join(', ')}`);
            if (ci.emails?.length > 0) fallbackParts.push(`بريد إلكتروني: ${ci.emails.join(', ')}`);
            if (ci.whatsappNumber) fallbackParts.push(`واتساب: ${ci.whatsappNumber}`);
            if (ci.address) fallbackParts.push(`العنوان: ${ci.address}`);
          }
          
          // 4. FAQs (from multi-page crawling)
          if (result.faqs && result.faqs.length > 0) {
            fallbackParts.push('\nأسئلة شائعة:');
            for (const faq of result.faqs.slice(0, 20)) {
              fallbackParts.push(`س: ${faq.question}\nج: ${faq.answer}`);
            }
          }
          
          // 5. Extract text from raw HTML (headings, paragraphs, alt text, JSON-LD)
          if ((result as any)._scrapedHtml) {
            const html = (result as any)._scrapedHtml as string;
            const htmlTexts: string[] = [];
            
            // Extract heading texts (h1-h6)
            const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
            let hMatch;
            while ((hMatch = headingRegex.exec(html)) !== null) {
              const t = hMatch[1].replace(/<[^>]*>/g, '').trim();
              if (t.length > 3) htmlTexts.push(t);
            }
            
            // Extract paragraph texts
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            let pMatch;
            while ((pMatch = pRegex.exec(html)) !== null) {
              const t = pMatch[1].replace(/<[^>]*>/g, '').trim();
              if (t.length > 10) htmlTexts.push(t);
            }
            
            // Extract image alt text
            const altRegex = /alt=["']([^"']{5,})["']/gi;
            let altMatch;
            while ((altMatch = altRegex.exec(html)) !== null) {
              htmlTexts.push(altMatch[1].trim());
            }
            
            // Extract JSON-LD structured data
            const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
            let ldMatch;
            while ((ldMatch = jsonLdRegex.exec(html)) !== null) {
              try {
                const ldData = JSON.parse(ldMatch[1]);
                const ldText = JSON.stringify(ldData, null, 0)
                  .replace(/[{}\[\]"]/g, ' ')
                  .replace(/@\w+/g, '')
                  .replace(/https?:\/\/[^\s]+/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (ldText.length > 20) htmlTexts.push('بيانات منظمة: ' + ldText.substring(0, 2000));
              } catch { /* malformed JSON-LD */ }
            }

            // Extract Vue.js / Nuxt SSR state (__NUXT__, __INITIAL_STATE__)
            const vueStateRegex = /window\.__(?:NUXT|INITIAL_STATE)__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|$)/gi;
            let vueMatch;
            while ((vueMatch = vueStateRegex.exec(html)) !== null) {
              try {
                const stateText = vueMatch[1]
                  .replace(/[{}\[\]"]/g, ' ')
                  .replace(/https?:\/\/[^\s]+/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (stateText.length > 50) {
                  htmlTexts.push('بيانات Vue SSR: ' + stateText.substring(0, 5000));
                  console.log(`[SariBrain] Vue SSR state extracted: ${stateText.length} chars`);
                }
              } catch { /* malformed Vue state */ }
            }
            
            if (htmlTexts.length > 0) {
              fallbackParts.push('\nمحتوى مستخرج من HTML:');
              fallbackParts.push(htmlTexts.join('\n'));
            }
          }
          
          // 6. Content from crawled sub-pages (biggest source of real content)
          if ((result as any)._crawledPages?.length > 0) {
            for (const page of (result as any)._crawledPages) {
              if (page.success && page.content && page.content.trim().length > 50) {
                fallbackParts.push(`\n[صفحة: ${page.title}]\n${page.content.substring(0, 5000)}`);
              }
            }
          }
          
          const fallbackText = fallbackParts.join('\n');
          console.log(`[SariBrain] SPA fallback built: ${fallbackText.length} chars from ${fallbackParts.length} sources`);
          
          if (fallbackText.trim().length > scrapedText.trim().length) {
            scrapedText = fallbackText;
          }
        }
        
        // Always prepend merchant profile as baseline context
        scrapedText = profileContext + scrapedText;
        
        // Lower threshold — run Knowledge Engine if we have ANY meaningful context (30+ chars)
        if (scrapedText.trim().length > 30) {
          console.log(`[SariBrain] Starting Knowledge Engine pipeline for merchant ${merchant.id} with ${scrapedText.trim().length} chars...`);
          const { ingestContent } = await import('./ai/knowledge-engine');
          
          const ingestionResult = await ingestContent(
            merchant.id,
            scrapedText,
            'website',
            { businessName: merchant.businessName, industry: result.industry },
            websiteUrl
          );
          evolveResult = ingestionResult.evolveResult;
          
          console.log(`[SariBrain] Knowledge Engine SUCCESS: +${evolveResult.added} sections, ↗${evolveResult.evolved} evolved, ⚠${evolveResult.conflicts} conflicts`);
          
          // Generate embeddings for all new sections (non-blocking — don't let it kill the pipeline)
          try {
            const { embedAllSections } = await import('./ai/rag-engine');
            await embedAllSections(merchant.id);
          } catch (embedErr: any) {
            console.warn('[SariBrain] Embedding generation failed (non-blocking):', embedErr.message);
          }
          
          // Invalidate response cache (knowledge changed)
          try {
            const knowledgeDb = await import('./db/knowledge');
            await knowledgeDb.invalidateCache(merchant.id);
          } catch { /* non-blocking */ }
        } else {
          console.warn(`[SariBrain] Knowledge Engine SKIPPED — no content available even after all fallbacks (${scrapedText.trim().length} chars)`);
          knowledgeError = `الموقع لا يحتوي على محتوى نصي كافٍ (SPA) — جرب رفع ملف تعريفي من الإعدادات`;
        }
      } catch (keErr: any) {
        console.error('[SariBrain] ❌ Knowledge Engine pipeline FAILED:', keErr.message, keErr.stack);
        knowledgeError = `فشل محرك المعرفة: ${keErr.message?.substring(0, 200)}`;
      }

      // Build rich response for frontend toast
      let salesIntelSummary = null;
      try {
        const knowledgeDb = await import('./db/knowledge');
        const allSections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
        const intelSection = allSections.find((s: any) => (s.section_type || s.sectionType) === 'sales_intel');
        const oppsSection = allSections.find((s: any) => (s.section_type || s.sectionType) === 'opportunities');
        salesIntelSummary = {
          totalSections: allSections.filter((s: any) => !['sales_intel', 'opportunities'].includes(s.section_type || s.sectionType || '')).length,
          hasIntel: !!intelSection,
          hasOpportunities: !!oppsSection,
          // PEN-V8-01 FIX: Don't expose content previews in response — frontend reads from getKnowledgeSections
        };
      } catch { /* non-blocking */ }

      return { 
        success: true, 
        title: result.title, 
        industry: result.industry, 
        score: result.overallScore,
        knowledgeEvolution: evolveResult,
        salesIntelSummary,
        knowledgeError,
        crawlStats: (result as any)._crawlStats || null,
      };
    } catch (error: any) {
      if (error?.code === 'TOO_MANY_REQUESTS') throw error;
      console.error('[SariBrain] Website re-analysis failed:', error);

      // Surface a meaningful reason to the merchant
      let reason = 'خطأ غير معروف';
      const msg = error?.message?.toLowerCase() || '';
      if (msg.includes('timeout') || msg.includes('abort')) {
        reason = 'الموقع لم يستجب في الوقت المحدد (timeout)';
      } else if (msg.includes('enotfound') || msg.includes('dns')) {
        reason = `الرابط غير صحيح أو الموقع غير موجود: ${websiteUrl}`;
      } else if (msg.includes('403') || msg.includes('cloudflare') || msg.includes('blocked')) {
        reason = 'الموقع محمي بجدار حماية (Cloudflare) ويمنع السحب';
      } else if (msg.includes('certificate') || msg.includes('ssl') || msg.includes('tls')) {
        reason = 'مشكلة في شهادة SSL للموقع';
      } else if (msg.includes('econnrefused') || msg.includes('econnreset')) {
        reason = 'السيرفر رفض الاتصال — تأكد من أن الموقع يعمل';
      } else if (error?.message) {
        reason = error.message.substring(0, 150);
      }

      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `فشل تحليل الموقع: ${reason}` });
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
    return sanitizeForTRPC(await db.getExtractedFaqsByMerchantId(merchant.id));
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
    const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        faqs = await db.getExtractedFaqsByMerchantId(merchant.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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

  // ═══════════════════════════════════════════════════════════════
  // Knowledge Engine v4 — Sections, Health, Changelog, Evolve
  // ═══════════════════════════════════════════════════════════════

  /** Get all knowledge sections (hierarchical) */
  getKnowledgeSections: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const knowledgeDb = await import('./db/knowledge');
      const sections = await knowledgeDb.getSectionsByMerchantId(merchant.id);
      
      // Nuclear serialization: JSON round-trip strips ALL non-serializable values (BLOB, Date, BigInt)
      const safe = sections.map((s: any) => {
        const row: any = {};
        for (const key of Object.keys(s)) {
          const val = s[key];
          // Skip binary/Buffer fields entirely
          if (val instanceof Buffer || val instanceof Uint8Array) continue;
          // Convert Date to ISO string
          if (val instanceof Date) { row[key] = val.toISOString(); continue; }
          // Convert BigInt to Number
          if (typeof val === 'bigint') { row[key] = Number(val); continue; }
          row[key] = val;
        }
        // Ensure both camelCase and snake_case are present for frontend compatibility
        row.sectionType = row.section_type ?? row.sectionType;
        row.section_type = row.section_type ?? row.sectionType;
        row.parentId = row.parent_id ?? row.parentId ?? null;
        row.parent_id = row.parent_id ?? row.parentId ?? null;
        row.useInBot = !!(row.use_in_bot ?? row.useInBot);
        row.use_in_bot = !!(row.use_in_bot ?? row.useInBot);
        row.merchantEdited = !!(row.merchant_edited ?? row.merchantEdited);
        row.merchant_edited = !!(row.merchant_edited ?? row.merchantEdited);
        row.injectAs = row.inject_as ?? row.injectAs ?? 'fact';
        row.sortOrder = row.sort_order ?? row.sortOrder ?? 0;
        row.sourceUrl = row.source_url ?? row.sourceUrl ?? null;
        row.confidence = Number(row.confidence) || 0.9;
        return row;
      });

      // Final safety net: JSON round-trip to catch anything we missed
      return JSON.parse(JSON.stringify(safe));
    } catch (err: any) {
      console.error('[getKnowledgeSections] SERIALIZATION ERROR:', err.message, err.stack?.substring(0, 300));
      return []; // Return empty array instead of crashing
    }
  }),

  /** Get knowledge health score */
  getHealthScore: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const knowledgeDb = await import('./db/knowledge');
    return sanitizeForTRPC(await knowledgeDb.calculateHealthScore(merchant.id));
  }),

  /** Get pending review sections (conflicts) */
  getPendingReviews: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try {
      const knowledgeDb = await import('./db/knowledge');
      const sections = await knowledgeDb.getPendingReviewSections(merchant.id);
      return JSON.parse(JSON.stringify(sections.map((s: any) => {
        const row: any = {};
        for (const key of Object.keys(s)) {
          const val = s[key];
          if (val instanceof Buffer || val instanceof Uint8Array) continue;
          if (val instanceof Date) { row[key] = val.toISOString(); continue; }
          if (typeof val === 'bigint') { row[key] = Number(val); continue; }
          row[key] = val;
        }
        row.sectionType = row.section_type ?? row.sectionType;
        row.confidence = Number(row.confidence) || 0.9;
        return row;
      })));
    } catch (err: any) {
      console.error('[getPendingReviews] ERROR:', err.message);
      return [];
    }
  }),

  /** Get knowledge changelog */
  getChangelog: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      try {
        const knowledgeDb = await import('./db/knowledge');
        const rows = await knowledgeDb.getChangelog(merchant.id, input.limit || 50);
        return JSON.parse(JSON.stringify(rows.map((r: any) => {
          const row: any = {};
          for (const key of Object.keys(r)) {
            const val = r[key];
            if (val instanceof Buffer || val instanceof Uint8Array) continue;
            if (val instanceof Date) { row[key] = val.toISOString(); continue; }
            if (typeof val === 'bigint') { row[key] = Number(val); continue; }
            row[key] = val;
          }
          return row;
        })));
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
    const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const qualityDb = await import('./db/quality-metrics');
      return sanitizeForTRPC(await qualityDb.getQualityDashboard(merchant.id, input.days || 30));
    }),

  /** Get weekly reports history */
  getWeeklyReports: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(52).optional() }))
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const qualityDb = await import('./db/quality-metrics');
      return sanitizeForTRPC(await qualityDb.getWeeklyReports(merchant.id, input.limit || 12));
    }),

  /** Generate weekly report (manual trigger) */
  generateWeeklyReport: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      return sanitizeForTRPC(await quotationsDb.getQuotations(merchant.id, input.limit || 50));
    }),

  /** Get quotation stats */
  getQuotationStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const quotationsDb = await import('./db/sales-quotations');
    return sanitizeForTRPC(await quotationsDb.getCurrentTarget(merchant.id));
  }),

  /** Set monthly target */
  setMonthlyTarget: protectedProcedure
    .input(z.object({ targetAmount: z.number().min(0).max(999999999) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      return sanitizeForTRPC(await quotationsDb.getTargetHistory(merchant.id, input.limit || 12));
    }),

  // ─── Quotation Templates ─────────────────────────

  /** Get templates */
  getQuotationTemplates: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const quotationsDb = await import('./db/sales-quotations');
      await quotationsDb.deleteTemplate(input.templateId, merchant.id);
      return { success: true };
    }),
});

export type SariBrainRouter = typeof sariBrainRouter;
