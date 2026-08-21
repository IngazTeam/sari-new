import { OAuth2Client } from "google-auth-library";
import { ENV } from "./_core/env";
import { createUser, getUserByEmail } from './db';
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
 * البحث عن مستخدم Google أو إنشاء واحد جديد
 */
export async function findOrCreateGoogleUser(googleData: {
  email: string;
  name: string;
  picture: string;
  googleId: string;
}) {
  try {
    // البحث عن مستخدم بنفس البريد الإلكتروني
    const existingUser = await getUserByEmail(googleData.email);

    if (existingUser) {
      await markVerifiedIdentityProviderEmail(existingUser.id, googleData.email);
      return existingUser;
    }

    // إنشاء مستخدم جديد
    const newUser = await createUser({
      openId: `google_${googleData.googleId}`,
      email: googleData.email,
      name: googleData.name,
      loginMethod: 'google',
      role: "user",
    });

    if (newUser) {
      await markVerifiedIdentityProviderEmail(newUser.id, googleData.email);
    }

    return newUser;
  } catch {
    console.error('[Auth] Google user resolution failed');
    throw new Error("فشل في البحث أو إنشاء مستخدم Google");
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
