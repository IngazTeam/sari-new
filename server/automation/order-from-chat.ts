import { currentInboundExecution } from '../messaging/inbound-context';
import { sallaShippingSchema, type SallaShipping } from '../../shared/salla-order';
import { formatProductPrice, formatMinorMoney, verifiedProductMoney, requireMinor } from '../../shared/product-money';
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
  getProductById,
  getProductsByMerchantId,
  getSallaConnectionByMerchantId,
  getUserById,
} from '../db';
// import { sendWhatsAppMessage } from '../greenapi-wrapper';
import { extractDiscountCodeFromMessage } from './discount-system';
import {
  filterProductsAvailableForSale,
  isProductAvailableForSale,
} from '../ai/product-availability';

interface ParsedOrder {
  shipTo?: SallaShipping;
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
    const products = filterProductsAvailableForSale(
      await getProductsByMerchantId(merchantId),
    );
    const productList = products.map(p => `- ${p.name} (${formatProductPrice(p)})`).join('\n');

    const response = await invokeLLM({
      merchantId,
      taskType: "sari.order.extract",
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
      const matches = products.filter(p =>
        p.name.toLowerCase().includes(product.name.toLowerCase()) ||
        product.name.toLowerCase().includes(p.name.toLowerCase())
      );
      const exact = matches.filter(p => p.name.trim().toLowerCase() === product.name.trim().toLowerCase());
      const dbProduct = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : undefined;
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
  let providerAttempted = false;
  try {
    const shipTo = sallaShippingSchema.parse(parsedOrder.shipTo);
    await currentInboundExecution()?.assertOwned();
    // Get Salla connection
    const sallaConnection = await getSallaConnectionByMerchantId(merchantId);
    if (!sallaConnection) {
      throw new Error('Salla not connected');
    }

    const salla = new SallaIntegration(merchantId, sallaConnection.accessToken);

    // Prepare order items
    const items = [];
    let totalAmount = 0;
    const outOfStockItems: string[] = [];

    for (const product of parsedOrder.products) {
      if (!product.productId) continue;

      const dbProduct = await getProductById(product.productId);
      if (!dbProduct || dbProduct.merchantId !== merchantId) throw new Error('Product unavailable for this merchant');
      const money = verifiedProductMoney(dbProduct);
      if (money.currency !== 'SAR' || !dbProduct.sallaProductId || dbProduct.sallaProductId.includes(':')) throw new Error('Product is not payable through Salla');
      if (!Number.isSafeInteger(product.quantity) || product.quantity < 1) throw new Error('Invalid order quantity');

      if (!isProductAvailableForSale(dbProduct)) {
        outOfStockItems.push(dbProduct.name);
        continue;
      }

      // P3: Zero Stock Guard
      const stock = (dbProduct as any).stock ?? (dbProduct as any).quantity ?? null;
      if (dbProduct.trackInventory && stock !== null && stock <= 0) { outOfStockItems.push(dbProduct.name); continue; }
      if (dbProduct.trackInventory && stock !== null && product.quantity > stock) throw new Error('Requested quantity unavailable');

      items.push({
        sallaProductId: dbProduct.sallaProductId || '',
        productId: dbProduct.id,
        name: dbProduct.name,
        quantity: product.quantity,
        price: dbProduct.price
      });

      totalAmount += dbProduct.price * product.quantity;
    }

    if (items.length === 0 || items.length !== parsedOrder.products.length) {
      if (outOfStockItems.length > 0) {
        throw new Error(`OUT_OF_STOCK:${outOfStockItems.join(',')}`);
      }
      throw new Error('No valid products found');
    }

    requireMinor(totalAmount);
    // Provider owns tax, shipping and coupon redemption. Do not debit a local
    // coupon reservation before a provider order has even been accepted.
    const discountCode = message ? extractDiscountCodeFromMessage(message) : undefined;
    await currentInboundExecution()?.assertOwned();
    providerAttempted = true;
    const sallaOrder = await salla.createOrder({
      customerName,
      discountCode: discountCode || undefined,
      shipTo,
      phone: customerPhone,
      email: `${customerPhone.replace('+', '')}@temp.salla.sa`,
      address: shipTo.address_line,
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

    // Financial authority is the accepted provider total, including shipping/tax.
    if (sallaOrder.currency !== 'SAR') throw new Error('Unsupported Salla currency');
    const finalAmount = requireMinor(sallaOrder.amountMinor);
    await currentInboundExecution()?.assertOwned();
    // Save order in our database
    const order = await createOrder({
      merchantId,
      sallaOrderId: sallaOrder.orderId,
      orderNumber: sallaOrder.orderNumber,
      customerPhone,
      customerName,
      address: shipTo.address_line,
      city: parsedOrder.city,
      items: JSON.stringify(items),
      totalAmount: finalAmount, // Use final amount after discount
      status: 'pending',
      paymentUrl: sallaOrder.paymentUrl || null,
      isGift: parsedOrder.isGift ? 1 : 0,
      giftRecipientName: parsedOrder.giftRecipientName,
      giftMessage: parsedOrder.giftMessage,
      discountCode: discountCode || null
    });

    if (!order) {
      throw new Error('Failed to save order in database');
    }

    // Salla owns payment for its order. A separate Tap link would leave the
    // provider's COD balance unpaid and could cause a second collection.
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
      paymentUrl: sallaOrder.paymentUrl || null,
      orderNumber: order.orderNumber,
    };
  } catch (error) {
    console.error('[OrderFromChat] Error creating order:', { providerAttempted });
    if (providerAttempted) {
      const execution = currentInboundExecution();
      if (execution) execution.uncertainEffect = true;
      throw error;
    }
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
    `• ${item.name} × ${item.quantity} = ${formatMinorMoney(item.price * item.quantity)}`
  ).join('\n');

  let discountSection = '';
  if (discountInfo) {
    const discountTypeText = discountInfo.type === 'discount' ? 'كود خصم' : 'كود إحالة';
    discountSection = `
💳 *${discountTypeText}:* ${discountInfo.code}
💵 *السعر الأصلي:* ${formatMinorMoney(discountInfo.originalAmount)}
🎉 *الخصم:* -${formatMinorMoney(discountInfo.discountAmount)}
`;
  }

  return `✅ *تم إنشاء طلبك بنجاح!*

📦 *رقم الطلب:* ${orderNumber}

*المنتجات:*
${itemsList}${discountSection}
💰 *الإجمالي:* ${formatMinorMoney(totalAmount)}

${paymentUrl ? `🔗 *لإتمام الطلب، افتح رابط المتجر:*\n${paymentUrl}` : 'لم يتوفر رابط دفع؛ راجع وسيلة الدفع المسجلة لدى المتجر.'}

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
💰 *المبلغ:* ${formatMinorMoney(amount)}

🔒 *لإتمام الدفع بشكل آمن:*
${paymentUrl}

✅ الدفع مؤمن بالكامل عبر Tap Payments
⏰ افتح الرابط للاطلاع على صلاحيته
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
💵 *السعر الأصلي:* ${formatMinorMoney(discountInfo.originalAmount)}
🎉 *الخصم:* -${formatMinorMoney(discountInfo.discountAmount)}
`;
  }

  return `🎁 *تم إنشاء طلب الهدية بنجاح!*

📦 *رقم الطلب:* ${orderNumber}
👤 *المستلم:* ${recipientName}

*المنتجات:*
${itemsList}${discountSection}
💰 *الإجمالي:* ${formatMinorMoney(totalAmount)}

${paymentUrl ? `🔗 *لإتمام الطلب، افتح رابط المتجر:*\n${paymentUrl}` : 'لم يتوفر رابط دفع؛ راجع وسيلة الدفع المسجلة لدى المتجر.'}

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
