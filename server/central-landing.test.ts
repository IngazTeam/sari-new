import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import { JSDOM } from "jsdom";
import {
  centralCatalog,
  CENTRAL_PATHS,
  CENTRAL_INDEXABLE_PATHS,
  centralHref,
  getCentralPage,
} from "../shared/central/catalog";
import { CENTRAL_ROUTE_PATHS, isCentralRoute } from "../shared/central/routes";
import { centralSeo, renderCentralDocument } from "../shared/central/seo";
import { classifySpaRoute } from "../shared/spa-route-policy";
import { generatePagesSitemap, generateBlogSitemap } from "./sitemap-generator";
import { serveStatic } from "./_core/serve-static";
import { safeCheckoutReturn } from "../client/src/central/transactions";

const template = readFileSync("client/index.html", "utf8");
describe("central landing: bilingual server HTML and public route contract", () => {
  it("publishes matching, complete language catalogues and entry manifests", () => {
    expect(Object.keys(centralCatalog.en).sort()).toEqual(
      CENTRAL_PATHS.slice().sort()
    );
    expect([...CENTRAL_ROUTE_PATHS].sort()).toEqual(
      CENTRAL_PATHS.slice().sort()
    );
    for (const p of CENTRAL_PATHS) {
      expect(isCentralRoute(p)).toBe(true);
      expect(classifySpaRoute(p).kind, p).toBe("known");
    }
    expect(
      getCentralPage("/solutions/clinics/not-a-service", "ar")
    ).toBeUndefined();
    expect(getCentralPage("/reset-password/one/two", "ar")).toBeUndefined();
  });
  it("renders each public page in both languages with one heading and unique SEO", () => {
    for (const lang of ["ar", "en"] as const) {
      const titles = new Set<string>();
      for (const route of CENTRAL_PATHS) {
        const dom = new JSDOM(
          renderCentralDocument(template, centralHref(route, lang))
        );
        const d = dom.window.document;
        expect(d.documentElement.lang, route).toBe(lang);
        expect(d.documentElement.dir, route).toBe(
          lang === "ar" ? "rtl" : "ltr"
        );
        expect(d.querySelectorAll("main").length, route).toBe(1);
        expect(d.querySelectorAll("h1").length, route).toBe(1);
        expect(d.querySelectorAll("title").length, route).toBe(1);
        expect(
          d.querySelectorAll('meta[name="description"]').length,
          route
        ).toBe(1);
        expect(
          d.querySelector('meta[name="description"]')?.getAttribute("content")!
            .length,
          route
        ).toBeGreaterThan(30);
        expect(
          d.querySelector('link[rel="canonical"]')?.getAttribute("href"),
          route
        ).toBe("https://sary.live" + centralHref(route, lang));
        expect(d.querySelectorAll("link[hreflang]").length, route).toBe(3);
        const page = centralCatalog[lang][route];
        if (!page.noindex) {
          expect(titles.has(d.title), route + " duplicates " + d.title).toBe(
            false
          );
          titles.add(d.title);
        }
        const graph = JSON.parse(
          d.querySelector('script[type="application/ld+json"]')!.textContent!
        )["@graph"];
        expect(JSON.stringify(graph), route).not.toMatch(
          /aggregateRating|SearchAction/
        );
        for (const schema of graph.filter(
          (node: { "@type": string }) => node["@type"] === "FAQPage"
        )) {
          for (const question of schema.mainEntity) {
            expect(d.body.textContent, route).toContain(question.name);
            expect(d.body.textContent, route).toContain(
              question.acceptedAnswer.text
            );
          }
        }
        expect(d.body.textContent, route).not.toMatch(/undefined|NaN/);
        if (lang === "en") {
          d.querySelectorAll('[lang="ar"]').forEach(n => n.remove());
          expect(d.body.textContent, route).not.toMatch(/[\u0600-\u06ff]/);
        }
        for (const image of Array.from(d.images))
          expect(image.alt, route).not.toBe("");
        for (const a of Array.from(
          d.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')
        )) {
          const decision = classifySpaRoute(a.getAttribute("href")!);
          expect(
            ["known", "redirect"],
            route + " → " + a.getAttribute("href")
          ).toContain(decision.kind);
        }
        dom.window.close();
      }
    }
  });
  it("keeps reciprocal self-canonical language URLs without tracking or secrets", () => {
    for (const p of CENTRAL_INDEXABLE_PATHS) {
      const ar = centralSeo(p, "ar")!,
        en = centralSeo(p, "en")!;
      expect(ar.alternates).toEqual(en.alternates);
      expect(en.canonical).toContain("?lang=en");
    }
    const html = renderCentralDocument(
      template,
      "/login?lang=en&email=private%40example.com&token=secret&utm_source=test"
    );
    expect(html).not.toContain("private@example.com");
    expect(html).not.toContain("token=secret");
    expect(html).not.toContain("utm_source");
    expect(
      centralSeo("/reset-password/" + "a".repeat(64), "en")!.canonical
    ).toBe("https://sary.live/reset-password?lang=en");
  });
  it("excludes accounts and transactions from indexable sitemaps", async () => {
    const xml = (await generatePagesSitemap()) + (await generateBlogSitemap());
    for (const p of CENTRAL_INDEXABLE_PATHS) {
      expect(xml).toContain("<loc>https://sary.live" + p + "</loc>");
      expect(xml).toContain("<loc>https://sary.live" + p + "?lang=en</loc>");
    }
    expect((xml.match(/<loc>/g) || []).length).toBe(
      CENTRAL_INDEXABLE_PATHS.length * 2
    );
    expect(xml).not.toMatch(
      /\/login|\/signup|\/subscribe|\/pay<|\/payment|localhost|127\.0\.0\.1|<lastmod>/
    );
    for (const p of [
      "/login",
      "/signup",
      "/reset-password",
      "/accept-invite",
      "/subscribe",
      "/payment/return",
      "/pay",
    ])
      expect(centralSeo(p, "ar")!.noindex).toBe(true);
  });
  it("ships local responsive photos, a social image and licensed fonts", () => {
    for (const file of [
      "founder-640.webp",
      "founder-1024.webp",
      "team-640.webp",
      "team-1024.webp",
      "social.jpg",
      "fonts/OFL.txt",
      "fonts/IBMPlexSansArabic-Regular.ttf",
    ])
      expect(existsSync("client/public/central/" + file), file).toBe(true);
    const css = readFileSync("client/public/central/central.css", "utf8");
    expect(css).not.toMatch(/ExpoArabic|ForWebDemonstrationOnly/);
    expect(css).toMatch(/font-display:\s*swap/);
  });
  it("allows only same-site subscription return targets", () => {
    expect(safeCheckoutReturn("/subscribe/2?billing=yearly", "en")).toBe(
      "/subscribe/2?billing=yearly&lang=en"
    );
    for (const p of [
      "//evil.test/subscribe/2",
      "https://evil.test/subscribe/2",
      "javascript:alert(1)",
      "/admin/dashboard",
      "/subscribe/../../admin",
    ])
      expect(safeCheckoutReturn(p, "en")).toBeNull();
  });
});

