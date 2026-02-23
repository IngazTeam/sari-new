/**
 * Website Analyzer Service
 * 
 * خدمة تحليل المواقع الذكية باستخدام AI
 * تقوم بتحليل شامل للمواقع الإلكترونية واستخراج المعلومات المهمة
 */

import { invokeLLM } from "./llm";
import { JSDOM } from "jsdom";
import { execSync } from "child_process";

/**
 * Fetch URL using curl as fallback when Node.js fetch is blocked by Cloudflare.
 * Cloudflare's TLS fingerprinting blocks Node.js fetch but allows curl.
 */
async function curlFetch(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const headerArgs = Object.entries(headers || {})
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(' ');

    const cmd = `curl -4 -s --max-time 15 -w "\\n__HTTP_STATUS__%{http_code}" ${headerArgs} "${url}"`;
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

    // Extract HTTP status from the last line
    const statusMatch = output.match(/__HTTP_STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 0;
    const body = output.replace(/__HTTP_STATUS__\d+$/, '').trim();

    return { ok: status >= 200 && status < 300, status, body };
  } catch (error) {
    console.warn('[WebsiteAnalyzer] curlFetch failed:', error instanceof Error ? error.message : 'unknown');
    return { ok: false, status: 0, body: '' };
  }
}

// ============================================
// Types & Interfaces
// ============================================

export interface WebsiteAnalysisResult {
  // Basic Info
  title: string;
  description: string;
  industry: string;
  language: string;

  // SEO Analysis
  seoScore: number;
  seoIssues: string[];
  metaTags: {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };

  // Performance Analysis
  performanceScore: number;
  loadTime: number;
  pageSize: number;

  // UX Analysis
  uxScore: number;
  mobileOptimized: boolean;
  hasContactInfo: boolean;
  hasWhatsapp: boolean;

  // Content Analysis
  contentQuality: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;

  // Overall Score
  overallScore: number;
}

export interface ExtractedProduct {
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  tags?: string[];
  inStock: boolean;
  confidence: number;
}

export interface WebsiteInsight {
  category: 'seo' | 'performance' | 'ux' | 'content' | 'marketing' | 'security';
  type: 'strength' | 'weakness' | 'opportunity' | 'threat' | 'recommendation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation?: string;
  impact?: string;
  confidence: number;
}

// ============================================
// Core Functions
// ============================================

/**
 * استخراج محتوى الموقع — with retry and anti-bot headers
 */
