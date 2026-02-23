import { COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

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
};

/**
 * Create a session token using jsonwebtoken
 */
export async function createSessionToken(
  userId: string,
  options: { expiresInMs?: number; name?: string; email?: string } = {}
): Promise<string> {
  const expiresInMs = options.expiresInMs ?? THIRTY_DAYS_MS;
  const expiresInSeconds = Math.floor(expiresInMs / 1000);

  const token = jwt.sign(
    {
      userId: String(userId),
      email: options.email || "",
      name: options.name || "",
    },
    getJwtSecret(),
    { expiresIn: expiresInSeconds }
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
    if (!userId) {
      console.warn("[Auth] Session payload missing userId");
      return null;
    }

    return {
      userId: String(userId),
      email: decoded.email || "",
      name: decoded.name || "",
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

/**
 * Authenticate request and return user
 */
export async function authenticateRequest(req: Request): Promise<User> {
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

  // Verify the token
  const session = await verifySession(sessionToken);

  if (!session) {
    throw ForbiddenError("Invalid session token");
  }

  // Get user from database (convert userId to number)
  const user = await db.getUserById(Number(session.userId));

  if (!user) {
    throw ForbiddenError("User not found");
  }

  // Update last signed in (use updateUser instead of upsertUser)
  try {
    await db.updateUser(user.id, {
      lastSignedIn: new Date(),
    });
  } catch (updateError) {
    // Ignore update errors - user is still authenticated
    console.log('[CustomAuth] Failed to update lastSignedIn:', String(updateError));
  }

  return user;
}

// Export as customAuth for easy import
export const customAuth = {
  createSessionToken,
  verifySession,
  authenticateRequest,
};
