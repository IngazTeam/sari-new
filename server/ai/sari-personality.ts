/**
 * Sari AI Agent Personality - Enhanced Version
 * A friendly, professional Saudi sales assistant with improved context awareness
 */

import { callGPT4, ChatMessage } from './openai';
import * as db from '../db';

/**
 * Enhanced system prompt for Sari's personality with specific guidelines
 */
const SARI_SYSTEM_PROMPT = `أنت ساري، مساعد مبيعات ذكي وودود عبر الواتساب. أنت خبير في فهم احتياجات العملاء واقتراح المنتجات المناسبة.

## شخصيتك المميزة:
- سعودي الأصل، تتحدث باللهجة السعودية الطبيعية (نجدية/حجازية حسب السياق)
- محترف لكن ودود - مثل صديق يساعد صديقه في الشراء
- متحمس وإيجابي، لكن ليس مبالغاً أو مزعجاً
- ذكي في فهم الإشارات الضمنية (مثلاً: "أبغى هدية لأمي" = منتجات نسائية راقية)
- تستخدم الإيموجي بذكاء (1-2 في الرسالة) لإضافة دفء دون مبالغة

## مهامك الذكية:
1. **الترحيب المخصص**: اذكر اسم العميل إن كان متوفراً، واجعل الترحيب مختصراً ومباشراً
2. **الفهم العميق**: اسأل أسئلة ذكية لفهم الاحتياجات (الميزانية، المناسبة، التفضيلات)
3. **البحث الذكي**: اقترح منتجات محددة من القائمة المتوفرة، مع ذكر الأسعار والمميزات
4. **البيع الإضافي**: اقترح منتجات مكملة بطريقة طبيعية (مثلاً: مع الجوال اقترح جراب)
5. **تسهيل الشراء**: اشرح خطوات الطلب بوضوح، واذكر طرق الدفع والتوصيل
6. **معالجة الاعتراضات**: إذا اعترض العميل على السعر، اقترح بدائل أرخص أو اشرح القيمة

## أسلوب التواصل المحسّن:
### الترحيب:
- "أهلاً [الاسم]! 😊 كيف أقدر أساعدك؟"
- "حياك الله! شو تدور عليه اليوم؟"
- "مرحباً! أنا ساري، جاهز أساعدك 🛍️"

### الاستفسار:
- "تمام! فهمت عليك. تبغى [المنتج] صح؟"
- "حلو، وش ميزانيتك تقريباً؟"
- "الهدية لمين؟ عشان أقترح لك الأنسب"

### الاقتراح:
- "عندي لك خيارين ممتازين:"
- "أنصحك بـ [المنتج] لأنه [السبب]"
- "هذا الأكثر مبيعاً عندنا، والتقييمات ممتازة"

### الإغلاق:
- "تبغى تأكد الطلب؟"
- "تمام، أرسل لك تفاصيل الطلب الحين"
- "ماشي، أي استفسار ثاني أنا موجود! 😊"

## قواعد ذهبية (CRITICAL):
1. **لا تخترع معلومات**: استخدم فقط المنتجات والأسعار المتوفرة في القائمة
2. **كن محدداً**: اذكر اسم المنتج، السعر، والمميزات الرئيسية
3. **اقترح 2-3 منتجات فقط**: لا تغرق العميل بخيارات كثيرة
4. **اسأل قبل الافتراض**: إذا لم تفهم الطلب، اسأل بدلاً من التخمين
5. **كن صادقاً**: إذا المنتج غير متوفر، قل ذلك واقترح بديل
6. **لا تكرر نفسك**: إذا سبق وذكرت معلومة، لا تكررها
7. **ردود قصيرة**: 2-4 أسطر كحد أقصى (إلا إذا طلب العميل تفاصيل)

## أمثلة على محادثات ناجحة:

### مثال 1: استفسار عن منتج
عميل: "عندك ساعات ذكية؟"
ساري: "أيوه عندنا! 😊 عندي خيارين ممتازين:
1. ساعة Galaxy Watch 6 - 1,299 ريال (شاشة كبيرة، بطارية تدوم يومين)
2. Apple Watch SE - 999 ريال (مناسبة للآيفون، سعرها معقول)

أي وحدة تناسبك أكثر؟"

### مثال 2: طلب هدية
عميل: "أبغى هدية لصديقي، ميزانيتي 500 ريال"
ساري: "حلو! صديقك يحب التقنية ولا الأكسسوارات؟"
عميل: "التقنية"
ساري: "تمام، أنصحك بسماعة JBL Flip 6 - 449 ريال 🎵
صوتها قوي، ضد الماء، وتصميمها أنيق. الكل يمدحها!
تبغى تأكد الطلب؟"

### مثال 3: اعتراض على السعر
عميل: "غالي شوي"
ساري: "فاهم عليك! عندي بديل أوفر:
سماعة JBL Go 3 - 199 ريال
نفس الجودة بس حجم أصغر. شو رأيك؟"

### مثال 4: استفسار عن التوصيل
عميل: "كم التوصيل؟"
ساري: "التوصيل مجاني لكل المدن الرئيسية، ويوصلك خلال 2-3 أيام 📦
الدفع عند الاستلام أو أونلاين، زي ما تحب!"

## التعامل مع الحالات الخاصة:

### إذا لم تجد منتج مناسب:
"للأسف ما عندي بالضبط اللي تبغاه حالياً 😅
بس عندي [بديل قريب] ممكن يناسبك. أو تقدر تتواصل مع الدعم مباشرة."

### إذا كان السؤال خارج نطاقك:
"هالسؤال أفضل تسأله الدعم الفني عشان يعطونك إجابة دقيقة.
تبغى أحولك لهم؟"

### إذا كان العميل غاضباً:
"أعتذر منك على الإزعاج 🙏
خلني أساعدك أحل المشكلة. وش اللي صار بالضبط؟"

## اللغة والتكيف:
- **العربية السعودية**: الأساس (استخدم: أبغى، شو، حلو، ماشي، تمام)
- **الإنجليزية**: إذا تحدث العميل بالإنجليزية، رد بنفس اللغة
- **الفصحى**: افهمها لكن رد بالعامية السعودية
- **المزج**: إذا مزج العميل بين العربية والإنجليزية، افعل نفس الشيء

تذكر: هدفك مساعدة العميل يشتري بثقة وسعادة، مو مجرد بيع! 🎯`;

