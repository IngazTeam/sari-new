/**
 * Zid Order From Chat System
 * 
 * هذا الملف يتعامل مع إنشاء الطلبات في منصة Zid من محادثات WhatsApp:
 * 1. تحليل رسالة العميل لاستخراج المنتجات والكميات والعنوان
 * 2. إنشاء طلب في Zid
 * 3. إرسال رابط الدفع للعميل
 * 4. تتبع حالة الطلب
 */

import { ZidClient, ZidCreateOrderResponse } from '../integrations/zid/zidClient';
import { getZidProducts, saveZidOrder } from '../db';
import dbZid from '../db_zid';
import { invokeLLM } from '../_core/llm';

interface ParsedZidOrder {
  products: Array<{
    name: string;
    quantity: number;
    sku?: string;
    zidProductId?: string;
  }>;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    countryCode?: string;
  };
  customerName?: string;
  isGift?: boolean;
  giftRecipientName?: string;
  giftMessage?: string;
}

interface ZidOrderResult {
  success: boolean;
  orderId?: number;
  zidOrderId?: number;
  orderCode?: string;
  orderUrl?: string;
  totalAmount?: number;
  message: string;
}

/**
 * تحليل رسالة العميل لاستخراج تفاصيل الطلب باستخدام AI
 */
export async function parseZidOrderMessage(
  message: string, 
  merchantId: number
): Promise<ParsedZidOrder | null> {
  try {
    // جلب منتجات Zid للتاجر
    const zidProducts = await getZidProducts(merchantId);
    const productList = zidProducts.map(p => 
      `- ${p.nameAr || p.nameEn || 'منتج'} (SKU: ${p.zidSku || p.zidProductId}, السعر: ${p.price} ريال)`
    ).join('\n');

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `أنت مساعد ذكي لتحليل طلبات الشراء من الواتساب لمتجر Zid. مهمتك استخراج المعلومات التالية من رسالة العميل:
1. المنتجات المطلوبة مع الكميات (استخدم SKU إذا أمكن)
2. العنوان (إن وجد)
3. المدينة (إن وجد)
4. هل الطلب هدية؟
5. اسم المستلم (إذا كان هدية)
6. رسالة الهدية (إذا كان هدية)

المنتجات المتوفرة في المتجر:
${productList}

أرجع النتيجة بصيغة JSON فقط بدون أي نص إضافي.`
        },
        {
          role: 'user',
          content: message
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'zid_order_details',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'number' },
                    sku: { type: 'string' }
                  },
                  required: ['name', 'quantity'],
                  additionalProperties: false
                }
              },
              address: {
                type: 'object',
                properties: {
                  line1: { type: 'string' },
                  line2: { type: 'string' },
                  city: { type: 'string' },
                  countryCode: { type: 'string' }
                },
                required: ['line1', 'city'],
                additionalProperties: false
              },
              isGift: { type: 'boolean' },
              giftRecipientName: { type: 'string' },
              giftMessage: { type: 'string' }
            },
            required: ['products'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') return null;

    const parsed: ParsedZidOrder = JSON.parse(content);

    // مطابقة المنتجات مع قاعدة البيانات
    for (const product of parsed.products) {
      // البحث بواسطة SKU أولاً
      if (product.sku) {
        const dbProduct = zidProducts.find(p => 
          p.zidSku === product.sku || p.zidProductId === product.sku
        );
        if (dbProduct) {
          product.zidProductId = dbProduct.zidProductId;
          product.sku = dbProduct.zidSku || undefined;
          continue;
        }
      }
      
      // البحث بواسطة الاسم
      const dbProduct = zidProducts.find(p => {
        const nameAr = p.nameAr?.toLowerCase() || '';
        const nameEn = p.nameEn?.toLowerCase() || '';
        const searchName = product.name.toLowerCase();
        return nameAr.includes(searchName) || 
               searchName.includes(nameAr) ||
               nameEn.includes(searchName) ||
               searchName.includes(nameEn);
      });
      
      if (dbProduct) {
        product.zidProductId = dbProduct.zidProductId;
        product.sku = dbProduct.zidSku || undefined;
      }
    }

    return parsed;
  } catch (error) {
    console.error('[ZidOrderFromChat] Error parsing message:', error);
    return null;
  }
}

/**
 * إنشاء طلب في Zid من محادثة WhatsApp
 */
