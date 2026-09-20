import { applyAnalysisSnapshot } from '../catalog/analysis-snapshot';
import { cleanScrapedText } from '../_core/websiteAnalyzer';

const pageTypes = ['about', 'shipping', 'returns', 'faq', 'contact', 'privacy', 'terms', 'other'] as const;
type PageType = typeof pageTypes[number];
const normalizePageType = (value?: string): PageType => pageTypes.includes(value as PageType) ? value as PageType : 'other';
type CrawlFacts = {
  faqs?: Array<{ question: string; answer: string; category?: string }>;
  _crawledPages?: Array<{ success?: boolean; pageType?: string; title?: string; url: string; content?: string }>;
};

/** Automatic crawling adds new facts without erasing reviewed/disabled entries. */
export function persistCrawledKnowledge(merchantId: number, websiteUrl: string, result: CrawlFacts) {
  return applyAnalysisSnapshot(merchantId, {
    websiteUrl, platform: 'unknown', productsAction: 'skip',
    faqsAction: 'merge', faqs: result.faqs || [],
    pagesAction: 'merge', pages: (result._crawledPages || []).filter(page => page.success === true).map(page => ({
      pageType: normalizePageType(page.pageType),
      title: (page.title || '').slice(0, 500), url: page.url,
      content: cleanScrapedText(page.content || '').slice(0, 15000),
    })),
  }, { updateWebsiteInfo: false });
}
