// Sitemap Generator - static pages only, no DB dependency

// ─── Dynamic Domain ─────────────────────────────
// Uses VITE_APP_URL or falls back to sary.live
const BASE_URL = (process.env.VITE_APP_URL || process.env.APP_URL || 'https://sary.live').replace(/\/$/, '');

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  alternates?: { lang: string; href: string }[];
}

/**
 * Generate main sitemap index
 */
export async function generateSitemapIndex(): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const sitemaps = [
    { loc: `${BASE_URL}/sitemap-pages.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-blog.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-products.xml`, lastmod: today },
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  sitemaps.forEach(sitemap => {
    xml += '  <sitemap>\n';
    xml += `    <loc>${escapeXml(sitemap.loc)}</loc>\n`;
    xml += `    <lastmod>${sitemap.lastmod}</lastmod>\n`;
    xml += '  </sitemap>\n';
  });

  xml += '</sitemapindex>';
  return xml;
}

/**
 * Generate sitemap for main pages with hreflang
 */
export async function generatePagesSitemap(): Promise<string> {
  const pages: SitemapUrl[] = [
    {
      loc: `${BASE_URL}/`,
      changefreq: 'weekly',
      priority: 1.0,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/` },
        { lang: 'en', href: `${BASE_URL}/?lang=en` },
        { lang: 'x-default', href: `${BASE_URL}/` },
      ],
    },
    {
      loc: `${BASE_URL}/pricing`,
      changefreq: 'weekly',
      priority: 0.9,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/pricing` },
        { lang: 'en', href: `${BASE_URL}/pricing?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/try-sari`,
      changefreq: 'monthly',
      priority: 0.9,
    },
    {
      loc: `${BASE_URL}/solutions/sales`,
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${BASE_URL}/solutions/marketing`,
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${BASE_URL}/solutions/support`,
      changefreq: 'monthly',
      priority: 0.8,
    },
    // ─── SEO Money Pages ───
    {
      loc: `${BASE_URL}/ai-whatsapp-sales-agent`,
      changefreq: 'weekly',
      priority: 0.95,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/ai-whatsapp-sales-agent` },
        { lang: 'en', href: `${BASE_URL}/ai-whatsapp-sales-agent?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/whatsapp-ordering-system`,
      changefreq: 'weekly',
      priority: 0.9,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/whatsapp-ordering-system` },
        { lang: 'en', href: `${BASE_URL}/whatsapp-ordering-system?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/whatsapp-booking-system`,
      changefreq: 'weekly',
      priority: 0.9,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/whatsapp-booking-system` },
        { lang: 'en', href: `${BASE_URL}/whatsapp-booking-system?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/ai-customer-service-whatsapp`,
      changefreq: 'weekly',
      priority: 0.9,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/ai-customer-service-whatsapp` },
        { lang: 'en', href: `${BASE_URL}/ai-customer-service-whatsapp?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/conversational-commerce-platform`,
      changefreq: 'weekly',
      priority: 0.9,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/conversational-commerce-platform` },
        { lang: 'en', href: `${BASE_URL}/conversational-commerce-platform?lang=en` },
      ],
    },
    // ─── SEO Vertical Industry Pages — Arabic only ───
    {
      loc: `${BASE_URL}/solutions/clinics`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/clinics` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/clinics` },
      ],
    },
    {
      loc: `${BASE_URL}/solutions/restaurants`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/restaurants` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/restaurants` },
      ],
    },
    {
      loc: `${BASE_URL}/solutions/salons`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/salons` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/salons` },
      ],
    },
    {
      loc: `${BASE_URL}/solutions/training-centers`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/training-centers` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/training-centers` },
      ],
    },
    {
      loc: `${BASE_URL}/solutions/real-estate`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/real-estate` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/real-estate` },
      ],
    },
    {
      loc: `${BASE_URL}/solutions/consultants`,
      changefreq: 'weekly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/consultants` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/consultants` },
      ],
    },
    // ─── SEO Vertical Industry Sub-Pages (Services) — Arabic only ───
    ...['appointment-booking', 'no-show-reminders', 'patient-inquiries'].map(slug => ({
      loc: `${BASE_URL}/solutions/clinics/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/clinics/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/clinics/${slug}` },
      ],
    })),
    ...['whatsapp-ordering', 'digital-menu-payment', 'delivery-repeat-orders'].map(slug => ({
      loc: `${BASE_URL}/solutions/restaurants/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/restaurants/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/restaurants/${slug}` },
      ],
    })),
    ...['appointment-booking', 'deposits-service-menu', 'loyalty-campaigns'].map(slug => ({
      loc: `${BASE_URL}/solutions/salons/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/salons/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/salons/${slug}` },
      ],
    })),
    ...['course-registration', 'class-reminders-certificates', 'course-marketing'].map(slug => ({
      loc: `${BASE_URL}/solutions/training-centers/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/training-centers/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/training-centers/${slug}` },
      ],
    })),
    ...['lead-qualification', 'property-catalog', 'viewing-followup'].map(slug => ({
      loc: `${BASE_URL}/solutions/real-estate/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/real-estate/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/real-estate/${slug}` },
      ],
    })),
    ...['consultation-booking', 'advance-payment', 'client-followup'].map(slug => ({
      loc: `${BASE_URL}/solutions/consultants/${slug}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/solutions/consultants/${slug}` },
        { lang: 'x-default', href: `${BASE_URL}/solutions/consultants/${slug}` },
      ],
    })),
    // ─── Knowledge Engine (Docs) ───
    {
      loc: `${BASE_URL}/docs/how-sari-works`,
      changefreq: 'monthly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/docs/how-sari-works` },
        { lang: 'en', href: `${BASE_URL}/docs/how-sari-works?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/docs/whatsapp-payment-guide`,
      changefreq: 'monthly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/docs/whatsapp-payment-guide` },
        { lang: 'en', href: `${BASE_URL}/docs/whatsapp-payment-guide?lang=en` },
      ],
    },
    {
      loc: `${BASE_URL}/docs/ai-sales-guide`,
      changefreq: 'monthly',
      priority: 0.85,
      alternates: [
        { lang: 'ar', href: `${BASE_URL}/docs/ai-sales-guide` },
        { lang: 'en', href: `${BASE_URL}/docs/ai-sales-guide?lang=en` },
      ],
    },
    // ─── Standard Pages ───
    {
      loc: `${BASE_URL}/resources/blog`,
      changefreq: 'weekly',
      priority: 0.8,
    },
    {
      loc: `${BASE_URL}/resources/help-center`,
      changefreq: 'weekly',
      priority: 0.7,
    },
    {
      loc: `${BASE_URL}/resources/success-stories`,
      changefreq: 'monthly',
      priority: 0.7,
    },
    {
      loc: `${BASE_URL}/company/about`,
      changefreq: 'yearly',
      priority: 0.6,
    },
    {
      loc: `${BASE_URL}/company/contact`,
      changefreq: 'yearly',
      priority: 0.6,
    },
    {
      loc: `${BASE_URL}/company/terms`,
      changefreq: 'yearly',
      priority: 0.4,
    },
    {
      loc: `${BASE_URL}/company/privacy`,
      changefreq: 'yearly',
      priority: 0.4,
    },
    {
      loc: `${BASE_URL}/login`,
      changefreq: 'yearly',
      priority: 0.3,
    },
    {
      loc: `${BASE_URL}/signup`,
      changefreq: 'yearly',
      priority: 0.5,
    },
  ];

  return generateSitemap(pages);
}