export async function scrapeWebsite(url: string): Promise<{
  html: string;
  dom: JSDOM;
  text: string;
}> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
  ];

  let lastError: Error | null = null;

  for (const ua of userAgents) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
        continue;
      }

      const html = await response.text();

      // If we got a Cloudflare challenge page, try next UA
      if (html.includes('cf-browser-verification') || html.includes('challenge-platform') ||
        (html.length < 1000 && html.includes('Just a moment'))) {
        console.warn(`[WebsiteAnalyzer] Cloudflare challenge detected with UA: ${ua.substring(0, 30)}...`);
        lastError = new Error('Cloudflare challenge detected');
        continue;
      }

      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Remove script/style tags for cleaner text
      document.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      const text = (document.body?.textContent || '').replace(/\s+/g, ' ').trim();

      console.log(`[WebsiteAnalyzer] Scraped ${url} — ${html.length} bytes, ${text.length} chars text`);
      return { html, dom, text };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[WebsiteAnalyzer] Fetch attempt failed (${ua.substring(0, 20)}...):`, lastError.message);
    }
  }

  throw new Error(`Failed to scrape website after ${userAgents.length} attempts: ${lastError?.message}`);
}


/**
 * تحليل SEO للموقع
 */
export function analyzeSEO(dom: JSDOM): {
  score: number;
  issues: string[];
  metaTags: any;
} {
  const document = dom.window.document;
  const issues: string[] = [];
  let score = 100;

  // Extract meta tags
  const metaTags: any = {};

  const titleTag = document.querySelector('title');
  metaTags.title = titleTag?.textContent || '';
  if (!metaTags.title || metaTags.title.length < 10) {
    issues.push('عنوان الصفحة قصير جداً أو غير موجود');
    score -= 15;
  }

  const descriptionTag = document.querySelector('meta[name="description"]');
  metaTags.description = descriptionTag?.getAttribute('content') || '';
  if (!metaTags.description || metaTags.description.length < 50) {
    issues.push('وصف الصفحة قصير جداً أو غير موجود');
    score -= 15;
  }

  const keywordsTag = document.querySelector('meta[name="keywords"]');
  metaTags.keywords = keywordsTag?.getAttribute('content') || '';

  // Open Graph tags
  metaTags.ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  metaTags.ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
  metaTags.ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

  if (!metaTags.ogTitle) {
    issues.push('عنوان Open Graph غير موجود');
    score -= 10;
  }

  if (!metaTags.ogImage) {
    issues.push('صورة Open Graph غير موجودة');
    score -= 10;
  }

  // Check for heading structure
  const h1Tags = document.querySelectorAll('h1');
  if (h1Tags.length === 0) {
    issues.push('لا يوجد عنوان رئيسي (H1) في الصفحة');
    score -= 10;
  } else if (h1Tags.length > 1) {
    issues.push('يوجد أكثر من عنوان رئيسي (H1) في الصفحة');
    score -= 5;
  }

  // Check for alt text on images
  const images = document.querySelectorAll('img');
  let imagesWithoutAlt = 0;
  images.forEach(img => {
    if (!img.getAttribute('alt')) {
      imagesWithoutAlt++;
    }
  });
  if (imagesWithoutAlt > 0) {
    issues.push(`${imagesWithoutAlt} صورة بدون نص بديل (alt text)`);
    score -= Math.min(10, imagesWithoutAlt * 2);
  }

  return {
    score: Math.max(0, score),
    issues,
    metaTags
  };
}

/**
 * تحليل الأداء
 */
export function analyzePerformance(html: string, dom: JSDOM): {
  score: number;
  loadTime: number;
  pageSize: number;
} {
  const document = dom.window.document;
  let score = 100;

  // Calculate page size
  const pageSize = Buffer.byteLength(html, 'utf8');

  // Estimate load time based on page size (rough estimation)
  const loadTime = Math.round((pageSize / 1024) * 0.1); // milliseconds per KB

  // Penalize large pages
  if (pageSize > 5 * 1024 * 1024) { // > 5MB
    score -= 30;
  } else if (pageSize > 2 * 1024 * 1024) { // > 2MB
    score -= 15;
  }

  // Check for optimization issues
  const images = document.querySelectorAll('img');
  const scripts = document.querySelectorAll('script');
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');

  if (images.length > 50) {
    score -= 10;
  }

  if (scripts.length > 20) {
    score -= 10;
  }

  if (stylesheets.length > 10) {
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    loadTime,
    pageSize
  };
}

/**
 * تحليل تجربة المستخدم (UX)
 */
export function analyzeUX(dom: JSDOM, text: string): {
  score: number;
  mobileOptimized: boolean;
  hasContactInfo: boolean;
  hasWhatsapp: boolean;
} {
  const document = dom.window.document;
  let score = 100;

  // Check for viewport meta tag (mobile optimization)
  const viewportTag = document.querySelector('meta[name="viewport"]');
  const mobileOptimized = !!viewportTag;
  if (!mobileOptimized) {
    score -= 20;
  }

  // Check for contact information
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const hasPhone = phoneRegex.test(text);
  const hasEmail = emailRegex.test(text);
  const hasContactInfo = hasPhone || hasEmail;

  if (!hasContactInfo) {
    score -= 15;
  }

  // Check for WhatsApp
  const whatsappRegex = /whatsapp|واتساب|واتس اب/gi;
  const hasWhatsapp = whatsappRegex.test(text) ||
    !!document.querySelector('a[href*="wa.me"]') ||
    !!document.querySelector('a[href*="whatsapp"]');

  if (!hasWhatsapp) {
    score -= 10;
  }

  // Check for navigation
  const nav = document.querySelector('nav');
  if (!nav) {
    score -= 10;
  }

  // Check for footer
  const footer = document.querySelector('footer');
  if (!footer) {
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    mobileOptimized,
    hasContactInfo,
    hasWhatsapp
  };
}

/**
 * تحليل المحتوى
 */
export function analyzeContent(dom: JSDOM, text: string): {
  score: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
} {
  const document = dom.window.document;
  let score = 100;

  // Count words
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;

  if (wordCount < 300) {
    score -= 20;
  } else if (wordCount < 500) {
    score -= 10;
  }

  // Count images
  const imageCount = document.querySelectorAll('img').length;
  if (imageCount === 0) {
    score -= 15;
  }

  // Count videos
  const videoCount = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length;

  return {
    score: Math.max(0, score),
    wordCount,
    imageCount,
    videoCount
  };
}

/**
 * تحليل شامل للموقع
 */
export async function analyzeWebsite(url: string): Promise<WebsiteAnalysisResult> {
  try {
    console.log('[WebsiteAnalyzer] Analyzing website:', url);

    // Scrape website
    const { html, dom, text } = await scrapeWebsite(url);
    const document = dom.window.document;

    // Basic info
    const title = document.querySelector('title')?.textContent || '';
    const descriptionTag = document.querySelector('meta[name="description"]');
    const description = descriptionTag?.getAttribute('content') || '';

    // Run all analyses
    const seoAnalysis = analyzeSEO(dom);
    const performanceAnalysis = analyzePerformance(html, dom);
    const uxAnalysis = analyzeUX(dom, text);
    const contentAnalysis = analyzeContent(dom, text);

    // Detect language
    const htmlLang = document.documentElement.lang || '';
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const language = isArabic ? 'ar' : (htmlLang || 'en');

    // Calculate overall score
    const overallScore = Math.round(
      (seoAnalysis.score * 0.3) +
      (performanceAnalysis.score * 0.25) +
      (uxAnalysis.score * 0.25) +
      (contentAnalysis.score * 0.2)
    );

    // Detect industry using AI
    const industry = await detectIndustry(title, description, text);

    return {
      title,
      description,
      industry,
      language,
      seoScore: seoAnalysis.score,
      seoIssues: seoAnalysis.issues,
      metaTags: seoAnalysis.metaTags,
      performanceScore: performanceAnalysis.score,
      loadTime: performanceAnalysis.loadTime,
      pageSize: performanceAnalysis.pageSize,
      uxScore: uxAnalysis.score,
      mobileOptimized: uxAnalysis.mobileOptimized,
      hasContactInfo: uxAnalysis.hasContactInfo,
      hasWhatsapp: uxAnalysis.hasWhatsapp,
      contentQuality: contentAnalysis.score,
      wordCount: contentAnalysis.wordCount,
      imageCount: contentAnalysis.imageCount,
      videoCount: contentAnalysis.videoCount,
      overallScore
    };
  } catch (error) {
    console.error('[WebsiteAnalyzer] Error analyzing website:', error);
    throw error;
  }
}

/**
 * Extract Zid store-id from HTML shell.
 * Zid SPAs always include the store-id in the initial HTML (in JS variables or headers).
 */
function extractZidStoreId(html: string): string | null {
  // Pattern 1: store-id in JavaScript headers/config
  const storeIdPatterns = [
    /["']store-id["']\s*:\s*["']([a-f0-9-]{36})["']/i,
    /store[_-]?id\s*[=:]\s*["']([a-f0-9-]{36})["']/i,
    /RaqeebStoreId\s*[=:]\s*["']([a-f0-9-]{36})["']/i,
    /store_uuid\s*[=:]\s*["']([a-f0-9-]{36})["']/i,
  ];

  for (const pattern of storeIdPatterns) {
    const match = html.match(pattern);
    if (match) {
      console.log(`[WebsiteAnalyzer] Found Zid store-id: ${match[1]}`);
      return match[1];
    }
  }

  return null;
}

/**
 * Detect if a website is built on Zid platform
 */
function isZidStore(html: string): boolean {
  return html.includes('zid.store') ||
    html.includes('zid.sa') ||
    html.includes('static.zid.store') ||
    html.includes('zidStore') ||
    html.includes('window.zid');
}

/**
 * Detect if a website is built on Salla platform
 */
function isSallaStore(html: string): boolean {
  return html.includes('salla.sa') ||
    html.includes('cdn.salla.sa') ||
    html.includes('s-product-card') ||
    html.includes('salla.network');
}

/**
 * Try to discover Zid store-id by fetching the page with a lightweight request.
 * Cloudflare may block the main page but allow API-like requests.
 * Also tries common Zid JS asset URLs that contain the store config.
 */
async function discoverZidStoreId(url: string): Promise<string | null> {
  const baseUrl = new URL(url).origin;

  // Try fetching the main page with Googlebot (often bypasses Cloudflare)
  const attempts = [
    { url: url, ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    { url: `${baseUrl}/manifest.json`, ua: 'Mozilla/5.0' },
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(attempt.url, {
        headers: {
          'User-Agent': attempt.ua,
          'Accept': '*/*',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const text = await response.text();
      const storeId = extractZidStoreId(text);
      if (storeId) {
        console.log(`[WebsiteAnalyzer] Discovered Zid store-id from ${attempt.url}: ${storeId}`);
        return storeId;
      }
    } catch {
      // Skip failed attempts
    }
  }

  // Last resort: try Zid API without store-id to see if it auto-resolves
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/api/v1/products`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // If we get a JSON response with store info, extract store-id from headers or response
    if (response.ok) {
      const storeIdHeader = response.headers.get('x-store-id') || response.headers.get('store-id');
      if (storeIdHeader) {
        console.log(`[WebsiteAnalyzer] Discovered Zid store-id from API response headers: ${storeIdHeader}`);
        return storeIdHeader;
      }
    }
  } catch {
    // Skip
  }

  console.log('[WebsiteAnalyzer] Could not discover Zid store-id');
  return null;
}

