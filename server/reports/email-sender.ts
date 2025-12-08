/**
 * نظام إرسال البريد الإلكتروني
 * يستخدم nodemailer مع SMTP2GO
 */

import nodemailer from 'nodemailer';
import { ENV } from '../_core/env';

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
    // التحقق من وجود إعدادات SMTP
    if (!ENV.smtpUser || !ENV.smtpPass) {
      console.error('[Email] SMTP credentials not configured');
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

    // إرسال البريد
    const info = await transporter.sendMail({
      from: options.from || ENV.smtpFrom,
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

/**
 * التحقق من تكوين SMTP
 */
export function isSMTPConfigured(): boolean {
  return !!(ENV.smtpUser && ENV.smtpPass);
}