/**
 * Generate sitemap for blog posts (dynamic from DB when available)
 */
export async function generateBlogSitemap(): Promise<string> {
  const pages: SitemapUrl[] = [
    {
      loc: `${BASE_URL}/blog/getting-started-with-sari`,
      lastmod: '2024-01-15',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${BASE_URL}/blog/whatsapp-marketing-tips`,
      lastmod: '2024-01-10',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${BASE_URL}/blog/ai-chatbot-best-practices`,
      lastmod: '2024-01-05',
      changefreq: 'monthly',
      priority: 0.8,
    },
  ];

  return generateSitemap(pages);
}

/**
 * Generate sitemap for products
 */
export async function generateProductsSitemap(): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const pages: SitemapUrl[] = [
    {
      loc: `${BASE_URL}/products/ai-sales-agent`,
      lastmod: today,
      changefreq: 'monthly',
      priority: 0.9,
    },
    {
      loc: `${BASE_URL}/products/marketing-automation`,
      lastmod: today,
      changefreq: 'monthly',
      priority: 0.9,
    },
    {
      loc: `${BASE_URL}/products/customer-support`,
      lastmod: today,
      changefreq: 'monthly',
      priority: 0.9,
    },
  ];

  return generateSitemap(pages);
}

/**
 * Helper function to generate sitemap XML with hreflang support
 */
function generateSitemap(urls: SitemapUrl[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += ' xmlns:xhtml="http://www.w3.org/1999/xhtml"';
  xml += ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;

    if (url.lastmod) {
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    }

    if (url.changefreq) {
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    }

    if (url.priority !== undefined) {
      xml += `    <priority>${url.priority.toFixed(1)}</priority>\n`;
    }

    // hreflang alternates
    if (url.alternates) {
      url.alternates.forEach(alt => {
        xml += `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${escapeXml(alt.href)}" />\n`;
      });
    }

    xml += '  </url>\n';
  });

  xml += '</urlset>';
  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/[&]/g, '&amp;')
    .replace(/[<]/g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/["]/g, '&quot;')
    .replace(/[']/g, '&apos;');
}

/**
 * Generate structured data (Schema.org)
 */
export function generateSchemaOrgData(type: 'Organization' | 'Product' | 'Article', data: any): string {
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': type,
  };

  switch (type) {
    case 'Organization':
      schema.name = 'ساري | Sari';
      schema.url = BASE_URL;
      schema.logo = `${BASE_URL}/sari-logo.png`;
      schema.description = 'AI Sales Agent for WhatsApp - Automate your sales conversations';
      schema.sameAs = [];
      break;

    case 'Product':
      schema.name = data.name || 'Sari AI Sales Agent';
      schema.description = data.description || 'AI-powered sales automation for WhatsApp';
      schema.url = data.url || BASE_URL;
      schema.image = data.image || `${BASE_URL}/og-image.png`;
      if (data.price) {
        schema.offers = {
          '@type': 'Offer',
          price: data.price,
          priceCurrency: 'SAR',
          availability: 'https://schema.org/InStock',
        };
      }
      break;

    case 'Article':
      schema.headline = data.title || 'Article';
      schema.description = data.description || '';
      schema.image = data.image || '';
      schema.datePublished = data.publishedDate || new Date().toISOString();
      schema.author = {
        '@type': 'Organization',
        name: 'ساري | Sari',
      };
      break;
  }

  return JSON.stringify(schema, null, 2);
}
