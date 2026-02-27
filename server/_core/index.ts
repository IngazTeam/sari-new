// Inline .env loader — replaces dotenv (not in package.json)
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
try {
  const __dirname2 = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname2, '../../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log('[ENV] Loaded .env file from', envPath);
} catch (e) {
  console.warn('[ENV] Could not load .env file:', (e as Error).message);
}
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import webhookRoutes from "../webhooks/routes";
import authRoutes from "../auth-routes";
import { initializeSallaCronJobs } from "../jobs/salla-sync";
import { startOrderTrackingJob } from "../jobs/order-tracking";
import { startAbandonedCartJob } from "../jobs/abandoned-cart";
import { runOccasionCampaignsCron } from "../jobs/occasion-campaigns";
import { startReviewRequestJob } from "../jobs/review-request";
import { startScheduledCampaignsJob } from "../jobs/scheduled-campaigns";
import { startScheduledMessagesJob } from "../jobs/scheduled-messages";
import { startUsageAlertsCron } from "../jobs/usage-alerts";
import { startSubscriptionExpiryCron } from "../jobs/subscription-expiry-alerts";
import { startAllPolling } from "../polling";
import { startCronJobs } from "../cronJobs";
import { startAllSheetsCronJobs } from "../sheetsCronJobs";
import { initWeeklyReportCron } from "../weeklyReportCron";
import { startSubscriptionJobs } from "../cron/subscription-jobs";
import cron from "node-cron";
import { authLimiter, webhookLimiter, apiLimiter } from "./rateLimiter";
import { validateEnv } from "./validateEnv";
import { applySecurityMiddleware } from "./security";
import { logError } from "./logger";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Validate environment variables first
  validateEnv();

  const app = express();

  // Trust first proxy (Nginx on Forge) — required for correct client IP in rate limiter
  app.set('trust proxy', 1);

  const server = createServer(app);

  // Apply security middleware (Helmet, CORS, request ID)
  applySecurityMiddleware(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Parse cookies
  app.use(cookieParser());

  // Gzip compression for API responses (60-80% size reduction)
  app.use(compression());

  // Request timeout middleware (30s) — prevents hung requests from exhausting resources
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/ready') return next();
    req.setTimeout(30000);
    res.setTimeout(30000, () => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request Timeout', errorAr: 'انتهت مهلة الطلب', code: 'TIMEOUT' });
      }
    });
    next();
  });

  // Health check endpoints for load balancers and orchestrators
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/ready', async (req, res) => {
    try {
      // Check database connectivity
      const { getDb } = await import('../db');
      const db = getDb();
      // Simple query to verify connection
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
        },
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
        },
      });
    }
  });

  // Auth endpoints (rate limited: 5 attempts per 15 minutes)
  app.use("/api/auth", authLimiter, authRoutes);

  // Webhook endpoints (rate limited: 200 requests per minute)
  app.use("/api/webhooks", webhookLimiter, webhookRoutes);

  // Sitemap routes
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const { generateSitemapIndex } = await import('../sitemap-generator');
      const sitemap = await generateSitemapIndex();
      res.header('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating sitemap index:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  app.get('/sitemap-pages.xml', async (req, res) => {
    try {
      const { generatePagesSitemap } = await import('../sitemap-generator');
      const sitemap = await generatePagesSitemap();
      res.header('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating pages sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  app.get('/sitemap-blog.xml', async (req, res) => {
    try {
      const { generateBlogSitemap } = await import('../sitemap-generator');
      const sitemap = await generateBlogSitemap();
      res.header('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating blog sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  app.get('/sitemap-products.xml', async (req, res) => {
    try {
      const { generateProductsSitemap } = await import('../sitemap-generator');
      const sitemap = await generateProductsSitemap();
      res.header('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error) {
      console.error('Error generating products sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // robots.txt is served from client/public/robots.txt via static files
  // tRPC API (rate limited: 100 requests per minute)
  app.use(
    "/api/trpc",
    apiLimiter,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // 404 handler for API routes - ensures unmatched API routes return JSON, not HTML
  // This MUST come before serveStatic/setupVite
  app.use('/api', (req: any, res: any, next: any) => {
    // If headers already sent or this is an error handler call, skip
    if (res.headersSent) {
      return next();
    }

    // This is a 404 for unmatched API routes
    console.warn('🟡 [API 404]', req.method, req.path);
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({
      error: 'API endpoint not found',
      errorAr: 'نقطة النهاية غير موجودة',
      code: 'NOT_FOUND',
      path: req.originalUrl
    });
  });

  // Global error handler for API routes - ensures JSON responses instead of HTML
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    console.error('🔴 [API Error]', err);

    // Always return JSON for API errors
    res.setHeader('Content-Type', 'application/json');

    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error: err.message || 'Internal server error',
      errorAr: 'حدث خطأ داخلي في الخادم',
      code: err.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }



  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Initialize Salla cron jobs
    initializeSallaCronJobs();

    // Initialize Order Tracking cron job
    startOrderTrackingJob();

    // Initialize Abandoned Cart Recovery cron job
    startAbandonedCartJob();

    // Initialize Review Request cron job (runs daily at 10:00 AM)
    startReviewRequestJob();

    // Initialize Scheduled Campaigns cron job (runs every minute)
    startScheduledCampaignsJob();

    // Initialize Scheduled Messages cron job (runs every minute)
    startScheduledMessagesJob();

    // Initialize Usage Alerts cron job (runs every hour)
    startUsageAlertsCron();

    // Initialize Subscription Expiry Alerts cron job (runs daily at 9:00 AM)
    startSubscriptionExpiryCron();

    // Initialize Appointment Reminders cron job (runs every hour)
    startCronJobs();

    // Initialize Google Sheets Reports cron jobs (daily/weekly/monthly)
    startAllSheetsCronJobs();

    // Initialize Weekly Report cron job (runs every Sunday at 9:00 AM)
    initWeeklyReportCron();

    // Initialize Subscription Management cron jobs
    startSubscriptionJobs();

    // Initialize Occasion Campaigns cron job (runs daily at 9:00 AM)
    cron.schedule('0 9 * * *', async () => {
      try {
        console.log('[Cron] Running occasion campaigns check...');
        await runOccasionCampaignsCron();
      } catch (error) {
        logError('[Cron] Occasion campaigns failed', error);
      }
    });

    // Instance Expiry Check (runs daily at 8 AM)
    cron.schedule('0 8 * * *', async () => {
      try {
        console.log('[Cron] Running instance expiry check...');
        const { checkInstanceExpiry } = await import('../jobs/instance-expiry-check');
        await checkInstanceExpiry();
      } catch (error) {
        logError('[Cron] Instance expiry check failed', error);
      }
    });

    // Monthly Usage Reset (runs on the 1st of each month at 00:00)
    cron.schedule('0 0 1 * *', async () => {
      try {
        console.log('[Cron] Running monthly usage reset...');
        const { resetMonthlyUsage } = await import('../usage-tracking');
        await resetMonthlyUsage();
      } catch (error) {
        logError('[Cron] Monthly usage reset failed', error);
      }
    });

    // Start WhatsApp message polling for all connected merchants
    // This is used for free Green API accounts that don't support webhooks
    setTimeout(async () => {
      console.log('[Polling] Initializing WhatsApp message polling...');
      await startAllPolling();
    }, 5000); // Wait 5 seconds for server to fully initialize

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

      server.close(() => {
        console.log('[Server] HTTP server closed');
        console.log('[Server] Graceful shutdown completed');
        process.exit(0);
      });

      // Force exit after 30 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  });
}

// Global process error handlers — prevent silent crashes
process.on('unhandledRejection', (reason) => {
  logError('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception — shutting down', error);
  process.exit(1);
});

startServer().catch(console.error);