/**
 * Few-shot examples for better context understanding
 */
const FEW_SHOT_EXAMPLES: ChatMessage[] = [
  {
    role: 'user',
    content: 'السلام عليكم، أول مرة أتعامل معكم',
  },
  {
    role: 'assistant',
    content: 'وعليكم السلام! أهلاً وسهلاً فيك 😊\nأنا ساري، مساعدك الشخصي. شو تحتاج اليوم؟',
  },
  {
    role: 'user',
    content: 'كم سعر الساعة الذكية؟',
  },
  {
    role: 'assistant',
    content: 'عندنا أكثر من نوع! الأشهر:\n• Galaxy Watch 6 - 1,299 ريال\n• Apple Watch SE - 999 ريال\n\nأي وحدة تهمك؟',
  },
];

/**
 * Smart product search based on customer message
 */
async function searchRelevantProducts(
  message: string,
  allProducts: any[],
  limit: number = 5
): Promise<any[]> {
  if (allProducts.length === 0) return [];

  // Simple keyword matching (can be enhanced with vector search later)
  const keywords = message.toLowerCase().split(/\s+/);
  
  const scoredProducts = allProducts.map(product => {
    let score = 0;
    const searchText = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase();
    
    keywords.forEach(keyword => {
      if (searchText.includes(keyword)) {
        score += 1;
      }
    });
    
    // Boost if keyword in name
    keywords.forEach(keyword => {
      if (product.name.toLowerCase().includes(keyword)) {
        score += 2;
      }
    });
    
    return { product, score };
  });

  // Sort by score and return top results
  return scoredProducts
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.product);
}

/**
 * Generate enhanced context-aware prompt
 */
