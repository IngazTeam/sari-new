import {
  createDiscountCode,
  getDiscountCodeByCode,
  getOrderById,
  getOrdersByMerchantId,
  incrementDiscountCodeUsage,
} from '../db';
import { randomInt } from 'node:crypto';

/**
 * توليد كود خصم عشوائي
 */
export function generateDiscountCode(prefix: string = 'SARI'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = prefix;

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomInt(chars.length));
  }

  return code;
}

/**
 * إنشاء كود خصم جديد
 */
export async function createDiscountCode(data: {
  merchantId: number;
  code?: string;
  type: 'percentage' | 'fixed';
  value: number;
  minPurchase?: number;
  maxDiscount?: number;
  usageLimit?: number;
  expiresAt?: Date;
  description?: string;
}): Promise<{ success: boolean; code?: any; error?: string }> {
  try {
    // توليد كود إذا لم يتم تقديمه
    const code = data.code || generateDiscountCode();

    // التحقق من عدم وجود الكود مسبقاً
    const existing = await getDiscountCodeByCode(code);
    if (existing) {
      return { success: false, error: 'الكود موجود مسبقاً' };
    }

    // إنشاء الكود
    const discountCode = await createDiscountCode({
      merchantId: data.merchantId,
      code,
      type: data.type,
      value: data.value,
      minOrderAmount: data.minPurchase || 0,
      maxUses: data.usageLimit || 1,
      usedCount: 0,
      isActive: true,
      expiresAt: data.expiresAt,
    });

    return { success: true, code: discountCode };
  } catch (error: any) {
    console.error('[Discount System] Error creating discount code:', error);
    return { success: false, error: error.message };
  }
}

/**
 * التحقق من صلاحية كود الخصم
 */
export async function validateDiscountCode(
  merchantId: number,
  code: string,
  orderAmount: number
): Promise<{
  valid: boolean;
  discount?: number;
  finalAmount?: number;
  error?: string;
  discountCode?: any;
}> {
  try {
    // الحصول على الكود
    const discountCode = await getDiscountCodeByCode(code);

    // التحقق من أن الكود يخص هذا التاجر
    if (discountCode && discountCode.merchantId !== merchantId) {
      return { valid: false, error: 'كود الخصم غير صحيح' };
    }

    if (!discountCode) {
      return { valid: false, error: 'كود الخصم غير صحيح' };
    }

    // التحقق من أن الكود نشط
    if (!discountCode.isActive) {
      return { valid: false, error: 'كود الخصم غير نشط' };
    }

    // التحقق من تاريخ الانتهاء
    if (discountCode.expiresAt && new Date(discountCode.expiresAt) < new Date()) {
      return { valid: false, error: 'كود الخصم منتهي الصلاحية' };
    }

    // التحقق من عدد مرات الاستخدام
    if (discountCode.maxUses && discountCode.usedCount >= discountCode.maxUses) {
      return { valid: false, error: 'تم استخدام كود الخصم بالكامل' };
    }

    // التحقق من الحد الأدنى للشراء
    if (discountCode.minOrderAmount && orderAmount < discountCode.minOrderAmount) {
      return {
        valid: false,
        error: `الحد الأدنى للشراء هو ${discountCode.minOrderAmount} ريال`,
      };
    }

    // حساب قيمة الخصم
    let discount = 0;
    if (discountCode.type === 'percentage') {
      discount = (orderAmount * discountCode.value) / 100;
    } else {
      // fixed amount
      discount = Math.min(discountCode.value, orderAmount);
    }

    const finalAmount = Math.max(0, orderAmount - discount);

    return {
      valid: true,
      discount,
      finalAmount,
      discountCode,
    };
  } catch (error: any) {
    console.error('[Discount System] Error validating discount code:', error);
    return { valid: false, error: 'حدث خطأ في التحقق من الكود' };
  }
}

/**
 * تطبيق كود الخصم على طلب
 */
