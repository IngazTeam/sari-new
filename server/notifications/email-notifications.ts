/**
 * نظام الإشعارات البريدية
 * يحتوي على جميع قوالب الرسائل البريدية
 */

import { sendEmail } from '../reports/email-sender';

/**
 * رسالة ترحيب عند تسجيل تاجر جديد
 */
export async function sendWelcomeEmail(
  email: string,
  businessName: string,
  userName: string
): Promise<boolean> {
  const subject = `🎉 مرحباً بك في ساري - ${businessName}`;

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>مرحباً بك في ساري</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 50px 30px; text-align: center;">
                  <div style="background-color: white; width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 25px; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(0,0,0,0.2);">
                    <svg width="60" height="60" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" fill="#00d25e" stroke="#00a84d" stroke-width="2"/>
                      <text x="50" y="68" font-size="50" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">S</text>
                    </svg>
                  </div>
                  <h1 style="color: white; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 1px;">مرحباً بك في ساري! 🎉</h1>
                  <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 16px; font-weight: 500;">مساعد المبيعات الذكي على الواتساب</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 26px; font-weight: 600;">عزيزي ${userName}،</h2>
                  
                  <p style="color: #4a4a4a; line-height: 1.9; font-size: 16px; margin: 0 0 25px 0;">
                    نحن سعداء جداً بانضمامك إلى <strong style="color: #00d25e;">ساري</strong>! 🚀
                  </p>
                  
                  <p style="color: #4a4a4a; line-height: 1.9; font-size: 16px; margin: 0 0 35px 0;">
                    الآن يمكنك تحويل محادثات الواتساب إلى مبيعات حقيقية بفضل الذكاء الاصطناعي المتقدم. ساري سيساعدك في:
                  </p>
                  
                  <!-- Features List -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 35px;">
                    <tr>
                      <td style="padding: 15px; background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; border-right: 4px solid #00d25e; margin-bottom: 12px;">
                        <p style="margin: 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">
                          💬 <strong>الرد التلقائي الذكي</strong> - ردود فورية على استفسارات العملاء 24/7
                        </p>
                      </td>
                    </tr>
                    <tr><td style="height: 12px;"></td></tr>
                    <tr>
                      <td style="padding: 15px; background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; border-right: 4px solid #00d25e; margin-bottom: 12px;">
                        <p style="margin: 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">
                          📦 <strong>إدارة المنتجات</strong> - عرض وبيع منتجاتك مباشرة عبر الواتساب
                        </p>
                      </td>
                    </tr>
                    <tr><td style="height: 12px;"></td></tr>
                    <tr>
                      <td style="padding: 15px; background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; border-right: 4px solid #00d25e; margin-bottom: 12px;">
                        <p style="margin: 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">
                          📊 <strong>تقارير وإحصائيات</strong> - تحليل شامل لأداء مبيعاتك ومحادثاتك
                        </p>
                      </td>
                    </tr>
                    <tr><td style="height: 12px;"></td></tr>
                    <tr>
                      <td style="padding: 15px; background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; border-right: 4px solid #00d25e;">
                        <p style="margin: 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">
                          🎯 <strong>حملات تسويقية</strong> - إرسال حملات مخصصة لعملائك بذكاء
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Next Steps -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-radius: 12px; padding: 25px; margin-bottom: 35px; border: 2px solid #fbbf24;">
                    <tr>
                      <td>
                        <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 20px; font-weight: 700;">🚀 الخطوات التالية:</h3>
                        <ol style="margin: 0; padding: 0 0 0 25px; color: #78350f; line-height: 2;">
                          <li style="margin-bottom: 10px; font-size: 15px;"><strong>ربط الواتساب:</strong> اذهب إلى لوحة التحكم وقم بربط رقم الواتساب الخاص بك</li>
                          <li style="margin-bottom: 10px; font-size: 15px;"><strong>إضافة المنتجات:</strong> ارفع قائمة منتجاتك عبر ملف CSV أو أضفها يدوياً</li>
                          <li style="margin-bottom: 10px; font-size: 15px;"><strong>تفعيل الرد التلقائي:</strong> فعّل ساري ليبدأ بالرد على عملائك تلقائياً</li>
                          <li style="font-size: 15px;"><strong>إطلاق أول حملة:</strong> أنشئ حملتك الأولى وابدأ بزيادة مبيعاتك!</li>
                        </ol>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 35px 0;">
                    <tr>
                      <td align="center">
                        <a href="https://sary.live/merchant/dashboard" 
                           style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                                  color: white; 
                                  padding: 18px 50px; 
                                  text-decoration: none; 
                                  border-radius: 10px; 
                                  display: inline-block;
                                  font-weight: 700;
                                  font-size: 17px;
                                  box-shadow: 0 8px 20px rgba(0, 210, 94, 0.4);
                                  transition: all 0.3s ease;">
                          🎯 ابدأ الآن
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Support Section -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e8e8e8;">
                    <tr>
                      <td>
                        <p style="color: #4a4a4a; font-size: 15px; margin: 0 0 12px 0; line-height: 1.7;">
                          💬 <strong>هل تحتاج مساعدة؟</strong>
                        </p>
                        <p style="color: #6a6a6a; font-size: 14px; margin: 0; line-height: 1.6;">
                          فريق الدعم الفني جاهز لمساعدتك على مدار الساعة. لا تتردد في التواصل معنا عبر:
                        </p>
                        <p style="margin: 15px 0 0 0;">
                          <a href="mailto:support@sary.live" style="color: #00d25e; text-decoration: none; font-weight: 600; font-size: 15px;">support@sary.live</a>
                          <span style="color: #ccc; margin: 0 10px;">|</span>
                          <a href="https://wa.me/966500000000" style="color: #00d25e; text-decoration: none; font-weight: 600; font-size: 15px;">واتساب</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 35px 30px; text-align: center; border-top: 1px solid #dee2e6;">
                  <!-- Social Links -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td align="center">
                        <a href="https://wa.me/966500000000" style="display: inline-block; margin: 0 10px; text-decoration: none;">
                          <span style="background: #25D366; color: white; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">📱</span>
                        </a>
                        <a href="https://twitter.com/sari_ai" style="display: inline-block; margin: 0 10px; text-decoration: none;">
                          <span style="background: #1DA1F2; color: white; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">🐦</span>
                        </a>
                        <a href="https://instagram.com/sari_ai" style="display: inline-block; margin: 0 10px; text-decoration: none;">
                          <span style="background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">📷</span>
                        </a>
                        <a href="mailto:support@sary.live" style="display: inline-block; margin: 0 10px; text-decoration: none;">
                          <span style="background: #EA4335; color: white; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 20px;">✉️</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px 0; font-weight: 600;">
                    © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
                  </p>
                  <p style="margin: 10px 0 0 0;">
                    <a href="https://sary.live" style="color: #00d25e; text-decoration: none; font-weight: 700; font-size: 15px;">sary.live</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 12px; margin: 15px 0 0 0; line-height: 1.5;">
                    المملكة العربية السعودية 🇸🇦 | الرياض
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await sendEmail({ to: email, subject, html });
  } catch (error) {
    console.error('[Welcome Email] Error:', error);
    return false;
  }
}