function buildEnhancedContextPrompt(context: {
  customerName?: string;
  merchantName?: string;
  availableProducts?: Array<any>;
  isFirstMessage?: boolean;
}): string {
  let contextPrompt = '\n\n## السياق الحالي:\n';

  if (context.merchantName) {
    contextPrompt += `أنت تعمل في متجر "${context.merchantName}".\n`;
  }

  if (context.customerName) {
    contextPrompt += `اسم العميل: ${context.customerName}\n`;
  }

  if (context.isFirstMessage) {
    contextPrompt += `هذه أول رسالة من العميل - رحب به بحرارة!\n`;
  }

  if (context.availableProducts && context.availableProducts.length > 0) {
    contextPrompt += `\n## المنتجات المتاحة حالياً:\n`;
    context.availableProducts.forEach((product, index) => {
      contextPrompt += `${index + 1}. **${product.name}**`;
      if (product.price) contextPrompt += ` - ${product.price} ريال`;
      if (product.stock !== undefined) contextPrompt += ` (متوفر: ${product.stock})`;
      if (product.description) contextPrompt += `\n   الوصف: ${product.description.substring(0, 100)}`;
      if (product.category) contextPrompt += `\n   الفئة: ${product.category}`;
      contextPrompt += `\n`;
    });
    
    contextPrompt += `\n⚠️ استخدم فقط المنتجات المذكورة أعلاه. لا تخترع منتجات أخرى!\n`;
  } else {
    contextPrompt += `\n⚠️ لا توجد منتجات متاحة حالياً. اعتذر بلطف وانصح بالتواصل مع الدعم.\n`;
  }

  return contextPrompt;
}

/**
 * Enhanced chat with Sari AI Agent
 */
export async function chatWithSari(params: {
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  message: string;
  conversationId?: number;
}): Promise<string> {
  try {
    // Get merchant info
    const merchant = await db.getMerchantById(params.merchantId);
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Get conversation history (last 10 messages)
    let previousMessages: ChatMessage[] = [];
    let isFirstMessage = true;
    
    if (params.conversationId) {
      const messages = await db.getMessagesByConversationId(params.conversationId);
      if (messages.length > 0) {
        isFirstMessage = false;
        previousMessages = messages
          .slice(-10) // Last 10 messages for context
          .map(msg => ({
            role: msg.direction === 'incoming' ? 'user' as const : 'assistant' as const,
            content: msg.content,
          }));
      }
    }

    // Get all products
    const allProducts = await db.getProductsByMerchantId(params.merchantId);
    
    // Smart product search based on customer message
    const relevantProducts = await searchRelevantProducts(
      params.message,
      allProducts,
      5 // Top 5 most relevant
    );
    
    // If no relevant products found, use top 5 products
    const productsToShow = relevantProducts.length > 0 
      ? relevantProducts 
      : allProducts.slice(0, 5);

    // Build enhanced context
    const contextPrompt = buildEnhancedContextPrompt({
      merchantName: merchant.businessName,
      customerName: params.customerName,
      availableProducts: productsToShow,
      isFirstMessage,
    });

    // Prepare messages with few-shot examples for better quality
    const messages: ChatMessage[] = [
      { role: 'system', content: SARI_SYSTEM_PROMPT + contextPrompt },
      ...FEW_SHOT_EXAMPLES, // Add examples for better understanding
      ...previousMessages,
      { role: 'user', content: params.message },
    ];

    // Call GPT-4 with optimized parameters
    const response = await callGPT4(messages, {
      temperature: 0.7, // Balanced between creativity and consistency
      maxTokens: 400, // Shorter, more focused responses
    });

    return response.trim();
  } catch (error: any) {
    console.error('Error in chatWithSari:', error);
    
    // Intelligent fallback based on error type
    if (error.message?.includes('rate limit')) {
      return 'عذراً، الضغط كبير شوي الحين 😅 ممكن تعيد رسالتك بعد ثواني؟';
    }
    
    return 'عذراً، حصل خطأ مؤقت. ممكن تعيد رسالتك مرة ثانية؟ 🙏';
  }
}

/**
 * Generate personalized welcome message
 */
export async function generateWelcomeMessage(params: {
  merchantId: number;
  customerName?: string;
}): Promise<string> {
  try {
    const merchant = await db.getMerchantById(params.merchantId);
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Get top 3 products to mention
    const products = await db.getProductsByMerchantId(params.merchantId);
    const topProducts = products.slice(0, 3);

    let contextPrompt = `\n## معلومات المتجر:\nأنت تعمل لدى متجر "${merchant.businessName}".\n\n`;
    
    if (topProducts.length > 0) {
      contextPrompt += `## أشهر المنتجات:\n`;
      topProducts.forEach(p => {
        contextPrompt += `- ${p.name}\n`;
      });
      contextPrompt += `\n`;
    }
    
    contextPrompt += `## المهمة:\nاكتب رسالة ترحيب قصيرة (2-3 أسطر فقط) لعميل جديد${params.customerName ? ` اسمه ${params.customerName}` : ''}. اجعلها ودودة ومباشرة، واذكر أنك جاهز للمساعدة.`;

    const response = await callGPT4([
      { role: 'system', content: SARI_SYSTEM_PROMPT + contextPrompt },
      { role: 'user', content: 'أرسل رسالة ترحيب' },
    ], {
      temperature: 0.8,
      maxTokens: 100,
    });

    return response.trim();
  } catch (error) {
    console.error('Error generating welcome message:', error);
    
    // Personalized fallback
    const greeting = params.customerName 
      ? `أهلاً ${params.customerName}! 😊` 
      : 'أهلاً وسهلاً! 😊';
    
    return `${greeting}\n\nأنا ساري، مساعدك الشخصي. كيف أقدر أساعدك اليوم؟ 🛍️`;
  }
}

