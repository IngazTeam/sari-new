import type { Request } from 'express';
import type { User } from '../../drizzle/schema';
import {
  authenticateRequest,
  createSessionToken,
  verifySession,
  type SessionPayload,
} from './auth';

export type { SessionPayload } from './auth';

/**
 * Compatibility facade for legacy imports. Cryptography and authorization must
 * remain in _core/auth so no caller can accidentally bypass credential binding
 * or the server-side session registry.
 */
class SDKServer {
  async createSessionToken(
    userId: string,
    options: { expiresInMs?: number; name?: string; email?: string } = {},
  ): Promise<string> {
    return createSessionToken(userId, options);
  }

  async signSession(
    payload: Pick<SessionPayload, 'userId' | 'email' | 'name'>,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    return createSessionToken(payload.userId, {
      ...options,
      email: payload.email,
      name: payload.name,
    });
  }

  async verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
    return verifySession(token);
  }

  async authenticateRequest(req: Request): Promise<User> {
    return authenticateRequest(req);
  }
}

export const sdk = new SDKServer();
