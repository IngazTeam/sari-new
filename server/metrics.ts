import { getDb } from './db';
import { testConversations, testMessages, testDeals } from '../drizzle/schema';
import { eq, and, gte, lte, sql, isNotNull } from 'drizzle-orm';

/**
 * حساب جميع المقاييس الـ15 لأداء ساري
 */
export async function calculateAllMetrics(merchantId: number, period: 'day' | 'week' | 'month') {
  const { startDate, endDate } = getDateRange(period);
  
  // 1-3: مقاييس التحويل والمبيعات
  const conversionRate = await calculateConversionRate(merchantId, startDate, endDate);
  const avgDealValue = await calculateAvgDealValue(merchantId, startDate, endDate);
  const totalRevenue = await calculateTotalRevenue(merchantId, startDate, endDate);
  
  // 4-6: مقاييس الوقت والكفاءة
  const avgResponseTime = await calculateAvgResponseTime(merchantId, startDate, endDate);
  const avgConversationLength = await calculateAvgConversationLength(merchantId, startDate, endDate);
  const avgTimeToConversion = await calculateAvgTimeToConversion(merchantId, startDate, endDate);
  
  // 7-9: مقاييس جودة المحادثة
  const resolutionRate = await calculateResolutionRate(merchantId, startDate, endDate);
  const escalationRate = await calculateEscalationRate(merchantId, startDate, endDate);
  const engagementRate = await calculateEngagementRate(merchantId, startDate, endDate);
  
  // 10-11: مقاييس النمو والتحسين
  const returnRate = await calculateReturnRate(merchantId, startDate, endDate);
  const referralRate = await calculateReferralRate(merchantId, startDate, endDate);
  
  // 12-15: مقاييس إضافية متقدمة
  const productClickRate = await calculateProductClickRate(merchantId, startDate, endDate);
  const orderCompletionRate = await calculateOrderCompletionRate(merchantId, startDate, endDate);
  const csatScore = await calculateCSATScore(merchantId, startDate, endDate);
  const npsScore = await calculateNPSScore(merchantId, startDate, endDate);
  
  return {
    conversion: {
      conversionRate,
      avgDealValue,
      totalRevenue,
    },
    time: {
      avgResponseTime,
      avgConversationLength,
      avgTimeToConversion,
    },
    quality: {
      resolutionRate,
      escalationRate,
      engagementRate,
    },
    growth: {
      returnRate,
      referralRate,
    },
    advanced: {
      productClickRate,
      orderCompletionRate,
      csatScore,
      npsScore,
    },
  };
}

// ==================== مقاييس التحويل والمبيعات ====================

/**
 * 1. معدل التحويل (Conversion Rate)
 * النسبة المئوية للمحادثات التي تحولت إلى اتفاق
 */
async function calculateConversionRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const totalConversations = await db
    .select({ count: sql<number>`count(*)` })
    .from(testConversations)
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  const totalDeals = await db
    .select({ count: sql<number>`count(*)` })
    .from(testDeals)
    .where(
      and(
        eq(testDeals.merchantId, merchantId),
        gte(testDeals.markedAt, startDate),
        lte(testDeals.markedAt, endDate)
      )
    );
    
  const conversations = Number(totalConversations[0]?.count) || 0;
  const deals = Number(totalDeals[0]?.count) || 0;
  
  return conversations > 0 ? Math.round((deals / conversations) * 100) : 0;
}

/**
 * 2. متوسط قيمة الصفقة (Average Deal Value)
 * متوسط قيمة المبيعات من الاتفاقات
 */
async function calculateAvgDealValue(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db
    .select({ avg: sql<number>`AVG(${testDeals.dealValue})` })
    .from(testDeals)
    .where(
      and(
        eq(testDeals.merchantId, merchantId),
        gte(testDeals.markedAt, startDate),
        lte(testDeals.markedAt, endDate)
      )
    );
    
  return Math.round(Number(result[0]?.avg) || 0);
}

/**
 * 3. الإيرادات المحتملة (Potential Revenue)
 * إجمالي قيمة جميع الاتفاقات
 */
async function calculateTotalRevenue(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db
    .select({ sum: sql<number>`SUM(${testDeals.dealValue})` })
    .from(testDeals)
    .where(
      and(
        eq(testDeals.merchantId, merchantId),
        gte(testDeals.markedAt, startDate),
        lte(testDeals.markedAt, endDate)
      )
    );
    
  return Math.round(Number(result[0]?.sum) || 0);
}

