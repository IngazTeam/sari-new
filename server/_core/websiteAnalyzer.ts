/**
 * Website Analyzer Service
 * 
 * خدمة تحليل المواقع الذكية باستخدام AI
 * تقوم بتحليل شامل للمواقع الإلكترونية واستخراج المعلومات المهمة
 */

import { invokeLLM } from "./llm";
import { JSDOM } from "jsdom";
import { execFileSync } from "child_process";

/**
 * Validate URL to prevent SSRF attacks (internal IP, metadata endpoints, etc.)
 */
function isUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();
    // Block internal/private IPs
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    // Block AWS/GCP/Azure metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return false;
    // Block file:// and other schemes
    if (hostname === '' || hostname.includes('..')) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch URL using curl as fallback when Node.js fetch is blocked by Cloudflare.
 * Uses execFileSync (no shell) to prevent command injection.
 */
async function curlFetch(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    // Validate URL to prevent SSRF
    if (!isUrlSafe(url)) {
      console.warn('[WebsiteAnalyzer] Blocked unsafe URL:', url);
      return { ok: false, status: 0, body: '' };
    }

    // Build args as array (safe — no shell interpolation)
    const args: string[] = ['-4', '-s', '--max-time', '15', '-w', '\n__HTTP_STATUS__%{http_code}'];
    for (const [k, v] of Object.entries(headers || {})) {
      args.push('-H', `${k}: ${v}`);
    }
    args.push(url);

    const output = execFileSync('curl', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

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

export interface ContactInfo {
  phones: string[];
  emails: string[];
  whatsappNumber: string | null;
  address: string | null;
}

export interface DiscoveredPage {
  pageType: 'about' | 'shipping' | 'returns' | 'faq' | 'contact' | 'privacy' | 'terms' | 'other';
  title: string;
  url: string;
}

export interface ExtractedFAQ {
  question: string;
  answer: string;
  category?: string;
}

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

  // Enriched data from multi-page crawling
  contactInfo?: ContactInfo;
  faqs?: ExtractedFAQ[];
  discoveredPages?: DiscoveredPage[];
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

  /** Helper: parse raw HTML into { html, dom, text } */
  const parseHtml = (html: string) => {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    document.querySelectorAll('script, style, noscript').forEach(el => el.remove());
    const text = (document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    return { html, dom, text };
  };

  /** Helper: detect Cloudflare challenge page */
  const isCloudflareChallenge = (html: string) =>
    html.includes('cf-browser-verification') ||
    html.includes('challenge-platform') ||
    (html.length < 1000 && html.includes('Just a moment'));

  let lastError: Error | null = null;

  // Strategy 1: Node.js fetch with multiple User-Agents
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

      if (isCloudflareChallenge(html)) {
        console.warn(`[WebsiteAnalyzer] Cloudflare challenge detected with UA: ${ua.substring(0, 30)}...`);
        lastError = new Error('Cloudflare challenge detected');
        continue;
      }

      const result = parseHtml(html);
      console.log(`[WebsiteAnalyzer] Scraped ${url} — ${html.length} bytes, ${result.text.length} chars text`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[WebsiteAnalyzer] Fetch attempt failed (${ua.substring(0, 20)}...):`, lastError.message);
    }
  }

  // Strategy 2: curl fallback — bypasses TLS fingerprinting that Cloudflare uses
  console.log(`[WebsiteAnalyzer] All fetch attempts failed, trying curl fallback for ${url}...`);
  const curlUAs = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  for (const ua of curlUAs) {
    const curlResult = await curlFetch(url, {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en;q=0.9',
    });

    if (curlResult.ok && curlResult.body.length > 500 && !isCloudflareChallenge(curlResult.body)) {
      const result = parseHtml(curlResult.body);
      console.log(`[WebsiteAnalyzer] ✅ curl fallback succeeded for ${url} — ${curlResult.body.length} bytes, ${result.text.length} chars text`);
      return result;
    }
  }

  throw new Error(`Failed to scrape website after all attempts (fetch + curl): ${lastError?.message}`);
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
/**
 * Extract actual contact details from text and HTML
 */
export function extractContactInfo(dom: JSDOM, text: string, html: string): ContactInfo {
  const document = dom.window.document;

  // Phone regex — supports Saudi (05xxxxxxxx, +966xxxxxxxx), international, and generic formats
  const phoneRegex = /(?:\+?966[\s-]?)?0?5\d[\s-]?\d{3}[\s-]?\d{4}|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = Array.from(new Set((text.match(phoneRegex) || []).map(p => p.replace(/[\s-]/g, '').trim()).filter(p => p.length >= 9)));

  // Email regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = Array.from(new Set((text.match(emailRegex) || []).filter(e => !e.includes('example.') && !e.includes('sentry'))));

  // WhatsApp — extract actual number from wa.me links
  let whatsappNumber: string | null = null;
  const waLinks = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]');
  waLinks.forEach((el: any) => {
    const href = el.getAttribute('href') || '';
    const waMatch = href.match(/wa\.me\/(\d+)/);
    if (waMatch && !whatsappNumber) {
      whatsappNumber = waMatch[1];
    }
    const apiMatch = href.match(/api\.whatsapp\.com\/send\?phone=(\d+)/);
    if (apiMatch && !whatsappNumber) {
      whatsappNumber = apiMatch[1];
    }
  });
  // Also check in raw HTML for wa.me links (in case DOM didn't parse them)
  if (!whatsappNumber) {
    const htmlWaMatch = html.match(/wa\.me\/(\d+)/);
    if (htmlWaMatch) whatsappNumber = htmlWaMatch[1];
  }

  // Address detection — look for common Arabic/English patterns in text
  let address: string | null = null;
  const addressPatterns = [
    /(?:العنوان|الموقع|عنوان)[:\s]+([^\n.]{10,80})/,
    /(?:address|location)[:\s]+([^\n.]{10,80})/i,
  ];
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      address = match[1].trim();
      break;
    }
  }

  return { phones, emails, whatsappNumber, address };
}

export function analyzeUX(dom: JSDOM, text: string, html?: string): {
  score: number;
  mobileOptimized: boolean;
  hasContactInfo: boolean;
  hasWhatsapp: boolean;
  contactInfo: ContactInfo;
} {
  const document = dom.window.document;
  let score = 100;

  // Check for viewport meta tag (mobile optimization)
  const viewportTag = document.querySelector('meta[name="viewport"]');
  const mobileOptimized = !!viewportTag;
  if (!mobileOptimized) {
    score -= 20;
  }

  // Extract detailed contact info
  const contactInfo = extractContactInfo(dom, text, html || '');
  const hasContactInfo = contactInfo.phones.length > 0 || contactInfo.emails.length > 0;

  if (!hasContactInfo) {
    score -= 15;
  }

  // Check for WhatsApp
  const whatsappRegex = /whatsapp|واتساب|واتس اب/gi;
  const hasWhatsapp = !!contactInfo.whatsappNumber ||
    whatsappRegex.test(text) ||
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
    hasWhatsapp,
    contactInfo,
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

// ============================================
// Page Discovery & Multi-Page Crawling
// ============================================

/** Keywords used to classify discovered pages */
const PAGE_TYPE_KEYWORDS: Record<string, string[]> = {
  about: ['about', 'من نحن', 'عن', 'عنا', 'من-نحن', 'about-us'],
  shipping: ['shipping', 'delivery', 'شحن', 'توصيل', 'الشحن', 'التوصيل'],
  returns: ['return', 'refund', 'استرجاع', 'استبدال', 'الاسترجاع', 'الاستبدال'],
  faq: ['faq', 'questions', 'أسئلة', 'الأسئلة', 'شائعة'],
  contact: ['contact', 'اتصل', 'تواصل', 'الاتصال', 'التواصل'],
  privacy: ['privacy', 'خصوصية', 'الخصوصية'],
  terms: ['terms', 'conditions', 'شروط', 'الشروط', 'أحكام'],
};

/**
 * Discover important sub-pages from the homepage HTML
 */
export function discoverPages(dom: JSDOM, baseUrl: string): DiscoveredPage[] {
  const document = dom.window.document;
  const pages: DiscoveredPage[] = [];
  const seenUrls = new Set<string>();

  document.querySelectorAll('a[href]').forEach((el: any) => {
    const href = el.getAttribute('href') || '';
    const text = (el.textContent || '').trim().toLowerCase();

    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    // Normalize URL
    let fullUrl: string;
    try {
      if (href.startsWith('http')) {
        fullUrl = href;
      } else {
        fullUrl = new URL(href, baseUrl).href;
      }
    } catch {
      return;
    }

    // Only same-origin pages
    try {
      if (new URL(fullUrl).origin !== new URL(baseUrl).origin) return;
    } catch {
      return;
    }

    if (seenUrls.has(fullUrl)) return;

    // Classify page type
    for (const [type, keywords] of Object.entries(PAGE_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword) || href.toLowerCase().includes(keyword)) {
          seenUrls.add(fullUrl);
          pages.push({
            pageType: type as DiscoveredPage['pageType'],
            title: (el.textContent || '').trim() || type,
            url: fullUrl,
          });
          return;
        }
      }
    }
  });

  return pages;
}

/**
 * Crawl discovered pages and extract FAQs + contact info
 * Limits to max 5 pages to avoid being blocked
 */
async function crawlAndExtract(pages: DiscoveredPage[], existingContactInfo: ContactInfo): Promise<{
  faqs: ExtractedFAQ[];
  contactInfo: ContactInfo;
  enrichedText: string;
}> {
  const faqs: ExtractedFAQ[] = [];
  let enrichedText = '';
  const mergedContact: ContactInfo = { ...existingContactInfo };

  // Prioritize high-value pages: contact, faq, about, then others
  const priorityOrder = ['contact', 'faq', 'about', 'shipping', 'returns', 'terms', 'privacy'];
  const sorted = [...pages].sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.pageType);
    const bIdx = priorityOrder.indexOf(b.pageType);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  for (const page of sorted.slice(0, 5)) {
    try {
      console.log(`[WebsiteAnalyzer] Crawling sub-page: ${page.pageType} — ${page.url}`);
      const { dom, text, html } = await scrapeWebsite(page.url);

      enrichedText += ' ' + text;

      // Extract contact info from contact pages
      if (page.pageType === 'contact' || page.pageType === 'about') {
        const pageContact = extractContactInfo(dom, text, html);
        // Merge unique values
        mergedContact.phones = Array.from(new Set([...mergedContact.phones, ...pageContact.phones]));
        mergedContact.emails = Array.from(new Set([...mergedContact.emails, ...pageContact.emails]));
        if (!mergedContact.whatsappNumber && pageContact.whatsappNumber) {
          mergedContact.whatsappNumber = pageContact.whatsappNumber;
        }
        if (!mergedContact.address && pageContact.address) {
          mergedContact.address = pageContact.address;
        }
      }

      // Extract FAQs from FAQ-like pages
      if (page.pageType === 'faq' || page.pageType === 'shipping' || page.pageType === 'returns') {
        const document = dom.window.document;

        // Try FAQ sections with common selectors
        document.querySelectorAll('.faq, .faqs, [class*="faq"], [class*="question"], .accordion, details, [class*="accordion"]').forEach((el: any) => {
          const question = (el.querySelector('h1, h2, h3, h4, h5, summary, [class*="question"], button')?.textContent || '').trim();
          const answer = (el.querySelector('p, [class*="answer"], .content, .panel, dd')?.textContent || '').trim();
          if (question && answer && question.length > 5 && answer.length > 10) {
            faqs.push({ question, answer: answer.substring(0, 500), category: page.pageType });
          }
        });

        // Also try <dt>/<dd> FAQ patterns
        const dtElements = document.querySelectorAll('dt');
        dtElements.forEach((dt: any) => {
          const question = (dt.textContent || '').trim();
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') {
            const answer = (dd.textContent || '').trim();
            if (question && answer) {
              faqs.push({ question, answer: answer.substring(0, 500), category: page.pageType });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[WebsiteAnalyzer] Failed to crawl ${page.url}:`, err instanceof Error ? err.message : 'unknown');
    }
  }

  return { faqs, contactInfo: mergedContact, enrichedText };
}

