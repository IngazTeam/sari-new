import { createHash } from 'node:crypto';
import { and, eq, isNotNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { discoveredPages, extractedFaqs, merchants, products, productVariants } from '../../drizzle/schema';
import { majorToMinor } from '../../shared/product-money';
import { formatDateForDB, getDb, type SariDb } from '../db/connection';

const action = z.enum(['replace', 'merge', 'skip']);
const pageType = z.enum(['about', 'shipping', 'returns', 'faq', 'contact', 'privacy', 'terms', 'other']);
export const analysisProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(15000).default(''),
  price: z.number().finite().refine(value => { try { majorToMinor(value); return true; } catch { return false; } }, 'Product price requires verification'),
  currency: z.enum(['SAR', 'USD']).default('SAR'),
  imageUrl: z.string().max(500).nullish(),
  productUrl: z.string().max(500).nullish(),
  category: z.string().max(100).nullish(),
});
export const analysisSnapshotSchema = z.object({
  websiteUrl: z.string().url().max(500),
  platform: z.enum(['salla', 'zid', 'shopify', 'woocommerce', 'custom', 'unknown']),
  productsAction: action,
  products: z.array(analysisProductSchema).max(2000).default([]),
  faqsAction: action,
  faqs: z.array(z.object({ question: z.string().trim().min(1).max(15000), answer: z.string().trim().min(1).max(15000), category: z.string().max(255).default('') })).max(2000).default([]),
  pagesAction: action,
  pages: z.array(z.object({ pageType, title: z.string().max(500), url: z.string().url().max(1000), content: z.string().max(15000).optional() })).max(2000).default([]),
  applyContactInfo: z.boolean().default(false),
  contactInfo: z.object({
    phones: z.array(z.string().max(20)).max(20).default([]),
    emails: z.array(z.string()).default([]),
    whatsappNumber: z.string().nullable().default(null),
    address: z.string().max(500).nullable().default(null),
  }).optional(),
});

type Transaction = Parameters<Parameters<SariDb['transaction']>[0]>[0];
const identity = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class AnalysisSnapshotValidationError extends Error {
  constructor() { super('Invalid analysis data'); this.name = 'AnalysisSnapshotValidationError'; }
}

/** URLs are stored, not fetched here. Fetching still requires the DNS/SSRF guard. */
function storedUrl(value: string, base?: string): string {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new AnalysisSnapshotValidationError(); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new AnalysisSnapshotValidationError();
  url.hash = '';
  return url.href;
}

function prepareProducts(websiteUrl: string, inputs: unknown[]) {
  const source = storedUrl(websiteUrl);
  const seen = new Set<string>();
  return inputs.map(input => {
    const product = analysisProductSchema.parse(input);
    const productUrl = product.productUrl ? storedUrl(product.productUrl, source) : null;
    const imageUrl = product.imageUrl ? storedUrl(product.imageUrl, source) : null;
    if ((productUrl?.length || 0) > 500 || (imageUrl?.length || 0) > 500) throw new AnalysisSnapshotValidationError();
    const externalId = `website:${hash(JSON.stringify([new URL(source).origin, productUrl || identity(product.name)]))}`;
    if (seen.has(externalId)) throw new AnalysisSnapshotValidationError();
    seen.add(externalId);
    return {
      name: product.name, description: product.description, price: majorToMinor(product.price),
      currency: product.currency, priceUnit: 'minor' as const, productUrl, imageUrl,
      category: product.category || null, sallaProductId: externalId,
    };
  });
}

async function lockMerchant(tx: Transaction, merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error('Invalid merchant');
  const rows = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
  if (!rows.length) throw new Error('Merchant not found');
}

async function saveProducts(tx: Transaction, merchantId: number, mode: 'merge' | 'replace', batch: ReturnType<typeof prepareProducts>) {
  const existing = await tx.select().from(products).where(eq(products.merchantId, merchantId)).for('update');
  const byExternal = new Map(existing.map(row => [row.sallaProductId, row]));
  const existingNames = new Set(existing.map(row => identity(row.name)));
  const kept: number[] = [];
  let saved = 0;
  for (const product of batch) {
    const previous = byExternal.get(product.sallaProductId);
    if (mode === 'merge' && (previous || existingNames.has(identity(product.name)))) continue;
    if (previous) {
      await tx.update(products).set({ ...product, status: 'active', isActive: 1,
        // Old cost/comparison amounts have no provenance; never relabel them as minor units.
        ...(previous.priceUnit !== 'minor' || previous.currency !== product.currency ? { compareAtPrice: null, costPrice: null } : {}),
      }).where(and(eq(products.merchantId, merchantId), eq(products.id, previous.id)));
      if (previous.currency !== product.currency) {
        // Variants inherit the product currency. A new base currency cannot certify old amounts.
        await tx.update(productVariants).set({ priceUnit: 'unverified' })
          .where(and(eq(productVariants.merchantId, merchantId), eq(productVariants.productId, previous.id), isNotNull(productVariants.price)));
      }
      kept.push(previous.id);
    } else {
      const [inserted] = await tx.insert(products).values({ ...product, merchantId }).$returningId();
      kept.push(inserted.id);
    }
    existingNames.add(identity(product.name));
    saved++;
  }
  if (mode === 'replace') {
    // Keep identifiers, variants and order references. Unknown stock is never invented.
    await tx.update(products).set({ status: 'archived', isActive: 0, registrationOpen: 0 })
      .where(and(eq(products.merchantId, merchantId), kept.length ? notInArray(products.id, kept) : undefined));
  }
  return saved;
}