/**
 * تنبيه عند وصول الاستخدام إلى 80%
 */
export async function sendUsageWarningEmail(
  email: string,
  businessName: string,
  planName: string,
  currentUsage: number,
  limit: number,
  usageType: 'conversations' | 'voice_messages'
): Promise<boolean> {
  const percentage = ((currentUsage / limit) * 100).toFixed(0);
  const usageLabel = usageType === 'conversations' ? 'المحادثات' : 'الرسائل الصوتية';
  const subject = `⚠️ تنبيه: وصلت إلى ${percentage}% من حد ${usageLabel} - ساري`;

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تنبيه الاستخدام</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); padding: 40px 30px; text-align: center;">
                  <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <span style="font-size: 50px;">⚠️</span>
                  </div>
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">تنبيه الاستخدام</h1>
                  <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 15px;">وصلت إلى ${percentage}% من حد ${usageLabel}</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">مرحباً ${businessName}،</h2>
                  
                  <p style="color: #4a4a4a; line-height: 1.8; font-size: 15px; margin: 0 0 30px 0;">
                    نود إعلامك بأنك قد استخدمت <strong style="color: #f59e0b;">${percentage}%</strong> من حد ${usageLabel} في باقتك الحالية (<strong>${planName}</strong>).
                  </p>
                  
                  <!-- Usage Stats -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 2px solid #fbbf24;">
                    <tr>
                      <td>
                        <h3 style="color: #92400e; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📊 إحصائيات الاستخدام</h3>
                        <table width="100%" cellpadding="10" cellspacing="0">
                          <tr>
                            <td style="color: #78350f; font-size: 14px; font-weight: 600;">الاستخدام الحالي:</td>
                            <td style="text-align: left;">
                              <span style="color: #1a1a1a; font-size: 20px; font-weight: 700;">${currentUsage}</span>
                              <span style="color: #6a6a6a; font-size: 14px;"> / ${limit}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="color: #78350f; font-size: 14px; font-weight: 600;">النسبة المئوية:</td>
                            <td style="text-align: left;">
                              <span style="color: #f59e0b; font-size: 20px; font-weight: 700;">${percentage}%</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="color: #78350f; font-size: 14px; font-weight: 600;">المتبقي:</td>
                            <td style="text-align: left;">
                              <span style="color: #00d25e; font-size: 20px; font-weight: 700;">${limit - currentUsage}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Warning Message -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #fef2f2; border-radius: 10px; padding: 20px; margin-bottom: 30px; border-right: 4px solid #ef4444;">
                    <tr>
                      <td>
                        <p style="color: #991b1b; font-size: 15px; margin: 0; line-height: 1.7; font-weight: 500;">
                          <strong>⚠️ تنبيه مهم:</strong> عند وصولك إلى 100% من الحد، سيتم إيقاف الخدمة تلقائياً حتى تقوم بترقية باقتك أو بداية الشهر الجديد.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Recommendation -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; padding: 25px; margin-bottom: 30px; border: 2px solid #00d25e;">
                    <tr>
                      <td>
                        <h3 style="color: #00a84d; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">💡 نوصي بـ:</h3>
                        <ul style="margin: 0; padding: 0 0 0 25px; color: #1a1a1a; line-height: 2;">
                          <li style="margin-bottom: 8px; font-size: 14px;">ترقية باقتك للحصول على حد أعلى من ${usageLabel}</li>
                          <li style="margin-bottom: 8px; font-size: 14px;">مراجعة استخدامك الحالي وتحسين الكفاءة</li>
                          <li style="font-size: 14px;">التواصل مع فريق الدعم للحصول على استشارة مجانية</li>
                        </ul>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="https://sary.live/merchant/subscriptions" 
                           style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                                  color: white; 
                                  padding: 16px 40px; 
                                  text-decoration: none; 
                                  border-radius: 8px; 
                                  display: inline-block;
                                  font-weight: 700;
                                  font-size: 15px;
                                  box-shadow: 0 6px 16px rgba(0, 210, 94, 0.35);">
                          🚀 ترقية الباقة الآن
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e8e8e8;">
                    <tr>
                      <td>
                        <p style="color: #888; font-size: 13px; margin: 0;">
                          ⚠️ هذا بريد إلكتروني تلقائي. يرجى عدم الرد عليه مباشرة.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px; text-align: center; border-top: 1px solid #dee2e6;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td align="center">
                        <a href="https://wa.me/966500000000" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #25D366; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📱</span>
                        </a>
                        <a href="https://twitter.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #1DA1F2; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">🐦</span>
                        </a>
                        <a href="https://instagram.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📷</span>
                        </a>
                        <a href="mailto:support@sary.live" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #EA4335; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">✉️</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="color: #6c757d; font-size: 13px; margin: 0 0 8px 0; font-weight: 600;">
                    © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
                  </p>
                  <p style="margin: 8px 0 0 0;">
                    <a href="https://sary.live" style="color: #00d25e; text-decoration: none; font-weight: 700; font-size: 14px;">sary.live</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 11px; margin: 12px 0 0 0;">
                    المملكة العربية السعودية 🇸🇦 | الرياض
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await sendEmail({ to: email, subject, html });
  } catch (error) {
    console.error('[Usage Warning Email] Error:', error);
    return false;
  }
}

