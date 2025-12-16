/**
 * SEO Database Functions
 * Comprehensive SEO management functions
 */

import { eq, and, desc, gte } from "drizzle-orm";
import { getDb } from "./db";
import {
  seoPages,
  seoMetaTags,
  seoOpenGraph,
  seoTwitterCards,
  seoStructuredData,
  seoTrackingCodes,
  seoAnalytics,
  seoKeywordsAnalysis,
  seoBacklinks,
  seoPerformanceAlerts,
  seoRecommendations,
  seoSitemaps,
} from "../drizzle/schema";

// ============================================
// SEO Pages
// ============================================

export async function createSeoPage(data: {
  pageSlug: string;
  pageTitle: string;
  pageDescription: string;
  keywords?: string;
  author?: string;
  canonicalUrl?: string;
  isIndexed?: number;
  isPriority?: number;
  changeFrequency?: string;
  priority?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  return db.insert(seoPages).values(data);
}

export async function getSeoPages() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) return [];
  return db.query.seoPages.findMany({
    orderBy: desc(seoPages.createdAt),
  });
}

export async function getSeoPageBySlug(slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) return null;
  return db.query.seoPages.findFirst({
    where: eq(seoPages.pageSlug, slug),
  });
}

export async function updateSeoPage(pageId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");
  return db.update(seoPages).set(data).where(eq(seoPages.id, pageId));
}

// ============================================
// Meta Tags
// ============================================

export async function createMetaTag(data: {
  pageId: number;
  metaName: string;
  metaContent: string;
  metaProperty?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoMetaTags).values(data);
}

export async function getMetaTagsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoMetaTags.findMany({
    where: eq(seoMetaTags.pageId, pageId),
  });
}

// ============================================
// Open Graph
// ============================================

export async function createOpenGraph(data: {
  pageId: number;
  ogTitle: string;
  ogDescription: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogType?: string;
  ogUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoOpenGraph).values(data);
}

export async function getOpenGraphByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoOpenGraph.findFirst({
    where: eq(seoOpenGraph.pageId, pageId),
  });
}

// ============================================
// Twitter Cards
// ============================================

export async function createTwitterCard(data: {
  pageId: number;
  twitterTitle: string;
  twitterDescription: string;
  twitterCardType?: string;
  twitterImage?: string;
  twitterImageAlt?: string;
  twitterCreator?: string;
  twitterSite?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoTwitterCards).values(data);
}

export async function getTwitterCardByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoTwitterCards.findFirst({
    where: eq(seoTwitterCards.pageId, pageId),
  });
}

// ============================================
// Structured Data
// ============================================

export async function createStructuredData(data: {
  pageId: number;
  schemaType: string;
  schemaData: string;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoStructuredData).values(data);
}

export async function getStructuredDataByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoStructuredData.findMany({
    where: eq(seoStructuredData.pageId, pageId),
  });
}

// ============================================
// Tracking Codes
// ============================================

export async function createTrackingCode(data: {
  pageId?: number;
  trackingType: string;
  trackingId: string;
  trackingCode?: string;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoTrackingCodes).values(data);
}

export async function getTrackingCodes(pageId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (pageId) {
    return db.query.seoTrackingCodes.findMany({
      where: eq(seoTrackingCodes.pageId, pageId),
    });
  }
  return db.query.seoTrackingCodes.findMany();
}

// ============================================
// Analytics
// ============================================

export async function createAnalyticsRecord(data: {
  pageId: number;
  date: string;
  visitors?: number;
  pageViews?: number;
  bounceRate?: string;
  avgSessionDuration?: string;
  conversions?: number;
  conversionRate?: string;
  trafficSource?: string;
  device?: string;
  country?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoAnalytics).values(data);
}

export async function getAnalyticsByPageId(pageId: number, days?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return db.query.seoAnalytics.findMany({
      where: and(
        eq(seoAnalytics.pageId, pageId),
        gte(seoAnalytics.date, startDate.toISOString())
      ),
      orderBy: desc(seoAnalytics.date),
    });
  }
  return db.query.seoAnalytics.findMany({
    where: eq(seoAnalytics.pageId, pageId),
    orderBy: desc(seoAnalytics.date),
  });
}

// ============================================
// Keywords Analysis
// ============================================

export async function createKeywordAnalysis(data: {
  pageId: number;
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  currentRank?: number;
  targetRank?: number;
  competitorCount?: number;
  trend?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoKeywordsAnalysis).values(data);
}

export async function getKeywordsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoKeywordsAnalysis.findMany({
    where: eq(seoKeywordsAnalysis.pageId, pageId),
    orderBy: desc(seoKeywordsAnalysis.searchVolume),
  });
}