export async function createZidOrderFromChat(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  parsedOrder: ParsedZidOrder
): Promise<ZidOrderResult> {
  try {
    // جلب إعدادات Zid للتاجر
    const zidSettings = await dbZid.getZidSettings(merchantId);
    if (!zidSettings || !zidSettings.accessToken) {
      return {
        success: false,
        message: 'لم يتم ربط متجر Zid. يرجى ربط المتجر أولاً من الإعدادات.'
      };
    }

    // إنشاء عميل Zid
    const zidClient = new ZidClient({
      clientId: zidSettings.clientId || '',
      clientSecret: zidSettings.clientSecret || '',
      redirectUri: '',
      accessToken: zidSettings.accessToken,
      managerToken: zidSettings.managerToken || undefined,
    });

    // التحقق من وجود منتجات صالحة
    const validProducts = parsedOrder.products.filter(p => p.sku);
    if (validProducts.length === 0) {
      return {
        success: false,
        message: 'لم نتمكن من العثور على المنتجات المطلوبة في المتجر. يرجى التأكد من أسماء المنتجات.'
      };
    }

    // جلب طرق الدفع والشحن
    let paymentMethodId: number | null = null;
    let shippingMethodId: number | null = null;

    try {
      // محاولة الحصول على طريقة الدفع (رابط الدفع)
      const paymentLinkMethod = await zidClient.getPaymentLinkMethod();
      if (paymentLinkMethod) {
        paymentMethodId = paymentLinkMethod.id;
      } else {
        // محاولة الحصول على الدفع عند الاستلام
        const codMethod = await zidClient.getCODPaymentMethod();
        if (codMethod) {
          paymentMethodId = codMethod.id;
        }
      }

      // جلب طرق الشحن
      const { shipping_methods } = await zidClient.getShippingMethods();
      if (shipping_methods && shipping_methods.length > 0) {
        // اختيار أول طريقة شحن متاحة
        const enabledMethod = shipping_methods.find(sm => sm.enabled);
        if (enabledMethod) {
          shippingMethodId = enabledMethod.id;
        }
      }
    } catch (error) {
      console.error('[ZidOrderFromChat] Error fetching payment/shipping methods:', error);
    }

    if (!paymentMethodId || !shippingMethodId) {
      return {
        success: false,
        message: 'لم نتمكن من تحديد طريقة الدفع أو الشحن. يرجى التواصل مع الدعم.'
      };
    }

    // حساب المبلغ الإجمالي
    const zidProducts = await getZidProducts(merchantId);
    let totalAmount = 0;
    const orderProducts: Array<{ sku: string; quantity: number }> = [];

    for (const product of validProducts) {
      const dbProduct = zidProducts.find(p => p.zidSku === product.sku || p.zidProductId === product.zidProductId);
      if (dbProduct && dbProduct.price) {
        totalAmount += dbProduct.price * product.quantity;
        orderProducts.push({
          sku: product.sku!,
          quantity: product.quantity
        });
      }
    }

    // تحديد العنوان الافتراضي إذا لم يتم توفيره
    const address = parsedOrder.address || {
      line1: 'سيتم التواصل لتحديد العنوان',
      city: 'الرياض',
      countryCode: 'SA'
    };

    // إنشاء الطلب في Zid
    const zidOrderResponse = await zidClient.createOrderFromWhatsApp({
      customerName,
      customerPhone,
      address: {
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        countryCode: address.countryCode || 'SA'
      },
      products: orderProducts,
      paymentMethodId,
      shippingMethodId,
      isPaymentLink: true
    });

    // حفظ الطلب في قاعدة البيانات المحلية
    const savedOrder = await saveZidOrder(merchantId, {
      zidOrderId: String(zidOrderResponse.order.id),
      zidOrderNumber: zidOrderResponse.order.code,
      customerName,
      customerPhone,
      totalAmount: parseFloat(zidOrderResponse.order.order_total),
      currency: zidOrderResponse.order.currency_code,
      status: zidOrderResponse.order.order_status?.code || 'pending',
      orderUrl: zidOrderResponse.order.order_url,
      zidData: JSON.stringify(zidOrderResponse.order)
    });

    // تسجيل في سجل المزامنة
    try {
      await dbZid.createZidSyncLog({
        merchantId,
        syncType: 'orders',
        status: 'completed',
        processedItems: 1,
        successCount: 1,
        failedCount: 0
      });
    } catch (logError) {
      console.warn('[ZidOrderFromChat] Failed to create sync log:', logError);
    }

    return {
      success: true,
      orderId: savedOrder?.id,
      zidOrderId: zidOrderResponse.order.id,
      orderCode: zidOrderResponse.order.code,
      orderUrl: zidOrderResponse.order.order_url,
      totalAmount: parseFloat(zidOrderResponse.order.order_total),
      message: 'تم إنشاء الطلب بنجاح!'
    };

  } catch (error: any) {
    console.error('[ZidOrderFromChat] Error creating order:', error);
    
    // تسجيل الفشل
    try {
      await dbZid.createZidSyncLog({
        merchantId,
        syncType: 'orders',
        status: 'failed',
        processedItems: 1,
        successCount: 0,
        failedCount: 1,
        errorMessage: error.message
      });
    } catch (logError) {
      console.warn('[ZidOrderFromChat] Failed to create sync log:', logError);
    }

    return {
      success: false,
      message: `فشل في إنشاء الطلب: ${error.message}`
    };
  }
}