/**
 * استخراج المنتجات من الموقع — multi-strategy with enrichment
 * 1. JSON-LD structured data (most e-commerce platforms embed this)
 * 2. HTML product patterns (price + title selectors)
 * 3. Salla/Zid/Shopify API endpoints (with platform detection)
 * 4. AI extraction from text as fallback
 * 
 * If early strategies return sparse data (no description/images),
 * we merge with AI enrichment.
 */
export async function extractProducts(url: string, html: string, text: string): Promise<ExtractedProduct[]> {
  try {
    console.log('[WebsiteAnalyzer] Extracting products from:', url);
    console.log(`[WebsiteAnalyzer] HTML length: ${html.length}, Text length: ${text.length}`);

    // Detect platform and extract store metadata
    const zidStoreId = extractZidStoreId(html);
    const isZid = isZidStore(html);
    const isSalla = isSallaStore(html);
    const htmlEmpty = html.length < 500; // Scraping likely failed (Cloudflare)

    if (isZid) console.log('[WebsiteAnalyzer] Detected Zid platform', zidStoreId ? `(store-id: ${zidStoreId})` : '');
    if (isSalla) console.log('[WebsiteAnalyzer] Detected Salla platform');
    if (htmlEmpty) console.log('[WebsiteAnalyzer] HTML is empty/minimal — scraping likely blocked, trying API-only extraction');

    // Strategy 1: For SPA platforms OR when scraping failed, try API first
    if (isZid || isSalla || htmlEmpty) {
      console.log('[WebsiteAnalyzer] Trying API-first extraction...');

      // If we don't have a store-id from HTML, try to discover it from the API
      const apiProducts = await tryProductsAPI(url, zidStoreId);
      if (apiProducts.length > 0) {
        console.log(`[WebsiteAnalyzer] Found ${apiProducts.length} products via platform API`);
        return apiProducts;
      }

      // If scraping completely failed and API didn't work, try discovering store-id from the page
      if (htmlEmpty && !zidStoreId) {
        console.log('[WebsiteAnalyzer] API without auth failed, trying store-id discovery...');
        const discoveredStoreId = await discoverZidStoreId(url);
        if (discoveredStoreId) {
          const retryProducts = await tryProductsAPI(url, discoveredStoreId);
          if (retryProducts.length > 0) {
            console.log(`[WebsiteAnalyzer] Found ${retryProducts.length} products via discovered store-id`);
            return retryProducts;
          }
        }
      }
    }

    // Strategy 2: Extract from JSON-LD structured data
    const jsonLdProducts = extractFromJsonLD(html, url);
    if (jsonLdProducts.length > 0) {
      console.log(`[WebsiteAnalyzer] Found ${jsonLdProducts.length} products via JSON-LD`);
      return jsonLdProducts; // JSON-LD is the most complete source
    }

    // Strategy 3: Try API endpoints (non-SPA sites)
    if (!isZid && !isSalla) {
      const apiProducts = await tryProductsAPI(url, null);
      if (apiProducts.length > 0) {
        console.log(`[WebsiteAnalyzer] Found ${apiProducts.length} products via API`);
        return apiProducts;
      }
    }

    // Strategy 4: Extract from HTML product patterns
    const htmlProducts = extractFromHTMLPatterns(html, url);
    if (htmlProducts.length > 0) {
      console.log(`[WebsiteAnalyzer] Found ${htmlProducts.length} products via HTML patterns`);
      // HTML extraction often misses descriptions —
      // if most products lack description, try AI enrichment
      const needsEnrichment = htmlProducts.filter(p => !p.description).length > htmlProducts.length * 0.5;
      if (needsEnrichment && text.length >= 200) {
        console.log('[WebsiteAnalyzer] HTML products lack descriptions, attempting AI enrichment...');
        const aiProducts = await extractWithAI(text, url);
        if (aiProducts.length > 0) {
          return mergeProducts(htmlProducts, aiProducts);
        }
      }
      return htmlProducts;
    }

    // Strategy 5: Fall back to AI extraction if we have enough text
    if (text.length < 100) {
      console.warn('[WebsiteAnalyzer] Not enough text content for AI extraction');
      return [];
    }

    return await extractWithAI(text, url);
  } catch (error) {
    console.error('[WebsiteAnalyzer] Error extracting products:', error);
    return [];
  }
}

