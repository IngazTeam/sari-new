/**
 * AI Opportunity Engine — "ساري يقترح"
 * 
 * Architecture: Rule Engine + GPT Layer
 * 1. Rule Engine: Aggregates structured signals from existing analytics
 * 2. GPT Layer: Interprets signals into 2-3 actionable insights
 * 3. Cache: 6-hour per-merchant cache to minimize API costs
 */

import { callGPT4 } from './openai';
import type { ChatMessage } from './openai';

// ═══ Types ═══
export interface AiInsight {
  type: 'opportunity' | 'momentum' | 'alert' | 'recovery' | 'discovery';
  title: string;
  body: string;
  action: { label: string; href: string } | null;
  emoji: string;
}

interface MerchantSignals {
  businessName: string;
  salesGrowth: number;
  revenueGrowth: number;
  topProduct: string | null;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  conversationCount: number;
  campaignCount: number;
  hasWhatsapp: boolean;
  hasProducts: boolean;
  productCount: number;
  daysSinceSignup: number;
}

// ═══ Cache — 6 hours per merchant, max 500 entries ═══
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_SIZE = 500;
const insightsCache = new Map<number, { insights: AiInsight[]; expiresAt: number }>();

// Allowed internal routes for action hrefs (prevents open redirect)
const ALLOWED_HREFS = new Set([
  '/merchant/products', '/merchant/campaigns/new', '/merchant/conversations',
  '/merchant/whatsapp', '/merchant/sari-brain', '/merchant/reports',
  '/merchant/orders', '/merchant/settings', '/merchant/reviews',
]);