/**
 * إشعار قبل انتهاء الاشتراك بـ 3 أيام
 */
export async function sendSubscriptionExpiryEmail(
  email: string,
  businessName: string,
  planName: string,
  expiryDate: Date
): Promise<boolean> {
  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const subject = `⏰ تنبيه: اشتراكك في ساري ينتهي خلال ${daysLeft} أيام`;

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تنبيه انتهاء الاشتراك</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center;">
                  <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <span style="font-size: 50px;">⏰</span>
                  </div>
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">تنبيه انتهاء الاشتراك</h1>
                  <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 15px;">اشتراكك ينتهي خلال ${daysLeft} أيام</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">عزيزي ${businessName}،</h2>
                  
                  <p style="color: #4a4a4a; line-height: 1.8; font-size: 15px; margin: 0 0 30px 0;">
                    نود تذكيرك بأن اشتراكك في باقة <strong style="color: #00d25e;">${planName}</strong> سينتهي خلال <strong style="color: #ef4444;">${daysLeft} أيام</strong>.
                  </p>
                  
                  <!-- Expiry Info -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 2px solid #ef4444;">
                    <tr>
                      <td>
                        <h3 style="color: #991b1b; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📅 معلومات الاشتراك</h3>
                        <table width="100%" cellpadding="10" cellspacing="0">
                          <tr>
                            <td style="color: #7f1d1d; font-size: 14px; font-weight: 600;">الباقة الحالية:</td>
                            <td style="text-align: left; color: #1a1a1a; font-size: 15px; font-weight: 600;">${planName}</td>
                          </tr>
                          <tr>
                            <td style="color: #7f1d1d; font-size: 14px; font-weight: 600;">تاريخ الانتهاء:</td>
                            <td style="text-align: left;">
                              <span style="color: #ef4444; font-size: 16px; font-weight: 700;">
                                ${expiryDate.toLocaleDateString('ar-SA', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style="color: #7f1d1d; font-size: 14px; font-weight: 600;">الأيام المتبقية:</td>
                            <td style="text-align: left;">
                              <span style="color: #ef4444; font-size: 20px; font-weight: 700;">${daysLeft} أيام</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- What Happens -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border-radius: 10px; padding: 20px; margin-bottom: 30px; border-right: 4px solid #fbbf24;">
                    <tr>
                      <td>
                        <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 17px; font-weight: 600;">⚠️ ماذا سيحدث بعد انتهاء الاشتراك؟</h3>
                        <ul style="margin: 0; padding: 0 0 0 25px; color: #78350f; line-height: 2;">
                          <li style="margin-bottom: 8px; font-size: 14px;">سيتم إيقاف الرد التلقائي على رسائل العملاء</li>
                          <li style="margin-bottom: 8px; font-size: 14px;">لن تتمكن من إرسال حملات تسويقية جديدة</li>
                          <li style="margin-bottom: 8px; font-size: 14px;">سيتم تعطيل الوصول إلى التقارير والإحصائيات</li>
                          <li style="font-size: 14px;">قد تفقد بياناتك بعد 30 يوماً من انتهاء الاشتراك</li>
                        </ul>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Renewal Benefits -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); border-radius: 10px; padding: 25px; margin-bottom: 30px; border: 2px solid #00d25e;">
                    <tr>
                      <td>
                        <h3 style="color: #00a84d; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">✨ جدد اشتراكك واستمتع بـ:</h3>
                        <ul style="margin: 0; padding: 0 0 0 25px; color: #1a1a1a; line-height: 2;">
                          <li style="margin-bottom: 8px; font-size: 14px;">استمرار الرد التلقائي الذكي على مدار الساعة</li>
                          <li style="margin-bottom: 8px; font-size: 14px;">إرسال حملات تسويقية غير محدودة</li>
                          <li style="margin-bottom: 8px; font-size: 14px;">تقارير وإحصائيات متقدمة لتحسين أدائك</li>
                          <li style="font-size: 14px;">دعم فني مخصص وأولوية في الرد</li>
                        </ul>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA Buttons -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="https://sary.live/merchant/subscriptions" 
                           style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                                  color: white; 
                                  padding: 16px 40px; 
                                  text-decoration: none; 
                                  border-radius: 8px; 
                                  display: inline-block;
                                  font-weight: 700;
                                  font-size: 15px;
                                  box-shadow: 0 6px 16px rgba(0, 210, 94, 0.35);
                                  margin: 0 5px;">
                          🔄 تجديد الاشتراك
                        </a>
                        <a href="https://sary.live/merchant/subscriptions" 
                           style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                                  color: white; 
                                  padding: 16px 40px; 
                                  text-decoration: none; 
                                  border-radius: 8px; 
                                  display: inline-block;
                                  font-weight: 700;
                                  font-size: 15px;
                                  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
                                  margin: 0 5px;">
                          🚀 ترقية الباقة
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e8e8e8;">
                    <tr>
                      <td>
                        <p style="color: #4a4a4a; font-size: 14px; margin: 0 0 10px 0;">
                          💬 <strong>هل لديك استفسار؟</strong> تواصل معنا على:
                        </p>
                        <p style="margin: 0;">
                          <a href="mailto:support@sary.live" style="color: #00d25e; text-decoration: none; font-weight: 600;">support@sary.live</a>
                          <span style="color: #ccc; margin: 0 8px;">|</span>
                          <a href="https://wa.me/966500000000" style="color: #00d25e; text-decoration: none; font-weight: 600;">واتساب</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px; text-align: center; border-top: 1px solid #dee2e6;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td align="center">
                        <a href="https://wa.me/966500000000" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #25D366; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📱</span>
                        </a>
                        <a href="https://twitter.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #1DA1F2; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">🐦</span>
                        </a>
                        <a href="https://instagram.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📷</span>
                        </a>
                        <a href="mailto:support@sary.live" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #EA4335; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">✉️</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="color: #6c757d; font-size: 13px; margin: 0 0 8px 0; font-weight: 600;">
                    © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
                  </p>
                  <p style="margin: 8px 0 0 0;">
                    <a href="https://sary.live" style="color: #00d25e; text-decoration: none; font-weight: 700; font-size: 14px;">sary.live</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 11px; margin: 12px 0 0 0;">
                    المملكة العربية السعودية 🇸🇦 | الرياض
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    return await sendEmail({ to: email, subject, html });
  } catch (error) {
    console.error('[Subscription Expiry Email] Error:', error);
    return false;
  }
}