/**
 * تحليل شامل للموقع — مع multi-page crawling
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
    const uxAnalysis = analyzeUX(dom, text, html);
    const contentAnalysis = analyzeContent(dom, text);

    // Detect language
    const htmlLang = document.documentElement.lang || '';
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const language = isArabic ? 'ar' : (htmlLang || 'en');

    // Discover sub-pages
    const discoveredPages = discoverPages(dom, url);
    console.log(`[WebsiteAnalyzer] Discovered ${discoveredPages.length} sub-pages`);

    // Multi-page crawling for richer data
    let faqs: ExtractedFAQ[] = [];
    let contactInfo = uxAnalysis.contactInfo;
    let totalWordCount = contentAnalysis.wordCount;

    if (discoveredPages.length > 0) {
      try {
        const crawled = await crawlAndExtract(discoveredPages, contactInfo);
        faqs = crawled.faqs;
        contactInfo = crawled.contactInfo;
        // Update word count with enriched text
        const extraWords = crawled.enrichedText.trim().split(/\s+/).length;
        totalWordCount += extraWords;
        console.log(`[WebsiteAnalyzer] Crawling complete: ${faqs.length} FAQs, ${contactInfo.phones.length} phones, ${contactInfo.emails.length} emails, +${extraWords} words`);
      } catch (crawlErr) {
        console.warn('[WebsiteAnalyzer] Multi-page crawling failed:', crawlErr instanceof Error ? crawlErr.message : 'unknown');
      }
    }

    // Recalculate content score with enriched word count
    let enrichedContentScore = contentAnalysis.score;
    if (totalWordCount >= 500 && contentAnalysis.wordCount < 500) {
      enrichedContentScore = Math.min(100, contentAnalysis.score + 20);
    } else if (totalWordCount >= 300 && contentAnalysis.wordCount < 300) {
      enrichedContentScore = Math.min(100, contentAnalysis.score + 10);
    }

    // Recalculate UX score if contact info was found during crawling
    let enrichedUxScore = uxAnalysis.score;
    const hasContactAfterCrawl = contactInfo.phones.length > 0 || contactInfo.emails.length > 0;
    const hasWhatsappAfterCrawl = !!contactInfo.whatsappNumber || uxAnalysis.hasWhatsapp;
    if (hasContactAfterCrawl && !uxAnalysis.hasContactInfo) {
      enrichedUxScore = Math.min(100, enrichedUxScore + 15);
    }
    if (hasWhatsappAfterCrawl && !uxAnalysis.hasWhatsapp) {
      enrichedUxScore = Math.min(100, enrichedUxScore + 10);
    }

    // Calculate overall score with enriched data
    const overallScore = Math.round(
      (seoAnalysis.score * 0.3) +
      (performanceAnalysis.score * 0.25) +
      (enrichedUxScore * 0.25) +
      (enrichedContentScore * 0.2)
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
      uxScore: enrichedUxScore,
      mobileOptimized: uxAnalysis.mobileOptimized,
      hasContactInfo: hasContactAfterCrawl,
      hasWhatsapp: hasWhatsappAfterCrawl,
      contentQuality: enrichedContentScore,
      wordCount: totalWordCount,
      imageCount: contentAnalysis.imageCount,
      videoCount: contentAnalysis.videoCount,
      overallScore,
      // Enriched data
      contactInfo,
      faqs: faqs.length > 0 ? faqs : undefined,
      discoveredPages: discoveredPages.length > 0 ? discoveredPages : undefined,
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
 * Detect the e-commerce platform from URL and HTML content.
 * Exported for use by the analysis router.
 */
