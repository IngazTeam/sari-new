/**
 * Sitemap Generator
 * Generates XML sitemap for SEO
 */

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

export function generateSitemap(entries: SitemapEntry[]): string {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://sari.app";

  const xmlEntries = entries
    .map((entry) => {
      const lastmod = entry.lastmod || new Date().toISOString().split("T")[0];
      const changefreq = entry.changefreq || "weekly";
      const priority = entry.priority || 0.8;

      return `  <url>
    <loc>${baseUrl}${entry.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}

export function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /private

Sitemap: https://sari.app/sitemap.xml
Crawl-delay: 1

User-agent: Googlebot
Allow: /
Crawl-delay: 0.5

User-agent: Bingbot
Allow: /
Crawl-delay: 1`;
}

// Default sitemap entries
export const defaultSitemapEntries: SitemapEntry[] = [
  {
    url: "/",
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    url: "/pricing",
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    url: "/features",
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    url: "/about",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    url: "/contact",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    url: "/blog",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    url: "/privacy",
    changefreq: "yearly",
    priority: 0.5,
  },
  {
    url: "/terms",
    changefreq: "yearly",
    priority: 0.5,
  },
];

// Component to render sitemap
export function SitemapComponent() {
  const sitemap = generateSitemap(defaultSitemapEntries);

  return (
    <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
      {sitemap}
    </pre>
  );
}
