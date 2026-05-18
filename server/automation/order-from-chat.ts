/**
 * Order From Chat System
 * 
 * This module handles complete order processing from WhatsApp chat:
 * 1. Parse customer message to extract products, quantity, and address
 * 2. Create order in Salla
 * 3. Generate payment link
 * 4. Send payment link to customer
 * 5. Track order status
 */

import { invokeLLM } from '../_core/llm';
import { SallaIntegration } from '../integrations/salla';
import {
  createOrder,
  getMerchantById,
  getMerchantPaymentSettings,
  getProductById,
  getProductsByMerchantId,
  getReferralCodeByCode,
  getSallaConnectionByMerchantId,
  getUserById,
  incrementDiscountCodeUsage,
  updateOrder,
} from '../db';
import * as dbPayments from '../db_payments';
// import { createPaymentLink } from '../_core/tapPayments';
// import { sendWhatsAppMessage } from '../greenapi-wrapper';
import { 
  extractDiscountCodeFromMessage, 
  validateDiscountCode,
  calculateFinalPrice 
} from './discount-system';
import { 
  extractReferralCodeFromMessage,
  trackReferral 
} from './referral-system';

interface ParsedOrder {
  products: Array<{
    name: string;
    quantity: number;
    productId?: number;
  }>;
  address?: string;
  city?: string;
  customerName?: string;
  isGift?: boolean;
  giftRecipientName?: string;
  giftMessage?: string;
}