describe("central landing: production HTTP delivery", () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    serveStatic(app, path.resolve("client"));
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  });
  afterAll(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      )
  );
  it("serves full English HTML before JavaScript and Arabic HTML by default", async () => {
    for (const [route, language] of [
      ["/", "ar"],
      ["/solutions/sales?lang=en", "en"],
      ["/resources/blog/measure-impact?lang=en", "en"],
    ]) {
      const r = await fetch(base + route);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-language")).toBe(language);
      const html = await r.text();
      expect(html).toContain("<h1");
      expect(html).toContain("data-central-seo");
    }
  });
  it("keeps noindex headers, aliases and actual 404 statuses", async () => {
    const login = await fetch(base + "/login?lang=en");
    expect(login.headers.get("x-robots-tag")).toContain("noindex");
    expect(login.headers.get("referrer-policy")).toBe("no-referrer");
    const alias = await fetch(base + "/register?lang=en", {
      redirect: "manual",
    });
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("/signup?lang=en");
    expect(
      (await fetch(base + "/solutions/clinics/not-a-service")).status
    ).toBe(404);
    expect((await fetch(base + "/resources/blog/does-not-exist")).status).toBe(
      404
    );
    expect(
      (await fetch(base + "/merchant/dashboard")).headers.get("x-robots-tag")
    ).toContain("noindex");
  });
});
