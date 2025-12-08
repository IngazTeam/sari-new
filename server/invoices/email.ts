import { Invoice } from '../../drizzle/schema';
import { getMerchantById, getUserById } from '../db';
import { ENV } from '../_core/env';

/**
 * إرسال فاتورة عبر البريد الإلكتروني باستخدام SMTP2GO API
 */
export async function sendInvoiceEmail(invoice: Invoice): Promise<boolean> {
  try {
    // التحقق من إعدادات SMTP2GO API
    if (!ENV.smtp2goApiKey) {
      console.error('[Invoice Email] SMTP2GO API Key not configured');
      return false;
    }

    // الحصول على بيانات التاجر
    const merchant = await getMerchantById(invoice.merchantId);
    if (!merchant) {
      console.error('[Invoice Email] Merchant not found');
      return false;
    }

    // الحصول على بريد المستخدم
    const user = await getUserById(merchant.userId);
    if (!user || !user.email) {
      console.error('[Invoice Email] User email not found');
      return false;
    }

    // محتوى البريد HTML
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>فاتورة ${invoice.invoiceNumber}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                
                <!-- Header with Logo -->
                <tr>
                  <td style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 40px 30px; text-align: center;">
                    <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                      <svg width="50" height="50" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" fill="#00d25e" stroke="#00a84d" stroke-width="2"/>
                        <text x="50" y="65" font-size="45" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">S</text>
                      </svg>
                    </div>
                    <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 1px;">ساري</h1>
                    <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 15px; font-weight: 500;">مساعد المبيعات الذكي على الواتساب</p>
                  </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">مرحباً ${merchant.businessName}،</h2>
                    
                    <p style="color: #4a4a4a; line-height: 1.8; font-size: 15px; margin: 0 0 30px 0;">
                      شكراً لك على ثقتك بنا! 🎉 تم استلام دفعتك بنجاح. نحن سعداء بخدمتك ومساعدتك في تطوير مبيعاتك.
                    </p>
                    
                    <!-- Invoice Details Card -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f8fffe 0%, #f0fdf9 100%); border-radius: 12px; overflow: hidden; border: 2px solid #00d25e; margin: 0 0 30px 0;">
                      <tr>
                        <td style="padding: 25px;">
                          <table width="100%" cellpadding="8" cellspacing="0">
                            <tr>
                              <td style="color: #4a4a4a; font-weight: 600; font-size: 14px; width: 40%;">رقم الفاتورة:</td>
                              <td style="color: #1a1a1a; text-align: left; font-size: 14px; font-weight: 500;">${invoice.invoiceNumber}</td>
                            </tr>
                            <tr>
                              <td style="color: #4a4a4a; font-weight: 600; font-size: 14px; padding-top: 12px;">المبلغ المدفوع:</td>
                              <td style="text-align: left; padding-top: 12px;">
                                <span style="color: #00d25e; font-size: 26px; font-weight: 700;">
                                  ${(invoice.amount / 100).toFixed(2)}
                                </span>
                                <span style="color: #00a84d; font-size: 18px; font-weight: 600; margin-right: 5px;">
                                  ${invoice.currency}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td style="color: #4a4a4a; font-weight: 600; font-size: 14px; padding-top: 12px;">الحالة:</td>
                              <td style="text-align: left; padding-top: 12px;">
                                <span style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); color: #155724; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-block; border: 1px solid #b1dfbb;">
                                  ✓ ${invoice.status === 'paid' ? 'مدفوعة' : invoice.status}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td style="color: #4a4a4a; font-weight: 600; font-size: 14px; padding-top: 12px;">تاريخ الدفع:</td>
                              <td style="color: #1a1a1a; text-align: left; font-size: 14px; font-weight: 500; padding-top: 12px;">
                                ${new Date(invoice.createdAt).toLocaleDateString('ar-SA', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    ${invoice.pdfUrl ? `
                    <!-- Download Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="${invoice.pdfUrl}" 
                             style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                                    color: white; 
                                    padding: 16px 40px; 
                                    text-decoration: none; 
                                    border-radius: 8px; 
                                    display: inline-block;
                                    font-weight: 700;
                                    font-size: 15px;
                                    box-shadow: 0 6px 16px rgba(0, 210, 94, 0.35);
                                    transition: all 0.3s ease;">
                            📄 تحميل الفاتورة PDF
                          </a>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    <!-- Support Section -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e8e8e8;">
                      <tr>
                        <td>
                          <p style="color: #4a4a4a; font-size: 14px; margin: 0 0 10px 0; line-height: 1.6;">
                            💬 <strong>هل لديك استفسار؟</strong> فريق الدعم جاهز لمساعدتك على مدار الساعة.
                          </p>
                          <p style="color: #888; font-size: 13px; margin: 15px 0 0 0; line-height: 1.5;">
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
                    <!-- Social Links -->
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
                    <p style="color: #adb5bd; font-size: 11px; margin: 12px 0 0 0; line-height: 1.5;">
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

    // إعداد البيانات للإرسال
    const payload = {
      sender: ENV.smtpFrom,
      to: [user.email],
      subject: `✅ فاتورة ${invoice.invoiceNumber} - ساري`,
      html_body: htmlContent,
    };

    // إرسال الطلب إلى SMTP2GO API
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': ENV.smtp2goApiKey,
        'accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.data?.succeeded > 0) {
      console.log('[Invoice Email] Email sent successfully:', result.data.email_id);
      return true;
    } else {
      console.error('[Invoice Email] Failed to send:', result.data?.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('[Invoice Email] Error sending email:', error);
    return false;
  }
}

/**
 * التحقق من تكوين SMTP2GO API
 */
export function isSMTPConfigured(): boolean {
  return !!ENV.smtp2goApiKey;
}