export async function applyDiscountCode(
  merchantId: number,
  code: string,
  orderId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // الحصول على الطلب
    const order = await getOrderById(orderId);
    if (!order) {
      return { success: false, error: 'الطلب غير موجود' };
    }

    // التحقق من الكود
    const validation = await validateDiscountCode(merchantId, code, order.totalAmount);

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // TODO: تحديث الطلب بالخصم (سيتم تطبيقه عند إنشاء الطلب)

    // زيادة عدد مرات استخدام الكود
    await incrementDiscountCodeUsage(code);

    console.log(`[Discount System] Applied discount ${code} to order ${orderId}: ${validation.discount} SAR`);

    return { success: true };
  } catch (error: any) {
    console.error('[Discount System] Error applying discount code:', error);
    return { success: false, error: error.message };
  }
}

/**
 * إنشاء كود خصم تلقائي بعد الشراء الأول
 */
export async function createPostPurchaseDiscount(
  merchantId: number,
  customerPhone: string,
  customerName: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    // التحقق من أن هذا أول طلب للعميل
    const orders = await getOrdersByMerchantId(merchantId);
    const customerOrders = orders.filter(
      o => o.customerPhone === customerPhone && o.status === 'delivered'
    );

    if (customerOrders.length !== 1) {
      // ليس أول طلب أو لم يتم توصيل أي طلب بعد
      return { success: false, error: 'ليس أول طلب' };
    }

    // إنشاء كود خصم 10%
    const code = generateDiscountCode('WELCOME');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // صالح لمدة 30 يوم

    const result = await createDiscountCode({
      merchantId,
      code,
      type: 'percentage',
      value: 10,
      usageLimit: 1,
      expiresAt,
      description: `كود ترحيبي للعميل ${customerName}`,
    });

    if (result.success) {
      console.log(`[Discount System] Created post-purchase discount ${code} for ${customerPhone}`);
      return { success: true, code };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[Discount System] Error creating post-purchase discount:', error);
    return { success: false, error: error.message };
  }
}

/**
 * رسالة واتساب لإرسال كود الخصم
 */
export function generateDiscountMessage(
  customerName: string,
  code: string,
  discountValue: number,
  expiresAt?: Date
): string {
  const expiryText = expiresAt
    ? `\nصالح حتى: ${expiresAt.toLocaleDateString('ar-SA')}`
    : '';

  return `مرحباً ${customerName}! 🎉

شكراً لك على طلبك الأول! 💙

نقدم لك كود خصم خاص:

🎁 الكود: *${code}*
💰 الخصم: ${discountValue}%${expiryText}

استخدم هذا الكود في طلبك القادم واحصل على خصم فوري!

نتطلع لخدمتك مرة أخرى! 🙏`;
}

/**
 * حساب السعر النهائي بعد الخصم
 */
export function calculateFinalPrice(
  originalPrice: number,
  discountType: 'percentage' | 'fixed',
  discountValue: number,
  maxDiscount?: number
): { discount: number; finalPrice: number } {
  let discount = 0;

  if (discountType === 'percentage') {
    discount = (originalPrice * discountValue) / 100;
    if (maxDiscount && discount > maxDiscount) {
      discount = maxDiscount;
    }
  } else {
    discount = Math.min(discountValue, originalPrice);
  }

  const finalPrice = Math.max(0, originalPrice - discount);

  return { discount, finalPrice };
}

/**
 * استخراج كود الخصم من رسالة العميل
 */
export function extractDiscountCodeFromMessage(message: string): string | null {
  // البحث عن كود بصيغة SARI + 6 أحرف/أرقام
  const codePattern = /\b[A-Z]{4,}[A-Z0-9]{4,8}\b/g;
  const matches = message.match(codePattern);

  if (matches && matches.length > 0) {
    return matches[0];
  }

  // البحث عن كلمة "كود" أو "خصم" متبوعة بنص
  const arabicPattern = /(?:كود|خصم|كوبون)\s*[:=]?\s*([A-Z0-9]{6,})/i;
  const arabicMatch = message.match(arabicPattern);

  if (arabicMatch && arabicMatch[1]) {
    return arabicMatch[1].toUpperCase();
  }

  return null;
}
