/**
 * Website Analysis Router
 * 
 * APIs للتحليل الذكي للمواقع
 */

import { router, protectedProcedure } from './_core/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as db from './db';
import * as analyzer from './_core/websiteAnalyzer';

export const websiteAnalysisRouter = router({
  /**
   * تحليل موقع جديد
   */
  analyze: protectedProcedure
    .input(z.object({
      url: z.string().url(),
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Also rate limit per merchant (prevents multi-IP abuse)
        const merchantCheck = checkRateLimit(`analyze_merchant:${merchant.id}`, 5, 3600000);
        if (!merchantCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التحليل. حاول بعد قليل.' });
        }

        // Create analysis record with pending status
        const analysisId = await db.createWebsiteAnalysis({
          merchantId: merchant.id,
          url: input.url,
          status: 'analyzing',
        });

        // Start analysis in background with GLOBAL TIMEOUT (90s)
        // BUG FIX: Without global timeout, if crawling 5 sub-pages (15s each) + LLM calls hang,
        // the analysis stays 'analyzing' FOREVER and frontend polls indefinitely.
        const runPipeline = async () => {
          let scrapedHtml = '';
          let scrapedText = '';

          // Phase 1: Analyze website (with 45s timeout for the whole phase including sub-page crawling)
          try {
            const analyzePromise = analyzer.analyzeWebsite(input.url);
            const analyzeTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Analysis phase timeout (45s)')), 45000)
            );
            const result = await Promise.race([analyzePromise, analyzeTimeout]);

            // Update analysis with results
            await db.updateWebsiteAnalysis(analysisId, {
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
              status: 'analyzing',
            });

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
                  await db.updateMerchant(merchant.id, updateData);
                  console.log('[WebsiteAnalysis] Updated merchant contact info:', updateData);
                } catch (contactErr: any) {
                  console.warn('[WebsiteAnalysis] Failed to update merchant contact:', contactErr.message);
                }
              }
            }

            // Save extracted FAQs
            if (result.faqs && result.faqs.length > 0) {
              try {
                await db.deleteAllExtractedFaqs(merchant.id);
                for (const faq of result.faqs) {
                  await db.createExtractedFaq({
                    merchantId: merchant.id,
                    question: faq.question,
                    answer: faq.answer,
                    category: faq.category,
                  });
                }
                console.log(`[WebsiteAnalysis] Saved ${result.faqs.length} FAQs for merchant ${merchant.id}`);
              } catch (faqErr: any) {
                console.warn('[WebsiteAnalysis] Failed to save FAQs:', faqErr.message);
              }
            }
          } catch (analysisError) {
            console.error('[WebsiteAnalysis] Analysis phase failed:', analysisError);
            // Save partial info but DON'T re-set status to 'analyzing' — let finally block handle it
            try {
              await db.updateWebsiteAnalysis(analysisId, {
                title: new URL(input.url).hostname,
                description: 'تعذر تحليل الموقع بسبب حماية أو تجاوز المهلة — تم استخراج المنتجات عبر API',
                overallScore: 0,
              });
            } catch (dbErr) {
              console.error('[WebsiteAnalysis] Failed to save partial Phase 1 data:', dbErr);
            }
          }

          // Phase 2: Extract products (independent from analysis, with 30s timeout)
          try {
            // Try scraping first (only if Phase 1 didn't already scrape)
            try {
              const scrapePromise = analyzer.scrapeWebsite(input.url);
              const scrapeTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Scrape timeout (15s)')), 15000)
              );
              const scraped = await Promise.race([scrapePromise, scrapeTimeout]) as any;
              scrapedHtml = scraped.html;
              scrapedText = scraped.text;
            } catch (scrapeError) {
              console.warn('[WebsiteAnalysis] Scrape failed (likely Cloudflare/timeout), trying API-only extraction:',
                scrapeError instanceof Error ? scrapeError.message : 'unknown');
            }

            // Extract products with timeout — works even with empty HTML for Zid/Salla via API strategy
            const extractPromise = analyzer.extractProducts(input.url, scrapedHtml, scrapedText);
            const extractTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Product extraction timeout (30s)')), 30000)
            );
            const products = await Promise.race([extractPromise, extractTimeout]) as any[];
            console.log(`[WebsiteAnalysis] extractProducts returned ${products.length} products, saving to DB...`);

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

                await db.createExtractedProduct({
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
                console.error(`[WebsiteAnalysis] Failed to save product "${product.name}":`, saveError instanceof Error ? saveError.message : saveError);
              }
            }

            console.log(`[WebsiteAnalysis] Saved ${savedCount}/${products.length} products for analysis ${analysisId}`);

            // ✅ ALSO save to main products table so the AI bot can use them immediately
            if (savedCount > 0) {
              try {
                await db.deleteAllProductsByMerchantId(merchant.id);
                let mainSavedCount = 0;
                for (const product of products) {
                  if (!product.name || (typeof product.name === 'string' && !product.name.trim())) continue;
                  try {
                    await db.createProduct({
                      merchantId: merchant.id,
                      name: typeof product.name === 'string' ? product.name.substring(0, 500) : String(product.name),
                      description: typeof product.description === 'string' ? product.description.substring(0, 2000) : '',
                      price: Math.round(product.price || 0),
                      currency: (product.currency === 'USD' ? 'USD' : 'SAR') as 'SAR' | 'USD',
                      imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : null,
                      productUrl: typeof product.productUrl === 'string' ? product.productUrl : null,
                      category: typeof product.category === 'string' ? product.category : null,
                    });
                    mainSavedCount++;
                  } catch (err: any) {
                    console.error(`[WebsiteAnalysis] Failed to save to main products: ${product.name}`, err.message);
                  }
                }
                console.log(`[WebsiteAnalysis] ✅ Saved ${mainSavedCount} products to MAIN products table for merchant ${merchant.id}`);
              } catch (mainErr: any) {
                console.error('[WebsiteAnalysis] Failed to save to main products table:', mainErr.message);
              }
            }
          } catch (productError) {
            console.error('[WebsiteAnalysis] Product extraction failed/timed out:', productError);
          }

          // Phase 3: Generate insights (only if we have analysis data, with timeout)
          try {
            const analysis = await db.getWebsiteAnalysisById(analysisId);
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

              const insightsPromise = analyzer.generateInsights(insightsData);
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Insights generation timeout (15s)')), 15000)
              );
              const insights = await Promise.race([insightsPromise, timeoutPromise]);

              for (const insight of insights) {
                await db.createWebsiteInsight({
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
            console.error('[WebsiteAnalysis] Insights generation failed/timed out:', insightsError);
          }

          // Final: Mark analysis as completed after all phases finish
          try {
            await db.updateWebsiteAnalysis(analysisId, { status: 'completed' });
            console.log('[WebsiteAnalysis] Analysis pipeline completed:', analysisId);
          } catch (finalUpdateErr) {
            console.error('[WebsiteAnalysis] CRITICAL: Failed to mark as completed:', finalUpdateErr);
          }
        };

        // GLOBAL TIMEOUT: Entire pipeline must finish in 90 seconds
        const globalTimeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Global analysis pipeline timeout (90s)')), 90000)
        );

        Promise.race([runPipeline(), globalTimeout])
          .catch((err) => {
            console.error('[WebsiteAnalysis] Background pipeline crashed/timed out:', err);
          })
          .finally(async () => {
            // GUARANTEE: status NEVER stays 'analyzing' forever
            try {
              const existing = await db.getWebsiteAnalysisById(analysisId);
              if (existing && existing.status === 'analyzing') {
                const finalStatus = existing.overallScore > 0 ? 'completed' : 'failed';
                await db.updateWebsiteAnalysis(analysisId, {
                  status: finalStatus,
                  ...(finalStatus === 'failed' ? { errorMessage: 'فشل إكمال التحليل. حاول مرة أخرى.' } : {})
                });
                console.log(`[WebsiteAnalysis] finally: marked analysis ${analysisId} as ${finalStatus}`);
              }
            } catch (finalErr) {
              console.error('[WebsiteAnalysis] CRITICAL: finally block DB update failed:', finalErr);
            }
          });

        return { analysisId, status: 'analyzing' };
      } catch (error) {
        console.error('[WebsiteAnalysis] Error starting analysis:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start analysis',
        });
      }
    }),

  /**
   * الحصول على تحليل محفوظ
   */
  getAnalysis: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const analysis = await db.getWebsiteAnalysisById(input.id);

      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      // Verify ownership
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // BUG FIX: Always include products — they may be saved before insights phase completes
      let extractedProductsList: any[] = [];
      extractedProductsList = await db.getExtractedProductsByAnalysisId(input.id);

      return { ...analysis, extractedProducts: extractedProductsList };
    }),

  /**
   * قائمة التحليلات
   */
  listAnalyses: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return await db.getWebsiteAnalysesByMerchant(merchant.id);
  }),

  /**
   * الحصول على المنتجات المستخرجة
   */
  getExtractedProducts: protectedProcedure
    .input(z.object({
      analysisId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await db.getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await db.getExtractedProductsByAnalysisId(input.analysisId);
    }),

  /**
   * الحصول على الرؤى الذكية
   */
  getInsights: protectedProcedure
    .input(z.object({
      analysisId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await db.getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await db.getInsightsByAnalysisId(input.analysisId);
    }),

  /**
   * حذف تحليل
   */
  deleteAnalysis: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await db.getWebsiteAnalysisById(input.id);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      await db.deleteWebsiteAnalysis(input.id);
      return { success: true };
    }),

  /**
   * إضافة منافس
   */
  addCompetitor: protectedProcedure
    .input(z.object({
      name: z.string(),
      url: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Create competitor record
        const competitorId = await db.createCompetitorAnalysis({
          merchantId: merchant.id,
          name: input.name,
          url: input.url,
          status: 'analyzing',
        });

        // Start analysis in background
        (async () => {
          try {
            // Analyze competitor website
            const result = await analyzer.analyzeWebsite(input.url);

            // Update competitor with results
            await db.updateCompetitorAnalysis(competitorId, {
              overallScore: result.overallScore,
              seoScore: result.seoScore,
              performanceScore: result.performanceScore,
              uxScore: result.uxScore,
              contentScore: result.contentQuality,
              status: 'completed',
            });

            // Extract competitor products
            const { html, text } = await analyzer.scrapeWebsite(input.url);
            const products = await analyzer.extractProducts(input.url, html, text);

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

              await db.createCompetitorProduct({
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
              await db.updateCompetitorAnalysis(competitorId, {
                avgPrice: totalPrice / productCount,
                minPrice: minPrice === Infinity ? 0 : minPrice,
                maxPrice,
                productCount,
              });
            }

            console.log('[CompetitorAnalysis] Analysis completed:', competitorId);
          } catch (error) {
            console.error('[CompetitorAnalysis] Analysis failed:', error);
            await db.updateCompetitorAnalysis(competitorId, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })();

        return { competitorId, status: 'analyzing' };
      } catch (error) {
        console.error('[CompetitorAnalysis] Error starting analysis:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start analysis',
        });
      }
    }),

  /**
   * قائمة المنافسين
   */
  listCompetitors: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }

    return await db.getCompetitorAnalysesByMerchant(merchant.id);
  }),

  /**
   * الحصول على تحليل منافس
   */
  getCompetitor: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const competitor = await db.getCompetitorAnalysisById(input.id);

      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      // Verify ownership
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return competitor;
    }),

  /**
   * الحصول على منتجات المنافس
   */
  getCompetitorProducts: protectedProcedure
    .input(z.object({
      competitorId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const competitor = await db.getCompetitorAnalysisById(input.competitorId);
      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return await db.getCompetitorProductsByCompetitorId(input.competitorId);
    }),

  /**
   * مقارنة مع المنافسين
   */
  compareWithCompetitors: protectedProcedure
    .input(z.object({
      analysisId: z.number(),
      competitorIds: z.array(z.number()),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const analysis = await db.getWebsiteAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || analysis.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Get competitor analyses
      const competitors = await Promise.all(
        input.competitorIds.map(id => db.getCompetitorAnalysisById(id))
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
        competitorAnalyses
      );

      return comparison;
    }),

  /**
   * حذف منافس
   */
  deleteCompetitor: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const competitor = await db.getCompetitorAnalysisById(input.id);
      if (!competitor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Competitor not found' });
      }

      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant || competitor.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      await db.deleteCompetitorAnalysis(input.id);
      return { success: true };
    }),
});
