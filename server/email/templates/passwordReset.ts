/**
 * قالب البريد الإلكتروني لإعادة تعيين كلمة المرور
 */

export interface PasswordResetEmailData {
  userName: string;
  resetLink: string;
  expiryHours: number;
}

export function getPasswordResetEmailTemplate(data: PasswordResetEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { userName, resetLink, expiryHours } = data;

  const subject = 'إعادة تعيين كلمة المرور - ساري';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🔐 إعادة تعيين كلمة المرور
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                مرحباً <strong>${userName}</strong>،
              </p>
              
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في <strong>ساري</strong>. 
                إذا لم تقم بهذا الطلب، يمكنك تجاهل هذه الرسالة بأمان.
              </p>

              <p style="margin: 0 0 30px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                لإعادة تعيين كلمة المرور، انقر على الزر أدناه:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 0 0 30px;">
                    <a href="${resetLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                              color: #ffffff; text-decoration: none; padding: 16px 40px; 
                              border-radius: 8px; font-size: 16px; font-weight: 600; 
                              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                      إعادة تعيين كلمة المرور
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning Box -->
              <div style="background-color: #fef3c7; border-right: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  ⚠️ <strong>تنبيه أمني:</strong> هذا الرابط صالح لمدة <strong>${expiryHours} ساعة</strong> فقط.
                </p>
              </div>

              <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px; line-height: 1.5;">
                إذا لم يعمل الزر أعلاه، يمكنك نسخ الرابط التالي ولصقه في المتصفح:
              </p>
              
              <p style="margin: 0 0 30px; padding: 12px; background-color: #f3f4f6; border-radius: 6px; 
                        word-break: break-all; font-size: 12px; color: #4b5563; direction: ltr; text-align: left;">
                ${resetLink}
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                إذا لم تطلب إعادة تعيين كلمة المرور، يُرجى تجاهل هذه الرسالة. 
                حسابك آمن ولن يتم إجراء أي تغييرات.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                مع تحيات فريق <strong style="color: #3b82f6;">ساري</strong>
              </p>
              <p style="margin: 0 0 15px; color: #9ca3af; font-size: 12px;">
                وكيل المبيعات الذكي عبر الواتساب
              </p>
              
              <!-- Social Links -->
              <div style="margin-top: 20px;">
                <a href="https://sary.live" style="color: #3b82f6; text-decoration: none; font-size: 13px; margin: 0 10px;">
                  🌐 الموقع الإلكتروني
                </a>
                <span style="color: #d1d5db;">|</span>
                <a href="mailto:support@sari.com" style="color: #3b82f6; text-decoration: none; font-size: 13px; margin: 0 10px;">
                  📧 الدعم الفني
                </a>
              </div>

              <p style="margin: 20px 0 0; color: #9ca3af; font-size: 11px;">
                © ${new Date().getFullYear()} ساري. جميع الحقوق محفوظة.
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

  const text = `
إعادة تعيين كلمة المرور - ساري

مرحباً ${userName}،

تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في ساري.

لإعادة تعيين كلمة المرور، انقر على الرابط التالي:
${resetLink}

⚠️ تنبيه أمني: هذا الرابط صالح لمدة ${expiryHours} ساعة فقط.

إذا لم تطلب إعادة تعيين كلمة المرور، يُرجى تجاهل هذه الرسالة. حسابك آمن ولن يتم إجراء أي تغييرات.

مع تحيات فريق ساري
وكيل المبيعات الذكي عبر الواتساب

---
الموقع الإلكتروني: https://sary.live
الدعم الفني: support@sari.com

© ${new Date().getFullYear()} ساري. جميع الحقوق محفوظة.
  `.trim();

  return { subject, html, text };
}