/** Sanitize text for GPT prompt injection prevention */
function sanitizeForPrompt(text: string): string {
  return text.replace(/[\n\r"'`${}\\]/g, '').substring(0, 100);
}

/**
 * Main entry: Generate merchant insights (cached)
 */
export async function generateMerchantInsights(merchantId: number): Promise<AiInsight[]> {
  // Check cache first
  const cached = insightsCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.insights;
  }

  try {
    // 1. Collect signals
    const signals = await collectSignals(merchantId);

    // Skip if not enough data
    if (signals.totalOrders < 1 && signals.conversationCount < 3 && !signals.hasWhatsapp) {
      return []; // New merchant, no insights yet
    }

    // 2. Generate insights via GPT
    const insights = await gptInterpret(signals);

    // 3. Cache (with LRU eviction)
    if (insightsCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = insightsCache.keys().next().value;
      if (oldestKey !== undefined) insightsCache.delete(oldestKey);
    }
    insightsCache.set(merchantId, {
      insights,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return insights;
  } catch (error) {
    console.error('[AI Insights] Error generating insights:', error);
    return []; // Graceful degradation
  }
}

/**
 * Rule Engine — Collect structured signals from existing data
 */
async function collectSignals(merchantId: number): Promise<MerchantSignals> {
  const { getDb } = await import('../db');
  const db = await getDb();

  // Import analytics functions (already exist)
  const { getDashboardStats, getComparisonStats, getTopProducts } = await import('../dashboard-analytics');

  // Parallel fetch all signals
  const [stats, comparison, topProducts] = await Promise.all([
    getDashboardStats(merchantId),
    getComparisonStats(merchantId, 7), // Last 7 days for recent momentum
    getTopProducts(merchantId, 3),
  ]);

  // Get merchant info + counts
  let businessName = '';
  let daysSinceSignup = 0;
  let conversationCount = 0;
  let campaignCount = 0;
  let hasWhatsapp = false;
  let productCount = 0;

  if (db) {
    const { merchants, conversations, campaigns, whatsappInstances, products } = await import('../../drizzle/schema');
    const { eq, sql } = await import('drizzle-orm');

    const [merchantRow] = await db.select({
      name: merchants.businessName,
      createdAt: merchants.createdAt,
    }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);

    if (merchantRow) {
      businessName = merchantRow.name || '';
      daysSinceSignup = Math.floor((Date.now() - new Date(merchantRow.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    }

    const [convCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(conversations).where(eq(conversations.merchantId, merchantId));
    conversationCount = Number(convCount?.count || 0);

    const [campCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(campaigns).where(eq(campaigns.merchantId, merchantId));
    campaignCount = Number(campCount?.count || 0);

    const [waCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(whatsappInstances).where(eq(whatsappInstances.merchantId, merchantId));
    hasWhatsapp = Number(waCount?.count || 0) > 0;

    const [prodCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(products).where(eq(products.merchantId, merchantId));
    productCount = Number(prodCount?.count || 0);
  }

  return {
    businessName,
    salesGrowth: comparison.growth.orders,
    revenueGrowth: comparison.growth.revenue,
    topProduct: topProducts[0]?.productName || null,
    totalOrders: stats.totalOrders,
    totalRevenue: stats.totalRevenue,
    pendingOrders: stats.pendingOrders,
    completedOrders: stats.completedOrders,
    avgOrderValue: stats.averageOrderValue,
    conversationCount,
    campaignCount,
    hasWhatsapp,
    hasProducts: productCount > 0,
    productCount,
    daysSinceSignup,
  };
}

/**
 * GPT Layer — Interpret signals into actionable insights
 */
async function gptInterpret(signals: MerchantSignals): Promise<AiInsight[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `أنت "ساري"، مستشار تجاري ذكي لنشاط تجاري عربي.
مهمتك: تحليل بيانات النشاط وتقديم 2-3 اقتراحات ذكية قابلة للتنفيذ.

القواعد:
- بالعربية فقط
- 2-3 اقتراحات كحد أقصى
- كل اقتراح يحتوي على: type, title, body, action, emoji
- الأنواع المتاحة: opportunity, momentum, alert, recovery, discovery
- action.href يجب أن يكون أحد هذه المسارات فقط:
  /merchant/products — إدارة المنتجات
  /merchant/campaigns/new — إطلاق حملة
  /merchant/conversations — المحادثات
  /merchant/whatsapp — ربط واتساب
  /merchant/sari-brain — عقل ساري
  /merchant/reports — التقارير
- لا تكرر الأرقام فقط، فسّر السلوك واقترح إجراء
- اجعل النص مختصراً ومباشراً (سطرين كحد أقصى للـ body)
- أعد JSON array فقط بدون أي نص إضافي`
    },
    {
      role: 'user',
      content: `بيانات النشاط التجاري:
${JSON.stringify({
  نمو_الطلبات: `${signals.salesGrowth}%`,
  نمو_الإيرادات: `${signals.revenueGrowth}%`,
  إجمالي_الطلبات_آخر_30_يوم: signals.totalOrders,
  طلبات_معلقة: signals.pendingOrders,
  أفضل_منتج: sanitizeForPrompt(signals.topProduct || 'لا يوجد'),
  عدد_المحادثات: signals.conversationCount,
  عدد_الحملات: signals.campaignCount,
  واتساب_مربوط: signals.hasWhatsapp,
  عدد_المنتجات: signals.productCount,
  أيام_منذ_التسجيل: signals.daysSinceSignup,
}, null, 2)}`
    }
  ];

  const response = await callGPT4(messages, {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 800,
  });

  // Parse JSON response
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    // Validate and sanitize
    return parsed
      .slice(0, 3) // Max 3 insights
      .map((item: any) => ({
        type: ['opportunity', 'momentum', 'alert', 'recovery', 'discovery'].includes(item.type) ? item.type : 'discovery',
        title: String(item.title || '').substring(0, 100),
        body: String(item.body || '').substring(0, 200),
        action: item.action ? {
          label: String(item.action.label || '').substring(0, 50),
          href: ALLOWED_HREFS.has(String(item.action.href || '')) ? String(item.action.href) : '/merchant/reports',
        } : null,
        emoji: String(item.emoji || '🧠').substring(0, 4),
      }))
      .filter((item: AiInsight) => item.title && item.body); // Remove empty
  } catch {
    console.error('[AI Insights] Failed to parse GPT response:', response.substring(0, 200));
    return [];
  }
}