/**
 * Merge HTML-extracted products with AI-extracted products.
 * Uses name similarity to match products and fill in missing fields.
 */
function mergeProducts(primary: ExtractedProduct[], secondary: ExtractedProduct[]): ExtractedProduct[] {
  return primary.map(p => {
    // Find matching product by name similarity
    const match = secondary.find(s => {
      const pName = p.name.toLowerCase().trim();
      const sName = s.name.toLowerCase().trim();
      return pName === sName || pName.includes(sName) || sName.includes(pName);
    });

    if (!match) return p;

    return {
      ...p,
      description: p.description || match.description,
      imageUrl: p.imageUrl || match.imageUrl,
      category: p.category || match.category,
      tags: p.tags?.length ? p.tags : match.tags,
      price: p.price || match.price,
    };
  });
}

/**
 * AI-based product extraction with image URL support
 */
async function extractWithAI(text: string, url: string): Promise<ExtractedProduct[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `أنت خبير في استخراج معلومات المنتجات من المواقع الإلكترونية. قم بتحليل المحتوى واستخراج قائمة المنتجات أو الخدمات المتاحة.

قواعد مهمة:
- استخرج اسم المنتج كاملاً بدقة
- اكتب وصف مفيد وموجز لكل منتج (إذا لم يوجد وصف صريح، اكتب وصفاً من خلال اسم المنتج وسياق الموقع)
- استخرج السعر بدقة
- إذا وجدت رابط صورة في النص، ضعه في imageUrl. إذا لم تجد صورة اتركه فارغاً
- حدد الفئة (category) لكل منتج

يجب أن تكون الإجابة بصيغة JSON فقط، بدون أي نص إضافي.`
        },
        {
          role: 'user',
          content: `الموقع: ${url}

قم بتحليل محتوى هذا الموقع واستخراج جميع المنتجات أو الخدمات:

${text.substring(0, 12000)}

استخرج المنتجات بالتنسيق التالي (JSON فقط):
{
  "products": [
    {
      "name": "اسم المنتج الكامل",
      "description": "وصف المنتج — اكتب وصفاً مفيداً حتى لو لم يكن موجوداً صراحة",
      "price": 100.00,
      "currency": "SAR",
      "imageUrl": "رابط الصورة إذا وجد في النص أو فارغ",
      "category": "الفئة",
      "tags": ["تاج1", "تاج2"],
      "inStock": true,
      "confidence": 85
    }
  ]
}`
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'product_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    currency: { type: 'string' },
                    imageUrl: { type: 'string' },
                    category: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    inStock: { type: 'boolean' },
                    confidence: { type: 'number' }
                  },
                  required: ['name', 'description', 'price', 'currency', 'imageUrl', 'inStock', 'confidence'],
                  additionalProperties: false
                }
              }
            },
            required: ['products'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content) return [];

    const result = JSON.parse(content as string);
    const products: ExtractedProduct[] = (result.products || []).map((p: any) => ({
      name: p.name || '',
      description: p.description || '',
      price: p.price || 0,
      currency: p.currency || 'SAR',
      imageUrl: (p.imageUrl && p.imageUrl.startsWith('http')) ? p.imageUrl : undefined,
      category: p.category || undefined,
      tags: p.tags || [],
      inStock: p.inStock ?? true,
      confidence: p.confidence || 70,
    }));

    console.log(`[WebsiteAnalyzer] AI extracted ${products.length} products`);
    return products;
  } catch (error) {
    console.error('[WebsiteAnalyzer] AI extraction failed:', error);
    return [];
  }
}