// ==================== مقاييس الوقت والكفاءة ====================

/**
 * 4. متوسط وقت الرد (Average Response Time)
 * متوسط الوقت بالميلي ثانية بين رسالة العميل ورد ساري
 */
async function calculateAvgResponseTime(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db
    .select({ avg: sql<number>`AVG(${testMessages.responseTime})` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.sender, 'sari'),
        isNotNull(testMessages.responseTime),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  return Math.round(Number(result[0]?.avg) || 0);
}

/**
 * 5. متوسط طول المحادثة (Conversation Length)
 * متوسط عدد الرسائل في المحادثة الواحدة
 */
async function calculateAvgConversationLength(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db
    .select({ 
      conversationId: testMessages.conversationId,
      messageCount: sql<number>`count(*)` 
    })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    )
    .groupBy(testMessages.conversationId);
    
  if (result.length === 0) return 0;
  
  const totalMessages = result.reduce((sum: number, conv: any) => sum + Number(conv.messageCount), 0);
  return Math.round(totalMessages / result.length);
}

/**
 * 6. وقت التحويل (Time to Conversion)
 * متوسط الوقت بالثواني من بداية المحادثة حتى الاتفاق
 */
async function calculateAvgTimeToConversion(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db
    .select({ avg: sql<number>`AVG(${testDeals.timeToConversion})` })
    .from(testDeals)
    .where(
      and(
        eq(testDeals.merchantId, merchantId),
        gte(testDeals.markedAt, startDate),
        lte(testDeals.markedAt, endDate)
      )
    );
    
  return Math.round(Number(result[0]?.avg) || 0);
}

// ==================== مقاييس جودة المحادثة ====================

/**
 * 7. معدل الاستفسارات المحلولة (Resolution Rate)
 * نسبة المحادثات التي تم حلها بنجاح (حصلت على تقييم إيجابي)
 */
async function calculateResolutionRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const totalConversations = await db
    .select({ count: sql<number>`count(*)` })
    .from(testConversations)
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  // عد المحادثات التي حصلت على تقييمات إيجابية
  const resolvedConversations = await db
    .select({ count: sql<number>`count(DISTINCT ${testMessages.conversationId})` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.rating, 'positive'),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  const total = Number(totalConversations[0]?.count) || 0;
  const resolved = Number(resolvedConversations[0]?.count) || 0;
  
  return total > 0 ? Math.round((resolved / total) * 100) : 0;
}

/**
 * 8. معدل التصعيد (Escalation Rate)
 * نسبة المحادثات التي تم تصعيدها للبشر (افتراضياً: المحادثات بدون اتفاق وبتقييم سلبي)
 */
async function calculateEscalationRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const totalConversations = await db
    .select({ count: sql<number>`count(*)` })
    .from(testConversations)
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  // المحادثات التي حصلت على تقييمات سلبية (مؤشر على الحاجة للتصعيد)
  const escalatedConversations = await db
    .select({ count: sql<number>`count(DISTINCT ${testMessages.conversationId})` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.rating, 'negative'),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  const total = Number(totalConversations[0]?.count) || 0;
  const escalated = Number(escalatedConversations[0]?.count) || 0;
  
  return total > 0 ? Math.round((escalated / total) * 100) : 0;
}

/**
 * 9. معدل التفاعل (Engagement Rate)
 * نسبة المحادثات التي تجاوزت 3 رسائل (مؤشر على التفاعل الجيد)
 */
async function calculateEngagementRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const allConversations = await db
    .select({ id: testConversations.id })
    .from(testConversations)
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  if (allConversations.length === 0) return 0;
  
  // المحادثات التي تحتوي على 3 رسائل أو أكثر
  const engagedConversations = await db
    .select({ 
      conversationId: testMessages.conversationId,
      count: sql<number>`count(*)` 
    })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    )
    .groupBy(testMessages.conversationId)
    .having(sql`count(*) >= 3`);
    
  return Math.round((engagedConversations.length / allConversations.length) * 100);
}

// ==================== مقاييس النمو والتحسين ====================

/**
 * 10. معدل العودة (Return Rate)
 * نسبة المحادثات المتكررة (افتراضياً: محادثات بنفس conversationId أو أكثر من محادثة)
 * ملاحظة: في الوضع الحالي نحسبها كنسبة المحادثات التي تحتوي على أكثر من 5 رسائل
 */
