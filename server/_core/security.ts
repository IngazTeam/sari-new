/**
 * Security Middleware Module for Sari
 * Configures security headers and CORS
 */
import helmet from 'helmet';
import cors from 'cors';
import type { Express, Request, Response, NextFunction } from 'express';

/**
 * Configure Helmet security headers
 * Protects against common web vulnerabilities
 */
export const securityHeaders = helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Vite HMR in dev
            connectSrc: ["'self'", "https://api.openai.com", "wss:", "ws:"],
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
        // Allow requests with no origin (mobile apps, curl, server-to-server, static assets)
        if (!origin) {
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
    const id = `req_${Date.now()}_${require('crypto').randomBytes(6).toString('hex')}`;
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-ID', id);
    next();
}

/**
 * Security logging middleware
 * Logs suspicious activities
 */
export function securityLogger(req: Request, res: Response, next: NextFunction): void {
    // Log suspicious patterns
    const suspiciousPatterns = [
        /\.\.\//, // Path traversal
        /<script/i, // XSS attempt
        /union.*select/i, // SQL injection
        /javascript:/i, // XSS via javascript:
    ];

    const fullUrl = req.originalUrl || req.url;
    const body = JSON.stringify(req.body || {});

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(fullUrl) || pattern.test(body)) {
            console.warn(`[Security] Suspicious request detected: ${req.method} ${fullUrl} from ${req.ip}`);
            break;
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
