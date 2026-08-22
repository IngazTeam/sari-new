import { z } from 'zod';
import {
  normalizeZidStoreId,
  requestZidApi,
  type ZidApiCredentials,
} from './zid-api';
import {
  normalizeZidProduct,
  safeZidHttpUrl,
  safeZidText,
  ZidProductSyncError,
  type NormalizedZidProduct,
} from './zid-product-normalization';

export { ZidProductSyncError } from './zid-product-normalization';

const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 100;
const MAX_PRODUCTS_PER_SYNC = PRODUCT_PAGE_SIZE * MAX_PRODUCT_PAGES;

const zidProductPageSchema = z.object({
  results: z.array(z.unknown()).max(PRODUCT_PAGE_SIZE),
  next: z.string().max(2048).nullable().optional(),
}).passthrough();

const zidStoreResponseSchema = z.object({
  store: z.object({
    id: z.union([z.string(), z.number()]),
    title: z.string().max(255).optional(),
    name: z.string().max(255).optional(),
    url: z.string().max(500).optional(),
  }).passthrough(),
}).passthrough();

export type ZidStoreIdentity = {
  storeId: string;
  storeName: string;
  storeUrl: string | null;
};

export async function fetchZidStoreIdentity(input: {
  credentials: ZidApiCredentials;
  fetchImpl?: typeof fetch;
}): Promise<ZidStoreIdentity> {
  const response = await requestZidApi('/v1/managers/account/store', input.credentials, {
    fetchImpl: input.fetchImpl,
  });
  const parsed = zidStoreResponseSchema.safeParse(response);
  const storeId = parsed.success ? normalizeZidStoreId(parsed.data.store.id) : null;
  if (!parsed.success || !storeId) throw new ZidProductSyncError('invalid_store');
  return {
    storeId,
    storeName: safeZidText(parsed.data.store.title ?? parsed.data.store.name, 255) || 'متجر زد',
    storeUrl: safeZidHttpUrl(parsed.data.store.url),
  };
}

export async function fetchAllZidProducts(input: {
  credentials: ZidApiCredentials;
  storeId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<NormalizedZidProduct[]> {
  const storeId = normalizeZidStoreId(input.storeId);
  if (!storeId) throw new ZidProductSyncError('invalid_store');
  const products: NormalizedZidProduct[] = [];
  const seenIds = new Set<string>();
  const syncStartedAt = input.now || new Date();

  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const response = await requestZidApi(
      `/v1/products/?page=${page}&page_size=${PRODUCT_PAGE_SIZE}`,
      input.credentials,
      { productContext: { storeId }, fetchImpl: input.fetchImpl },
    );
    const parsed = zidProductPageSchema.safeParse(response);
    if (!parsed.success) throw new ZidProductSyncError('invalid_page');
    for (const product of parsed.data.results) {
      const normalized = normalizeZidProduct(product, syncStartedAt);
      if (seenIds.has(normalized.externalId)) continue;
      seenIds.add(normalized.externalId);
      products.push(normalized);
      if (products.length > MAX_PRODUCTS_PER_SYNC) throw new ZidProductSyncError('limit');
    }

    const hasNextPage = typeof parsed.data.next === 'string' && parsed.data.next.trim().length > 0;
    if (!hasNextPage) return products;
    if (parsed.data.results.length === 0) throw new ZidProductSyncError('invalid_page');
    // Do not follow Zid's `next` URL. Only its presence is used; the next
    // trusted relative URL is constructed above to prevent SSRF/downgrades.
    if (page === MAX_PRODUCT_PAGES) throw new ZidProductSyncError('limit');
  }
  throw new ZidProductSyncError('limit');
}