interface DiscountInfo {
  code: string;
  type: 'discount' | 'referral';
  discountType: 'percentage' | 'fixed';
  value: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

/**
 * Parse customer message to extract order details using AI
 */
export async function parseOrderMessage(message: string, merchantId: number): Promise<ParsedOrder | null> {
  try {
    // Get merchant's products for context
    const products = await getProductsByMerchantId(merchantId);
    const productList = products.map(p => `- ${p.name} (${p.price} ريال)`).join('\n');

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `أنت مساعد ذكي لتحليل طلبات الشراء من الواتساب. مهمتك استخراج المعلومات التالية من رسالة العميل:
1. المنتجات المطلوبة مع الكميات
2. العنوان (إن وجد)
3. المدينة (إن وجد)
4. هل الطلب هدية؟
5. اسم المستلم (إذا كان هدية)
6. رسالة الهدية (إذا كان هدية)

المنتجات المتوفرة:
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
          name: 'order_details',
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
                    quantity: { type: 'number' }
                  },
                  required: ['name', 'quantity'],
                  additionalProperties: false
                }
              },
              address: { type: 'string' },
              city: { type: 'string' },
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

    const parsed: ParsedOrder = JSON.parse(content);

    // Match products with database IDs
    for (const product of parsed.products) {
      const dbProduct = products.find(p => 
        p.name.toLowerCase().includes(product.name.toLowerCase()) ||
        product.name.toLowerCase().includes(p.name.toLowerCase())
      );
      if (dbProduct) {
        product.productId = dbProduct.id;
      }
    }

    return parsed;
  } catch (error) {
    console.error('[OrderFromChat] Error parsing message:', error);
    return null;
  }
}

/**
 * Create order in Salla and return payment link
 */
export async function createOrderFromChat(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  parsedOrder: ParsedOrder,
  message?: string
): Promise<{ orderId: number; paymentUrl: string | null; orderNumber: string | null; discountInfo?: DiscountInfo } | null> {
  try {
    // Get Salla connection
    const sallaConnection = await getSallaConnectionByMerchantId(merchantId);
    if (!sallaConnection) {
      throw new Error('Salla not connected');
    }

    const salla = new SallaIntegration(merchantId, sallaConnection.accessToken);

    // Prepare order items
    const items = [];
    let totalAmount = 0;

    for (const product of parsedOrder.products) {
      if (!product.productId) continue;

      const dbProduct = await getProductById(product.productId);
      if (!dbProduct) continue;

      items.push({
        sallaProductId: dbProduct.sallaProductId || '',
        productId: dbProduct.id,
        name: dbProduct.name,
        quantity: product.quantity,
        price: dbProduct.price
      });

      totalAmount += dbProduct.price * product.quantity;
    }

    if (items.length === 0) {
      throw new Error('No valid products found');
    }

    // Check for discount or referral codes
    let discountInfo: DiscountInfo | undefined;
    let finalAmount = totalAmount;

    if (message) {
      // Try to extract discount code
      const discountCode = extractDiscountCodeFromMessage(message);
      if (discountCode) {
        const validation = await validateDiscountCode(merchantId, discountCode, totalAmount);
        if (validation.valid && validation.discountCode) {
          finalAmount = validation.finalAmount || totalAmount;
          const discountAmount = validation.discount || 0;
          discountInfo = {
            code: discountCode,
            type: 'discount',
            discountType: validation.discountCode.type,
            value: validation.discountCode.value,
            originalAmount: totalAmount,
            discountAmount,
            finalAmount
          };
          // Increment usage count
          await incrementDiscountCodeUsage(discountCode);
        }
      }

      // Try to extract referral code if no discount applied
      if (!discountInfo) {
        const referralCode = extractReferralCodeFromMessage(message);
        if (referralCode) {
          const referralCodeData = await getReferralCodeByCode(referralCode);
          if (referralCodeData && referralCodeData.merchantId === merchantId) {
            // Track referral (will be completed when order is paid)
            await trackReferral(merchantId, referralCode, customerPhone, customerName);
            // Note: Referral discount is applied after first successful purchase
          }
        }
      }
    }

    // Create order in Salla
    const sallaOrder = await salla.createOrder({
      customerName,
      phone: customerPhone,
      email: `${customerPhone.replace('+', '')}@temp.salla.sa`,
      address: parsedOrder.address || 'سيتم التواصل لتحديد العنوان',
      city: parsedOrder.city || 'الرياض',
      items: items.map(item => ({
        sallaProductId: item.sallaProductId,
        quantity: item.quantity,
        price: item.price
      })),
      notes: parsedOrder.isGift 
        ? `هدية إلى: ${parsedOrder.giftRecipientName}\nرسالة: ${parsedOrder.giftMessage}`
        : undefined
    });

    if (!sallaOrder || !sallaOrder.success) {
      throw new Error('Failed to create order in Salla');
    }

    // Save order in our database
    const order = await createOrder({
      merchantId,
      sallaOrderId: sallaOrder.orderId,
      orderNumber: sallaOrder.orderNumber,
      customerPhone,
      customerName,
      address: parsedOrder.address,
      city: parsedOrder.city,
      items: JSON.stringify(items),
      totalAmount: finalAmount, // Use final amount after discount
      status: 'pending',
      paymentUrl: sallaOrder.paymentUrl || null,
      isGift: parsedOrder.isGift || false,
      giftRecipientName: parsedOrder.giftRecipientName,
      giftMessage: parsedOrder.giftMessage,
      discountCode: discountInfo?.code
    });

    if (!order) {
      throw new Error('Failed to save order in database');
    }

    // إنشاء رابط دفع Tap باستخدام مفاتيح التاجر
    let tapPaymentUrl: string | null = null;
    try {
      // جلب إعدادات الدفع للتاجر
      const paymentSettings = await getMerchantPaymentSettings(merchantId);
      
      if (paymentSettings?.tapEnabled && paymentSettings?.tapSecretKey) {
        const baseUrl = 'https://api.tap.company/v2';
        const merchant = await getMerchantById(merchantId);
        
        const chargeData = {
          amount: finalAmount / 100, // تحويل من الهللات إلى ريال
          currency: paymentSettings.defaultCurrency || 'SAR',
          customer: {
            first_name: customerName || 'Customer',
            phone: {
              country_code: '966',
              number: customerPhone.replace(/^\+?966/, '').replace(/^0/, ''),
            },
          },
          source: { id: 'src_all' },
          redirect: {
            url: `${process.env.VITE_APP_URL || 'https://sari.manus.space'}/payment/callback`,
          },
          description: `طلب رقم ${order.orderNumber} من ${merchant?.businessName || 'المتجر'}`,
          metadata: {
            merchantId: merchantId.toString(),
            orderId: order.id.toString(),
            orderNumber: order.orderNumber || '',
            type: 'order'
          },
        };

        const response = await fetch(`${baseUrl}/charges`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${paymentSettings.tapSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chargeData),
        });

        const result = await response.json();

        if (response.ok && (result.transaction?.url || result.redirect?.url)) {
          tapPaymentUrl = result.transaction?.url || result.redirect?.url;
          
          // حفظ رابط الدفع في قاعدة البيانات
          await dbPayments.createOrderPayment({
            merchantId,
            orderId: order.id,
            bookingId: null,
            customerPhone,
            customerName,
            amount: finalAmount,
            currency: paymentSettings.defaultCurrency || 'SAR',
            tapChargeId: result.id,
            tapPaymentUrl: tapPaymentUrl,
            status: 'pending',
            description: `طلب رقم ${order.orderNumber}`,
          });

          // تحديث رابط الدفع في الطلب
          await updateOrder(order.id, { paymentUrl: tapPaymentUrl });

          console.log('[OrderFromChat] Tap payment link created:', tapPaymentUrl);
        } else {
          console.warn('[OrderFromChat] Tap API error:', result);
        }
      }
    } catch (error) {
      console.error('[OrderFromChat] Error creating Tap payment link:', error);
      // نستمر حتى لو فشل إنشاء رابط Tap، سنستخدم رابط Salla
    }

    // Notify admin about new order
    try {
      const { notifyNewOrder } = await import('../_core/emailNotifications');
      const merchant = await getMerchantById(merchantId);
      const user = merchant ? await getUserById(merchant.userId) : null;
      await notifyNewOrder({
        merchantName: user?.name || merchant?.businessName || 'Unknown',
        businessName: merchant?.businessName || 'Unknown',
        orderNumber: order.orderNumber || 'N/A',
        customerName: customerName,
        customerPhone: customerPhone,
        totalAmount: finalAmount / 100, // Convert from halalas to SAR
        itemsCount: items.length,
        orderDate: new Date(),
      });
    } catch (error) {
      console.error('Failed to send new order notification:', error);
    }

    return {
      orderId: order.id,
      paymentUrl: tapPaymentUrl || sallaOrder.paymentUrl || null,
      orderNumber: order.orderNumber,
      discountInfo
    };
  } catch (error) {
    console.error('[OrderFromChat] Error creating order:', error);
    return null;
  }
}

/**
 * Generate order confirmation message
 */
export function generateOrderConfirmationMessage(
  orderNumber: string,
  items: Array<{ name: string; quantity: number; price: number }>,
  totalAmount: number,
  paymentUrl: string,
  discountInfo?: DiscountInfo
): string {
  const itemsList = items.map(item => 
    `• ${item.name} × ${item.quantity} = ${item.price * item.quantity} ريال`
  ).join('\n');

  let discountSection = '';
  if (discountInfo) {
    const discountTypeText = discountInfo.type === 'discount' ? 'كود خصم' : 'كود إحالة';
    discountSection = `
💳 *${discountTypeText}:* ${discountInfo.code}
💵 *السعر الأصلي:* ${discountInfo.originalAmount} ريال
🎉 *الخصم:* -${discountInfo.discountAmount} ريال
`;
  }

  return `✅ *تم إنشاء طلبك بنجاح!*

📦 *رقم الطلب:* ${orderNumber}

*المنتجات:*
${itemsList}${discountSection}
💰 *الإجمالي:* ${totalAmount} ريال

🔗 *لإتمام الطلب، اضغط على الرابط التالي للدفع:*
${paymentUrl}

📱 سنرسل لك تحديثات عن حالة طلبك عبر الواتساب

شكراً لثقتك بنا! 🌟`;
}

/**
 * Generate payment link message for WhatsApp
 */
export function generatePaymentLinkMessage(
  orderNumber: string,
  amount: number,
  paymentUrl: string
): string {
  return `💳 *رابط الدفع جاهز!*

📦 *رقم الطلب:* ${orderNumber}
💰 *المبلغ:* ${amount} ريال

🔒 *لإتمام الدفع بشكل آمن:*
${paymentUrl}

✅ الدفع مؤمن بالكامل عبر Tap Payments
⏰ الرابط صالح لمدة 24 ساعة
📱 ستصلك رسالة تأكيد فور إتمام الدفع

شكراً لثقتك بنا! 🌟`;
}

/**
 * Generate gift order confirmation message
 */
export function generateGiftOrderConfirmationMessage(
  orderNumber: string,
  recipientName: string,
  items: Array<{ name: string; quantity: number; price: number }>,
  totalAmount: number,
  paymentUrl: string,
  discountInfo?: DiscountInfo
): string {
  const itemsList = items.map(item => 
    `• ${item.name} × ${item.quantity}`
  ).join('\n');

  let discountSection = '';
  if (discountInfo) {
    const discountTypeText = discountInfo.type === 'discount' ? 'كود خصم' : 'كود إحالة';
    discountSection = `
💳 *${discountTypeText}:* ${discountInfo.code}
💵 *السعر الأصلي:* ${discountInfo.originalAmount} ريال
🎉 *الخصم:* -${discountInfo.discountAmount} ريال
`;
  }

  return `🎁 *تم إنشاء طلب الهدية بنجاح!*

📦 *رقم الطلب:* ${orderNumber}
👤 *المستلم:* ${recipientName}

*المنتجات:*
${itemsList}${discountSection}
💰 *الإجمالي:* ${totalAmount} ريال

🔗 *لإتمام الطلب، اضغط على الرابط التالي للدفع:*
${paymentUrl}

🎉 سنقوم بتوصيل الهدية مع بطاقة تهنئة خاصة

شكراً لاختيارك هديتك معنا! 💝`;
}

/**
 * Check if message is an order request
 */
export async function isOrderRequest(message: string): Promise<boolean> {
  const orderKeywords = [
    'أبي', 'أبغى', 'أريد', 'أطلب', 'اشتري',
    'عندكم', 'متوفر', 'كم سعر',
    'أبي أطلب', 'أبغى أشتري',
    'هدية', 'هدية لـ'
  ];

  const lowerMessage = message.toLowerCase();
  return orderKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Check if message contains address information
 */
export function hasAddressInfo(message: string): boolean {
  const addressKeywords = [
    'عنوان', 'عنواني', 'موقع', 'موقعي',
    'حي', 'شارع', 'مدينة',
    'الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام'
  ];

  const lowerMessage = message.toLowerCase();
  return addressKeywords.some(keyword => lowerMessage.includes(keyword));
}
