/**
 * Production Static File Server
 * Serves pre-built Vite assets with proper caching headers.
 * No dependency on the 'vite' package.
 */
import { type Express } from "express";
import express from "express";
import compression from "compression";
import path from "path";
import { classifySpaRoute } from "@shared/spa-route-policy";

export function serveStatic(app: Express, publicDirectory?: string) {
  const distPath = publicDirectory ?? path.resolve(import.meta.dirname, "public");

  // Enable Gzip compression for all responses
  app.use(compression());

  // Serve hashed assets with long-term cache (1 year)
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    })
  );

  // Serve other static files with short cache (1 hour)
  app.use(
    express.static(distPath, {
      maxAge: "1h",
    })
  );

  // SPA fallback with real HTTP semantics. Known deep links receive the app
  // shell with 200, aliases get an HTTP redirect, and unknown routes receive
  // the same shell with 404 so React can render its localized NotFound page.
  app.use("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(404).json({ code: 'NOT_FOUND' });
    }

    const decision = classifySpaRoute(req.originalUrl);
    if (decision.kind === 'redirect') {
      const queryIndex = req.originalUrl.indexOf('?');
      const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
      return res.redirect(308, `${decision.target}${query}`);
    }

    const looksLikeMissingFile = /\/[^/]+\.[a-z0-9]{1,12}$/i.test(decision.path);
    if (decision.kind === 'sensitive' || looksLikeMissingFile) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(404).type('text/plain').send('Not Found');
    }

    const status = decision.kind === 'known' ? 200 : 404;
    if (status === 404) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(status).sendFile(path.join(distPath, "index.html"));
  });
}
