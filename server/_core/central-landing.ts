import type { Express } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { centralLanguage, getCentralPage } from "../../shared/central/catalog";
import { renderCentralDocument } from "../../shared/central/seo";

/** Public HTML is rendered identically for people and crawlers, before static
 * index.html can swallow '/'. No user data or API secrets enter this renderer. */
export function registerCentralLanding(app: Express, publicDirectory: string) {
  let template: Promise<string> | undefined;
  app.use(async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    const lang = centralLanguage(
      new URL(req.originalUrl, "http://localhost").search
    );
    const page = getCentralPage(req.path, lang);
    if (!page) return next();
    try {
      template ??= readFile(
        path.join(publicDirectory, "index.html"),
        "utf8"
      ).catch(err => {
        template = undefined;
        throw err;
      });
      res.setHeader("Content-Language", lang);
      res.setHeader("Cache-Control", "no-cache");
      if (page.noindex) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        res.setHeader("Referrer-Policy", "no-referrer");
      }
      res
        .status(200)
        .type("html")
        .send(renderCentralDocument(await template, req.originalUrl));
    } catch (err) {
      next(err);
    }
  });
}
