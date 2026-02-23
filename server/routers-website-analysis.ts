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
        // Get merchant ID
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Create analysis record with pending status
        const analysisId = await db.createWebsiteAnalysis({
          merchantId: merchant.id,
          url: input.url,
          status: 'analyzing',
        });

        // Start analysis in background
        (async () => {
          let scrapedHtml = '';
          let scrapedText = '';

          // Phase 1: Analyze website
          try {
            const result = await analyzer.analyzeWebsite(input.url);

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
          } catch (analysisError) {
            console.error('[WebsiteAnalysis] Analysis phase failed:', analysisError);
            // Keep status as analyzing — don't block product extraction
            await db.updateWebsiteAnalysis(analysisId, {
              status: 'analyzing',
              title: new URL(input.url).hostname,
              description: 'تعذر تحليل الموقع بسبب حماية Cloudflare — تم استخراج المنتجات عبر API',
              overallScore: 0,
            });
          }

          // Phase 2: Extract products (independent from analysis)
          try {
            // Try scraping first
            try {
              const scraped = await analyzer.scrapeWebsite(input.url);
              scrapedHtml = scraped.html;
              scrapedText = scraped.text;
            } catch (scrapeError) {
              console.warn('[WebsiteAnalysis] Scrape failed (likely Cloudflare), trying API-only extraction:',
                scrapeError instanceof Error ? scrapeError.message : 'unknown');
            }

            // Extract products — works even with empty HTML for Zid/Salla via API strategy
            const products = await analyzer.extractProducts(input.url, scrapedHtml, scrapedText);
            console.log(`[WebsiteAnalysis] extractProducts returned ${products.length} products, saving to DB...`);

            let savedCount = 0;
            for (const product of products) {
              try {
                // Truncate fields to fit DB varchar limits
                await db.createExtractedProduct({
                  analysisId,
                  merchantId: merchant.id,
                  name: (product.name || 'Unknown').substring(0, 500),
                  description: (product.description || '').substring(0, 2000),
                  price: product.price,
                  currency: (product.currency || 'SAR').substring(0, 10),
                  imageUrl: product.imageUrl ? product.imageUrl.substring(0, 500) : undefined,
                  productUrl: product.productUrl ? product.productUrl.substring(0, 500) : undefined,
                  category: product.category ? product.category.substring(0, 255) : undefined,
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
          } catch (productError) {
            console.error('[WebsiteAnalysis] Product extraction failed:', productError);
          }

          // Phase 3: Generate insights (only if we have analysis data)
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
              const insights = await analyzer.generateInsights(insightsData);

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
            console.error('[WebsiteAnalysis] Insights generation failed:', insightsError);
          }

          // Final: Mark analysis as completed after all phases finish
          await db.updateWebsiteAnalysis(analysisId, { status: 'completed' });
          console.log('[WebsiteAnalysis] Analysis pipeline completed:', analysisId);
        })().catch(err => {
          console.error('[WebsiteAnalysis] Background pipeline crashed:', err);
          // Try to mark as failed so frontend doesn't poll forever
          db.updateWebsiteAnalysis(analysisId, { status: 'failed', errorMessage: String(err) }).catch(() => { });
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

      // Include products when analysis is completed
      let extractedProductsList: any[] = [];
      if (analysis.status === 'completed') {
        extractedProductsList = await db.getExtractedProductsByAnalysisId(input.id);
      }

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
