import { z } from 'zod';
import { requestZidApi, type ZidApiCredentials } from './zid-api';
import {
  normalizeZidCustomer,
  normalizeZidOrder,
  ZidCommerceSyncError,
  type NormalizedZidCustomer,
  type NormalizedZidOrder,
} from './zid-commerce-normalization';

export { ZidCommerceSyncError } from './zid-commerce-normalization';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_RECORDS = PAGE_SIZE * MAX_PAGES;

const orderPageSchema = z.object({
  orders: z.array(z.unknown()).max(PAGE_SIZE),
  total_order_count: z.coerce.number().int().nonnegative(),
}).passthrough();

const customerPageSchema = z.object({
  customers: z.array(z.unknown()).max(PAGE_SIZE),
  total_customers_count: z.coerce.number().int().nonnegative(),
  next_cursor: z.union([z.string().max(32), z.number().int().nonnegative(), z.null()]).optional(),
}).passthrough();

function validatedTotal(value: number): number {
  if (value > MAX_RECORDS) throw new ZidCommerceSyncError('limit');
  return value;
}

export async function fetchAllZidOrders(input: {
  credentials: ZidApiCredentials;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<NormalizedZidOrder[]> {
  const records: NormalizedZidOrder[] = [];
  const seenIds = new Set<string>();
  const syncStartedAt = input.now || new Date();
  let rawCount = 0;
  let expectedTotal: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await requestZidApi(
      `/v1/managers/store/orders?payload_type=simple&page=${page}&per_page=${PAGE_SIZE}`,
      input.credentials,
      { fetchImpl: input.fetchImpl },
    );
    const parsed = orderPageSchema.safeParse(response);
    if (!parsed.success) throw new ZidCommerceSyncError('invalid_page');
    const pageTotal = validatedTotal(parsed.data.total_order_count);
    expectedTotal = expectedTotal === null ? pageTotal : Math.max(expectedTotal, pageTotal);
    rawCount += parsed.data.orders.length;
    if (rawCount > MAX_RECORDS) throw new ZidCommerceSyncError('limit');
    if (rawCount > expectedTotal) throw new ZidCommerceSyncError('invalid_page');
    for (const order of parsed.data.orders) {
      const normalized = normalizeZidOrder(order, syncStartedAt);
      if (seenIds.has(normalized.externalId)) continue;
      seenIds.add(normalized.externalId);
      records.push(normalized);
    }
    if (rawCount >= expectedTotal) return records;
    if (parsed.data.orders.length === 0) throw new ZidCommerceSyncError('invalid_page');
    if (page === MAX_PAGES) throw new ZidCommerceSyncError('limit');
  }
  throw new ZidCommerceSyncError('limit');
}

function cursor(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!/^\d{1,20}$/.test(normalized)) throw new ZidCommerceSyncError('invalid_cursor');
  return normalized;
}

export async function fetchAllZidCustomers(input: {
  credentials: ZidApiCredentials;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<NormalizedZidCustomer[]> {
  const records: NormalizedZidCustomer[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>(['0']);
  const syncStartedAt = input.now || new Date();
  let after = '0';
  let rawCount = 0;
  let expectedTotal: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await requestZidApi(
      `/v1/managers/store/customers?after=${after}&per_page=${PAGE_SIZE}`,
      input.credentials,
      { fetchImpl: input.fetchImpl },
    );
    const parsed = customerPageSchema.safeParse(response);
    if (!parsed.success) throw new ZidCommerceSyncError('invalid_page');
    const pageTotal = validatedTotal(parsed.data.total_customers_count);
    expectedTotal = expectedTotal === null ? pageTotal : Math.max(expectedTotal, pageTotal);
    rawCount += parsed.data.customers.length;
    if (rawCount > MAX_RECORDS) throw new ZidCommerceSyncError('limit');
    if (rawCount > expectedTotal) throw new ZidCommerceSyncError('invalid_page');
    for (const customer of parsed.data.customers) {
      const normalized = normalizeZidCustomer(customer, syncStartedAt);
      if (seenIds.has(normalized.externalId)) continue;
      seenIds.add(normalized.externalId);
      records.push(normalized);
    }
    if (rawCount >= expectedTotal) return records;
    if (parsed.data.customers.length === 0) throw new ZidCommerceSyncError('invalid_page');
    const nextCursor = cursor(parsed.data.next_cursor);
    if (!nextCursor || seenCursors.has(nextCursor)) throw new ZidCommerceSyncError('invalid_cursor');
    seenCursors.add(nextCursor);
    after = nextCursor;
    if (page === MAX_PAGES) throw new ZidCommerceSyncError('limit');
  }
  throw new ZidCommerceSyncError('limit');
}