// ============================================
// Backlinks
// ============================================

export async function createBacklink(data: {
  pageId: number;
  sourceUrl: string;
  sourceDomain: string;
  anchorText?: string;
  linkType?: string;
  domainAuthority?: number;
  spamScore?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoBacklinks).values(data);
}

export async function getBacklinksByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoBacklinks.findMany({
    where: eq(seoBacklinks.pageId, pageId),
    orderBy: desc(seoBacklinks.domainAuthority),
  });
}

export async function getActiveBacklinks(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoBacklinks.findMany({
    where: and(
      eq(seoBacklinks.pageId, pageId),
      eq(seoBacklinks.status, "active")
    ),
  });
}

// ============================================
// Performance Alerts
// ============================================

export async function createAlert(data: {
  pageId: number;
  alertType: string;
  severity: string;
  message: string;
  metric?: string;
  previousValue?: string;
  currentValue?: string;
  threshold?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoPerformanceAlerts).values(data);
}

export async function getAlertsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoPerformanceAlerts.findMany({
    where: eq(seoPerformanceAlerts.pageId, pageId),
    orderBy: desc(seoPerformanceAlerts.createdAt),
  });
}

export async function getUnresolvedAlerts(pageId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (pageId) {
    return db.query.seoPerformanceAlerts.findMany({
      where: and(
        eq(seoPerformanceAlerts.pageId, pageId),
        eq(seoPerformanceAlerts.isResolved, 0)
      ),
    });
  }
  return db.query.seoPerformanceAlerts.findMany({
    where: eq(seoPerformanceAlerts.isResolved, 0),
  });
}

export async function resolveAlert(alertId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(seoPerformanceAlerts)
    .set({ isResolved: 1, resolvedAt: new Date().toISOString() })
    .where(eq(seoPerformanceAlerts.id, alertId));
}

// ============================================
// Recommendations
// ============================================

export async function createRecommendation(data: {
  pageId: number;
  recommendationType: string;
  title: string;
  description: string;
  priority?: string;
  estimatedImpact?: string;
  implementationDifficulty?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoRecommendations).values(data);
}

export async function getRecommendationsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.seoRecommendations.findMany({
    where: eq(seoRecommendations.pageId, pageId),
    orderBy: desc(seoRecommendations.priority),
  });
}

export async function getPendingRecommendations(pageId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (pageId) {
    return db.query.seoRecommendations.findMany({
      where: and(
        eq(seoRecommendations.pageId, pageId),
        eq(seoRecommendations.status, "pending")
      ),
    });
  }
  return db.query.seoRecommendations.findMany({
    where: eq(seoRecommendations.status, "pending"),
  });
}

export async function updateRecommendation(recId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(seoRecommendations).set(data).where(eq(seoRecommendations.id, recId));
}

// ============================================
// Sitemaps
// ============================================

export async function createSitemap(data: {
  sitemapType: string;
  url: string;
  entryCount?: number;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(seoSitemaps).values(data);
}

export async function getSitemaps(type?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (type) {
    return db.query.seoSitemaps.findMany({
      where: eq(seoSitemaps.sitemapType, type),
    });
  }
  return db.query.seoSitemaps.findMany();
}

// ============================================
// Dashboard
// ============================================

export async function getSeoPageFullData(pageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const page = await db.query.seoPages.findFirst({
    where: eq(seoPages.id, pageId),
  });

  if (!page) return null;

  const [metaTags, openGraph, twitterCard, structuredData, keywords, backlinks, alerts, recommendations] =
    await Promise.all([
      getMetaTagsByPageId(pageId),
      getOpenGraphByPageId(pageId),
      getTwitterCardByPageId(pageId),
      getStructuredDataByPageId(pageId),
      getKeywordsByPageId(pageId),
      getBacklinksByPageId(pageId),
      getAlertsByPageId(pageId),
      getRecommendationsByPageId(pageId),
    ]);

  return {
    page,
    metaTags,
    openGraph,
    twitterCard,
    structuredData,
    keywords,
    backlinks,
    alerts,
    recommendations,
  };
}

export async function getSeoPageDashboard() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!db) return null;
  
  const pages = await db.query.seoPages.findMany();
  const allAlerts = await getUnresolvedAlerts();
  const allRecommendations = await getPendingRecommendations();

  return {
    totalPages: pages.length,
    totalAlerts: allAlerts.length,
    totalRecommendations: allRecommendations.length,
    pages,
    alerts: allAlerts,
    recommendations: allRecommendations,
  };
}
