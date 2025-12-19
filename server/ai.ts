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
      isProcessed: 1,
      aiResponse: aiResponse,
    });

    return aiResponse;

  } catch (error) {
    console.error('[AI] Error processing incoming message:', error);
    return null;
  }
}


// ============================================
// Service Booking Functions
// ============================================

/**
 * Detect if the message is a booking request
 */
export async function detectServiceBookingRequest(messageText: string, merchantId: number): Promise<boolean> {
  const bookingKeywords = [
    'حجز', 'موعد', 'أريد حجز', 'أبغى موعد', 'أبي موعد', 'أبغى أحجز',
    'متى ممكن', 'متى متاح', 'عندكم وقت', 'فيه وقت فاضي',
    'booking', 'appointment', 'reserve', 'schedule'
  ];
  
  const lowerText = messageText.toLowerCase();
  return bookingKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Extract booking details from message using AI
 */
export async function extractBookingDetails(
  messageText: string,
  merchantId: number,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{
  serviceRequested?: string;
  preferredDate?: string;
  preferredTime?: string;
  customerName?: string;
  notes?: string;
}> {
  try {
    const prompt = `أنت مساعد ذكي لاستخراج تفاصيل الحجز من رسائل العملاء.

المحادثة السابقة:
${conversationHistory.map(m => `${m.role === 'user' ? 'العميل' : 'ساري'}: ${m.content}`).join('\n')}

الرسالة الحالية: "${messageText}"

استخرج التفاصيل التالية إن وجدت:
1. الخدمة المطلوبة (اسم الخدمة أو وصفها)
2. التاريخ المفضل (حوّل التعبيرات مثل "غداً" أو "يوم السبت" إلى تاريخ بصيغة YYYY-MM-DD)
3. الوقت المفضل (بصيغة HH:MM)
4. اسم العميل (إن ذكره)
5. ملاحظات إضافية

أرجع النتيجة بصيغة JSON فقط بدون أي نص إضافي:
{
  "serviceRequested": "اسم الخدمة أو null",
  "preferredDate": "YYYY-MM-DD أو null",
  "preferredTime": "HH:MM أو null",
  "customerName": "الاسم أو null",
  "notes": "ملاحظات أو null"
}`;

    const response = await invokeLLM({
      messages: [
        { role: 'system', content: 'أنت مساعد ذكي لاستخراج تفاصيل الحجز. أرجع JSON فقط.' },
        { role: 'user', content: prompt }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'booking_details',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              serviceRequested: { type: ['string', 'null'] },
              preferredDate: { type: ['string', 'null'] },
              preferredTime: { type: ['string', 'null'] },
              customerName: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] }
            },
            required: ['serviceRequested', 'preferredDate', 'preferredTime', 'customerName', 'notes'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};

    const details = JSON.parse(content);
    return {
      serviceRequested: details.serviceRequested || undefined,
      preferredDate: details.preferredDate || undefined,
      preferredTime: details.preferredTime || undefined,
      customerName: details.customerName || undefined,
      notes: details.notes || undefined,
    };

  } catch (error) {
    console.error('[AI] Error extracting booking details:', error);
    return {};
  }
}

/**
 * Find matching service based on customer request
 */
export async function findMatchingService(
  serviceRequest: string,
  merchantId: number
): Promise<any | null> {
  try {
    const services = await db.getServicesByMerchant(merchantId);
    if (services.length === 0) return null;

    // استخدام AI للمطابقة الذكية
    const servicesList = services.map(s => `${s.id}: ${s.name} - ${s.description || ''}`).join('\n');
    
    const prompt = `لديك قائمة الخدمات التالية:
${servicesList}

العميل يطلب: "${serviceRequest}"

أرجع رقم ID الخدمة الأنسب فقط (رقم فقط)، أو null إذا لم تجد مطابقة مناسبة.`;

    const response = await invokeLLM({
      messages: [
        { role: 'system', content: 'أنت مساعد لمطابقة طلبات العملاء مع الخدمات المتاحة.' },
        { role: 'user', content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content || content === 'null') return null;

    const serviceId = parseInt(content);
    return services.find(s => s.id === serviceId) || null;

  } catch (error) {
    console.error('[AI] Error finding matching service:', error);
    return null;
  }
}

/**
 * Create booking from chat conversation
 */
export async function createBookingFromChat(params: {
  merchantId: number;
  serviceId: number;
  customerPhone: string;
  customerName?: string;
  bookingDate: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
}): Promise<{ success: boolean; bookingId?: number; message: string; paymentUrl?: string }> {
  try {
    // الحصول على معلومات الخدمة
    const service = await db.getServiceById(params.serviceId);
    if (!service) {
      return { success: false, message: 'الخدمة غير موجودة' };
    }

    // حساب وقت الانتهاء
    const [hours, minutes] = params.startTime.split(':').map(Number);
    const endMinutes = minutes + params.durationMinutes;
    const endHours = hours + Math.floor(endMinutes / 60);
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    // التحقق من عدم وجود تعارض
    const hasConflict = await db.checkBookingConflict(
      params.serviceId,
      null,
      params.bookingDate,
      params.startTime,
      endTime
    );

    if (hasConflict) {
      return { success: false, message: 'عذراً، هذا الموعد محجوز بالفعل. يرجى اختيار وقت آخر.' };
    }

    // إنشاء الحجز
    const bookingId = await db.createBooking({
      merchantId: params.merchantId,
      serviceId: params.serviceId,
      customerPhone: params.customerPhone,
      customerName: params.customerName,
      bookingDate: params.bookingDate,
      startTime: params.startTime,
      endTime,
      durationMinutes: params.durationMinutes,
      basePrice: service.basePrice || 0,
      finalPrice: service.basePrice || 0,
      notes: params.notes,
      bookingSource: 'whatsapp',
    });

    // إنشاء رابط دفع Tap للحجز
    let paymentUrl: string | undefined;
    try {
      const dbPayments = await import('../db_payments');
      // const { createPaymentLink } = await import('../_core/tapPayments');

      // TODO: إعادة تفعيل بعد إصلاح createPaymentLink
      /*
      const paymentLink = await createPaymentLink({
        merchantId: params.merchantId,
        amount: service.basePrice || 0,
        currency: 'SAR',
        customerName: params.customerName || 'عميل',
        customerPhone: params.customerPhone,
        description: `حجز ${service.name} - ${params.bookingDate}`,
        metadata: {
          bookingId: bookingId?.toString() || '',
          serviceId: params.serviceId.toString(),
          type: 'booking'
        }
      });

      if (paymentLink && paymentLink.url) {
        paymentUrl = paymentLink.url;
        
        // حفظ رابط الدفع
        await dbPayments.createPaymentLink({
          merchantId: params.merchantId,
          bookingId,
          amount: service.basePrice || 0,
          currency: 'SAR',
          tapChargeId: paymentLink.id,
          paymentUrl: paymentLink.url,
          status: 'active',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        // إرسال رابط الدفع عبر واتساب
        const paymentMessage = `💳 *رابط الدفع جاهز!*

📅 *الحجز:* ${service.name}
📆 *التاريخ:* ${params.bookingDate}
⏰ *الوقت:* ${params.startTime} - ${endTime}
💰 *المبلغ:* ${service.basePrice} ريال

🔒 *لإتمام الدفع:*
${paymentUrl}

✅ الدفع مؤمن عبر Tap Payments
⏰ الرابط صالح لمدة 24 ساعة

شكراً لثقتك! 🌟`;
        
        // TODO: إرسال رسالة الدفع عبر واتساب
        console.log('[AI] Payment link created for booking:', paymentUrl);
      }
      */
    } catch (error) {
      console.error('[AI] Error creating payment link for booking:', error);
    }

    return {
      success: true,
      bookingId,
      paymentUrl,
      message: `تم تأكيد حجزك بنجاح! 🎉\n\nالخدمة: ${service.name}\nالتاريخ: ${params.bookingDate}\nالوقت: ${params.startTime} - ${endTime}\nالمدة: ${params.durationMinutes} دقيقة\n\nسنرسل لك تذكير قبل الموعد. شكراً لك! 💚`
    };

  } catch (error) {
    console.error('[AI] Error creating booking from chat:', error);
    return { success: false, message: 'حدث خطأ أثناء إنشاء الحجز. يرجى المحاولة مرة أخرى.' };
  }
}

/**
 * Generate available time slots message
 */
export async function generateAvailableSlotsMessage(
  serviceId: number,
  date: string
): Promise<string> {
  try {
    const service = await db.getServiceById(serviceId);
    if (!service) return 'عذراً، الخدمة غير متاحة.';

    // الحصول على الحجوزات الموجودة في هذا اليوم
    const existingBookings = await db.getBookingsByService(serviceId, {
      startDate: date,
      endDate: date,
      status: 'confirmed'
    });

    // توليد الأوقات المتاحة (من 9 صباحاً إلى 5 مساءً)
    const availableSlots: string[] = [];
    for (let hour = 9; hour < 17; hour++) {
      const timeSlot = `${String(hour).padStart(2, '0')}:00`;
      
      // التحقق من عدم وجود تعارض
      const hasConflict = existingBookings.some((booking: any) => {
        return booking.startTime <= timeSlot && booking.endTime > timeSlot;
      });

      if (!hasConflict) {
        availableSlots.push(timeSlot);
      }
    }

    if (availableSlots.length === 0) {
      return `عذراً، لا توجد أوقات متاحة في ${date}. يرجى اختيار يوم آخر.`;
    }

    return `الأوقات المتاحة في ${date}:\n\n${availableSlots.map((slot, i) => `${i + 1}. ${slot}`).join('\n')}\n\nيرجى اختيار الوقت المناسب لك.`;

  } catch (error) {
    console.error('[AI] Error generating available slots:', error);
    return 'حدث خطأ أثناء جلب الأوقات المتاحة.';
  }
}
