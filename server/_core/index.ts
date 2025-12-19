import "dotenv/config";
import express from "express";
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
import cron from "node-cron";

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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Parse cookies
  app.use(cookieParser());
  
  // Auth endpoints
  app.use("/api/auth", authRoutes);
  
  // Webhook endpoints
  app.use("/api/webhooks", webhookRoutes);
  
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
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
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
    
    // Initialize Occasion Campaigns cron job (runs daily at 9:00 AM)
    cron.schedule('0 9 * * *', async () => {
      console.log('[Cron] Running occasion campaigns check...');
      await runOccasionCampaignsCron();
    });

    // Instance Expiry Check (runs daily at 8 AM)
    cron.schedule('0 8 * * *', async () => {
      console.log('[Cron] Running instance expiry check...');
      const { checkInstanceExpiry } = await import('../jobs/instance-expiry-check');
      await checkInstanceExpiry();
    });
    
    // Monthly Usage Reset (runs on the 1st of each month at 00:00)
    cron.schedule('0 0 1 * *', async () => {
      console.log('[Cron] Running monthly usage reset...');
      const { resetMonthlyUsage } = await import('../usage-tracking');
      await resetMonthlyUsage();
    });
    
    // Start WhatsApp message polling for all connected merchants
    // This is used for free Green API accounts that don't support webhooks
    setTimeout(async () => {
      console.log('[Polling] Initializing WhatsApp message polling...');
      await startAllPolling();
    }, 5000); // Wait 5 seconds for server to fully initialize
  });
}

startServer().catch(console.error);
