import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token using local JWT
   * @example
   * const sessionToken = await sdk.createSessionToken(userId, { name: 'John' });
   */
  async createSessionToken(
    userId: string,
    options: { expiresInMs?: number; name?: string; email?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        userId,
        email: options.email || "",
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ userId: string; email: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { userId, email, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(userId)) {
        console.warn("[Auth] Session payload missing userId");
        return null;
      }

      return {
        userId,
        email: isNonEmptyString(email) ? email : "",
        name: isNonEmptyString(name) ? name : "",
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    // Regular authentication flow
    // Try multiple sources for the session token
    let sessionCookie = (req as any).cookies?.[COOKIE_NAME];
    
    // Fallback to Authorization header
    if (!sessionCookie) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionCookie = authHeader.substring(7);
      }
    }
    
    // Fallback to cookie header
    if (!sessionCookie && req.headers.cookie) {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionCookie = cookies.get(COOKIE_NAME);
    }
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.userId;
    const signedInAt = new Date();
    let user = await db.getUserById(sessionUserId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      id: user.id,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
