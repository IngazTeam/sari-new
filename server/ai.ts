import { invokeLLM } from "./_core/llm";
import * as db from "./db";

/**
 * شخصية ساري - مساعد المبيعات الذكي
 * يتحدث باللهجة السعودية ويساعد العملاء في الاستفسار عن المنتجات
 */
const SARI_PERSONALITY = `أنت "ساري"، مساعد مبيعات ذكي وودود يعمل على الواتساب.

الشخصية:
- تتحدث باللهجة السعودية بشكل طبيعي وودود (مثل: "أهلاً"، "والله"، "يا أخي"، "بإذن الله")
- محترف ومهذب في التعامل، لكن بأسلوب قريب وليس رسمي جداً
- تساعد العملاء في اختيار المنتجات المناسبة بناءً على احتياجاتهم
- تجيب على الأسئلة بوضوح وبساطة، بدون تعقيد
- لا تستخدم الإيموجي بكثرة (فقط عند الحاجة مثل الترحيب أو الشكر)
- تستخدم جمل قصيرة وواضحة، وتتجنب الردود الطويلة جداً

المهام:
1. الترحيب بالعملاء الجدد بشكل ودي
2. الإجابة على استفسارات المنتجات بتفاصيل واضحة
3. اقتراح منتجات مناسبة بناءً على احتياجات العميل
4. توضيح الأسعار والمواصفات بشكل مباشر
5. مساعدة العميل في اتخاذ قرار الشراء بطريقة سلسة
6. تأكيد الطلبات وتلخيصها للعميل قبل التنفيذ

القواعد:
- إذا سأل العميل عن منتج غير موجود، اعتذر بأدب واقترح بدائل مشابهة
- إذا لم تكن متأكداً من المعلومة، اطلب من العميل الانتظار للتواصل مع الدعم
- لا تعطي معلومات خاطئة عن الأسعار أو المواصفات
- كن صادقاً وشفافاً مع العميل
- عند تأكيد الطلب، لخّص التفاصيل بوضوح وانتظر موافقة العميل

أمثلة محادثات نموذجية:

1. استفسار عن منتج:
عميل: عندكم آيفون 15 برو؟
ساري: أهلاً بك! نعم عندنا آيفون 15 برو متوفر بسعر 3,999 ريال. معاه ذاكرة 256 جيجا واللون الأزرق. تبي تعرف تفاصيل أكثر؟

2. طلب شراء مباشر:
عميل: أبي آخذ وحدة من السماعات اللي عندكم
ساري: تمام! عندنا سماعات إيربودز برو بسعر 899 ريال. خليني ألخص لك الطلب:

• المنتج: سماعات إيربودز برو
• السعر: 899 ريال
• الكمية: 1

موافق على الطلب؟

3. مقارنة بين منتجات:
عميل: وش الفرق بين آيفون 14 و 15؟
ساري: والله يا أخي الفرق الرئيسي:
• آيفون 15 معالج أقوى (A17)
• كاميرا أفضل 48 ميجابكسل
• منفذ USB-C بدل لايتنينج

آيفون 14 بـ 2,799 ريال، والـ 15 بـ 3,499 ريال. أيهم أنسب لك؟

4. شكوى أو مشكلة:
عميل: السماعات اللي أخذتها ما تشتغل زين
ساري: والله آسف على المشكلة! خليني أساعدك. تقدر توضح لي المشكلة بالضبط؟ ما تشتغل نهائياً ولا فيها مشكلة في البلوتوث؟

5. متابعة طلب:
عميل: وين طلبي؟
ساري: أهلاً بك! خليني أتفقد لك طلبك. ممكن تعطيني رقم الطلب أو رقم جوالك اللي سجلت فيه؟

6. استفسار عن التوصيل:
عميل: كم رسوم التوصيل؟
ساري: التوصيل عندنا مجاني داخل الرياض للطلبات فوق 500 ريال. وإذا أقل من كذا، رسوم التوصيل 30 ريال. وين موقعك؟

7. طلب تخصيص:
عميل: تقدرون تحفرون اسم على الهدية؟
ساري: أكيد يا أخي! نقدر نحفر الاسم بدون رسوم إضافية. بس خليني أعرف الاسم اللي تبيه ونوع الخط (عربي أو إنجليزي)؟

8. سؤال عن منتج غير متوفر:
عميل: عندكم بلايستيشن 5 برو؟
ساري: للأسف ما عندنا بلايستيشن 5 برو حالياً. لكن عندنا بلايستيشن 5 سليم بسعر 1,899 ريال مع يدتين. ولا تبي أعرض لك إكس بوكس؟

9. عميل متردد:
عميل: ما أدري وش آخذ، محتار
ساري: لا تشيل هم! خليني أساعدك. وش استخدامك للجهاز؟ للألعاب، للعمل، ولا للاستخدام اليومي؟ على أساس كذا أقدر أرشح لك الأنسب.

10. عميل يشكر:
عميل: مشكور على المساعدة
ساري: العفو يا أخي! أي وقت تحتاج مساعدة أنا موجود 😊 بإذن الله نشوفك قريب!`;

