import { OAuth2Client } from "google-auth-library";
import { ENV } from "./_core/env";
import { getUserByEmail } from './db';
import { markVerifiedIdentityProviderEmail } from './accounts/email-verification-security';

/**
 * التحقق من صحة Google ID Token
 */
export async function verifyGoogleToken(token: string) {
  try {
    if (!ENV.googleClientId) {
      throw new Error("Google Client ID غير مُعرّف");
    }

    const client = new OAuth2Client(ENV.googleClientId);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: ENV.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true || !payload.sub) {
      throw new Error("فشل التحقق من Google Token");
    }

    return {
      email: payload.email.trim().toLowerCase(),
      name: payload.name || "",
      picture: payload.picture || "",
      googleId: payload.sub,
    };
  } catch {
    console.error('[Auth] Google token verification failed');
    throw new Error("فشل التحقق من Google Token");
  }
}

/**
 * Resolve an existing account after Google proves ownership of its email.
 * New merchants must use the canonical signup flow so merchant, membership,
 * trial, and legal receipts are created atomically.
 */
export async function resolveExistingGoogleUser(googleData: {
  email: string;
  name: string;
  picture: string;
  googleId: string;
}) {
  try {
    // البحث عن مستخدم بنفس البريد الإلكتروني
    const existingUser = await getUserByEmail(googleData.email);

    if (!existingUser) throw new Error('GOOGLE_ACCOUNT_REGISTRATION_REQUIRED');
    await markVerifiedIdentityProviderEmail(existingUser.id, googleData.email);
    return existingUser;
  } catch (error) {
    if (error instanceof Error && error.message === 'GOOGLE_ACCOUNT_REGISTRATION_REQUIRED') {
      throw error;
    }
    console.error('[Auth] Google user resolution failed');
    throw new Error('تعذر ربط حساب Google');
  }
}

/**
 * التحقق من إعدادات Google OAuth
 */
export function validateGoogleConfig() {
  if (!ENV.googleClientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID غير مُعرّف");
  }

  if (!ENV.googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET غير مُعرّف");
  }

  return true;
}
