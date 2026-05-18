/**
 * نظام استخراج الكلمات المفتاحية من رسائل العملاء
 */

import { getKeywordStats, upsertKeywordAnalysis } from '../db';
import { callGPT4 } from './openai';

interface KeywordExtractionResult {
  keywords: Array<{
    keyword: string;
    category: 'product' | 'price' | 'shipping' | 'complaint' | 'question' | 'other';
    confidence: number;
  }>;
  suggestedResponse?: string;
}

/**
 * استخراج الكلمات المفتاحية من رسالة العميل
 */
export async function extractKeywordsFromMessage(
  merchantId: number,
  message: string,
  conversationId?: number
): Promise<KeywordExtractionResult> {
  try {
    const prompt = `حلل هذه الرسالة من العميل واستخرج الكلمات المفتاحية:

"${message}"

أعطني النتيجة بصيغة JSON:
{
  "keywords": [
    {
      "keyword": "الكلمة المفتاحية",
      "category": "product|price|shipping|complaint|question|other",
      "confidence": 85
    }
  ],
  "suggestedResponse": "رد سريع مقترح (اختياري)"
}

الفئات:
- product: أسئلة عن المنتجات أو الخدمات
- price: أسئلة عن الأسعار أو التكلفة
- shipping: أسئلة عن التوصيل أو الشحن
- complaint: شكاوى أو مشاكل
- question: أسئلة عامة
- other: أي شيء آخر

مثال:
"كم سعر الآيفون 15؟" → [{"keyword": "آيفون 15", "category": "product", "confidence": 95}, {"keyword": "سعر", "category": "price", "confidence": 90}]
"متى يوصل الطلب؟" → [{"keyword": "توصيل", "category": "shipping", "confidence": 90}]`;

    const response = await callGPT4([
      { role: 'system', content: 'أنت محلل ذكي للكلمات المفتاحية في رسائل العملاء. أجب بـ JSON فقط بدون أي تنسيق markdown.' },
      { role: 'user', content: prompt }
    ]);

    // Strip markdown code blocks (GPT sometimes wraps JSON in ```json...```)
    const cleanResponse = response
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const result: KeywordExtractionResult = JSON.parse(cleanResponse);

    // حفظ الكلمات المفتاحية في قاعدة البيانات
    for (const kw of result.keywords) {
      try {
        // البحث عن كلمة مفتاحية موجودة
        const existingKeywords = await getKeywordStats(merchantId, {
          category: kw.category
        });
        
        // استخدام upsert للتحديث أو الإنشاء
        await upsertKeywordAnalysis({
          merchantId,
          keyword: kw.keyword,
          category: kw.category,
          sampleMessage: message.substring(0, 200),
          suggestedResponse: result.suggestedResponse || undefined
        });
      } catch (error) {
        console.error('[Keyword Extraction] Error saving keyword:', error);
      }
    }

    return result;
  } catch (error) {
    console.error('[Keyword Extraction] Error extracting keywords:', error);
    return { keywords: [] };
  }
}

/**
 * الحصول على الكلمات المفتاحية الأكثر تكراراً للتاجر
 */
export async function getTopKeywords(
  merchantId: number,
  limit: number = 10
): Promise<Array<{ keyword: string; count: number; category: string }>> {
  try {
    const keywords = await getKeywordStats(merchantId, { limit });
    return keywords.map(k => ({
      keyword: k.keyword,
      count: k.frequency,
      category: k.category
    }));
  } catch (error) {
    console.error('[Keyword Extraction] Error getting top keywords:', error);
    return [];
  }
}
