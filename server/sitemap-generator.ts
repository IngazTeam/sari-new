import {
  CENTRAL_ORIGIN,
  CENTRAL_INDEXABLE_PATHS,
  centralCatalog,
  centralHref,
} from "../shared/central/catalog";
const BASE_URL = CENTRAL_ORIGIN;
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
function sitemap(paths: readonly string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    paths
      .flatMap(path =>
        ["ar", "en"].map(language => {
          const lang = language as "ar" | "en";
          const alternatives = [
            ["ar", path],
            ["en", centralHref(path, "en")],
            ["x-default", path],
          ];
          return (
            "  <url><loc>" +
            escapeXml(BASE_URL + centralHref(path, lang)) +
            "</loc>" +
            alternatives
              .map(
                ([code, href]) =>
                  '<xhtml:link rel="alternate" hreflang="' +
                  code +
                  '" href="' +
                  escapeXml(BASE_URL + href) +
                  '"/>'
              )
              .join("") +
            "</url>"
          );
        })
      )
      .join("\n") +
    "\n</urlset>"
  );
}
export async function generateSitemapIndex(): Promise<string> {
  // No fabricated daily lastmod: content dates change only when content changes.
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>' +
    BASE_URL +
    "/sitemap-pages.xml</loc></sitemap><sitemap><loc>" +
    BASE_URL +
    "/sitemap-blog.xml</loc></sitemap></sitemapindex>"
  );
}
export async function generatePagesSitemap(): Promise<string> {
  return sitemap(
    CENTRAL_INDEXABLE_PATHS.filter(
      path => centralCatalog.ar[path].kind !== "article"
    )
  );
}
export async function generateBlogSitemap(): Promise<string> {
  return sitemap(
    CENTRAL_INDEXABLE_PATHS.filter(
      path => centralCatalog.ar[path].kind === "article"
    )
  );
}
export async function generateProductsSitemap(): Promise<string> {
  return sitemap([]);
}

export function generateSchemaOrgData(
  type: "Organization" | "Product" | "Article",
  data: any
): string {
  const schema: any = {
    "@context": "https://schema.org",
    "@type": type,
  };

  switch (type) {
    case "Organization":
      schema.name = "ساري | Sari";
      schema.url = BASE_URL;
      schema.logo = `${BASE_URL}/sari-logo.png`;
      schema.description =
        "AI Sales Agent for WhatsApp - Automate your sales conversations";
      schema.sameAs = [];
      break;

    case "Product":
      schema.name = data.name || "Sari AI Sales Agent";
      schema.description =
        data.description || "AI-powered sales automation for WhatsApp";
      schema.url = data.url || BASE_URL;
      schema.image = data.image || `${BASE_URL}/og-image.png`;
      if (data.price) {
        schema.offers = {
          "@type": "Offer",
          price: data.price,
          priceCurrency: "SAR",
          availability: "https://schema.org/InStock",
        };
      }
      break;

    case "Article":
      schema.headline = data.title || "Article";
      schema.description = data.description || "";
      schema.image = data.image || "";
      schema.datePublished = data.publishedDate || new Date().toISOString();
      schema.author = {
        "@type": "Organization",
        name: "ساري | Sari",
      };
      break;
  }

  return JSON.stringify(schema, null, 2);
}