/**
 * Extract products from JSON-LD structured data embedded in HTML
 */
function extractFromJsonLD(html: string, baseUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];

  try {
    // Find all JSON-LD script tags
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Direct Product type
          if (item['@type'] === 'Product') {
            const product = parseJsonLDProduct(item, baseUrl);
            if (product) products.push(product);
          }

          // ItemList containing Products
          if (item['@type'] === 'ItemList' && item.itemListElement) {
            for (const listItem of item.itemListElement) {
              const productData = listItem.item || listItem;
              if (productData['@type'] === 'Product') {
                const product = parseJsonLDProduct(productData, baseUrl);
                if (product) products.push(product);
              }
            }
          }

          // Handle @graph arrays (common in Salla)
          if (item['@graph']) {
            for (const graphItem of item['@graph']) {
              if (graphItem['@type'] === 'Product') {
                const product = parseJsonLDProduct(graphItem, baseUrl);
                if (product) products.push(product);
              }
            }
          }
        }
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }
  } catch (error) {
    console.warn('[WebsiteAnalyzer] Error parsing JSON-LD:', error);
  }

  return products;
}

function parseJsonLDProduct(item: any, baseUrl: string): ExtractedProduct | null {
  try {
    const name = item.name;
    if (!name) return null;

    // Handle both single Offer and AggregateOffer
    const offers = item.offers || {};
    let price = 0;
    let currency = 'SAR';
    let inStock = true;

    if (offers['@type'] === 'AggregateOffer') {
      price = parseFloat(offers.lowPrice || offers.highPrice || '0');
      currency = offers.priceCurrency || 'SAR';
      inStock = offers.availability ? !offers.availability.includes('OutOfStock') : true;
    } else if (Array.isArray(offers)) {
      // Multiple offers (variants) — take least price
      const prices = offers.map((o: any) => parseFloat(o.price || '0')).filter((p: number) => p > 0);
      price = prices.length > 0 ? Math.min(...prices) : 0;
      currency = offers[0]?.priceCurrency || 'SAR';
      inStock = offers.some((o: any) => !o.availability?.includes('OutOfStock'));
    } else {
      price = parseFloat(offers.price || offers.lowPrice || '0');
      currency = offers.priceCurrency || 'SAR';
      inStock = offers.availability ? !offers.availability.includes('OutOfStock') : true;
    }

    let imageUrl = '';
    if (item.image) {
      imageUrl = typeof item.image === 'string' ? item.image :
        Array.isArray(item.image) ? item.image[0] :
          item.image.url || '';
    }

    let productUrl = item.url || '';
    if (productUrl && !productUrl.startsWith('http')) {
      productUrl = new URL(productUrl, baseUrl).href;
    }

    // Build description — include variant info if available
    let description = item.description || '';
    if (item.hasVariant && Array.isArray(item.hasVariant)) {
      const variantNames = item.hasVariant
        .map((v: any) => v.name || v.sku)
        .filter(Boolean)
        .slice(0, 5);
      if (variantNames.length > 0) {
        description = description
          ? `${description} | الخيارات: ${variantNames.join('، ')}`
          : `الخيارات: ${variantNames.join('، ')}`;
      }
    }

    // Extract category from breadcrumb or category field
    const category = item.category ||
      (item.breadcrumb?.itemListElement?.slice(-2, -1)?.[0]?.name) ||
      undefined;

    return {
      name,
      description,
      price,
      currency,
      imageUrl: imageUrl || undefined,
      productUrl: productUrl || undefined,
      category,
      inStock,
      confidence: 95,
    };
  } catch {
    return null;
  }
}

/**
 * Extract products from common HTML patterns (price + title selectors)
 * Enhanced with description extraction and Saudi platform selectors
 */
