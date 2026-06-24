/**
 * WhatsApp Disconnect Email Template
 * 
 * Branded HTML email sent to the merchant when their WhatsApp instance
 * becomes disconnected. Includes clear instructions and a direct link
 * to reconnect.
 */

import { sendEmail } from '../_core/emailService';

function getEmailTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              ${content}
              <tr>
                <td style="padding: 20px 40px; background: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                    هذا الإشعار مرسل تلقائياً من نظام ساري لمراقبة اتصال واتساب.
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
}

export async function sendWhatsAppDisconnectEmail(
  email: string,
  businessName: string,
  phoneNumber: string,
  state: string,
): Promise<boolean> {
  const subject = `🔴 تنبيه عاجل: واتساب غير متصل — ${businessName}`;
  const appUrl = process.env.VITE_APP_URL || 'https://sary.live';

  const content = `
    <tr>
      <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ واتساب غير متصل</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">الرسائل لا تصل حالياً</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <div style="background: #fee2e2; border-right: 4px solid #ef4444; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
          <p style="margin: 0; color: #991b1b; font-weight: bold; font-size: 16px;">
            تم اكتشاف انقطاع في اتصال واتساب الخاص بمتجرك
          </p>
          <p style="margin: 10px 0 0 0; color: #7f1d1d;">
            رسائل العملاء لن تصل إلى النظام حتى يتم إعادة الربط.
          </p>
        </div>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #6b7280;">المتجر:</span>
                <strong style="color: #111827; margin-right: 10px;">${businessName}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #6b7280;">الرقم:</span>
                <strong style="color: #111827; margin-right: 10px;" dir="ltr">${phoneNumber}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #6b7280;">الحالة:</span>
                <strong style="color: #ef4444; margin-right: 10px;">${state}</strong>
              </td>
            </tr>
          </table>
        </div>

        <h3 style="color: #111827; margin-bottom: 15px;">كيف تعيد الربط؟</h3>
        <ol style="color: #374151; line-height: 2; padding-right: 20px;">
          <li>اذهب إلى <strong>صفحة إدارة الأرقام</strong> من الرابط أدناه</li>
          <li>اضغط على زر <strong style="color: #059669;">"إعادة الربط"</strong></li>
          <li>امسح <strong>QR Code</strong> من تطبيق واتساب على جوالك</li>
          <li>الرسائل ستبدأ بالوصول فوراً بعد المسح ✅</li>
        </ol>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${appUrl}/merchant/whatsapp-instances" 
             style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
            إعادة ربط واتساب الآن
          </a>
        </div>

        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 25px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            💡 <strong>ملاحظة:</strong> يتم فحص الاتصال تلقائياً كل 5 دقائق. لن نرسل لك إشعاراً آخر خلال الـ 4 ساعات القادمة.
          </p>
        </div>
      </td>
    </tr>
  `;

  const html = getEmailTemplate(content);
  return await sendEmail({ to: email, subject, html, type: 'notification' });
}
