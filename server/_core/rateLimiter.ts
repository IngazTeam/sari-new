/**
 * Rate Limiting Module for Sari
 * Protects APIs from abuse and brute force attacks
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Custom error handler for rate limit exceeded
 */
const rateLimitHandler = (req: Request, res: Response) => {
    res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        errorAr: 'عدد كبير جداً من الطلبات. يرجى المحاولة لاحقاً.',
        retryAfter: res.getHeader('Retry-After'),
    });
};

/**
 * Auth Rate Limiter
 * Limits: 5 attempts per 15 minutes
 * Applied to: /api/auth routes (login, signup, password reset)
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: rateLimitHandler,
    skip: (req: Request) => {
        // Skip rate limiting for logout (it's not a security risk)
        return req.path.includes('logout');
    },
});

/**
 * API Rate Limiter
 * Limits: 100 requests per minute
 * Applied to: /api/trpc routes
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many API requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

/**
 * Webhook Rate Limiter
 * Limits: 200 requests per minute
 * Applied to: /api/webhooks routes
 * Higher limit because webhooks are server-to-server
 */
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Too many webhook requests.',
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict Rate Limiter
 * Limits: 3 requests per minute
 * Applied to: sensitive operations like password reset
 */
export const strictLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // Only 3 requests per minute
    message: 'Too many attempts. Please wait before trying again.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

/**
 * OpenAI Rate Limiter
 * Limits: 30 requests per minute per IP
 * Protects against abuse of AI endpoints
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 AI requests per minute
    message: 'Too many AI requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

console.log('[Rate Limiter] Rate limiting middleware initialized');

// ─── tRPC-Compatible In-Memory Rate Limiter ───────────────────────
// For use inside tRPC procedures (publicProcedure) where Express middleware doesn't apply

interface InMemoryEntry {
    count: number;
    resetAt: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    inMemoryStore.forEach((entry, key) => {
        if (now > entry.resetAt) {
            inMemoryStore.delete(key);
        }
    });
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key (IP, sessionId, etc.)
 * Works inside tRPC procedures without Express middleware.
 *
 * @returns { allowed, remaining, retryAfterMs }
 */
export function checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const entry = inMemoryStore.get(key);

    if (!entry || now > entry.resetAt) {
        inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
    }

    if (entry.count < maxRequests) {
        entry.count++;
        return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
    }

    return {
        allowed: false,
        remaining: 0,
        retryAfterMs: entry.resetAt - now,
    };
}

/** Rate limit presets */
export const TRPC_LIMITS = {
    /** Public AI chat: 20 messages / minute / IP */
    CHAT_PER_IP: { max: 20, windowMs: 60_000 },
    /** Public AI chat: 50 messages / hour / session */
    CHAT_PER_SESSION: { max: 50, windowMs: 3_600_000 },
} as const;
