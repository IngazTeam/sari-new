import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { detectPlatform, discoverPages, scrapeWebsite } from './_core/websiteAnalyzer';
import { JSDOM } from 'jsdom';

describe('Smart Website Analysis', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Use existing merchant or create a test one
    testMerchantId = 150001; // Default test merchant
  });

  describe('Database Functions', () => {
    it('should update merchant website info', async () => {
      await db.updateMerchantWebsiteInfo({
        merchantId: testMerchantId,
        websiteUrl: 'https://example.com',
        platformType: 'custom',
        analysisStatus: 'pending',
      });

      const info = await db.getMerchantWebsiteInfo(testMerchantId);
      expect(info).toBeDefined();
      expect(info?.websiteUrl).toBe('https://example.com');
      expect(info?.platformType).toBe('custom');
    });

    it('should create and retrieve discovered pages', async () => {
      const pageId = await db.createDiscoveredPage({
        merchantId: testMerchantId,
        pageType: 'about',
        title: 'About Us',
        url: 'https://example.com/about',
        isActive: true,
        useInBot: true,
      });

      expect(pageId).toBeGreaterThan(0);

      const pages = await db.getDiscoveredPagesByMerchantId(testMerchantId);
      expect(pages.length).toBeGreaterThan(0);
      
      const aboutPages = pages.filter(p => p.pageType === 'about');
      expect(aboutPages.length).toBeGreaterThan(0);
    });

    it('should create and retrieve extracted FAQs', async () => {
      const faqId = await db.createExtractedFaq({
        merchantId: testMerchantId,
        question: 'What is your return policy?',
        answer: 'We accept returns within 30 days.',
        category: 'returns',
        isActive: true,
        useInBot: true,
        priority: 1,
      });

      expect(faqId).toBeGreaterThan(0);

      const faqs = await db.getExtractedFaqsByMerchantId(testMerchantId);
      expect(faqs.length).toBeGreaterThan(0);
    });

    it('should get active FAQs for bot', async () => {
      const activeFaqs = await db.getActiveFaqsForBot(testMerchantId);
      expect(Array.isArray(activeFaqs)).toBe(true);
      
      // All returned FAQs should be active and enabled for bot
      activeFaqs.forEach(faq => {
        expect(faq.isActive).toBe(true);
        expect(faq.useInBot).toBe(true);
      });
    });

    it('should search FAQs by question', async () => {
      const results = await db.searchFaqsByQuestion(testMerchantId, 'return');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should get analysis statistics', async () => {
      const stats = await db.getAnalysisStats(testMerchantId);
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalPages).toBe('number');
      expect(typeof stats.totalFaqs).toBe('number');
      expect(typeof stats.pagesByType).toBe('object');
      expect(typeof stats.faqsByCategory).toBe('object');
    });

    it('should update discovered page', async () => {
      const pages = await db.getDiscoveredPagesByMerchantId(testMerchantId);
      if (pages.length > 0) {
        const pageId = pages[0].id;
        
        await db.updateDiscoveredPage(pageId, {
          title: 'Updated Title',
          isActive: false,
        });

        const updatedPages = await db.getDiscoveredPagesByMerchantId(testMerchantId);
        const updatedPage = updatedPages.find(p => p.id === pageId);
        
        expect(updatedPage?.title).toBe('Updated Title');
        expect(updatedPage?.isActive).toBe(false);
      }
    });

    it('should update extracted FAQ', async () => {
      const faqs = await db.getExtractedFaqsByMerchantId(testMerchantId);
      if (faqs.length > 0) {
        const faqId = faqs[0].id;
        
        await db.updateExtractedFaq(faqId, {
          priority: 10,
          isActive: false,
        });

        const updatedFaqs = await db.getExtractedFaqsByMerchantId(testMerchantId);
        const updatedFaq = updatedFaqs.find(f => f.id === faqId);
        
        expect(updatedFaq?.priority).toBe(10);
        expect(updatedFaq?.isActive).toBe(false);
      }
    });

    it('should increment FAQ usage count', async () => {
      const faqs = await db.getExtractedFaqsByMerchantId(testMerchantId);
      if (faqs.length > 0) {
        const faqId = faqs[0].id;
        const initialCount = faqs[0].usageCount;
        
        await db.incrementFaqUsageCount(faqId);

        const updatedFaqs = await db.getExtractedFaqsByMerchantId(testMerchantId);
        const updatedFaq = updatedFaqs.find(f => f.id === faqId);
        
        expect(updatedFaq?.usageCount).toBe(initialCount + 1);
      }
    });
  });

  describe('Platform Detection', () => {
    it('should detect Salla platform', () => {
      const html = '<html><head><meta name="salla-store" content="test"></head></html>';
      const platform = detectPlatform('https://example.salla.sa', html);
      expect(platform).toBe('salla');
    });

    it('should detect Shopify platform', () => {
      const html = '<html><head><script src="https://cdn.shopify.com/test.js"></script></head></html>';
      const platform = detectPlatform('https://example.myshopify.com', html);
      expect(platform).toBe('shopify');
    });

    it('should detect WooCommerce platform', () => {
      const html = '<html><body><div class="woocommerce">Test</div></body></html>';
      const platform = detectPlatform('https://example.com', html);
      expect(platform).toBe('woocommerce');
    });

    it('should detect Zid platform', () => {
      const html = '<html><body><script>window.zid = {};</script></body></html>';
      const platform = detectPlatform('https://example.zid.sa', html);
      expect(platform).toBe('zid');
    });

    it('should return custom for unrecognized platforms', () => {
      const html = '<html><body>Simple website</body></html>';
      const platform = detectPlatform('https://example.com', html);
      expect(platform).toBe('custom');
    });
  });

  describe('Page Discovery', () => {
    it('should discover pages from HTML', () => {
      const html = `
        <html>
          <body>
            <a href="/about">About Us</a>
            <a href="/shipping">Shipping Info</a>
            <a href="/faq">FAQ</a>
            <a href="/contact">Contact</a>
          </body>
        </html>
      `;

      const dom = new JSDOM(html);
      const pages = discoverPages(dom, 'https://example.com');
      
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      
      // Check if at least one page was discovered
      const pageTypes = pages.map(p => p.pageType);
      expect(pageTypes.some(type => ['about', 'shipping', 'faq', 'contact'].includes(type))).toBe(true);
    });

    it('should normalize URLs correctly', () => {
      const html = `
        <html>
          <body>
            <a href="/about">About</a>
            <a href="https://example.com/shipping">Shipping</a>
          </body>
        </html>
      `;

      const dom = new JSDOM(html);
      const pages = discoverPages(dom, 'https://example.com');
      
      pages.forEach(page => {
        expect(page.url).toMatch(/^https?:\/\//);
      });
    });
  });

  describe('FAQ Extraction', () => {
    it('should extract FAQs from HTML using DOM selectors', () => {
      const html = `
        <html>
          <body>
            <div class="faq">
              <h3>What is your return policy?</h3>
              <p>We accept returns within 30 days of purchase.</p>
            </div>
            <div class="faq">
              <h3>How long does shipping take?</h3>
              <p>Shipping takes 3-5 business days for standard delivery.</p>
            </div>
          </body>
        </html>
      `;

      const dom = new JSDOM(html);
      const document = dom.window.document;
      const faqs: Array<{ question: string; answer: string }> = [];

      document.querySelectorAll('.faq, .faqs, [class*="faq"], .accordion, details').forEach((el: any) => {
        const question = (el.querySelector('h1, h2, h3, h4, h5, summary, [class*="question"], button')?.textContent || '').trim();
        const answer = (el.querySelector('p, [class*="answer"], .content, .panel, dd')?.textContent || '').trim();
        if (question && answer && question.length > 5 && answer.length > 10) {
          faqs.push({ question, answer });
        }
      });
      
      expect(Array.isArray(faqs)).toBe(true);
      expect(faqs.length).toBe(2);
      expect(faqs[0]).toHaveProperty('question');
      expect(faqs[0]).toHaveProperty('answer');
      expect(faqs[0].question).toBe('What is your return policy?');
    });

    it('should handle empty HTML gracefully', () => {
      const html = '<html><body></body></html>';
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const faqs: Array<{ question: string; answer: string }> = [];

      document.querySelectorAll('.faq, [class*="faq"]').forEach((el: any) => {
        const question = (el.querySelector('h3')?.textContent || '').trim();
        const answer = (el.querySelector('p')?.textContent || '').trim();
        if (question && answer) faqs.push({ question, answer });
      });
      
      expect(Array.isArray(faqs)).toBe(true);
      expect(faqs.length).toBe(0);
    });
  });
});