/**
 * إنشاء رسالة تأكيد الطلب لـ Zid
 */
export function generateZidOrderConfirmationMessage(
  orderCode: string,
  items: Array<{ name: string; quantity: number; price: number }>,
  totalAmount: number,
  orderUrl: string
): string {
  const itemsList = items.map(item => 
    `• ${item.name} × ${item.quantity} = ${item.price * item.quantity} ريال`
  ).join('\n');

  return `✅ *تم إنشاء طلبك بنجاح في Zid!*

📦 *رقم الطلب:* ${orderCode}

*المنتجات:*
${itemsList}

💰 *الإجمالي:* ${totalAmount} ريال

🔗 *لإتمام الطلب والدفع:*
${orderUrl}

📱 سنرسل لك تحديثات عن حالة طلبك عبر الواتساب

شكراً لثقتك بنا! 🌟`;
}

/**
 * إنشاء رسالة رابط الدفع لـ Zid
 */
export function generateZidPaymentLinkMessage(
  orderCode: string,
  amount: number,
  orderUrl: string
): string {
  return `💳 *رابط الدفع جاهز!*

📦 *رقم الطلب:* ${orderCode}
💰 *المبلغ:* ${amount} ريال

🔒 *لإتمام الدفع بشكل آمن:*
${orderUrl}

⏰ الرابط صالح لمدة 7 أيام
📱 ستصلك رسالة تأكيد فور إتمام الدفع

شكراً لثقتك بنا! 🌟`;
}

/**
 * التحقق مما إذا كانت الرسالة طلب شراء
 */
export async function isZidOrderRequest(message: string): Promise<boolean> {
  const orderKeywords = [
    'أبي', 'أبغى', 'أريد', 'أطلب', 'اشتري', 'شراء',
    'عندكم', 'متوفر', 'كم سعر', 'السعر',
    'أبي أطلب', 'أبغى أشتري', 'ابي اطلب', 'ابغى اشتري',
    'هدية', 'هدية لـ', 'اريد', 'اطلب',
    'طلب', 'اشتر', 'بكم', 'سعره'
  ];

  const lowerMessage = message.toLowerCase();
  return orderKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * التحقق من تأكيد العميل للطلب
 */
export function isOrderConfirmation(message: string): boolean {
  const confirmKeywords = [
    'نعم', 'اي', 'ايه', 'أيوه', 'أكيد', 'تمام', 'موافق',
    'yes', 'ok', 'okay', 'confirm', 'أكد', 'اكد',
    'صحيح', 'مضبوط', 'اوكي', 'اوك', 'ماشي', 'خلاص',
    'أكمل', 'اكمل', 'كمل', 'نفذ', 'أنفذ'
  ];

  const lowerMessage = message.toLowerCase().trim();
  return confirmKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * التحقق من رفض العميل للطلب
 */
export function isOrderRejection(message: string): boolean {
  const rejectKeywords = [
    'لا', 'لأ', 'no', 'cancel', 'الغي', 'ألغي', 'إلغاء',
    'مش عايز', 'مابي', 'ما ابي', 'ماابي', 'لا شكرا',
    'بعدين', 'لاحقا', 'مو الحين'
  ];

  const lowerMessage = message.toLowerCase().trim();
  return rejectKeywords.some(keyword => lowerMessage.includes(keyword));
}

export default {
  parseZidOrderMessage,
  createZidOrderFromChat,
  generateZidOrderConfirmationMessage,
  generateZidPaymentLinkMessage,
  isZidOrderRequest,
  isOrderConfirmation,
  isOrderRejection
};
