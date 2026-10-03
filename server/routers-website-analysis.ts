import { persistCrawledKnowledge } from './knowledge/crawled-snapshot';
import { reportListInput, reportReadInput, reportDeleteInput } from '../shared/website-reports';
import { listWebsiteReports, readWebsiteReport, deleteReviewedWebsiteReport } from './knowledge/website-reports';
import { hasPermission } from './_core/permissions';
/**
 * Website Analysis Router
 * 
 * APIs للتحليل الذكي للمواقع
 */

import { router, merchantProcedure, permissionProcedure } from './_core/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createCompetitorAnalysis,
  createCompetitorProduct,
  createExtractedProduct,
  createWebsiteAnalysis,
  createWebsiteInsight,
  deleteCompetitorAnalysis,
  getCompetitorAnalysesByMerchant,
  getCompetitorAnalysisById,
  getCompetitorProductsByCompetitorId,
  getExtractedProductsByAnalysisId,
  getInsightsByAnalysisId,
  getMerchantById,
  getPool,
  getWebsiteAnalysesByMerchant,
  getWebsiteAnalysisById,
  updateCompetitorAnalysis,
  updateMerchant,
  updateWebsiteAnalysis,
} from './db';
import { mergeAnalyzedProducts } from './catalog/analysis-snapshot';
import * as analyzer from './_core/websiteAnalyzer';

async function reportOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error('[WebsiteReports] Operation failed');
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Website report operation unavailable' });
  }
}

// Historic provider/SQL errors are not tenant-facing report content.
function publicCompetitor(competitor: any) {
  return { ...competitor, errorMessage: competitor.status === 'failed' ? 'COMPETITOR_ANALYSIS_FAILED' : null };
}

