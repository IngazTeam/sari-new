import { type Express } from "express";
import express from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // Middleware filter: skip Vite for API and webhook routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
      return next(); // Skip Vite for API/webhook routes
    }
    // Pass to Vite for all other routes (SPA)
    return vite.middlewares(req, res, next);
  });
  
  // Serve index.html for non-API routes
  app.use(async (req, res, next) => {
    // Skip API requests
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
      return next();
    }
    
    // Skip static files
    if (req.path.match(/\.(js|css|json|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
      return next();
    }
    
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    path.resolve(import.meta.dirname, "../../client/dist");

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
