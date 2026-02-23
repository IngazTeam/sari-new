import * as db from '../db';
import { sendTextMessage } from '../whatsapp';
import { createDiscountCode, generateDiscountMessage } from './discount-system';
import { randomInt } from 'node:crypto';

/**
 * توليد كود إحالة فريد
 */
export function generateReferralCode(customerPhone: string): string {
  // استخدام آخر 4 أرقام من الهاتف + 4 أحرف عشوائية
  const phoneDigits = customerPhone.replace(/\D/g, '').slice(-4);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';

  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(randomInt(chars.length));
  }

  return `REF${phoneDigits}${randomPart}`;
}

/**
 * إنشاء كود إحالة لعميل جديد
 */
export async function createReferralCodeForCustomer(
  merchantId: number,
  customerPhone: string,
  customerName: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    // التحقق من عدم وجود كود إحالة مسبقاً
    const existing = await db.getReferralCodeByPhone(merchantId, customerPhone);
    if (existing) {
      return { success: true, code: existing.code };
    }

    // توليد كود فريد
    let code = generateReferralCode(customerPhone);
    let attempts = 0;

    // التأكد من أن الكود فريد
    while (attempts < 5) {
      const existingCode = await db.getReferralCodeByCode(code);
      if (!existingCode) break;

      code = generateReferralCode(customerPhone);
      attempts++;
    }

    if (attempts >= 5) {
      return { success: false, error: 'فشل في توليد كود فريد' };
    }

    // إنشاء كود الإحالة
    const referralCode = await db.createReferralCode({
      merchantId,
      code,
      referrerPhone: customerPhone,
      referrerName: customerName,
      referralCount: 0,
      rewardGiven: false,
    });

    if (referralCode) {
      console.log(`[Referral System] Created referral code ${code} for ${customerPhone}`);
      return { success: true, code };
    } else {
      return { success: false, error: 'فشل في إنشاء كود الإحالة' };
    }
  } catch (error: any) {
    console.error('[Referral System] Error creating referral code:', error);
    return { success: false, error: error.message };
  }
}

/**
 * تتبع إحالة ناجحة
 */
export async function trackReferral(
  merchantId: number,
  referralCode: string,
  referredPhone: string,
  referredName: string
): Promise<{ success: boolean; milestone?: boolean; error?: string }> {
  try {
    // الحصول على كود الإحالة
    const code = await db.getReferralCodeByCode(referralCode);

    if (!code) {
      return { success: false, error: 'كود الإحالة غير صحيح' };
    }

    if (code.merchantId !== merchantId) {
      return { success: false, error: 'كود الإحالة غير صحيح' };
    }

    // التحقق من أن المُحال ليس نفس المُحيل
    if (code.referrerPhone === referredPhone) {
      return { success: false, error: 'لا يمكنك استخدام كود الإحالة الخاص بك' };
    }

    // التحقق من عدم استخدام نفس الشخص للكود مسبقاً
    const existingReferral = await db.getReferralByPhone(code.id, referredPhone);
    if (existingReferral) {
      return { success: false, error: 'تم استخدام كود الإحالة مسبقاً' };
    }

    // تسجيل الإحالة
    await db.createReferral({
      referralCodeId: code.id,
      referredPhone,
      referredName,
      orderCompleted: false,
    });

    console.log(`[Referral System] Tracked referral: ${referredPhone} referred by ${code.referrerPhone}`);

    return { success: true, milestone: false };
  } catch (error: any) {
    console.error('[Referral System] Error tracking referral:', error);
    return { success: false, error: error.message };
  }
}

/**
 * تحديث حالة إحالة عند إتمام الطلب
 */
export async function completeReferral(
  merchantId: number,
  referredPhone: string
): Promise<{ success: boolean; milestone?: boolean; referrer?: any }> {
  try {
    // البحث عن الإحالة
    const referrals = await db.getReferralsByReferredPhone(referredPhone);

    for (const referral of referrals) {
      if (referral.orderCompleted) continue;

      // الحصول على كود الإحالة
      const code = await db.getReferralCodeById(referral.referralCodeId);
      if (!code || code.merchantId !== merchantId) continue;

      // تحديث الإحالة
      await db.updateReferralStatus(referral.id, true);

      // زيادة عدد الإحالات الناجحة
      const newCount = await db.incrementReferralCount(code.id);

      console.log(`[Referral System] Completed referral for ${referredPhone}, referrer now has ${newCount} referrals`);

      // التحقق من الوصول إلى 5 إحالات
      if (newCount >= 5 && !code.rewardGiven) {
        return {
          success: true,
          milestone: true,
          referrer: {
            phone: code.referrerPhone,
            name: code.referrerName,
            codeId: code.id,
          },
        };
      }

      return { success: true, milestone: false };
    }

    return { success: false };
  } catch (error: any) {
    console.error('[Referral System] Error completing referral:', error);
    return { success: false };
  }
}

