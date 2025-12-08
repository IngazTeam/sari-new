/**
 * نظام تحليل الكلمات المفتاحية الذكية
 * يحلل الرسائل الواردة ويستخرج الأسئلة المتكررة ويقترح ردود سريعة جديدة
 */

import { invokeLLM } from "../_core/llm";

/**
 * استخراج الكلمات المفتاحية من نص الرسالة
 */
export async function extractKeywords(text: string): Promise<{
  keywords: string[];
  category: 'product' | 'price' | 'shipping' | 'complaint' | 'question' | 'other';
  mainQuestion?: string;
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `أنت محلل ذكي للكلمات المفتاحية في رسائل العملاء.
مهمتك:
1. استخراج الكلمات والعبارات المفتاحية الأساسية (2-5 كلمات)
2. تصنيف الرسالة إلى فئة (product, price, shipping, complaint, question, other)
3. استخراج السؤال الرئيسي إن وجد

الرد يجب أن يكون JSON فقط.`
        },
        {
          role: "user",
          content: `حلل هذه الرسالة واستخرج الكلمات المفتاحية:

"${text}"`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string" },
                description: "قائمة الكلمات المفتاحية (2-5 كلمات)"
              },
              category: {
                type: "string",
                enum: ["product", "price", "shipping", "complaint", "question", "other"],
                description: "تصنيف الرسالة"
              },
              mainQuestion: {
                type: "string",
                description: "السؤال الرئيسي إن وجد"
              }
            },
            required: ["keywords", "category"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No content in LLM response");
    }

    const result = JSON.parse(content);
    return result;
  } catch (error) {
    console.error("Error extracting keywords:", error);
    // Fallback: return basic analysis
    return {
      keywords: [text.substring(0, 50)],
      category: 'other'
    };
  }
}

/**
 * تحليل الأسئلة المتكررة من مجموعة رسائل
 */
export async function analyzeFrequentQuestions(messages: Array<{
  text: string;
  timestamp: Date;
}>): Promise<Array<{
  question: string;
  frequency: number;
  category: string;
  sampleMessages: string[];
}>> {
  if (messages.length === 0) {
    return [];
  }

  try {
    // تجميع الرسائل في نص واحد
    const messagesText = messages.map((m, i) => `${i + 1}. ${m.text}`).join('\n');

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `أنت محلل ذكي للأسئلة المتكررة في رسائل العملاء.
مهمتك:
1. تحديد الأسئلة والاستفسارات المتكررة
2. تجميع الأسئلة المتشابهة معاً
3. حساب تكرار كل سؤال
4. تصنيف كل سؤال

الرد يجب أن يكون JSON فقط.`
        },
        {
          role: "user",
          content: `حلل هذه الرسائل واستخرج الأسئلة المتكررة:

${messagesText}

ابحث عن الأنماط المتكررة والأسئلة المتشابهة.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "frequent_questions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string", description: "السؤال الرئيسي" },
                    frequency: { type: "integer", description: "عدد مرات التكرار" },
                    category: { type: "string", description: "التصنيف" },
                    sampleIndexes: {
                      type: "array",
                      items: { type: "integer" },
                      description: "أرقام الرسائل الأمثلة (1-based)"
                    }
                  },
                  required: ["question", "frequency", "category", "sampleIndexes"],
                  additionalProperties: false
                }
              }
            },
            required: ["questions"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No content in LLM response");
    }

    const result = JSON.parse(content);
    
    // تحويل الأرقام إلى نصوص الرسائل
    return result.questions.map((q: any) => ({
      question: q.question,
      frequency: q.frequency,
      category: q.category,
      sampleMessages: q.sampleIndexes
        .slice(0, 3) // أول 3 أمثلة فقط
        .map((idx: number) => messages[idx - 1]?.text || '')
        .filter((text: string) => text.length > 0)
    }));
  } catch (error) {
    console.error("Error analyzing frequent questions:", error);
    return [];
  }
}

/**
 * اقتراح ردود سريعة جديدة بناءً على الأسئلة المتكررة
 */
export async function suggestQuickResponses(
  frequentQuestions: Array<{
    question: string;
    frequency: number;
    category: string;
  }>,
  merchantContext?: {
    businessName: string;
    products?: string[];
  }
): Promise<Array<{
  keyword: string;
  suggestedResponse: string;
  category: string;
  confidence: number;
}>> {
  if (frequentQuestions.length === 0) {
    return [];
  }

  try {
    const questionsText = frequentQuestions
      .map((q, i) => `${i + 1}. ${q.question} (تكرر ${q.frequency} مرة - ${q.category})`)
      .join('\n');

    const contextInfo = merchantContext 
      ? `\nمعلومات المتجر: ${merchantContext.businessName}${merchantContext.products ? `\nالمنتجات: ${merchantContext.products.join(', ')}` : ''}`
      : '';

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `أنت مساعد ذكي لاقتراح ردود سريعة للأسئلة المتكررة.
مهمتك:
1. تحليل الأسئلة المتكررة
2. اقتراح رد سريع مناسب لكل سؤال
3. تحديد الكلمة المفتاحية التي تطلق الرد
4. تقييم مستوى الثقة في الرد (0-100)

الردود يجب أن تكون:
- واضحة ومفيدة
- باللهجة السعودية الودية
- قصيرة ومباشرة (2-3 جمل)

الرد يجب أن يكون JSON فقط.`
        },
        {
          role: "user",
          content: `اقترح ردود سريعة لهذه الأسئلة المتكررة:

${questionsText}${contextInfo}

لكل سؤال، اقترح:
1. الكلمة المفتاحية (keyword) التي تطلق الرد
2. الرد المقترح (suggestedResponse)
3. مستوى الثقة (confidence) من 0 إلى 100`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "suggested_responses",
          strict: true,
          schema: {
            type: "object",
            properties: {
              responses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string", description: "الكلمة المفتاحية" },
                    suggestedResponse: { type: "string", description: "الرد المقترح" },
                    category: { type: "string", description: "التصنيف" },
                    confidence: { type: "integer", description: "مستوى الثقة 0-100" }
                  },
                  required: ["keyword", "suggestedResponse", "category", "confidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["responses"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No content in LLM response");
    }

    const result = JSON.parse(content);
    return result.responses;
  } catch (error) {
    console.error("Error suggesting quick responses:", error);
    return [];
  }
}

/**
 * تحديث إحصائيات الكلمة المفتاحية
 */
export function updateKeywordFrequency(
  existingKeywords: Map<string, number>,
  newKeywords: string[]
): Map<string, number> {
  const updated = new Map(existingKeywords);
  
  for (const keyword of newKeywords) {
    const normalized = keyword.toLowerCase().trim();
    if (normalized.length > 0) {
      updated.set(normalized, (updated.get(normalized) || 0) + 1);
    }
  }
  
  return updated;
}

/**
 * الحصول على أكثر الكلمات تكراراً
 */
export function getTopKeywords(
  keywordMap: Map<string, number>,
  limit: number = 10
): Array<{ keyword: string; frequency: number }> {
  return Array.from(keywordMap.entries())
    .map(([keyword, frequency]) => ({ keyword, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}