export function detectPlatform(url: string, html: string): 'salla' | 'zid' | 'shopify' | 'woocommerce' | 'custom' | 'unknown' {
  if (isSallaStore(html) || /salla\.sa/i.test(url)) return 'salla';
  if (isZidStore(html) || /zid\.sa/i.test(url)) return 'zid';
  if (/shopify\.com/i.test(url) || /cdn\.shopify\.com/i.test(html) || html.includes('Shopify.theme')) return 'shopify';
  if (/woocommerce/i.test(html) || html.includes('wp-content/plugins/woocommerce')) return 'woocommerce';
  return 'custom';
}

/**
 * Try to discover Zid store-id by fetching the page with a lightweight request.
 * Cloudflare may block the main page but allow API-like requests.
 * Also tries common Zid JS asset URLs that contain the store config.
 */
async function discoverZidStoreId(url: string): Promise<string | null> {
  const baseUrl = new URL(url).origin;

  // Strategy 1: Use curl to fetch the page (bypasses Cloudflare TLS fingerprinting)
  console.log('[WebsiteAnalyzer] Trying curl to fetch page for store-id discovery...');
  const curlPage = await curlFetch(url, {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html',
  });
  if (curlPage.ok && curlPage.body) {
    const storeId = extractZidStoreId(curlPage.body);
    if (storeId) {
      console.log(`[WebsiteAnalyzer] Discovered Zid store-id from curl page: ${storeId}`);
      return storeId;
    }
  }

  // Strategy 2: Try Zid API via curl — extract store-id UUID from image URLs in response
  console.log('[WebsiteAnalyzer] Trying curl to Zid API for store-id discovery...');
  const curlApi = await curlFetch(`${baseUrl}/api/v1/products`, {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  if (curlApi.ok && curlApi.body) {
    try {
      const data = JSON.parse(curlApi.body);
      // Extract store-id UUID from media.zid.store image URLs
      const imageUrl = JSON.stringify(data).match(/media\.zid\.store\/thumbs\/([a-f0-9-]{36})\//);
      if (imageUrl?.[1]) {
        console.log(`[WebsiteAnalyzer] Discovered Zid store-id from API image URLs: ${imageUrl[1]}`);
        return imageUrl[1];
      }
    } catch { /* skip */ }
  }

  // Strategy 3: Fallback to fetch (in case Cloudflare is not blocking)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Accept': '*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const text = await response.text();
      const storeId = extractZidStoreId(text);
      if (storeId) {
        console.log(`[WebsiteAnalyzer] Discovered Zid store-id from fetch: ${storeId}`);
        return storeId;
      }
    }
  } catch { /* skip */ }

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
    const platform = detectPlatform(url, html);
    const htmlEmpty = html.length < 500; // Scraping likely failed (Cloudflare)

    console.log(`[WebsiteAnalyzer] Detected platform: ${platform}${zidStoreId ? ` (Zid store-id: ${zidStoreId})` : ''}`);
    if (htmlEmpty) console.log('[WebsiteAnalyzer] HTML is empty/minimal — scraping likely blocked, trying API-only extraction');

    // Strategy 1: For known e-commerce platforms OR when scraping failed, try API first
    if (platform !== 'custom' || htmlEmpty) {
      console.log(`[WebsiteAnalyzer] Trying API-first extraction for ${platform} platform...`);

      const apiProducts = await tryProductsAPI(url, zidStoreId);
      if (apiProducts.length > 0) {
        console.log(`[WebsiteAnalyzer] Found ${apiProducts.length} products via ${platform} API`);
        return apiProducts;
      }

      // If scraping completely failed and API didn't work, try discovering store-id from the page (Zid)
      if (htmlEmpty && !zidStoreId && (platform === 'zid' || platform === 'custom')) {
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

    // Strategy 3: Try API endpoints (for sites where platform wasn't detected from HTML)
    if (platform === 'custom') {
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
 * Enhanced with platform-specific response parsers and fallbacks
 */
async function tryProductsAPI(url: string, zidStoreId?: string | null): Promise<ExtractedProduct[]> {
  const baseUrl = new URL(url).origin;

  // =============================================
  // Platform-specific API scrapers
  // =============================================

  // --- Salla ---
  const trySallaAPI = async (): Promise<ExtractedProduct[]> => {
    // Salla storefront API paths — try multiple known endpoints
    const sallaEndpoints = [
      `${baseUrl}/api/products`,
      `${baseUrl}/api/v1/products`,
      `${baseUrl}/api/products/search`,
    ];

    for (const endpoint of sallaEndpoints) {
      try {
        console.log(`[WebsiteAnalyzer] Trying Salla API: ${endpoint}`);
        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Language': 'ar',
        };

        // Try fetch first, then curl
        let body: string | null = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(endpoint, { headers, signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
            body = await response.text();
          }
        } catch {
          const curlResult = await curlFetch(endpoint, headers);
          if (curlResult.ok) body = curlResult.body;
        }

        if (!body) continue;
        const data = JSON.parse(body);

        // Salla response format: { data: [...products], cursor: {...} }
        // or { products: [...] } or just an array
        const rawProducts = data.data || data.products || (Array.isArray(data) ? data : []);
        if (!Array.isArray(rawProducts) || rawProducts.length === 0) continue;

        const products: ExtractedProduct[] = [];
        for (const p of rawProducts.slice(0, 50)) {
          const name = p.name || p.title || '';
          if (!name) continue;

          // Salla price format: { amount: number, currency: "SAR" } or just a number
          let price = 0;
          let currency = 'SAR';
          if (typeof p.price === 'object' && p.price !== null) {
            price = parseFloat(p.price.amount || p.price.value || '0');
            currency = p.price.currency || 'SAR';
          } else {
            price = parseFloat(p.price || p.sale_price || p.regular_price || '0');
          }

          // Salla image format: { url: string, alt: string } or string or thumbnail object
          let imageUrl: string | undefined;
          if (p.image) {
            imageUrl = typeof p.image === 'string' ? p.image : p.image.url || p.image.src;
          } else if (p.thumbnail) {
            imageUrl = typeof p.thumbnail === 'string' ? p.thumbnail : p.thumbnail.url;
          } else if (p.images && Array.isArray(p.images) && p.images.length > 0) {
            const firstImg = p.images[0];
            imageUrl = typeof firstImg === 'string' ? firstImg : firstImg.url || firstImg.src || firstImg.original_url;
          }

          const description = (p.description || p.short_description || '')
            .replace(/<[^>]*>/g, '').trim().substring(0, 300);

          const productUrl = p.url || p.share_url || (p.slug ? `${baseUrl}/p/${p.slug}` : undefined);

          products.push({
            name,
            description,
            price,
            currency,
            imageUrl,
            productUrl,
            category: p.category?.name || p.categories?.[0]?.name,
            inStock: p.status !== 'out' && p.quantity !== 0 && p.availability !== 'out',
            confidence: 90,
          });
        }

        if (products.length > 0) {
          console.log(`[WebsiteAnalyzer] ✅ Salla API: Got ${products.length} products from ${endpoint}`);
          return products;
        }
      } catch (err) {
        console.log(`[WebsiteAnalyzer] Salla API ${endpoint} failed:`, err instanceof Error ? err.message : 'unknown');
      }
    }
    return [];
  };

  // --- Shopify ---
  const tryShopifyAPI = async (): Promise<ExtractedProduct[]> => {
    const endpoint = `${baseUrl}/products.json?limit=50`;
    console.log(`[WebsiteAnalyzer] Trying Shopify API: ${endpoint}`);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    let body: string | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(endpoint, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
        body = await response.text();
      }
    } catch {
      const curlResult = await curlFetch(endpoint, headers);
      if (curlResult.ok) body = curlResult.body;
    }

    if (!body) return [];

    try {
      const data = JSON.parse(body);
      const rawProducts = data.products;
      if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

      const products: ExtractedProduct[] = [];
      for (const p of rawProducts.slice(0, 50)) {
        const name = p.title || '';
        if (!name) continue;

        // Shopify format: variants[].price, images[].src
        let price = 0;
        let currency = 'USD'; // Shopify default
        if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
          // Get the lowest price from variants
          const prices = p.variants
            .map((v: any) => parseFloat(v.price || '0'))
            .filter((pr: number) => pr > 0);
          price = prices.length > 0 ? Math.min(...prices) : 0;
        }

        // Shopify images format: images[].src
        let imageUrl: string | undefined;
        if (p.images && Array.isArray(p.images) && p.images.length > 0) {
          imageUrl = p.images[0].src || p.images[0].url;
        } else if (p.image?.src) {
          imageUrl = p.image.src;
        }

        // Strip HTML from body_html for description
        const description = (p.body_html || '')
          .replace(/<[^>]*>/g, '').trim().substring(0, 300);

        const productUrl = p.handle ? `${baseUrl}/products/${p.handle}` : undefined;

        // Build tags list
        const tags = typeof p.tags === 'string'
          ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(p.tags) ? p.tags : undefined;

        // Variant info for description enrichment
        const variantInfo = p.variants?.length > 1
          ? ` | ${p.variants.length} خيارات متاحة`
          : '';

        products.push({
          name,
          description: description + variantInfo,
          price,
          currency,
          imageUrl,
          productUrl,
          category: p.product_type || undefined,
          tags,
          inStock: p.variants?.some((v: any) => v.available !== false) ?? true,
          confidence: 95,
        });
      }

      if (products.length > 0) {
        console.log(`[WebsiteAnalyzer] ✅ Shopify API: Got ${products.length} products`);
      }
      return products;
    } catch (err) {
      console.log(`[WebsiteAnalyzer] Shopify API parsing failed:`, err instanceof Error ? err.message : 'unknown');
      return [];
    }
  };

  // --- WooCommerce ---
  const tryWooCommerceAPI = async (): Promise<ExtractedProduct[]> => {
    // WooCommerce Store API v1 is PUBLIC (no auth needed!)
    const wcEndpoints = [
      `${baseUrl}/wp-json/wc/store/v1/products?per_page=50`,
      `${baseUrl}/wp-json/wc/store/products?per_page=50`,
      `${baseUrl}/wp-json/wc/v3/products?per_page=50`, // May require auth but try anyway
    ];

    for (const endpoint of wcEndpoints) {
      try {
        console.log(`[WebsiteAnalyzer] Trying WooCommerce API: ${endpoint}`);
        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };

        let body: string | null = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(endpoint, { headers, signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
            body = await response.text();
          }
        } catch {
          const curlResult = await curlFetch(endpoint, headers);
          if (curlResult.ok) body = curlResult.body;
        }

        if (!body) continue;
        const rawProducts = JSON.parse(body);
        if (!Array.isArray(rawProducts) || rawProducts.length === 0) continue;

        const products: ExtractedProduct[] = [];
        for (const p of rawProducts.slice(0, 50)) {
          const name = p.name || p.title || '';
          if (!name) continue;

          // WC Store API v1 price format: prices.price is in minor units (cents)
          // e.g., "1500" = 15.00 SAR when currency_minor_unit = 2
          let price = 0;
          let currency = 'SAR';
          if (p.prices) {
            const minorUnit = p.prices.currency_minor_unit || 2;
            const divisor = Math.pow(10, minorUnit);
            price = parseFloat(p.prices.sale_price || p.prices.price || '0') / divisor;
            currency = p.prices.currency_code || 'SAR';
          } else {
            price = parseFloat(p.price || p.regular_price || p.sale_price || '0');
          }

          // WC Store API images format: images[].src or images[].thumbnail
          let imageUrl: string | undefined;
          if (p.images && Array.isArray(p.images) && p.images.length > 0) {
            imageUrl = p.images[0].src || p.images[0].thumbnail;
          }

          // Description — WC Store API uses short_description or description
          const rawDesc = p.short_description || p.description || '';
          const description = rawDesc.replace(/<[^>]*>/g, '').trim().substring(0, 300);

          // Product URL
          const productUrl = p.permalink || (p.slug ? `${baseUrl}/product/${p.slug}` : undefined);

          // Categories
          const categories = p.categories?.map((c: any) => c.name).filter(Boolean) || [];

          products.push({
            name: name.replace(/<[^>]*>/g, '').trim(), // WC sometimes has HTML in names
            description,
            price,
            currency,
            imageUrl,
            productUrl,
            category: categories[0] || undefined,
            inStock: p.is_in_stock !== false && p.is_purchasable !== false,
            confidence: 90,
          });
        }

        if (products.length > 0) {
          console.log(`[WebsiteAnalyzer] ✅ WooCommerce API: Got ${products.length} products from ${endpoint}`);
          return products;
        }
      } catch (err) {
        console.log(`[WebsiteAnalyzer] WooCommerce API ${endpoint} failed:`, err instanceof Error ? err.message : 'unknown');
      }
    }
    return [];
  };

  // --- Zid (existing, enhanced) ---
  const tryZidAPI = async (): Promise<ExtractedProduct[]> => {
    const products: ExtractedProduct[] = [];

    const zidEndpoints: { url: string; headers?: Record<string, string> }[] = [];

    // If we have a store-id, prioritize authenticated API
    if (zidStoreId) {
      zidEndpoints.push({
        url: `${baseUrl}/api/v1/products`,
        headers: {
          'store-id': zidStoreId,
          'Accept-Language': 'ar',
          'Content-Type': 'application/json',
        },
      });
    }

    // Standard endpoints
    zidEndpoints.push(
      { url: `${baseUrl}/api/v1/products` },
      { url: `${baseUrl}/api/products` },
    );

    for (const endpoint of zidEndpoints) {
      try {
        console.log(`[WebsiteAnalyzer] Trying Zid API: ${endpoint.url}${endpoint.headers ? ' [with store-id]' : ''}`);
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(endpoint.headers || {}),
        };

        let body: string | null = null;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(endpoint.url, { headers, signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
            body = await response.text();
          }
        } catch {
          const curlResult = await curlFetch(endpoint.url, headers);
          if (curlResult.ok) body = curlResult.body;
        }

        if (!body) continue;
        const data = JSON.parse(body);
        const rawProducts = data.results || data.products || data.data || (Array.isArray(data) ? data : []);
        if (!Array.isArray(rawProducts) || rawProducts.length === 0) continue;

        for (const p of rawProducts.slice(0, 50)) {
          const name = p.title || p.name || '';
          if (!name) continue;

          // Zid price: { amount: number, currency: { code: "SAR" } } or direct number
          let price = 0;
          let currency = 'SAR';
          if (typeof p.price === 'object' && p.price !== null) {
            price = parseFloat(p.price.amount || p.price.value || p.price.price || '0');
            if (p.price.currency?.code) currency = p.price.currency.code;
          } else {
            price = parseFloat(p.price || p.sale_price || p.regular_price || '0');
          }

          // Zid image: thumbnail object with full_size/large/medium/small
          const resolveZidImage = (val: any): string | undefined => {
            if (!val) return undefined;
            if (typeof val === 'string' && val.startsWith('http')) return val;
            if (typeof val === 'object') {
              return val.full_size || val.large || val.medium || val.small || val.thumbnail || val.url || val.src || val.original_url;
            }
            return undefined;
          };

          const imageUrl = resolveZidImage(p.image) || resolveZidImage(p.images?.[0]) ||
            resolveZidImage(p.thumbnail) || resolveZidImage(p.main_image);

          const description = (p.body_html || p.description || p.short_description || p.content || '')
            .replace(/<[^>]*>/g, '').trim().substring(0, 300);

          let productUrl = p.url || p.permalink || (p.slug ? `${baseUrl}/products/${p.slug}` : undefined);
          if (productUrl && typeof productUrl === 'string' && !productUrl.startsWith('http')) {
            productUrl = productUrl.startsWith('/') ? `${baseUrl}${productUrl}` : `${baseUrl}/${productUrl}`;
          }

          products.push({
            name,
            description,
            price,
            currency,
            imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
            productUrl: typeof productUrl === 'string' ? productUrl : undefined,
            category: p.category?.name || p.categories?.[0]?.name,
            inStock: p.in_stock !== false && p.available !== false && p.quantity !== 0,
            confidence: 90,
          });
        }

        if (products.length > 0) {
          console.log(`[WebsiteAnalyzer] ✅ Zid API: Got ${products.length} products from ${endpoint.url}`);
          return products;
        }
      } catch (err) {
        console.log(`[WebsiteAnalyzer] Zid API ${endpoint.url} failed:`, err instanceof Error ? err.message : 'unknown');
      }
    }
    return products;
  };

  // =============================================
  // Execute platform-specific scrapers
  // =============================================

  // Detect platform from URL patterns for prioritization
  const urlLower = url.toLowerCase();
  const isSallaUrl = urlLower.includes('salla.sa') || urlLower.includes('salla.network');
  const isShopifyUrl = urlLower.includes('shopify') || urlLower.includes('myshopify');
  const isZidUrl = urlLower.includes('zid.sa') || urlLower.includes('zid.store');

  // Run platform-specific scraper first based on URL hints
  if (isSallaUrl) {
    const sallaProducts = await trySallaAPI();
    if (sallaProducts.length > 0) return sallaProducts;
  }
  if (isShopifyUrl) {
    const shopifyProducts = await tryShopifyAPI();
    if (shopifyProducts.length > 0) return shopifyProducts;
  }
  if (isZidUrl) {
    const zidProducts = await tryZidAPI();
    if (zidProducts.length > 0) return zidProducts;
  }

  // If no platform-specific match from URL, try all in priority order
  console.log('[WebsiteAnalyzer] No platform detected from URL, trying all APIs...');

  // Try Shopify first (most likely to have public products.json)
  const shopifyProducts = await tryShopifyAPI();
  if (shopifyProducts.length > 0) return shopifyProducts;

  // Try WooCommerce Store API (public, no auth)
  const wooProducts = await tryWooCommerceAPI();
  if (wooProducts.length > 0) return wooProducts;

  // Try Salla API
  const sallaProducts = await trySallaAPI();
  if (sallaProducts.length > 0) return sallaProducts;

  // Try Zid
  const zidProducts = await tryZidAPI();
  if (zidProducts.length > 0) return zidProducts;

  return [];
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