function extractFromHTMLPatterns(html: string, baseUrl: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];

  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Common e-commerce product card selectors (including Saudi platforms)
    const productSelectors = [
      '.product-card', '.product-item', '.product',
      '[data-product]', '[data-product-id]',
      '.s-product-card', '.s-product-card-entry', // Salla
      '.zid-product-card', '.product-block', // Zid
      '.woocommerce-loop-product',
      '.product-grid-item',
      '.products-list .product', '.product-box',
    ];

    // Name selectors — ordered by specificity
    const nameSelectors = [
      '.product-title', '.product-name',
      '.s-product-card-entry__title', // Salla
      '.woocommerce-loop-product__title',
      '.product-card__title',
      'h3 a', 'h2 a', 'h3', 'h2',
    ].join(', ');

    // Price selectors
    const priceSelectors = [
      '.price', '.product-price',
      '.s-product-card-entry__price', // Salla
      '.amount', '.current-price', '.sale-price',
    ].join(', ');

    // Description selectors
    const descSelectors = [
      '.product-description', '.product-excerpt',
      '.s-product-card-entry__description', // Salla
      'p.description', '.short-description',
      '.product-brief', '.product-subtitle',
    ].join(', ');

    for (const selector of productSelectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length === 0) continue;

      cards.forEach((card: any) => {
        const nameEl = card.querySelector(nameSelectors);
        const priceEl = card.querySelector(priceSelectors);
        const linkEl = card.querySelector('a[href]');
        const imgEl = card.querySelector('img');
        const descEl = card.querySelector(descSelectors);

        const name = nameEl?.textContent?.trim();
        if (!name) return;

        // Parse price — handles Arabic numerals and various formats
        let priceText = priceEl?.textContent?.replace(/[^\d.٫,]/g, '')
          .replace('٫', '.').replace(',', '') || '0';
        const price = parseFloat(priceText) || 0;

        // Detect currency from price text
        const priceFullText = priceEl?.textContent || '';
        let currency = 'SAR';
        if (priceFullText.includes('$') || priceFullText.includes('USD')) currency = 'USD';
        else if (priceFullText.includes('€') || priceFullText.includes('EUR')) currency = 'EUR';
        else if (priceFullText.includes('د.إ') || priceFullText.includes('AED')) currency = 'AED';
        else if (priceFullText.includes('د.ك') || priceFullText.includes('KWD')) currency = 'KWD';

        let productUrl = linkEl?.getAttribute('href') || '';
        if (productUrl && !productUrl.startsWith('http')) {
          try { productUrl = new URL(productUrl, baseUrl).href; } catch { productUrl = ''; }
        }

        // Get image URL — check multiple attributes
        let imageUrl = imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          imgEl?.getAttribute('data-lazy-src') ||
          imgEl?.getAttribute('data-original') || '';
        if (imageUrl && !imageUrl.startsWith('http')) {
          try { imageUrl = new URL(imageUrl, baseUrl).href; } catch { imageUrl = ''; }
        }
        // Skip placeholder/loading images
        if (imageUrl && (imageUrl.includes('placeholder') || imageUrl.includes('data:image') || imageUrl.includes('loading'))) {
          imageUrl = '';
        }

        // Extract description from card
        const description = descEl?.textContent?.trim()?.substring(0, 200) || '';

        products.push({
          name,
          description,
          price,
          currency,
          imageUrl: imageUrl || undefined,
          productUrl: productUrl || undefined,
          inStock: true,
          confidence: 75,
        });
      });

      if (products.length > 0) break; // Use first matching selector
    }
  } catch (error) {
    console.warn('[WebsiteAnalyzer] Error parsing HTML patterns:', error);
  }

  return products;
}

/**
 * Try common e-commerce API endpoints (Salla, Zid, Shopify, WooCommerce)
 * Enhanced: supports Zid store-id header for authenticated API access
 */
