/**
 * Rate Limiting Module for Sari
 * Protects APIs from abuse and brute force attacks
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Custom key generator that uses IP + user agent
 * For more accurate rate limiting
 */
const keyGenerator = (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return ip;
};

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
    keyGenerator,
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
    keyGenerator,
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
    keyGenerator,
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
    keyGenerator,
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
    keyGenerator,
    handler: rateLimitHandler,
});

console.log('[Rate Limiter] Rate limiting middleware initialized');
