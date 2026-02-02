/**
 * SEO Router Module
 * Handles SEO pages and metadata management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import * as seoDb from "./db/seo";

export const seoRouter = router({
    // Dashboard
    getDashboard: adminProcedure.query(async () => {
        return await seoDb.getSeoPageDashboard();
    }),

    // Pages
    getPages: adminProcedure.query(async () => {
        return await seoDb.getSeoPages();
    }),

    getPageBySlug: adminProcedure
        .input(z.object({ slug: z.string() }))
        .query(async ({ input }) => {
            return await seoDb.getSeoPageBySlug(input.slug);
        }),

    getPageFullData: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getSeoPageFullData(input.pageId);
        }),

    createPage: adminProcedure
        .input(z.object({
            pageSlug: z.string(),
            pageTitle: z.string(),
            pageDescription: z.string(),
            keywords: z.string().optional(),
            author: z.string().optional(),
            canonicalUrl: z.string().optional(),
            isIndexed: z.number().optional(),
            isPriority: z.number().optional(),
            changeFrequency: z.string().optional(),
            priority: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            return await seoDb.createSeoPage(input);
        }),

    updatePage: adminProcedure
        .input(z.object({
            pageId: z.number(),
            data: z.record(z.any()),
        }))
        .mutation(async ({ input }) => {
            return await seoDb.updateSeoPage(input.pageId, input.data);
        }),

    // Meta Tags
    getMetaTags: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getMetaTagsByPageId(input.pageId);
        }),

    createMetaTag: adminProcedure
        .input(z.object({
            pageId: z.number(),
            metaName: z.string(),
            metaContent: z.string(),
            metaProperty: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            return await seoDb.createMetaTag(input);
        }),

    // Open Graph
    getOpenGraph: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getOpenGraphByPageId(input.pageId);
        }),

    createOpenGraph: adminProcedure
        .input(z.object({
            pageId: z.number(),
            ogTitle: z.string(),
            ogDescription: z.string(),
            ogImage: z.string().optional(),
            ogImageAlt: z.string().optional(),
            ogImageWidth: z.number().optional(),
            ogImageHeight: z.number().optional(),
            ogType: z.string().optional(),
            ogUrl: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            return await seoDb.createOpenGraph(input);
        }),

    // Tracking Codes
    getTrackingCodes: adminProcedure.query(async () => {
        return await seoDb.getTrackingCodes();
    }),

    createTrackingCode: adminProcedure
        .input(z.object({
            pageId: z.number().optional(),
            trackingType: z.string(),
            trackingId: z.string(),
            trackingCode: z.string().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
            return await seoDb.createTrackingCode(input);
        }),

    // Analytics
    getAnalytics: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getAnalyticsByPageId(input.pageId);
        }),

    // Keywords
    getKeywords: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getKeywordsByPageId(input.pageId);
        }),

    // Backlinks
    getBacklinks: adminProcedure
        .input(z.object({ pageId: z.number() }))
        .query(async ({ input }) => {
            return await seoDb.getBacklinksByPageId(input.pageId);
        }),

    // Sitemaps
    getSitemaps: adminProcedure
        .input(z.object({ type: z.string().optional() }))
        .query(async ({ input }) => {
            return await seoDb.getSitemaps(input.type);
        }),

    // Recommendations
    getRecommendations: adminProcedure
        .input(z.object({ pageId: z.number().optional() }))
        .query(async ({ input }) => {
            if (input.pageId) {
                return await seoDb.getRecommendationsByPageId(input.pageId);
            }
            return await seoDb.getPendingRecommendations();
        }),

    getAllRecommendations: adminProcedure
        .query(async () => {
            return await seoDb.getPendingRecommendations();
        }),

    updateRecommendation: adminProcedure
        .input(z.object({
            id: z.number(),
            status: z.enum(['pending', 'in_progress', 'completed', 'dismissed']).optional(),
            completedAt: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const updateData: any = {};
            if (input.status) updateData.status = input.status;
            if (input.completedAt) updateData.completedAt = input.completedAt;
            return await seoDb.updateRecommendation(input.id, updateData);
        }),
});

export type SeoRouter = typeof seoRouter;