/**
 * مكافأة المُحيل عند الوصول إلى 5 إحالات
 */
export async function rewardReferrer(
  merchantId: number,
  referrerPhone: string,
  referrerName: string,
  referralCodeId: number
): Promise<{ success: boolean; discountCode?: string; error?: string }> {
  try {
    // إنشاء كود خصم 15%
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60); // صالح لمدة 60 يوم

    const result = await createDiscountCode({
      merchantId,
      type: 'percentage',
      value: 15,
      usageLimit: 1,
      expiresAt,
    });

    if (!result.success || !result.code) {
      return { success: false, error: 'فشل في إنشاء كود الخصم' };
    }

    // تحديث حالة المكافأة
    await db.markReferralRewardGiven(referralCodeId);

    // إرسال رسالة واتساب
    const message = generateReferralRewardMessage(
      referrerName,
      result.code.code,
      expiresAt
    );

    await sendTextMessage(referrerPhone, message);

    console.log(`[Referral System] Rewarded ${referrerPhone} with discount code ${result.code.code}`);

    return { success: true, discountCode: result.code.code };
  } catch (error: any) {
    console.error('[Referral System] Error rewarding referrer:', error);
    return { success: false, error: error.message };
  }
}

/**
 * رسالة مكافأة الإحالة
 */
export function generateReferralRewardMessage(
  name: string,
  discountCode: string,
  expiresAt: Date
): string {
  return `مبروك ${name}! 🎉🎊

لقد وصلت إلى 5 إحالات ناجحة! 🌟

مكافأتك الخاصة:

🎁 كود الخصم: *${discountCode}*
💰 خصم: 15%
📅 صالح حتى: ${expiresAt.toLocaleDateString('ar-SA')}

شكراً لك على ثقتك ودعمك! 💙

استخدم الكود في طلبك القادم واستمتع بالخصم! 🛍️`;
}

/**
 * رسالة دعوة الأصدقاء
 */
export function generateReferralInviteMessage(
  name: string,
  referralCode: string,
  storeUrl: string
): string {
  return `مرحباً! 👋

صديقك ${name} يدعوك للتسوق معنا! 🛍️

استخدم كود الإحالة الخاص به:
🎁 *${referralCode}*

ستحصل على خصم خاص في طلبك الأول! 💰

للطلب، تواصل معنا عبر الواتساب:
${storeUrl}

نتطلع لخدمتك! 🙏`;
}

/**
 * رسالة تشجيعية للمُحيل
 */
export function generateReferralProgressMessage(
  name: string,
  currentCount: number,
  remaining: number
): string {
  const emoji = currentCount >= 3 ? '🔥' : '👏';

  return `رائع ${name}! ${emoji}

لديك الآن ${currentCount} إحالة ناجحة! 

باقي ${remaining} إحالة فقط للحصول على خصم 15%! 🎁

شارك كود الإحالة الخاص بك مع أصدقائك وعائلتك! 💙`;
}

/**
 * استخراج كود الإحالة من رسالة العميل
 */
export function extractReferralCodeFromMessage(message: string): string | null {
  // البحث عن كود بصيغة REF + أرقام + أحرف
  const codePattern = /\bREF\d{4}[A-Z]{4}\b/g;
  const matches = message.match(codePattern);

  if (matches && matches.length > 0) {
    return matches[0];
  }

  // البحث عن كلمة "إحالة" أو "دعوة" متبوعة بنص
  const arabicPattern = /(?:إحالة|دعوة|كود\s+صديق)\s*[:=]?\s*(REF[A-Z0-9]{8})/i;
  const arabicMatch = message.match(arabicPattern);

  if (arabicMatch && arabicMatch[1]) {
    return arabicMatch[1].toUpperCase();
  }

  return null;
}

/**
 * التحقق من إمكانية إرسال رسالة تشجيعية
 */
export async function shouldSendProgressMessage(
  referralCodeId: number,
  currentCount: number
): Promise<boolean> {
  // إرسال رسالة عند 2، 3، 4 إحالات فقط
  if (![2, 3, 4].includes(currentCount)) {
    return false;
  }

  // TODO: التحقق من عدم إرسال رسالة مؤخراً (خلال آخر 24 ساعة)

  return true;
}