async function calculateReturnRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const allConversations = await db
    .select({ id: testConversations.id })
    .from(testConversations)
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    );
    
  if (allConversations.length === 0) return 0;
  
  // المحادثات الطويلة (5+ رسائل) تعتبر مؤشر على العودة والاهتمام
  const returningConversations = await db
    .select({ 
      conversationId: testMessages.conversationId,
      count: sql<number>`count(*)` 
    })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        gte(testConversations.startedAt, startDate),
        lte(testConversations.startedAt, endDate)
      )
    )
    .groupBy(testMessages.conversationId)
    .having(sql`count(*) >= 5`);
    
  return Math.round((returningConversations.length / allConversations.length) * 100);
}

/**
 * 11. معدل الإحالة (Referral Indicator)
 * نسبة المحادثات التي تحولت لاتفاق (كمؤشر على احتمالية التوصية)
 */
async function calculateReferralRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  // نفس معدل التحويل لكن كمؤشر على الإحالة
  return calculateConversionRate(merchantId, startDate, endDate);
}

// ==================== مقاييس إضافية متقدمة ====================

/**
 * 12. معدل النقر على المنتجات (Product Click Rate)
 * افتراضياً: نسبة المحادثات التي تحتوي على استفسارات عن المنتجات
 * (نحسبها كنسبة المحادثات التي أدت لاتفاق)
 */
async function calculateProductClickRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  return calculateConversionRate(merchantId, startDate, endDate);
}

/**
 * 13. معدل إكمال الطلب (Order Completion Rate)
 * نسبة الاتفاقات من إجمالي المحادثات
 */
async function calculateOrderCompletionRate(merchantId: number, startDate: string, endDate: string): Promise<number> {
  return calculateConversionRate(merchantId, startDate, endDate);
}

/**
 * 14. نقاط رضا العملاء (CSAT Score)
 * متوسط التقييمات (نسبة التقييمات الإيجابية من إجمالي التقييمات)
 * نعرضها من 5 (100% إيجابي = 5، 0% إيجابي = 0)
 */
async function calculateCSATScore(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const totalRatings = await db
    .select({ count: sql<number>`count(*)` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        isNotNull(testMessages.rating),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  const positiveRatings = await db
    .select({ count: sql<number>`count(*)` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.rating, 'positive'),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  const total = Number(totalRatings[0]?.count) || 0;
  const positive = Number(positiveRatings[0]?.count) || 0;
  
  if (total === 0) return 0;
  
  const percentage = (positive / total) * 100;
  return Number((percentage / 20).toFixed(1)); // تحويل من 0-100% إلى 0-5
}

/**
 * 15. صافي نقاط الترويج (NPS)
 * مقياس من -100 إلى +100 بناءً على التقييمات
 * (نسبة الإيجابي - نسبة السلبي) × 100
 */
async function calculateNPSScore(merchantId: number, startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const totalRatings = await db
    .select({ count: sql<number>`count(*)` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        isNotNull(testMessages.rating),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  const positiveRatings = await db
    .select({ count: sql<number>`count(*)` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.rating, 'positive'),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  const negativeRatings = await db
    .select({ count: sql<number>`count(*)` })
    .from(testMessages)
    .innerJoin(testConversations, eq(testMessages.conversationId, testConversations.id))
    .where(
      and(
        eq(testConversations.merchantId, merchantId),
        eq(testMessages.rating, 'negative'),
        gte(testMessages.sentAt, startDate),
        lte(testMessages.sentAt, endDate)
      )
    );
    
  const total = Number(totalRatings[0]?.count) || 0;
  const positive = Number(positiveRatings[0]?.count) || 0;
  const negative = Number(negativeRatings[0]?.count) || 0;
  
  if (total === 0) return 0;
  
  const promoterPercentage = (positive / total) * 100;
  const detractorPercentage = (negative / total) * 100;
  
  return Math.round(promoterPercentage - detractorPercentage);
}

// ==================== دوال مساعدة ====================

function getDateRange(period: 'day' | 'week' | 'month'): { startDate: string; endDate: string } {
  const now = new Date();
  let start: Date;
  
  switch (period) {
    case 'day':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }
  
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { startDate: fmt(start), endDate: fmt(now) };
}