async function tryProductsAPI(url: string, zidStoreId?: string | null): Promise<ExtractedProduct[]> {
  const products: ExtractedProduct[] = [];
  const baseUrl = new URL(url).origin;

  // Build API endpoints — prioritize platform-specific ones when detected
  const apiEndpoints: { url: string; platform: string; headers?: Record<string, string> }[] = [];

  // If we have a Zid store-id, prioritize Zid API with auth
  if (zidStoreId) {
    apiEndpoints.push({
      url: `${baseUrl}/api/v1/products`,
      platform: 'zid',
      headers: {
        'store-id': zidStoreId,
        'Accept-Language': 'ar',
        'Content-Type': 'application/json',
      },
    });
  }

  // Standard API endpoints
  apiEndpoints.push(
    { url: `${baseUrl}/api/products`, platform: 'salla' },
    { url: `${baseUrl}/products.json`, platform: 'shopify' },
    { url: `${baseUrl}/api/v1/products`, platform: 'zid' },
    { url: `${baseUrl}/wp-json/wc/v3/products`, platform: 'woocommerce' },
    { url: `${baseUrl}/wp-json/wc/store/v1/products`, platform: 'woocommerce-store' },
  );

  for (const endpoint of apiEndpoints) {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(endpoint.headers || {}),
      };

      console.log(`[WebsiteAnalyzer] Trying API: ${endpoint.url} (${endpoint.platform})${endpoint.headers ? ' [with auth]' : ''}`);

      // Try Node.js fetch first
      let responseBody: string | null = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint.url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`[WebsiteAnalyzer] API ${endpoint.url} returned ${response.status}`);
          throw new Error(`HTTP ${response.status}`); // Fall through to curl
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) throw new Error('Not JSON');

        responseBody = await response.text();
      } catch (fetchError) {
        // Fetch failed (likely Cloudflare) — try curl as fallback
        console.log(`[WebsiteAnalyzer] fetch failed for ${endpoint.url}, trying curl fallback...`);
        const curlResult = await curlFetch(endpoint.url, headers);
        if (curlResult.ok && curlResult.body) {
          responseBody = curlResult.body;
          console.log(`[WebsiteAnalyzer] curl succeeded for ${endpoint.url} (${curlResult.body.length} bytes)`);
        } else {
          console.log(`[WebsiteAnalyzer] curl also failed for ${endpoint.url} (status: ${curlResult.status})`);
          continue;
        }
      }

      if (!responseBody) continue;

      let data: any;
      try {
        data = JSON.parse(responseBody);
      } catch {
        continue; // Not valid JSON
      }

      // Extract products array from various response formats
      const rawProducts = data.results || data.products || data.data || (Array.isArray(data) ? data : []);

      if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
        console.log(`[WebsiteAnalyzer] API ${endpoint.url} returned no products`);
        continue;
      }

      for (const p of rawProducts.slice(0, 50)) {
        // Get image URL from various platform formats
        const imageUrl = p.image?.src ||           // Shopify
          p.images?.[0]?.src ||                      // Shopify array
          p.images?.[0]?.url ||                      // Salla
          p.images?.[0]?.original_url ||             // Zid images
          p.images?.[0]?.image?.url ||               // Zid nested image
          p.thumbnail?.src ||                         // Zid thumbnail
          p.thumbnail ||                              // Generic
          p.main_image ||                             // Zid alt
          p.featured_image ||                         // Generic
          undefined;

        // Get description — strip HTML tags
        const rawDesc = p.body_html || p.description || p.short_description || p.content || '';
        const description = typeof rawDesc === 'string'
          ? rawDesc.replace(/<[^>]*>/g, '').trim().substring(0, 300)
          : '';

        // Get category
        const category = p.category?.name ||
          p.categories?.[0]?.name ||
          p.product_type ||
          p.type ||
          undefined;

        // Get price from variants or direct — handle Zid nested price objects
        let price = 0;
        if (typeof p.price === 'object' && p.price !== null) {
          price = parseFloat(p.price.amount || p.price.value || p.price.price || '0');
        } else {
          price = parseFloat(
            p.price || p.variants?.[0]?.price || p.sale_price || p.regular_price || '0'
          );
        }

        // Get currency — handle Zid nested currency
        let currency = 'SAR';
        if (typeof p.price === 'object' && p.price?.currency?.code) {
          currency = p.price.currency.code;
        } else {
          currency = p.currency || p.price_currency || 'SAR';
        }

        // Get product URL
        let productUrl = p.url || p.permalink || p.slug || undefined;
        if (productUrl && !productUrl.startsWith('http')) {
          if (productUrl.startsWith('/')) {
            productUrl = `${baseUrl}${productUrl}`;
          } else {
            productUrl = `${baseUrl}/products/${productUrl}`;
          }
        }

        // Determine stock status
        const inStock = p.in_stock !== false &&
          p.available !== false &&
          p.quantity !== 0 &&
          p.status !== 'out_of_stock';

        const name = p.title || p.name || '';
        if (!name) continue; // Skip products without names

        products.push({
          name,
          description,
          price,
          currency,
          imageUrl,
          productUrl,
          category,
          inStock,
          confidence: 90,
        });
      }

      if (products.length > 0) {
        console.log(`[WebsiteAnalyzer] Got ${products.length} products from ${endpoint.url} (${endpoint.platform})`);
        return products;
      }
    } catch (err) {
      // Endpoint doesn't exist or not accessible, skip
      console.log(`[WebsiteAnalyzer] API ${endpoint.url} failed:`, err instanceof Error ? err.message : 'unknown');
    }
  }

  return products;
}


/**
 * توليد رؤى ذكية باستخدام AI
 */
