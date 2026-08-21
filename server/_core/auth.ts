import { COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { User } from "../../drizzle/schema";
import { createAuthSession, getUserByActiveSession, getUserById } from '../db';
import { ENV } from "./env";
import {
  deriveSessionCredentialVersion,
  isSessionCredentialVersion,
  createSessionId,
  isSessionId,
  sessionCredentialVersionMatches,
} from './session-security';

// JWT Secret - uses JWT_SECRET from environment
const getJwtSecret = (): string => {
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters. Set it in your environment variables.');
  }
  return ENV.cookieSecret;
};

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  credentialVersion: string;
  sessionId: string;
};

export function sessionMatchesUserCredential(
  session: Pick<SessionPayload, 'credentialVersion'>,
  user: Pick<User, 'id' | 'openId' | 'password'>,
): boolean {
  return sessionCredentialVersionMatches(
    session.credentialVersion,
    user,
    getJwtSecret(),
  );
}

/**
 * Create a session token using jsonwebtoken
 */
export async function createSessionToken(
  userId: string,
  options: { expiresInMs?: number; name?: string; email?: string } = {}
): Promise<string> {
  const expiresInMs = options.expiresInMs ?? THIRTY_DAYS_MS;
  const expiresInSeconds = Math.floor(expiresInMs / 1000);
  const numericUserId = Number(userId);

  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('Cannot create session with an invalid expiry');
  }

  if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
    throw new Error('Cannot create session for an invalid user');
  }

  const user = await getUserById(numericUserId);
  if (!user || user.accountStatus !== 'active') {
    throw new Error('Cannot create session for an unavailable user');
  }

  const jwtSecret = getJwtSecret();
  const credentialVersion = deriveSessionCredentialVersion(user, jwtSecret);
  const sessionId = createSessionId();

  const token = jwt.sign(
    {
      userId: String(user.id),
      email: options.email ?? user.email ?? "",
      name: options.name ?? user.name ?? "",
      credentialVersion,
      sessionId,
    },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: expiresInSeconds }
  );

  await createAuthSession(
    user.id,
    sessionId,
    new Date(Date.now() + expiresInSeconds * 1000),
  );

  return token;
}

/**
 * Verify a session token
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) {
    console.warn("[Auth] Missing session token");
    return null;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as any;

    const userId = decoded.userId || decoded.id;
    if (!userId || !/^[1-9]\d*$/.test(String(userId))) {
      console.warn("[Auth] Session payload missing userId");
      return null;
    }

    if (!isSessionCredentialVersion(decoded.credentialVersion)) {
      console.warn('[Auth] Session payload missing credential binding');
      return null;
    }

    if (!isSessionId(decoded.sessionId)) {
      console.warn('[Auth] Session payload missing server-side session id');
      return null;
    }

    return {
      userId: String(userId),
      email: decoded.email || "",
      name: decoded.name || "",
      credentialVersion: decoded.credentialVersion,
      sessionId: decoded.sessionId,
    };
  } catch (error) {
    console.warn("[Auth] Session verification failed", String(error));
    return null;
  }
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) {
    return new Map<string, string>();
  }
  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

function getRequestSessionToken(req: Request): string | undefined {
  // Try multiple sources for the session token
  let sessionToken = (req as any).cookies?.[COOKIE_NAME];

  // Fallback to Authorization header (Bearer token)
  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    }
  }

  // Fallback to cookie header
  if (!sessionToken && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    sessionToken = cookies.get(COOKIE_NAME);
  }

  return typeof sessionToken === 'string' ? sessionToken : undefined;
}

export type AuthenticatedSession = {
  user: User;
  session: SessionPayload;
};

/**
 * Authenticate a request and retain the server-side session identity for
 * revocation-sensitive operations such as logout.
 */
export async function authenticateSessionRequest(req: Request): Promise<AuthenticatedSession> {
  const sessionToken = getRequestSessionToken(req);

  // Verify the token
  const session = await verifySession(sessionToken);

  if (!session) {
    throw ForbiddenError("Invalid session token");
  }

  // Get user from database (convert userId to number)
  const user = await getUserByActiveSession(Number(session.userId), session.sessionId);

  if (!user) {
    throw ForbiddenError("User not found");
  }

  if (user.accountStatus !== 'active') {
    throw ForbiddenError("Account unavailable");
  }

  if (!sessionMatchesUserCredential(session, user)) {
    throw ForbiddenError('Session revoked');
  }

  // NOTE: lastSignedIn is updated only at login time (routers-auth.ts / auth-routes.ts).
  // Previously this ran on EVERY request via createContext() → DB pool exhaustion.

  return { user, session };
}

/**
 * Authenticate request and return user
 */
export async function authenticateRequest(req: Request): Promise<User> {
  return (await authenticateSessionRequest(req)).user;
}

/**
 * Resolve user from request without throwing (returns null on failure)
 * Used by Express endpoints that need auth but can't use tRPC middleware
 */
export async function resolveUser(req: Request): Promise<User | null> {
  try {
    return await authenticateRequest(req);
  } catch {
    return null;
  }
}

// Export as customAuth for easy import
export const customAuth = {
  createSessionToken,
  verifySession,
  authenticateSessionRequest,
  authenticateRequest,
  resolveUser,
};