/** All catalogue imports use the same merchant lock as external source synchronization. */
export async function mergeAnalyzedProducts(merchantId: number, websiteUrl: string, inputs: unknown[]) {
  if (inputs.length > 2000) throw new Error('Too many products in analysis');
  const batch = prepareProducts(websiteUrl, inputs);
  const database = await getDb();
  if (!database) throw new Error('Database unavailable');
  return database.transaction(async tx => {
    await lockMerchant(tx, merchantId);
    return saveProducts(tx, merchantId, 'merge', batch);
  });
}

/** The user's selected changes commit together. No AI/network call runs inside the transaction. */
export async function applyAnalysisSnapshot(merchantId: number, raw: z.input<typeof analysisSnapshotSchema>) {
  const input = analysisSnapshotSchema.parse(raw);
  const websiteUrl = storedUrl(input.websiteUrl);
  const batch = input.productsAction === 'skip' ? [] : prepareProducts(websiteUrl, input.products);
  const pages = input.pages.map(page => ({ ...page, url: storedUrl(page.url) }));
  if (websiteUrl.length > 500 || pages.some(page => page.url.length > 1000)) throw new AnalysisSnapshotValidationError();
  const database = await getDb();
  if (!database) throw new Error('Database unavailable');
  return database.transaction(async tx => {
    await lockMerchant(tx, merchantId);
    let savedProducts = 0, savedFaqs = 0, savedPages = 0;
    // Preserve the existing contract: an empty extraction cannot clear a catalogue.
    if (input.productsAction !== 'skip' && batch.length) savedProducts = await saveProducts(tx, merchantId, input.productsAction, batch);
    if (input.pagesAction !== 'skip' && pages.length) {
      const existing = await tx.select().from(discoveredPages).where(eq(discoveredPages.merchantId, merchantId)).for('update');
      const byUrl = new Map(existing.map(row => [row.url, row]));
      const kept: number[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        if (seen.has(page.url)) continue;
        seen.add(page.url);
        const previous = byUrl.get(page.url);
        if (previous && input.pagesAction === 'merge') continue;
        if (previous) {
          await tx.update(discoveredPages).set({ ...page, isActive: 1, useInBot: 1 }).where(and(eq(discoveredPages.merchantId, merchantId), eq(discoveredPages.id, previous.id)));
          kept.push(previous.id);
        } else {
          const [inserted] = await tx.insert(discoveredPages).values({ ...page, merchantId }).$returningId();
          kept.push(inserted.id);
        }
        savedPages++;
      }
      if (input.pagesAction === 'replace') await tx.update(discoveredPages).set({ isActive: 0, useInBot: 0 })
        .where(and(eq(discoveredPages.merchantId, merchantId), notInArray(discoveredPages.id, kept)));
    }
    if (input.faqsAction !== 'skip' && input.faqs.length) {
      const existing = await tx.select().from(extractedFaqs).where(eq(extractedFaqs.merchantId, merchantId)).for('update');
      const byQuestion = new Map(existing.map(row => [identity(row.question), row]));
      const kept: number[] = [];
      const seen = new Set<string>();
      for (const faq of input.faqs) {
        const key = identity(faq.question);
        if (seen.has(key)) continue;
        seen.add(key);
        const previous = byQuestion.get(key);
        if (previous && input.faqsAction === 'merge') continue;
        if (previous) {
          await tx.update(extractedFaqs).set({ ...faq, sourceStatus: 'active', isActive: 1, useInBot: 1 }).where(and(eq(extractedFaqs.merchantId, merchantId), eq(extractedFaqs.id, previous.id)));
          kept.push(previous.id);
        } else {
          const [inserted] = await tx.insert(extractedFaqs).values({ ...faq, merchantId }).$returningId();
          kept.push(inserted.id);
        }
        savedFaqs++;
      }
      if (input.faqsAction === 'replace') await tx.update(extractedFaqs).set({ sourceStatus: 'archived', isActive: 0, useInBot: 0 })
        .where(and(eq(extractedFaqs.merchantId, merchantId), notInArray(extractedFaqs.id, kept)));
    }
    await tx.update(merchants).set({ websiteUrl, platformType: input.platform, analysisStatus: 'completed', lastAnalysisDate: formatDateForDB(new Date()),
      ...(input.applyContactInfo && input.contactInfo?.phones.length ? { phone: input.contactInfo.phones[0] } : {}),
      ...(input.applyContactInfo && input.contactInfo?.address ? { address: input.contactInfo.address } : {}),
    }).where(eq(merchants.id, merchantId));
    return { success: true as const, savedProducts, savedFaqs, savedPages };
  });
}
