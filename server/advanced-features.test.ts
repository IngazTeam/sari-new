/**
 * اختبارات الميزات المتقدمة:
 * - نظام الكلمات المفتاحية الذكية
 * - تقارير المشاعر الأسبوعية
 * - اختبار A/B للردود
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Advanced Features - Keyword Analysis', () => {
  let merchantId: number;

  beforeAll(async () => {
    // إنشاء تاجر تجريبي
    const user = await db.createUser({
      openId: 'test_advanced_' + Date.now(),
      name: 'Test Merchant',
      email: 'test_advanced@test.com',
      role: 'user',
    });

    if (!user) throw new Error('Failed to create test user');

    const merchant = await db.createMerchant({
      userId: user.id,
      businessName: 'Test Business',
      status: 'active',
    });

    if (!merchant) throw new Error('Failed to create test merchant');
    merchantId = merchant.id;
  });

  it('should create keyword analysis', async () => {
    const keywordId = await db.upsertKeywordAnalysis({
      merchantId,
      keyword: 'سعر المنتج',
      category: 'price',
      sampleMessage: 'كم سعر هذا المنتج؟',
      suggestedResponse: 'السعر هو 100 ريال',
    });

    expect(keywordId).toBeGreaterThan(0);
  });

  it('should get keyword stats', async () => {
    const stats = await db.getKeywordStats(merchantId);
    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThan(0);
  });

  it('should get new keywords', async () => {
    const newKeywords = await db.getNewKeywords(merchantId);
    expect(Array.isArray(newKeywords)).toBe(true);
  });

  it('should update keyword status', async () => {
    const keywords = await db.getNewKeywords(merchantId, 1);
    if (keywords.length > 0) {
      await db.updateKeywordStatus(keywords[0].id, 'reviewed');
      const updated = await db.getKeywordStats(merchantId, { status: 'reviewed' });
      expect(updated.length).toBeGreaterThan(0);
    }
  });
});

describe('Advanced Features - Weekly Sentiment Reports', () => {
  let merchantId: number;

  beforeAll(async () => {
    // استخدام نفس التاجر من الاختبار السابق أو إنشاء جديد
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      merchantId = merchants[0].id;
    }
  });

  it('should create weekly sentiment report', async () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekEnd = new Date();

    const reportId = await db.createWeeklySentimentReport({
      merchantId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalConversations: 50,
      positiveCount: 30,
      negativeCount: 10,
      neutralCount: 10,
      topKeywords: ['سعر', 'توصيل', 'منتج'],
      topComplaints: ['تأخير التوصيل'],
      recommendations: ['تحسين سرعة التوصيل', 'إضافة ردود سريعة للأسعار'],
    });

    expect(reportId).toBeGreaterThan(0);
  });

  it('should get weekly sentiment reports', async () => {
    const reports = await db.getWeeklySentimentReports(merchantId);
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
  });

  it('should get report by id', async () => {
    const reports = await db.getWeeklySentimentReports(merchantId, 1);
    if (reports.length > 0) {
      const report = await db.getWeeklySentimentReportById(reports[0].id);
      expect(report).toBeDefined();
      expect(report?.merchantId).toBe(merchantId);
    }
  });

  it('should mark report email as sent', async () => {
    const reports = await db.getWeeklySentimentReports(merchantId, 1);
    if (reports.length > 0) {
      await db.markReportEmailSent(reports[0].id);
      const updated = await db.getWeeklySentimentReportById(reports[0].id);
      expect(updated?.emailSent).toBe(true);
    }
  });
});

describe('Advanced Features - A/B Testing', () => {
  let merchantId: number;

  beforeAll(async () => {
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      merchantId = merchants[0].id;
    }
  });

  it('should create A/B test', async () => {
    const testId = await db.createABTest({
      merchantId,
      testName: 'Test Price Response',
      keyword: 'السعر',
      variantAText: 'السعر هو 100 ريال',
      variantBText: 'السعر 100 ريال فقط! 😊',
    });

    expect(testId).toBeGreaterThan(0);
  });

  it('should get A/B tests', async () => {
    const tests = await db.getABTests(merchantId);
    expect(Array.isArray(tests)).toBe(true);
    expect(tests.length).toBeGreaterThan(0);
  });

  it('should get active A/B test for keyword', async () => {
    const test = await db.getActiveABTestForKeyword(merchantId, 'السعر');
    expect(test).toBeDefined();
    expect(test?.keyword).toBe('السعر');
  });

  it('should track A/B test usage', async () => {
    const tests = await db.getABTests(merchantId, 'running');
    if (tests.length > 0) {
      await db.trackABTestUsage(tests[0].id, 'A', true, merchantId);
      await db.trackABTestUsage(tests[0].id, 'B', false, merchantId);
      
      const updated = await db.getABTestById(tests[0].id, merchantId);
      expect(updated?.variantAUsageCount).toBeGreaterThan(0);
      expect(updated?.variantBUsageCount).toBeGreaterThan(0);
    }
  });

  it('should declare A/B test winner', async () => {
    const tests = await db.getABTests(merchantId, 'running');
    if (tests.length > 0) {
      await db.declareABTestWinner(tests[0].id, 'variant_a', merchantId);
      const updated = await db.getABTestById(tests[0].id, merchantId);
      expect(updated?.status).toBe('completed');
      expect(updated?.winner).toBe('variant_a');
      expect(updated?.confidenceLevel).toBe(0);
    }
  });

  it('should pause A/B test', async () => {
    // إنشاء اختبار جديد
    const testId = await db.createABTest({
      merchantId,
      testName: 'Test Shipping Response',
      keyword: 'التوصيل',
      variantAText: 'التوصيل خلال 3 أيام',
      variantBText: 'التوصيل السريع خلال 3 أيام فقط!',
    });

    await db.pauseABTest(testId, merchantId);
    const test = await db.getABTestById(testId, merchantId);
    expect(test?.status).toBe('paused');
  });

  it('should resume A/B test', async () => {
    const tests = await db.getABTests(merchantId, 'paused');
    if (tests.length > 0) {
      await db.resumeABTest(tests[0].id, merchantId);
      const test = await db.getABTestById(tests[0].id, merchantId);
      expect(test?.status).toBe('running');
    }
  });
});

describe('Advanced Features - Integration', () => {
  it('should have all required APIs in routers', async () => {
    // هذا اختبار بسيط للتأكد من أن الـ APIs موجودة
    const { appRouter } = await import('./routers');
    
    expect(appRouter.keywords).toBeDefined();
    expect(appRouter.weeklyReports).toBeDefined();
    expect(appRouter.abTests).toBeDefined();
  });
});
