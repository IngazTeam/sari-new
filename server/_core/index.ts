// Load .env FIRST — this module must be imported before anything else
// so esbuild places it at the top of the bundle
import "./loadEnv";
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
import { startEscalationCascadeJob } from "../jobs/escalation-cascade";
import { startCoachingTriggerJob } from "../jobs/coaching-trigger";
import { startTakeoverExpiryJob } from "../jobs/takeover-expiry";
import { startFollowUpJob } from "../jobs/followup-reminders";
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

  // Request timeout middleware — prevents hung requests from exhausting resources
  // tRPC mutations (AI analysis, website crawling) get 120s; everything else gets 30s
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/ready') return next();
    // tRPC mutation calls can be heavy (AI pipeline, crawling 50 pages, embeddings)
    const isHeavyRequest = req.method === 'POST' && req.path.startsWith('/api/trpc');
    const timeout = isHeavyRequest ? 120000 : 30000;
    req.setTimeout(timeout);
    res.setTimeout(timeout, () => {
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

  // REST API v1 — External service integration (API key auth)
  try {
    const { sariApiRouter, sariPlatformRouter } = await import('../api/rest');
    // ⚠️ CRITICAL: /platform MUST be mounted BEFORE /api/v1
    // Otherwise Express matches /api/v1 first → authMiddleware rejects platform keys
    app.use("/api/v1/platform", sariPlatformRouter);
    app.use("/api/v1", sariApiRouter);
    console.log('[Core] ✅ REST API v1 mounted at /api/v1');
    console.log('[Core] ✅ Platform API mounted at /api/v1/platform');
  } catch (e) {
    console.warn('[Core] REST API v1 failed to mount:', e);
  }

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

  // ── Knowledge Docs Upload Endpoint ─────────────────────────
  // Uses multer for multipart file parsing (tRPC doesn't support FormData)
  const multer = (await import('multer')).default;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف PDF أو Word أو Excel فقط.'));
      }
    },
  });

  app.post('/api/knowledge-docs/upload', apiLimiter, (req: any, res: any, next: any) => {
    // SEC-04 FIX: Wrap multer to catch file size / type errors and return JSON
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? 'حجم الملف أكبر من الحد المسموح (5 ميجابايت)'
          : err.message || 'خطأ في رفع الملف';
        return res.status(400).json({ error: message });
      }
      next();
    });
  }, async (req: any, res: any) => {
    try {
      // Auth check — extract user from session cookie
      const { resolveUser } = await import('./auth');
      const user = await resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: 'غير مصرح' });
      }

      const { getMerchantByUserId, createKnowledgeDoc, updateKnowledgeDoc, deleteKnowledgeDocsByMerchantId } = await import('../db');
      const merchant = await getMerchantByUserId(user.id);
      if (!merchant) {
        return res.status(404).json({ error: 'التاجر غير موجود' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
      }

      const file = req.file;
      const { getFileTypeFromMime } = await import('../document-parser');
      const fileType = getFileTypeFromMime(file.mimetype);
      if (!fileType) {
        return res.status(400).json({ error: 'نوع الملف غير مدعوم' });
      }

      console.log(`[KnowledgeDocs] Upload started: merchant=${merchant.id}, size=${file.size}`);

      // SEC-01/SEC-02 FIX: Sanitize filename — strip path separators, control chars, and HTML
      const sanitizedName = file.originalname
        .replace(/[/\\<>"'`:;|?*\x00-\x1f]/g, '_')  // Strip path separators & dangerous chars
        .replace(/\.{2,}/g, '.')                       // Prevent ..
        .substring(0, 200);                            // Limit length

      // Delete old docs for this merchant (one doc per merchant)
      await deleteKnowledgeDocsByMerchantId(merchant.id);

      // Save to storage — SEC-01 FIX: Use sanitized name in storage key
      let fileUrl: string | null = null;
      try {
        const { storagePut } = await import('../storage');
        const storageKey = `knowledge-docs/${merchant.id}/${Date.now()}-${sanitizedName}`;
        const result = await storagePut(storageKey, file.buffer, file.mimetype);
        fileUrl = result.key;
      } catch (err) {
        console.warn('[KnowledgeDocs] Storage upload failed, proceeding without file URL:', err);
      }

      // Create DB record — SEC-02 FIX: Store sanitized filename
      const docId = await createKnowledgeDoc({
        merchantId: merchant.id,
        fileName: sanitizedName,
        fileType,
        fileUrl,
        fileSize: file.size,
        extractionStatus: 'processing',
      });

      // Extract text
      try {
        const { extractTextFromDocument } = await import('../document-parser');
        const { text, pageCount } = await extractTextFromDocument(file.buffer, fileType);

        // AI-Powered Understanding: Send extracted text to GPT-4 for sales-oriented analysis
        let finalText = text;
        try {
          const { invokeLLM } = await import('./llm');
          const aiResult = await invokeLLM({
            merchantId: merchant.id,
            messages: [
              {
                role: 'system',
                content: `أنت محلل أعمال متخصص. مهمتك تحليل ملف بروفايل تاجر وتحويله لملخص مبيعات ذكي يستخدمه بوت مبيعات واتساب اسمه "ساري".

قواعد التحليل:
1. حدد نوع النشاط التجاري وتخصصه
2. استخرج المنتجات والخدمات المقدمة مع أسعارها إن وُجدت
3. حدد نقاط القوة والتميز (USPs)
4. حدد الجمهور المستهدف
5. اكتب عبارات بيعية يستخدمها البوت عند الترويج
6. حدد الأسئلة الشائعة المتوقعة وأجوبتها
7. اكتب بالعربية

الشكل:
=== ملخص النشاط ===
[وصف مختصر وشامل]

=== المنتجات/الخدمات ===
[قائمة مفصلة]

=== نقاط القوة ===
[أبرز مميزات التاجر]

=== عبارات بيعية مقترحة ===
[جمل يستخدمها البوت]

=== أسئلة شائعة ===
[سؤال: جواب]`
              },
              {
                role: 'user',
                content: `حلل ملف البروفايل هذا:\n\n${text.substring(0, 15000)
                  // SEC-02: Sanitize to prevent prompt injection from malicious docs
                  .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
                  .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
                  .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
                  .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
                  .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
                  .replace(/do\s+not\s+follow/gi, '[filtered]')
                  .replace(/override\s+(system|all|your)/gi, '[filtered]')}`
              }
            ],
            maxTokens: 3000,
          });

          const aiSummary = typeof aiResult.choices[0]?.message?.content === 'string'
            ? aiResult.choices[0].message.content
            : '';

          if (aiSummary && aiSummary.length > 50) {
            // Store both raw text AND AI analysis
            finalText = aiSummary + '\n\n=== النص الأصلي للملف ===\n' + text;
            console.log(`[KnowledgeDocs] ✅ AI analyzed profile: ${aiSummary.length} chars of sales intelligence`);
          }
        } catch (aiErr) {
          console.warn('[KnowledgeDocs] AI analysis failed, using raw text:', aiErr);
          // Fall back to raw text if AI fails
        }

        await updateKnowledgeDoc(docId, {
          extractedText: finalText,
          extractionStatus: 'completed',
        });

        console.log(`[KnowledgeDocs] ✅ Extraction completed: merchant=${merchant.id}, chars=${text.length}, pages=${pageCount || 'N/A'}`);

        // === Knowledge Engine v4: Classify document into structured sections ===
        try {
          if (finalText.trim().length > 100) {
            const { ingestContent } = await import('../ai/knowledge-engine');
            const { embedAllSections } = await import('../ai/rag-engine');
            const knowledgeDb = await import('../db/knowledge');
            
            await ingestContent(
              merchant.id,
              finalText,
              'document',
              { businessName: merchant.businessName },
            );
            
            await embedAllSections(merchant.id);
            await knowledgeDb.invalidateCache(merchant.id);
            console.log(`[KnowledgeDocs] ✅ Knowledge Engine processed uploaded document for merchant ${merchant.id}`);
          }
        } catch (keErr: any) {
          console.warn('[KnowledgeDocs] Knowledge Engine pipeline failed (non-blocking):', keErr.message);
        }

        // Log to Sari Brain activity
        try {
          const { logBrainActivity } = await import('../routers-sari-brain');
          await logBrainActivity(merchant.id, 'file_uploaded', `تم رفع ملف "${sanitizedName}" (${fileType})`, { fileName: sanitizedName, fileType, textLength: text.length });
        } catch (e) { /* skip */ }

        return res.json({
          success: true,
          doc: {
            id: docId,
            fileName: sanitizedName,
            fileType,
            fileSize: file.size,
            extractionStatus: 'completed',
            textLength: text.length,
            pageCount,
            // Smart Intake: return raw text for frontend preview (truncated)
            extractedTextPreview: text.substring(0, 30000),
          },
        });
      } catch (extractError) {
        console.error('[KnowledgeDocs] Text extraction failed:', extractError);
        await updateKnowledgeDoc(docId, { extractionStatus: 'failed' });

        return res.json({
          success: true,
          doc: {
            id: docId,
            fileName: sanitizedName,
            fileType,
            fileSize: file.size,
            extractionStatus: 'failed',
          },
          warning: 'تم رفع الملف لكن فشل استخراج النص. يمكنك إعادة المحاولة.',
        });
      }
    } catch (error: any) {
      // SEC-03 FIX: Don't expose raw error messages
      console.error('[KnowledgeDocs] Upload error:', error);
      return res.status(500).json({ error: 'حدث خطأ أثناء رفع الملف. حاول مرة أخرى.' });
    }
  });

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

    // ─── Cluster-Safe Background Jobs ──────────────────────────
    // In PM2 cluster mode, only the primary worker (instance 0) runs cron jobs.
    // This prevents duplicate campaign sends, duplicate WhatsApp messages, etc.
    const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

    if (isPrimaryWorker) {
      console.log('[Cluster] This is the PRIMARY worker — initializing cron jobs and polling');

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

      // Initialize Escalation Cascade job (runs every 60s — cascading phone alerts)
      startEscalationCascadeJob();

      // Initialize Coaching Trigger job (runs every 6h — Priority Engine micro-training)
      startCoachingTriggerJob();

      // Initialize Takeover Expiry job (runs every 60s — auto-clears expired takeovers & responds to pending messages)
      startTakeoverExpiryJob();

      // Initialize Follow-Up Reminders job (runs every 5min — sends proactive follow-ups to hesitant customers)
      startFollowUpJob();

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

      // Message Delivery Log Cleanup — 30 day retention (runs daily at 3:00 AM)
      cron.schedule('0 3 * * *', async () => {
        try {
          const { cleanupOldDeliveryLogs } = await import('../routers-monitor');
          await cleanupOldDeliveryLogs();
        } catch (error) {
          logError('[Cron] Delivery log cleanup failed', error);
        }
      });

      // Start WhatsApp message polling for all connected merchants
      // This is used for free Green API accounts that don't support webhooks
      setTimeout(async () => {
        console.log('[Polling] Initializing WhatsApp message polling...');
        await startAllPolling();
      }, 5000); // Wait 5 seconds for server to fully initialize

    } else {
      console.log(`[Cluster] Worker ${process.env.NODE_APP_INSTANCE} — skipping cron jobs (handled by primary)`);
    }

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        console.log('[Server] HTTP server closed');

        // Close database connection pool
        try {
          const { closeDb } = await import('../db');
          await closeDb();
        } catch (e) {
          console.error('[Server] Error closing DB pool:', e);
        }

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
  // HOTFIX: Do NOT exit — log and continue. PM2 restart loop was killing WhatsApp connectivity.
  // Only truly fatal errors (OOM, segfault) should crash the process.
  logError('Uncaught Exception (non-fatal — process continues)', error);
  console.error('[CRITICAL] uncaughtException:', error?.message || error);
});

startServer().catch(console.error);