export const websiteAnalysisRouter = router({
  reports: merchantProcedure.input(reportListInput).query(async ({ctx,input}) => reportOperation(async () => ({
    ...await listWebsiteReports(ctx.merchantId,input), canManage: hasPermission(ctx.merchantRole, 'bot_settings.manage'),
  }))),
  report: merchantProcedure.input(reportReadInput).query(({ctx,input}) => reportOperation(() => readWebsiteReport(ctx.merchantId,input.id))),
  deleteReviewedReport: permissionProcedure('bot_settings.manage').input(reportDeleteInput).mutation(({ctx,input}) => reportOperation(() => deleteReviewedWebsiteReport(ctx.merchantId,input))),
  /**
   * تحليل موقع جديد
   */
  analyze: permissionProcedure('bot_settings.manage')
    .input(z.object({
      url: z.string().url().max(500),
      acknowledged: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // SEC-W1: SSRF guard — block internal/private/metadata IPs at router level
        const { isUrlSafe } = await import('./_core/websiteAnalyzer');
        if (!isUrlSafe(input.url)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط غير مسموح به.' });
        }

        // SEC-W2: Rate limit analysis per merchant (5 per hour) — each analysis triggers LLM + external requests
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';
        const ipCheck = checkRateLimit(`analyze_ip:${clientIp}`, 5, 3600000); // 5 per hour per IP
        if (!ipCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التحليل. حاول بعد قليل.' });
        }

        // Get merchant ID
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Also rate limit per merchant (prevents multi-IP abuse)
        const merchantCheck = checkRateLimit(`analyze_merchant:${merchant.id}`, 5, 3600000);
        if (!merchantCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التحليل. حاول بعد قليل.' });
        }

        // Create analysis record — save hostname as title immediately so frontend never shows "بدون عنوان"
        const hostname = new URL(input.url).hostname;
        const analysisId = await createWebsiteAnalysis({
          merchantId: merchant.id,
          url: input.url,
          title: hostname,
          status: 'analyzing',
        });
        console.log(`[WebsiteAnalysis] Pipeline START: id=${analysisId}`);

        // Remote phases have deadlines; the report stays running until its database writes settle.
        const runPipeline = async () => {
          let scrapedHtml = '';
          let scrapedText = '';
          let enrichedText = '';  // Text from ALL crawled sub-pages
          let analyzedIndustry = '';  // Captured from Phase 1 for Phase 4
          let analysisSucceeded = false;
          const warnings: string[] = [];

          // Phase 1: Analyze website (120s timeout — increased for up to 30-page crawl)
          console.log('[WebsiteAnalysis] Phase 1 START: scrape + analyze');
          try {
            const analyzePromise = analyzer.analyzeWebsite(input.url, merchant.id);
            const analyzeTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Analysis phase timeout (120s)')), 120000)
            );
            const result = await Promise.race([analyzePromise, analyzeTimeout]);
            console.log(`[WebsiteAnalysis] Phase 1 COMPLETE: score=${result.overallScore}`);

            // Update analysis with results
            await updateWebsiteAnalysis(analysisId, {
              title: result.title,
              description: result.description,
              industry: result.industry,
              language: result.language,
              seoScore: result.seoScore,
              seoIssues: result.seoIssues,
              metaTags: result.metaTags,
              performanceScore: result.performanceScore,
              loadTime: result.loadTime,
              pageSize: result.pageSize,
              uxScore: result.uxScore,
              mobileOptimized: result.mobileOptimized,
              hasContactInfo: result.hasContactInfo,
              hasWhatsapp: result.hasWhatsapp,
              contentQuality: result.contentQuality,
              wordCount: result.wordCount,
              imageCount: result.imageCount,
              videoCount: result.videoCount,
              overallScore: result.overallScore,
              // PEN-SESSION-02: Clean scraped text before storage (removes JSON-LD, CSS, nav noise)
              scrapedContent: analyzer.cleanScrapedText((result._scrapedText || '') + '\n\n' + (result._enrichedText || '')),
              status: 'analyzing',
            });
            analysisSucceeded = true;

            // Cache scraped content from Phase 1 for reuse in Phase 2
            if (result._scrapedHtml) {
              scrapedHtml = result._scrapedHtml;
              scrapedText = result._scrapedText;
              enrichedText = result._enrichedText || '';
              console.log(`[WebsiteAnalysis] Cached ${scrapedHtml.length} bytes HTML, ${scrapedText.length + enrichedText.length} chars text from Phase 1`);
            }
            analyzedIndustry = result.industry || '';
            // Save enriched contact info to merchant profile
            if (result.contactInfo) {
              const ci = result.contactInfo;
              const updateData: Record<string, any> = {};
              if (ci.phones.length > 0 && !merchant.phone) {
                updateData.phone = ci.phones[0];
              }
              if (ci.whatsappNumber) {
                updateData.whatsappNumber = ci.whatsappNumber;
              }
              if (Object.keys(updateData).length > 0) {
                try {
                  await updateMerchant(merchant.id, updateData);
                  console.log('[WebsiteAnalysis] Updated merchant contact info');
                } catch (contactErr: any) {
                  warnings.push('contact');
                  console.warn('[WebsiteAnalysis] Failed to update merchant contact');
                }
              }
            }

            await persistCrawledKnowledge(merchant.id, input.url, result);

          } catch (analysisError) {
            warnings.push('analysis_or_knowledge');
            console.error('[WebsiteAnalysis] Phase 1 FAILED');
            // Save partial info — title was already saved at creation, just add description
            try {
              if (!analysisSucceeded) await updateWebsiteAnalysis(analysisId, {
                description: 'تعذر إكمال تحليل الموقع أو تحديث معرفته. راجع النتائج المحفوظة.',
                overallScore: 0,
              });
            } catch (dbErr) {
              console.error('[WebsiteAnalysis] Failed to save partial Phase 1 data');
            }
          }

          // Phase 2: Extract products (20s timeout — reuse HTML from Phase 1 if available)
          console.log(`[WebsiteAnalysis] Phase 2 START: extract products (html=${scrapedHtml.length} bytes cached)`);
          try {
            // Only re-scrape if Phase 1 didn't already provide HTML
            if (!scrapedHtml) {
              console.log('[WebsiteAnalysis] Phase 2: no cached HTML, re-scraping...');
              try {
                const scrapePromise = analyzer.scrapeWebsite(input.url);
                const scrapeTimeout = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Scrape timeout (15s)')), 15000)
                );
                const scraped = await Promise.race([scrapePromise, scrapeTimeout]) as any;
                scrapedHtml = scraped.html;
                scrapedText = scraped.text;
              } catch (scrapeError) {
                console.warn('[WebsiteAnalysis] Phase 2 scrape failed');
              }
            }

            // Extract products/courses/services with timeout — pass ALL text (main + sub-pages)
            const allText = scrapedText + '\n\n' + enrichedText;
            const extractPromise = analyzer.extractProducts(input.url, scrapedHtml, allText, merchant.id);
            const extractTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Product extraction timeout (30s)')), 30000)
            );
            const products = await Promise.race([extractPromise, extractTimeout]) as any[];
            console.log(`[WebsiteAnalysis] Phase 2 COMPLETE: ${products.length} products found`);

            let savedCount = 0;
            for (const product of products) {
              try {
                // Safely extract string values — Zid API may return deeply nested objects for URLs
                const safeStr = (val: any, maxLen: number, depth: number = 0): string | undefined => {
                  if (!val || depth > 3) return undefined;
                  if (typeof val === 'string') return val.substring(0, maxLen);
                  if (typeof val === 'object') {
                    // Try direct URL fields first
                    for (const key of ['url', 'src', 'original_url', 'original', 'href']) {
                      if (typeof val[key] === 'string') return val[key].substring(0, maxLen);
                    }
                    // Try size variants (Zid returns { full_size: { url: "..." }, large: {...}, ... })
                    for (const key of ['full_size', 'large', 'medium', 'small', 'thumbnail']) {
                      const nested = val[key];
                      if (!nested) continue;
                      if (typeof nested === 'string') return nested.substring(0, maxLen);
                      const resolved = safeStr(nested, maxLen, depth + 1);
                      if (resolved) return resolved;
                    }
                  }
                  return undefined;
                };

                await createExtractedProduct({
                  analysisId,
                  merchantId: merchant.id,
                  name: typeof product.name === 'string' ? product.name.substring(0, 500) : (String(product.name || 'Unknown')).substring(0, 500),
                  description: typeof product.description === 'string' ? product.description.substring(0, 2000) : '',
                  price: product.price,
                  currency: typeof product.currency === 'string' ? product.currency.substring(0, 10) : 'SAR',
                  imageUrl: safeStr(product.imageUrl, 500),
                  productUrl: safeStr(product.productUrl, 500),
                  category: typeof product.category === 'string' ? product.category.substring(0, 255) : undefined,
                  tags: product.tags,
                  inStock: product.inStock,
                  confidence: product.confidence || 70,
                });
                savedCount++;
              } catch (saveError) {
                warnings.push('product_record');
                console.error('[WebsiteAnalysis] Failed to save product');
              }
            }

            console.log(`[WebsiteAnalysis] Saved ${savedCount}/${products.length} products for analysis ${analysisId}`);

            // ✅ ALSO save to main products table so the AI bot can use them immediately
            if (savedCount > 0) {
              try {
                const mainSavedCount = await mergeAnalyzedProducts(merchant.id, input.url, products);
                console.log(`[WebsiteAnalysis] ✅ Saved ${mainSavedCount} products to MAIN products table for merchant ${merchant.id}`);
              } catch (mainErr: any) {
                warnings.push('catalog');
                console.error('[WebsiteAnalysis] Failed to save to main products table');
              }
            }
          } catch (productError) {
            warnings.push('products');
            console.error('[WebsiteAnalysis] Phase 2 FAILED');
          }

          // Phase 3: Generate insights (10s timeout — only if we have analysis data)
          console.log(`[WebsiteAnalysis] Phase 3 START: generate insights`);
          try {
            const analysis = await getWebsiteAnalysisById(analysisId);
            if (analysis && analysis.overallScore > 0) {
              const insightsData: analyzer.WebsiteAnalysisResult = {
                title: analysis.title || '',
                description: analysis.description || '',
                industry: analysis.industry || '',
                language: analysis.language || '',
                seoScore: analysis.seoScore,
                seoIssues: analysis.seoIssues || [],
                metaTags: analysis.metaTags || {},
                performanceScore: analysis.performanceScore,
                loadTime: analysis.loadTime || 0,
                pageSize: analysis.pageSize || 0,
                uxScore: analysis.uxScore,
                mobileOptimized: analysis.mobileOptimized,
                hasContactInfo: analysis.hasContactInfo,
                hasWhatsapp: analysis.hasWhatsapp,
                contentQuality: analysis.contentQuality,
                wordCount: analysis.wordCount,
                imageCount: analysis.imageCount,
                videoCount: analysis.videoCount,
                overallScore: analysis.overallScore,
              };

              const insightsPromise = analyzer.generateInsights(insightsData, merchant.id);
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Insights generation timeout (10s)')), 10000)
              );
              const insights = await Promise.race([insightsPromise, timeoutPromise]);

              for (const insight of insights) {
                await createWebsiteInsight({
                  analysisId,
                  merchantId: merchant.id,
                  category: insight.category,
                  type: insight.type,
                  priority: insight.priority,
                  title: insight.title,
                  description: insight.description,
                  recommendation: insight.recommendation,
                  impact: insight.impact,
                  confidence: insight.confidence,
                });
              }
            }
          } catch (insightsError) {
            warnings.push('insights');
            console.error('[WebsiteAnalysis] Phase 3 FAILED');
          }

          // Phase 4: Feed into Knowledge Engine (RAG) — bridges the gap with sariBrain.reanalyzeWebsite
          console.log(`[WebsiteAnalysis] Phase 4 START: Knowledge Engine ingestion`);
          try {
            const allScrapedText = (scrapedText + '\n\n' + enrichedText).trim();
            if (allScrapedText.length > 100) {
              const { ingestContent } = await import('./ai/knowledge-engine');
              const ingestionResult = await ingestContent(
                merchant.id,
                allScrapedText,
                'website',
                {
                  businessName: merchant.businessName || '',
                  industry: analyzedIndustry,
                },
                input.url
              );
              console.log(`[WebsiteAnalysis] Phase 4 ingestion: +${ingestionResult.evolveResult.added} added, ↗${ingestionResult.evolveResult.evolved} evolved, ⚠${ingestionResult.evolveResult.conflicts} conflicts`);

              // Embed all new sections for RAG
              try {
                const { embedAllSections } = await import('./ai/rag-engine');
                await embedAllSections(merchant.id, true);
              } catch { warnings.push('index_or_cache'); }

              // Invalidate knowledge cache so bot uses new data immediately
              try {
                const knowledgeDb = await import('./db/knowledge');
                await knowledgeDb.invalidateCache(merchant.id);
              } catch { warnings.push('index_or_cache'); }
            }
          } catch (knowledgeError) {
            warnings.push('knowledge');
            console.error('[WebsiteAnalysis] Phase 4 FAILED (non-blocking)');
          }

          // Final: Mark analysis as completed after all phases finish
          try {
            await updateWebsiteAnalysis(analysisId, { status: analysisSucceeded ? 'completed' : 'failed', errorMessage: warnings.length ? `Incomplete stages: ${Array.from(new Set(warnings)).join(', ')}` : undefined });
            console.log(`[WebsiteAnalysis] Pipeline settled: id=${analysisId}, status=${analysisSucceeded ? "completed" : "failed"}`);
          } catch (finalUpdateErr) {
            console.error('[WebsiteAnalysis] CRITICAL: Failed to mark as completed');
          }
        };

        // Per-stage deadlines bound remote work. Never mark the report terminal while
        // this pipeline can still write children or knowledge; deletion relies on that state.
        void runPipeline().catch(async error => {
          console.error('[WebsiteAnalysis] Background pipeline failed');
          try { await updateWebsiteAnalysis(analysisId, { status: 'failed', errorMessage: 'Pipeline failed; partial results may exist.' }); }
          catch (saveError) { console.error('[WebsiteAnalysis] Failed to store terminal status'); }
        });

        return { analysisId, status: 'analyzing' };
      } catch (error) {
        console.error('[WebsiteAnalysis] Error starting analysis');
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start analysis',
        });
      }
    }),

  /**
   * الحصول على تحليل محفوظ
   */
  getAnalysis: merchantProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const analysis = await getWebsiteAnalysisById(input.id);

      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      // Verify ownership
      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // BUG FIX: Always include products — they may be saved before insights phase completes
      let extractedProductsList: any[] = [];
      extractedProductsList = await getExtractedProductsByAnalysisId(input.id);

      return { ...analysis, extractedProducts: extractedProductsList };
    }),

  /**
   * قائمة التحليلات
   */
  listAnalyses: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return await getWebsiteAnalysesByMerchant(merchant.id);
  }),

  /**
   * الحصول على المنتجات المستخرجة
   */
  getExtractedProducts: merchantProcedure
    .input(z.object({
      analysisId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await getExtractedProductsByAnalysisId(input.analysisId);
    }),

  /**
   * الحصول على الرؤى الذكية
   */
  getInsights: merchantProcedure
    .input(z.object({
      analysisId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await getInsightsByAnalysisId(input.analysisId);
    }),

  /**
   * حذف تحليل
   */
  deleteAnalysis: permissionProcedure('bot_settings.manage')
    .input(reportReadInput)
    .mutation(() => { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Open the report and review its current impact before deletion.' }); }),

  /**
   * إضافة منافس
   */
  addCompetitor: permissionProcedure('bot_settings.manage')
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      url: z.string().url().max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (!analyzer.isUrlSafe(input.url)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Website URL is not allowed' });
        }
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Create competitor record
        const competitorId = await createCompetitorAnalysis({
          merchantId: merchant.id,
          name: input.name,
          url: input.url,
          status: 'analyzing',
        });

        // Start analysis in background
        void (async () => {
          try {
            // Analyze competitor website
            const result = await analyzer.analyzeWebsite(input.url, merchant.id);

            // Update competitor with results
            await updateCompetitorAnalysis(competitorId, {
              overallScore: result.overallScore,
              seoScore: result.seoScore,
              performanceScore: result.performanceScore,
              uxScore: result.uxScore,
              contentScore: result.contentQuality,
            });

            // Extract competitor products
            const scraped = await analyzer.scrapeWebsite(input.url);
            let products: analyzer.ExtractedProduct[];
            try {
              products = await analyzer.extractProducts(input.url, scraped.html, scraped.text, merchant.id);
            } finally { scraped.dom.window.close(); }

            let totalPrice = 0;
            let minPrice = Infinity;
            let maxPrice = 0;
            let productCount = 0;

            for (const product of products) {
              if (product.price) {
                totalPrice += product.price;
                minPrice = Math.min(minPrice, product.price);
                maxPrice = Math.max(maxPrice, product.price);
                productCount++;
              }

              await createCompetitorProduct({
                competitorId,
                merchantId: merchant.id,
                name: product.name,
                description: product.description,
                price: product.price,
                currency: product.currency,
                imageUrl: product.imageUrl,
                productUrl: product.productUrl,
                category: product.category,
              });
            }

            // Update pricing stats
            if (productCount > 0) {
              await updateCompetitorAnalysis(competitorId, {
                avgPrice: totalPrice / productCount,
                minPrice: minPrice === Infinity ? 0 : minPrice,
                maxPrice,
                productCount,
              });
            }

            // Product writes must settle before a terminal report can be read or deleted.
            await updateCompetitorAnalysis(competitorId, { status: 'completed' });
            console.log('[CompetitorAnalysis] Analysis completed:', competitorId);
          } catch {
            console.error('[CompetitorAnalysis] Analysis failed');
            await updateCompetitorAnalysis(competitorId, {
              status: 'failed',
              errorMessage: 'COMPETITOR_ANALYSIS_FAILED',
            });
          }
        })().catch(() => { console.error('[CompetitorAnalysis] Failed to store terminal status'); });

        return { competitorId, status: 'analyzing' };
      } catch (error) {
        console.error('[CompetitorAnalysis] Error starting analysis');
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Competitor analysis unavailable',
        });
      }
    }),

  /**
   * قائمة المنافسين
   */
  listCompetitors: merchantProcedure.query(async ({ ctx }) => reportOperation(async () => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return (await getCompetitorAnalysesByMerchant(merchant.id)).map(publicCompetitor);
  })),

  /**
   * الحصول على تحليل منافس
   */
  getCompetitor: merchantProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => reportOperation(async () => {
      const competitor = await getCompetitorAnalysisById(input.id);

      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      // Verify ownership
      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return publicCompetitor(competitor);
    })),

  /**
   * الحصول على منتجات المنافس
   */
  getCompetitorProducts: merchantProcedure
    .input(z.object({
      competitorId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const competitor = await getCompetitorAnalysisById(input.competitorId);
      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await getCompetitorProductsByCompetitorId(input.competitorId);
    }),

  /**
   * مقارنة مع المنافسين
   */
  compareWithCompetitors: permissionProcedure('bot_settings.manage')
    .input(z.object({
      analysisId: z.number(),
      competitorIds: z.array(z.number()),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Get competitor analyses
      const competitors = await Promise.all(
        input.competitorIds.map(id => getCompetitorAnalysisById(id))
      );

      // Filter out null values and verify ownership
      const validCompetitors = competitors.filter(
        c => c && c.merchantId === merchant.id
      );

      if (validCompetitors.length === 0) {
        return { strengths: [], weaknesses: [], opportunities: [] };
      }

      // Convert to WebsiteAnalysisResult format
      const merchantAnalysis: analyzer.WebsiteAnalysisResult = {
        title: analysis.title || '',
        description: analysis.description || '',
        industry: analysis.industry || '',
        language: analysis.language || '',
        seoScore: analysis.seoScore,
        seoIssues: analysis.seoIssues || [],
        metaTags: analysis.metaTags || {},
        performanceScore: analysis.performanceScore,
        loadTime: analysis.loadTime || 0,
        pageSize: analysis.pageSize || 0,
        uxScore: analysis.uxScore,
        mobileOptimized: analysis.mobileOptimized,
        hasContactInfo: analysis.hasContactInfo,
        hasWhatsapp: analysis.hasWhatsapp,
        contentQuality: analysis.contentQuality,
        wordCount: analysis.wordCount,
        imageCount: analysis.imageCount,
        videoCount: analysis.videoCount,
        overallScore: analysis.overallScore,
      };

      const competitorAnalyses: analyzer.WebsiteAnalysisResult[] = validCompetitors.map(c => ({
        title: c.name,
        description: '',
        industry: c.industry || '',
        language: '',
        seoScore: c.seoScore,
        seoIssues: [],
        metaTags: {},
        performanceScore: c.performanceScore,
        loadTime: 0,
        pageSize: 0,
        uxScore: c.uxScore,
        mobileOptimized: false,
        hasContactInfo: false,
        hasWhatsapp: false,
        contentQuality: c.contentScore,
        wordCount: 0,
        imageCount: 0,
        videoCount: 0,
        overallScore: c.overallScore,
      }));

      // Compare
      const comparison = await analyzer.compareWithCompetitors(
        merchantAnalysis,
        competitorAnalyses,
        merchant.id,
      );

      return comparison;
    }),

  /**
   * حذف منافس
   */
  deleteCompetitor: permissionProcedure('bot_settings.manage')
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => reportOperation(async () => {
      // Verify ownership
      const competitor = await getCompetitorAnalysisById(input.id);
      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      if (competitor.status === 'pending' || competitor.status === 'analyzing') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Wait for competitor analysis to settle before deletion' });
      }
      await deleteCompetitorAnalysis(input.id);
      return { success: true };
    })),
});
