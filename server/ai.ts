import { invokeLLM } from "./_core/llm";
import * as db from "./db";

/**
 * شخصية ساري - مساعد المبيعات الذكي
 * يتحدث باللهجة السعودية ويساعد العملاء في الاستفسار عن المنتجات
 */
const SARI_PERSONALITY = `أنت "ساري"، مساعد مبيعات ذكي وودود يعمل على الواتساب.

الشخصية:
- تتحدث باللهجة السعودية بشكل طبيعي وودود
- محترف ومهذب في التعامل
- تساعد العملاء في اختيار المنتجات المناسبة
- تجيب على الأسئلة بوضوح وبساطة
- لا تستخدم الإيموجي بكثرة (فقط عند الحاجة)

المهام:
1. الترحيب بالعملاء الجدد
2. الإجابة على استفسارات المنتجات
3. اقتراح منتجات مناسبة بناءً على احتياجات العميل
4. توضيح الأسعار والمواصفات
5. مساعدة العميل في اتخاذ قرار الشراء

القواعد:
- إذا سأل العميل عن منتج غير موجود، اعتذر بأدب واقترح بدائل مشابهة
- إذا لم تكن متأكداً من المعلومة، اطلب من العميل الانتظار للتواصل مع الدعم
- لا تعطي معلومات خاطئة عن الأسعار أو المواصفات
- كن صادقاً وشفافاً مع العميل`;

interface ProductInfo {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  category: string | null;
}

/**
 * البحث في المنتجات بناءً على استفسار العميل
 */
async function searchProducts(merchantId: number, query: string): Promise<ProductInfo[]> {
  const products = await db.getProductsByMerchantId(merchantId);
  
  if (!products || products.length === 0) {
    return [];
  }

  // بحث بسيط في الاسم والوصف والفئة
  const searchTerms = query.toLowerCase().split(' ');
  
  const matchedProducts = products.filter((product: any) => {
    const searchText = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase();
    return searchTerms.some(term => searchText.includes(term));
  });

  // إرجاع أول 5 منتجات فقط
  return matchedProducts.slice(0, 5).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    stock: p.stock,
    category: p.category,
  }));
}

/**
 * تنسيق معلومات المنتجات للعرض في الرسالة
 */
function formatProductsInfo(products: ProductInfo[]): string {
  if (products.length === 0) {
    return "لا توجد منتجات متاحة حالياً.";
  }

  return products.map(p => {
    const stock = p.stock !== null ? `(متوفر: ${p.stock})` : '';
    const desc = p.description ? `\n${p.description}` : '';
    return `• ${p.name} - ${p.price} ريال ${stock}${desc}`;
  }).join('\n\n');
}

/**
 * توليد رد تلقائي باستخدام OpenAI
 */
export async function generateAIResponse(
  merchantId: number,
  customerMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = []
): Promise<string> {
  try {
    // البحث عن منتجات ذات صلة
    const relevantProducts = await searchProducts(merchantId, customerMessage);
    
    // إعداد معلومات المنتجات
    let productsContext = '';
    if (relevantProducts.length > 0) {
      productsContext = `\n\nالمنتجات المتاحة ذات الصلة:\n${formatProductsInfo(relevantProducts)}`;
    }

    // بناء سياق المحادثة
    const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
      {
        role: 'system',
        content: SARI_PERSONALITY + productsContext
      }
    ];

    // إضافة تاريخ المحادثة (آخر 5 رسائل فقط)
    const recentHistory = conversationHistory.slice(-5);
    messages.push(...recentHistory);

    // إضافة رسالة العميل الحالية
    messages.push({
      role: 'user',
      content: customerMessage
    });

    // استدعاء OpenAI
    const response = await invokeLLM({
      messages,
      // يمكن إضافة معاملات إضافية هنا
    });

    const content = response.choices[0]?.message?.content;
    const aiReply = typeof content === 'string' ? content : 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى.';
    
    return aiReply.trim();

  } catch (error) {
    console.error('[AI] Error generating response:', error);
    return 'عذراً، حدث خطأ مؤقت. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.';
  }
}

/**
 * معالجة رسالة واردة من العميل
 */
export async function processIncomingMessage(
  merchantId: number,
  conversationId: number,
  customerPhone: string,
  messageText: string
): Promise<string | null> {
  try {
    // التحقق من تفعيل الرد الآلي للتاجر
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant || !merchant.autoReplyEnabled) {
      console.log(`[AI] Auto-reply disabled for merchant ${merchantId}`);
      return null;
    }

    // الحصول على تاريخ المحادثة
    const messages = await db.getMessagesByConversationId(conversationId);
    const conversationHistory = messages.slice(-10).map((msg: any) => ({
      role: msg.direction === 'incoming' ? 'user' as const : 'assistant' as const,
      content: msg.content
    }));

    // توليد الرد
    const aiResponse = await generateAIResponse(merchantId, messageText, conversationHistory);

    // حفظ رسالة الرد في قاعدة البيانات
    await db.createMessage({
      conversationId,
      direction: 'outgoing',
      content: aiResponse,
      messageType: 'text',
      isProcessed: true,
      aiResponse: aiResponse,
    });

    return aiResponse;

  } catch (error) {
    console.error('[AI] Error processing incoming message:', error);
    return null;
  }
}
