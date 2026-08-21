import { sendEmail } from '../reports/email-sender';
import { buildPublicUrl } from '../utils/public-url';
import {
  issueEmailVerificationToken,
  revokeEmailVerificationToken,
  type EmailVerificationIssueResult,
} from './email-verification-security';

export type EmailVerificationDeliveryResult =
  | { delivered: true; alreadyVerified: boolean }
  | { delivered: false; reason: 'provider' }
  | ({ delivered: false } & Extract<EmailVerificationIssueResult, { allowed: false }>);

export async function deliverEmailVerification(data: {
  userId: number;
  email: string;
  ipAddress: string;
}): Promise<EmailVerificationDeliveryResult> {
  const issued = await issueEmailVerificationToken(data);
  if (!issued.allowed) return { delivered: false, ...issued };
  if (issued.alreadyVerified) return { delivered: true, alreadyVerified: true };

  const verificationUrl = `${buildPublicUrl('/verify-email')}#token=${issued.token}`;
  const delivered = await sendEmail({
    to: data.email,
    subject: 'تأكيد بريدك الإلكتروني - ساري',
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#172033">
      <h2>أكّد بريدك الإلكتروني</h2>
      <p>اضغط الزر التالي لتأكيد بريد حسابك في ساري.</p>
      <p><a href="${verificationUrl}" rel="noreferrer" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">تأكيد البريد</a></p>
      <p>صلاحية الرابط ساعة واحدة، ويعمل مرة واحدة فقط. إذا لم تطلبه فتجاهل الرسالة.</p>
    </div>`,
  });

  if (!delivered) {
    await revokeEmailVerificationToken(issued.token);
    return { delivered: false, reason: 'provider' };
  }
  return { delivered: true, alreadyVerified: false };
}
