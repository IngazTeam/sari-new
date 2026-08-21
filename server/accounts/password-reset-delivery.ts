import crypto from 'node:crypto';
import {
  createPasswordResetToken,
  deletePasswordResetTokensByUserId,
} from '../db';
import { sendPasswordResetEmail } from '../notifications/email-notifications';
import { buildPublicUrl } from '../utils/public-url';

export async function deliverPasswordResetForUser(user: {
  id: number;
  email: string;
  name?: string | null;
}): Promise<boolean> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await deletePasswordResetTokensByUserId(user.id);
  await createPasswordResetToken({
    userId: user.id,
    email: user.email,
    token,
    expiresAt,
    used: 0,
  });

  // A fragment keeps the bearer out of HTTP request paths, access logs and referrers.
  const resetLink = `${buildPublicUrl('/reset-password')}#token=${token}`;
  try {
    const delivered = await sendPasswordResetEmail(user.email, user.name || 'المستخدم', resetLink);
    if (delivered) return true;
  } catch {
    // The caller owns user-facing/logging policy; never log the account here.
  }

  // Do not leave a hidden live token when the user never received the link.
  await deletePasswordResetTokensByUserId(user.id);
  return false;
}
