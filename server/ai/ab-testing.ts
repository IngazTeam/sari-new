/**
 * نظام اختبار A/B للردود السريعة
 * يختبر نسختين من نفس الرد ويحدد أيهما أكثر فعالية
 */

import {
  createQuickResponse,
  getABTestById,
  getActiveABTestForKeyword,
  getQuickResponses,
  trackABTestUsage,
  updateQuickResponse,
} from '../db';

/**
 * اختيار نسخة من الاختبار (A أو B) بشكل عشوائي
 */
export async function selectABTestVariant(
  merchantId: number,
  keyword: string
): Promise<{
  variant: 'A' | 'B';
  text: string;
  testId: number;
} | null> {
  // البحث عن اختبار نشط لهذه الكلمة المفتاحية
  const test = await getActiveABTestForKeyword(merchantId, keyword);
  
  if (!test) {
    return null;
  }

  // اختيار عشوائي بين A و B (50/50)
  const variant = Math.random() < 0.5 ? 'A' : 'B';
  const text = variant === 'A' ? test.variantAText : test.variantBText;

  return {
    variant,
    text,
    testId: test.id,
  };
}

/**
 * تسجيل نتيجة استخدام نسخة من الاختبار
 */
export async function recordABTestResult(
  testId: number,
  variant: 'A' | 'B',
  wasSuccessful: boolean
) {
  await trackABTestUsage(testId, variant, wasSuccessful);
}

/**
 * تحليل نتائج الاختبار وتحديد الفائز
 */
export async function analyzeABTest(testId: number): Promise<{
  winner: 'variant_a' | 'variant_b' | 'no_winner';
  confidence: number;
  stats: {
    variantA: {
      total: number;
      success: number;
      successRate: number;
    };
    variantB: {
      total: number;
      success: number;
      successRate: number;
    };
  };
}> {
  const test = await getABTestById(testId);
  if (!test) {
    throw new Error('Test not found');
  }

  const totalA = test.variantAUsageCount;
  const totalB = test.variantBUsageCount;
  const successA = test.variantASuccessCount;
  const successB = test.variantBSuccessCount;

  const successRateA = totalA > 0 ? (successA / totalA) * 100 : 0;
  const successRateB = totalB > 0 ? (successB / totalB) * 100 : 0;

  const stats = {
    variantA: {
      total: totalA,
      success: successA,
      successRate: successRateA,
    },
    variantB: {
      total: totalB,
      success: successB,
      successRate: successRateB,
    },
  };

  // تحديد الفائز بناءً على حجم العينة والفرق
  const totalSamples = totalA + totalB;
  const difference = Math.abs(successRateA - successRateB);

  let winner: 'variant_a' | 'variant_b' | 'no_winner' = 'no_winner';
  let confidence = 0;

  // يجب أن يكون هناك عدد كافٍ من العينات
  if (totalSamples < 30) {
    return { winner: 'no_winner', confidence: 0, stats };
  }

  // حساب الثقة بناءً على حجم العينة والفرق
  if (totalSamples >= 100 && difference >= 10) {
    confidence = 95;
  } else if (totalSamples >= 50 && difference >= 15) {
    confidence = 90;
  } else if (totalSamples >= 30 && difference >= 20) {
    confidence = 80;
  } else {
    confidence = 50;
  }

  // تحديد الفائز
  if (confidence >= 80) {
    if (successRateA > successRateB) {
      winner = 'variant_a';
    } else if (successRateB > successRateA) {
      winner = 'variant_b';
    }
  }

  return { winner, confidence, stats };
}

/**
 * تطبيق الرد الفائز تلقائياً
 */
export async function applyWinningVariant(testId: number): Promise<number | null> {
  const test = await getABTestById(testId);
  if (!test || test.status !== 'completed' || !test.winner) {
    return null;
  }

  // تحديد النص الفائز
  const winningText = test.winner === 'variant_a' ? test.variantAText : test.variantBText;

  // إنشاء رد سريع جديد
  const responseId = await createQuickResponse({
    merchantId: test.merchantId,
    trigger: test.keyword,
    keywords: test.keyword,
    response: winningText,
    isActive: 1,
    priority: 10, // أولوية عالية
  });

  // تعطيل الردود القديمة لنفس الكلمة المفتاحية
  if (test.variantAId) {
    await updateQuickResponse(test.variantAId, { isActive: 0 });
  }
  if (test.variantBId) {
    await updateQuickResponse(test.variantBId, { isActive: 0 });
  }

  return responseId ? Number(responseId) : null;
}

/**
 * التحقق من نجاح المحادثة (لحساب معدل النجاح)
 */
export function isConversationSuccessful(
  messages: Array<{ sender: string; text: string }>,
  sentiment?: string
): boolean {
  // معايير النجاح:
  // 1. المحادثة انتهت بشكل طبيعي (ليست مفتوحة)
  // 2. المشاعر إيجابية أو محايدة
  // 3. العميل لم يكرر نفس السؤال

  if (!sentiment) {
    // إذا لم يكن هناك تحليل مشاعر، نعتبرها ناجحة إذا كانت قصيرة
    return messages.length <= 5;
  }

  // المشاعر الإيجابية أو المحايدة = نجاح
  if (['positive', 'happy', 'neutral'].includes(sentiment)) {
    return true;
  }

  // المشاعر السلبية = فشل
  if (['negative', 'angry', 'frustrated'].includes(sentiment)) {
    return false;
  }

  // افتراضياً: نجاح
  return true;
}

/**
 * اقتراح اختبارات A/B جديدة بناءً على الردود الحالية
 */
export async function suggestABTests(merchantId: number): Promise<Array<{
  keyword: string;
  currentResponse: string;
  suggestedVariant: string;
  reason: string;
}>> {
  // الحصول على الردود السريعة الأكثر استخداماً
  const responses = await getQuickResponses(merchantId);
  
  // ترتيب حسب الاستخدام
  const mostUsed = responses
    .filter(r => r.useCount > 10) // فقط الردود المستخدمة بكثرة
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 5);

  const suggestions = [];

  for (const response of mostUsed) {
    // اقتراح نسخة محسّنة
    suggestions.push({
      keyword: response.trigger || response.keywords || '',
      currentResponse: response.response,
      suggestedVariant: `${response.response} 😊`, // مثال بسيط: إضافة emoji
      reason: 'إضافة emoji قد يزيد من ودية الرد',
    });
  }

  return suggestions;
}