interface ProductInfo {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  category: string | null;
}

interface OrderInfo {
  id: number;
  status: string;
  totalAmount: number;
  createdAt: Date;
  trackingNumber: string | null;
  items: string;
}

interface MerchantInfo {
  businessName: string;
  phone: string | null;
  autoReplyEnabled: boolean;
}

/**
 * الحصول على معلومات التاجر
 */
async function getMerchantInfo(merchantId: number): Promise<MerchantInfo | null> {
  const merchant = await db.getMerchantById(merchantId);
  if (!merchant) return null;
  
  return {
    businessName: merchant.businessName,
    phone: merchant.phone,
    autoReplyEnabled: merchant.autoReplyEnabled || false,
  };
}

/**
 * البحث عن طلبات العميل
 */
async function searchCustomerOrders(merchantId: number, customerPhone: string): Promise<OrderInfo[]> {
  try {
    const orders = await db.getOrdersByMerchantId(merchantId);
    
    // تصفية الطلبات حسب رقم الهاتف
    const customerOrders = orders.filter((order: any) => 
      order.customerPhone === customerPhone
    );
    
    return customerOrders.slice(0, 5).map((order: any) => ({
      id: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      trackingNumber: order.trackingNumber,
      items: order.items,
    }));
  } catch (error) {
    console.error('[AI] Error searching customer orders:', error);
    return [];
  }
}

/**
 * تنسيق معلومات الطلبات للعرض
 */
function formatOrdersInfo(orders: OrderInfo[]): string {
  if (orders.length === 0) {
    return "لا توجد طلبات سابقة.";
  }
  
  return orders.map(order => {
    const statusMap: Record<string, string> = {
      'pending': 'قيد الانتظار',
      'paid': 'مدفوع',
      'processing': 'قيد التجهيز',
      'shipped': 'تم الشحن',
      'delivered': 'تم التوصيل',
      'cancelled': 'ملغي'
    };
    
    const statusAr = statusMap[order.status] || order.status;
    const tracking = order.trackingNumber ? ` - رقم التتبع: ${order.trackingNumber}` : '';
    const date = new Date(order.createdAt).toLocaleDateString('ar-SA');
    
    return `• طلب رقم ${order.id} - ${statusAr}${tracking}\n  المبلغ: ${order.totalAmount} ريال - التاريخ: ${date}`;
  }).join('\n\n');
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
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [],
  customerPhone?: string
): Promise<string> {
  try {
    // الحصول على معلومات التاجر
    const merchantInfo = await getMerchantInfo(merchantId);
    
    // البحث عن منتجات ذات صلة
    const relevantProducts = await searchProducts(merchantId, customerMessage);
    
    // البحث عن طلبات العميل إذا كان رقم الهاتف متوفر
    let customerOrders: OrderInfo[] = [];
    if (customerPhone) {
      customerOrders = await searchCustomerOrders(merchantId, customerPhone);
    }
    
    // إعداد معلومات المنتجات
    let productsContext = '';
    if (relevantProducts.length > 0) {
      productsContext = `\n\nالمنتجات المتاحة ذات الصلة:\n${formatProductsInfo(relevantProducts)}`;
    }
    
    // إعداد معلومات الطلبات
    let ordersContext = '';
    if (customerOrders.length > 0) {
      ordersContext = `\n\nطلبات العميل السابقة:\n${formatOrdersInfo(customerOrders)}`;
    }
    
    // إعداد معلومات التاجر
    const merchantContext = merchantInfo ? `\n\nمعلومات المتجر:\nاسم المتجر: ${merchantInfo.businessName}\nرقم التواصل: ${merchantInfo.phone || 'غير متوفر'}` : '';

    // بناء سياق المحادثة
    const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
      {
        role: 'system',
        content: SARI_PERSONALITY + merchantContext + productsContext + ordersContext
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

    // توليد الرد مع تمرير رقم هاتف العميل
    const aiResponse = await generateAIResponse(merchantId, messageText, conversationHistory, customerPhone);

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
