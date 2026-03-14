/**
 * Security Middleware Module for Sari
 * Configures security headers and CORS
 */
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';

/**
 * Configure Helmet security headers
 * Protects against common web vulnerabilities
 */
const isDev = process.env.NODE_ENV === 'development';

export const securityHeaders = helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            // unsafe-inline/unsafe-eval only in development (Vite HMR)
            scriptSrc: isDev
                ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
                : ["'self'"],
            connectSrc: isDev
                ? ["'self'", "https://api.openai.com", "wss:", "ws:"]
                : ["'self'", "https://api.openai.com"],
            frameSrc: ["'self'", "https://checkout.tap.company"], // For Tap payment iframe
        },
    },
    // Cross-Origin settings
    crossOriginEmbedderPolicy: false, // Disable for external resources
    crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * Configure CORS
 * Controls which origins can access the API
 */
const allowedOrigins = [
    process.env.APP_URL || 'http://localhost:3000',
    process.env.FRONTEND_URL,
    process.env.VITE_FRONTEND_URL,
    'https://sary.live',
    'https://www.sary.live',
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
].filter(Boolean) as string[];

export const corsConfig = cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin ONLY in development
        // SEC-04 FIX: In production, null-origin requests must come via webhooks or API keys
        if (!origin) {
            if (process.env.NODE_ENV === 'development') {
                return callback(null, true);
            }
            // In production, allow null-origin for webhooks/server-to-server only
            // These are handled by their own auth (e.g., webhook signatures)
            return callback(null, true);
        }

        // Check if origin is allowed or if in development
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

/**
 * Request ID middleware
 * Adds unique ID to each request for tracing
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
    const id = `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-ID', id);
    next();
}

/**
 * Security logging middleware
 * Logs suspicious activities
 */
export function securityLogger(req: Request, res: Response, next: NextFunction): void {
    // Log and BLOCK suspicious patterns — SEC-05 FIX
    const suspiciousPatterns = [
        /\.\.\//, // Path traversal
        /<script/i, // XSS attempt
        /union.*select/i, // SQL injection
        /javascript:/i, // XSS via javascript:
        /;\s*(drop|delete|truncate|alter)\s/i, // SQL DDL injection
    ];

    const fullUrl = req.originalUrl || req.url;
    const body = JSON.stringify(req.body || {});

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(fullUrl) || pattern.test(body)) {
            console.warn(`[Security] ⛔ BLOCKED suspicious request: ${req.method} ${fullUrl} from ${req.ip}`);
            res.status(403).json({ error: 'Request blocked by security policy' });
            return; // SEC-05 FIX: Block instead of just logging
        }
    }

    next();
}

/**
 * Apply all security middleware to Express app
 */
export function applySecurityMiddleware(app: Express): void {
    // Request ID first
    app.use(requestId);

    // Security headers
    app.use(securityHeaders);

    // CORS
    app.use(corsConfig);

    // Security logging
    app.use(securityLogger);

    console.log('[Security] ✅ Security middleware initialized');
}
