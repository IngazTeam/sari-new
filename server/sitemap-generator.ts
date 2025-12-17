import * as db from './db';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * Generate main sitemap index
 */
export async function generateSitemapIndex(): Promise<string> {
  const sitemaps = [
    {
      loc: 'https://sari.manus.space/sitemap-pages.xml',
      lastmod: new Date().toISOString().split('T')[0],
    },
    {
      loc: 'https://sari.manus.space/sitemap-blog.xml',
      lastmod: new Date().toISOString().split('T')[0],
    },
    {
      loc: 'https://sari.manus.space/sitemap-products.xml',
      lastmod: new Date().toISOString().split('T')[0],
    },
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  sitemaps.forEach(sitemap => {
    xml += '  <sitemap>\n';
    xml += `    <loc>${escapeXml(sitemap.loc)}</loc>\n`;
    if (sitemap.lastmod) {
      xml += `    <lastmod>${sitemap.lastmod}</lastmod>\n`;
    }
    xml += '  </sitemap>\n';
  });

  xml += '</sitemapindex>';
  return xml;
}

/**
 * Generate sitemap for main pages
 */
export async function generatePagesSitemap(): Promise<string> {
  const pages: SitemapUrl[] = [
    {
      loc: 'https://sari.manus.space/',
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      loc: 'https://sari.manus.space/products',
      changefreq: 'weekly',
      priority: 0.9,
    },
    {
      loc: 'https://sari.manus.space/pricing',
      changefreq: 'weekly',
      priority: 0.9,
    },
    {
      loc: 'https://sari.manus.space/solutions/sales',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/solutions/marketing',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/solutions/support',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/resources/blog',
      changefreq: 'weekly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/resources/help-center',
      changefreq: 'weekly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/resources/success-stories',
      changefreq: 'monthly',
      priority: 0.7,
    },
    {
      loc: 'https://sari.manus.space/company/about',
      changefreq: 'yearly',
      priority: 0.7,
    },
    {
      loc: 'https://sari.manus.space/company/contact',
      changefreq: 'yearly',
      priority: 0.6,
    },
    {
      loc: 'https://sari.manus.space/company/terms',
      changefreq: 'yearly',
      priority: 0.5,
    },
    {
      loc: 'https://sari.manus.space/company/privacy',
      changefreq: 'yearly',
      priority: 0.5,
    },
  ];

  return generateSitemap(pages);
}

/**
 * Generate sitemap for blog posts
 */
export async function generateBlogSitemap(): Promise<string> {
  // في الواقع، ستحصل على البيانات من قاعدة البيانات
  // هنا مثال على البيانات
  const pages: SitemapUrl[] = [
    {
      loc: 'https://sari.manus.space/blog/getting-started-with-sari',
      lastmod: '2024-01-15',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/blog/whatsapp-marketing-tips',
      lastmod: '2024-01-10',
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: 'https://sari.manus.space/blog/ai-chatbot-best-practices',
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
  // في الواقع، ستحصل على البيانات من قاعدة البيانات
  const pages: SitemapUrl[] = [
    {
      loc: 'https://sari.manus.space/products/ai-sales-agent',
      lastmod: new Date().toISOString().split('T')[0],
      changefreq: 'monthly',
      priority: 0.9,
    },
    {
      loc: 'https://sari.manus.space/products/marketing-automation',
      lastmod: new Date().toISOString().split('T')[0],
      changefreq: 'monthly',
      priority: 0.9,
    },
    {
      loc: 'https://sari.manus.space/products/customer-support',
      lastmod: new Date().toISOString().split('T')[0],
      changefreq: 'monthly',
      priority: 0.9,
    },
  ];

  return generateSitemap(pages);
}

/**
 * Helper function to generate sitemap XML
 */
function generateSitemap(urls: SitemapUrl[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
  xml += ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';

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
    .replace(/[<]/g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/[&]/g, '&amp;')
    .replace(/['"]/g, (c) => ({
      "'": '&apos;',
      '"': '&quot;',
    }[c] || c));
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
      schema.name = 'Sari';
      schema.url = 'https://sari.manus.space';
      schema.logo = 'https://sari.manus.space/logo.png';
      schema.description = 'AI Sales Agent for WhatsApp - Automate your sales conversations';
      schema.sameAs = [
        'https://twitter.com/sari',
        'https://linkedin.com/company/sari',
      ];
      break;

    case 'Product':
      schema.name = data.name || 'Sari AI Sales Agent';
      schema.description = data.description || 'AI-powered sales automation for WhatsApp';
      schema.url = data.url || 'https://sari.manus.space';
      schema.image = data.image || 'https://sari.manus.space/product-image.png';
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
        name: 'Sari',
      };
      break;
  }

  return JSON.stringify(schema, null, 2);
}
