import nodemailer from "nodemailer";
import { getSmtpSettings } from "../db_smtp";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const settings = await getSmtpSettings();

  if (!settings) {
    throw new Error("SMTP settings not configured");
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465, // true for 465, false for other ports
    auth: {
      user: settings.username,
      pass: settings.password,
    },
  });

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

export async function testSmtpConnection(testEmail: string): Promise<boolean> {
  const settings = await getSmtpSettings();

  if (!settings) {
    throw new Error("SMTP settings not configured");
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
  });

  // Verify connection
  await transporter.verify();

  // Send test email
  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: testEmail,
    subject: "اختبار SMTP - ساري",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">اختبار SMTP - ساري</h2>
        <p>تم إرسال هذا البريد الإلكتروني لاختبار إعدادات SMTP الخاصة بك.</p>
        <p>إذا تلقيت هذه الرسالة، فهذا يعني أن إعدادات SMTP تعمل بشكل صحيح! ✅</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          التاريخ والوقت: ${new Date().toLocaleString("ar-SA")}
        </p>
      </div>
    `,
    text: `اختبار SMTP - ساري\n\nتم إرسال هذا البريد الإلكتروني لاختبار إعدادات SMTP الخاصة بك.\n\nالتاريخ والوقت: ${new Date().toLocaleString("ar-SA")}`,
  });

  return true;
}
