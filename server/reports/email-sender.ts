/**
 * نظام إرسال البريد الإلكتروني
 * يستخدم nodemailer لإرسال رسائل البريد
 */

import nodemailer from 'nodemailer';

/**
 * إرسال بريد إلكتروني
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  try {
    // إنشاء transporter (يمكن تخصيصه حسب خدمة البريد المستخدمة)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // إرسال البريد
    const info = await transporter.sendMail({
      from: options.from || process.env.SMTP_FROM || 'noreply@sari.ai',
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    console.log('[Email] Sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    return false;
  }
}
