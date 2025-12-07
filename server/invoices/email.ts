import nodemailer from 'nodemailer';
import { Invoice } from '../../drizzle/schema';
import { getMerchantById, getUserById } from '../db';

/**
 * Send invoice email to merchant
 * Note: This is a simplified version. In production, you should:
 * 1. Use a proper email service (SendGrid, AWS SES, etc.)
 * 2. Store SMTP credentials in environment variables
 * 3. Add email templates
 */
export async function sendInvoiceEmail(invoice: Invoice): Promise<boolean> {
  try {
    // Get merchant data
    const merchant = await getMerchantById(invoice.merchantId);
    if (!merchant) {
      console.error('[Invoice Email] Merchant not found');
      return false;
    }

    // Get user email
    const user = await getUserById(merchant.userId);
    if (!user || !user.email) {
      console.error('[Invoice Email] User email not found');
      return false;
    }

    // Create transporter (using Gmail as example)
    // In production, use environment variables for credentials
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email content
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Sari" <noreply@sari.com>',
      to: user.email,
      subject: `Invoice ${invoice.invoiceNumber} - Sari`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Invoice / فاتورة</h2>
          <p>Dear ${merchant.businessName},</p>
          <p>عزيزنا ${merchant.businessName}،</p>
          
          <p>Thank you for your payment. Please find your invoice attached.</p>
          <p>شكراً لك على الدفع. يرجى الاطلاع على الفاتورة المرفقة.</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Invoice Number / رقم الفاتورة:</strong> ${invoice.invoiceNumber}</p>
            <p style="margin: 5px 0;"><strong>Amount / المبلغ:</strong> ${(invoice.amount / 100).toFixed(2)} ${invoice.currency}</p>
            <p style="margin: 5px 0;"><strong>Status / الحالة:</strong> ${invoice.status}</p>
            <p style="margin: 5px 0;"><strong>Date / التاريخ:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
          </div>
          
          ${invoice.pdfUrl ? `
          <p>
            <a href="${invoice.pdfUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Download Invoice / تحميل الفاتورة
            </a>
          </p>
          ` : ''}
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated email. Please do not reply.<br>
            هذا بريد إلكتروني تلقائي. يرجى عدم الرد.
          </p>
          
          <p style="color: #666; font-size: 12px;">
            Sari - AI Sales Agent for WhatsApp
          </p>
        </div>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('[Invoice Email] Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Invoice Email] Error sending email:', error);
    return false;
  }
}

/**
 * Check if SMTP is configured
 */
export function isSMTPConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}
