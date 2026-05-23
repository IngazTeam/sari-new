/**
 * Production Static File Server
 * Serves pre-built Vite assets with proper caching headers.
 * No dependency on the 'vite' package.
 */
import { type Express } from "express";
import express from "express";
import compression from "compression";
import path from "path";

export function serveStatic(app: Express) {
  const distPath =
    path.resolve(import.meta.dirname, "public");

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

  // SPA fallback - no cache for HTML
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(distPath, "index.html"));
  });
}