export async function generateInsights(analysis: WebsiteAnalysisResult): Promise<WebsiteInsight[]> {
  try {
    console.log('[WebsiteAnalyzer] Generating insights');

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `أنت خبير في تحليل المواقع الإلكترونية وتقديم رؤى استراتيجية. قم بتحليل نتائج التحليل وتقديم رؤى قيمة وتوصيات عملية.

يجب أن تكون الإجابة بصيغة JSON فقط، بدون أي نص إضافي.`
        },
        {
          role: 'user',
          content: `بناءً على نتائج التحليل التالية، قدم رؤى ذكية وتوصيات:

نتائج التحليل:
- العنوان: ${analysis.title}
- الوصف: ${analysis.description}
- الصناعة: ${analysis.industry}
- نقاط SEO: ${analysis.seoScore}/100
- مشاكل SEO: ${analysis.seoIssues.join(', ')}
- نقاط الأداء: ${analysis.performanceScore}/100
- نقاط UX: ${analysis.uxScore}/100
- محسّن للجوال: ${analysis.mobileOptimized ? 'نعم' : 'لا'}
- يحتوي على واتساب: ${analysis.hasWhatsapp ? 'نعم' : 'لا'}
- جودة المحتوى: ${analysis.contentQuality}/100
- عدد الكلمات: ${analysis.wordCount}

قدم رؤى بالتنسيق التالي (JSON فقط):
{
  "insights": [
    {
      "category": "seo",
      "type": "weakness",
      "priority": "high",
      "title": "عنوان الرؤية",
      "description": "وصف تفصيلي",
      "recommendation": "التوصية",
      "impact": "التأثير المتوقع",
      "confidence": 90
    }
  ]
}`
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'insights_generation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              insights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      enum: ['seo', 'performance', 'ux', 'content', 'marketing', 'security']
                    },
                    type: {
                      type: 'string',
                      enum: ['strength', 'weakness', 'opportunity', 'threat', 'recommendation']
                    },
                    priority: {
                      type: 'string',
                      enum: ['low', 'medium', 'high', 'critical']
                    },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    recommendation: { type: 'string' },
                    impact: { type: 'string' },
                    confidence: { type: 'number' }
                  },
                  required: ['category', 'type', 'priority', 'title', 'description', 'confidence'],
                  additionalProperties: false
                }
              }
            },
            required: ['insights'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return [];
    }

    const result = JSON.parse(content as string);
    return result.insights || [];
  } catch (error) {
    console.error('[WebsiteAnalyzer] Error generating insights:', error);
    return [];
  }
}

/**
 * اكتشاف الصناعة باستخدام AI
 */
async function detectIndustry(title: string, description: string, text: string): Promise<string> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'أنت خبير في تصنيف المواقع الإلكترونية حسب الصناعة. قم بتحليل المحتوى وتحديد الصناعة بكلمة أو كلمتين فقط.'
        },
        {
          role: 'user',
          content: `حدد الصناعة لهذا الموقع:

العنوان: ${title}
الوصف: ${description}
المحتوى: ${text.substring(0, 1000)}

أجب بكلمة أو كلمتين فقط تصف الصناعة (مثل: تجارة إلكترونية، خدمات مالية، مطاعم، تعليم، إلخ)`
        }
      ]
    });

    return (response.choices[0].message.content as string)?.trim() || 'غير محدد';
  } catch (error) {
    console.error('[WebsiteAnalyzer] Error detecting industry:', error);
    return 'غير محدد';
  }
}

/**
 * مقارنة مع المنافسين
 */
export async function compareWithCompetitors(
  merchantAnalysis: WebsiteAnalysisResult,
  competitorAnalyses: WebsiteAnalysisResult[]
): Promise<{
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
}> {
  try {
    console.log('[WebsiteAnalyzer] Comparing with competitors');

    const competitorsData = competitorAnalyses.map(comp => ({
      title: comp.title,
      overallScore: comp.overallScore,
      seoScore: comp.seoScore,
      performanceScore: comp.performanceScore,
      uxScore: comp.uxScore
    }));

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `أنت خبير في التحليل التنافسي. قم بمقارنة الموقع مع المنافسين وتحديد نقاط القوة والضعف والفرص.

يجب أن تكون الإجابة بصيغة JSON فقط، بدون أي نص إضافي.`
        },
        {
          role: 'user',
          content: `قارن هذا الموقع مع المنافسين:

موقع التاجر:
- العنوان: ${merchantAnalysis.title}
- النقاط الإجمالية: ${merchantAnalysis.overallScore}/100
- SEO: ${merchantAnalysis.seoScore}/100
- الأداء: ${merchantAnalysis.performanceScore}/100
- UX: ${merchantAnalysis.uxScore}/100

المنافسون:
${competitorsData.map((c, i) => `
${i + 1}. ${c.title}
   - النقاط: ${c.overallScore}/100
   - SEO: ${c.seoScore}/100
   - الأداء: ${c.performanceScore}/100
   - UX: ${c.uxScore}/100
`).join('\n')}

قدم التحليل بالتنسيق التالي (JSON فقط):
{
  "strengths": ["نقطة قوة 1", "نقطة قوة 2"],
  "weaknesses": ["نقطة ضعف 1", "نقطة ضعف 2"],
  "opportunities": ["فرصة 1", "فرصة 2"]
}`
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'competitor_comparison',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              opportunities: { type: 'array', items: { type: 'string' } }
            },
            required: ['strengths', 'weaknesses', 'opportunities'],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { strengths: [], weaknesses: [], opportunities: [] };
    }

    return JSON.parse(content as string);
  } catch (error) {
    console.error('[WebsiteAnalyzer] Error comparing with competitors:', error);
    return { strengths: [], weaknesses: [], opportunities: [] };
  }
}
