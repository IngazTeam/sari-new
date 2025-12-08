import nodemailer from 'nodemailer';
import { Invoice } from '../../drizzle/schema';
import { getMerchantById, getUserById } from '../db';
import { ENV } from '../_core/env';

/**
 * إرسال فاتورة عبر البريد الإلكتروني
 */
export async function sendInvoiceEmail(invoice: Invoice): Promise<boolean> {
  try {
    // التحقق من إعدادات SMTP
    if (!ENV.smtpUser || !ENV.smtpPass) {
      console.error('[Invoice Email] SMTP credentials not configured');
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

    // إنشاء transporter مع SMTP2GO
    const transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: false, // SMTP2GO uses STARTTLS on port 2525
      auth: {
        user: ENV.smtpUser,
        pass: ENV.smtpPass,
      },
    });

    // محتوى البريد
    const mailOptions = {
      from: ENV.smtpFrom,
      to: user.email,
      subject: `فاتورة ${invoice.invoiceNumber} - ساري`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <div style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">ساري</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">مساعد المبيعات الذكي</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
            <h2 style="color: #333; margin-top: 0;">مرحباً ${merchant.businessName}،</h2>
            
            <p style="color: #555; line-height: 1.6;">
              شكراً لك على الدفع! نحن سعداء بخدمتك. يرجى الاطلاع على تفاصيل الفاتورة أدناه.
            </p>
            
            <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; border-right: 4px solid #00d25e;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 600;">رقم الفاتورة:</td>
                  <td style="padding: 8px 0; color: #333; text-align: left;">${invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 600;">المبلغ:</td>
                  <td style="padding: 8px 0; color: #00d25e; font-size: 20px; font-weight: bold; text-align: left;">
                    ${(invoice.amount / 100).toFixed(2)} ${invoice.currency}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 600;">الحالة:</td>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="background: #d4edda; color: #155724; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                      ${invoice.status === 'paid' ? 'مدفوعة' : invoice.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: 600;">التاريخ:</td>
                  <td style="padding: 8px 0; color: #333; text-align: left;">
                    ${new Date(invoice.createdAt).toLocaleDateString('ar-SA')}
                  </td>
                </tr>
              </table>
            </div>
            
            ${invoice.pdfUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${invoice.pdfUrl}" 
                 style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                        color: white; 
                        padding: 14px 32px; 
                        text-decoration: none; 
                        border-radius: 6px; 
                        display: inline-block;
                        font-weight: 600;
                        box-shadow: 0 4px 6px rgba(0, 210, 94, 0.3);">
                📄 تحميل الفاتورة
              </a>
            </div>
            ` : ''}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
              <p style="color: #666; font-size: 13px; margin: 5px 0;">
                إذا كان لديك أي استفسار، لا تتردد في التواصل معنا.
              </p>
              <p style="color: #999; font-size: 12px; margin: 15px 0 0 0;">
                هذا بريد إلكتروني تلقائي. يرجى عدم الرد عليه مباشرة.
              </p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="color: #666; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
            </p>
            <p style="color: #999; font-size: 11px; margin: 5px 0 0 0;">
              <a href="https://sary.live" style="color: #00d25e; text-decoration: none;">sary.live</a>
            </p>
          </div>
        </div>
      `,
    };

    // إرسال البريد
    const info = await transporter.sendMail(mailOptions);
    console.log('[Invoice Email] Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Invoice Email] Error sending email:', error);
    return false;
  }
}

/**
 * التحقق من تكوين SMTP
 */
export function isSMTPConfigured(): boolean {
  return !!(ENV.smtpUser && ENV.smtpPass);
}