/**
 * Enhanced customer intent analysis with structured output
 */
export async function analyzeCustomerIntent(message: string): Promise<{
  intent: 'greeting' | 'product_inquiry' | 'price_inquiry' | 'order' | 'complaint' | 'other';
  confidence: number;
  keywords: string[];
  suggestedAction?: string;
}> {
  try {
    const analysisPrompt = `حلل الرسالة التالية وحدد نية العميل بدقة:

الرسالة: "${message}"

أجب بصيغة JSON فقط (بدون markdown):
{
  "intent": "greeting | product_inquiry | price_inquiry | order | complaint | other",
  "confidence": 0.0-1.0,
  "keywords": ["كلمة1", "كلمة2"],
  "suggestedAction": "وصف قصير للإجراء المقترح"
}`;

    const response = await callGPT4([
      { role: 'system', content: 'أنت محلل ذكي لنوايا العملاء في التجارة الإلكترونية. أجب بصيغة JSON فقط بدون أي نص إضافي.' },
      { role: 'user', content: analysisPrompt },
    ], {
      temperature: 0.2, // Low temperature for consistent analysis
      maxTokens: 150,
    });

    // Clean and parse JSON response
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const analysis = JSON.parse(cleaned);
    
    return analysis;
  } catch (error) {
    console.error('Error analyzing intent:', error);
    
    // Fallback with simple keyword matching
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.match(/سلام|مرحب|هلا|أهل/)) {
      return { intent: 'greeting', confidence: 0.8, keywords: ['تحية'] };
    }
    if (lowerMessage.match(/كم|سعر|ثمن|price/)) {
      return { intent: 'price_inquiry', confidence: 0.7, keywords: ['سعر'] };
    }
    if (lowerMessage.match(/أبغى|أبي|أريد|عندك|want/)) {
      return { intent: 'product_inquiry', confidence: 0.7, keywords: ['استفسار منتج'] };
    }
    if (lowerMessage.match(/طلب|أطلب|order|شراء/)) {
      return { intent: 'order', confidence: 0.7, keywords: ['طلب'] };
    }
    if (lowerMessage.match(/مشكلة|شكوى|زعلان|complaint/)) {
      return { intent: 'complaint', confidence: 0.7, keywords: ['شكوى'] };
    }
    
    return {
      intent: 'other',
      confidence: 0.5,
      keywords: [],
    };
  }
}

/**
 * Generate product recommendation based on customer preferences
 */
export async function recommendProducts(params: {
  merchantId: number;
  customerMessage: string;
  budget?: number;
  category?: string;
  limit?: number;
}): Promise<Array<{ product: any; reason: string; score: number }>> {
  try {
    const allProducts = await db.getProductsByMerchantId(params.merchantId);
    
    if (allProducts.length === 0) return [];
    
    // Filter by budget if provided
    let filteredProducts = allProducts;
    if (params.budget) {
      filteredProducts = filteredProducts.filter(p => 
        p.price && p.price <= params.budget!
      );
    }
    
    // Filter by category if provided
    if (params.category) {
      filteredProducts = filteredProducts.filter(p => 
        p.category?.toLowerCase().includes(params.category!.toLowerCase())
      );
    }
    
    // Search relevant products
    const relevantProducts = await searchRelevantProducts(
      params.customerMessage,
      filteredProducts,
      params.limit || 3
    );
    
    // Return with reasons (simplified - can be enhanced with AI later)
    return relevantProducts.map((product, index) => ({
      product,
      reason: index === 0 ? 'الأكثر مطابقة لطلبك' : 'خيار ممتاز',
      score: 1 - (index * 0.1),
    }));
    
  } catch (error) {
    console.error('Error recommending products:', error);
    return [];
  }
}
