import axios, { type Method } from 'axios';
import dns from 'node:dns/promises';
import https from 'node:https';
import { z } from 'zod';
import type { WooCommerceSettings } from '../drizzle/schema';
import { isPrivateOrSpecialAddress } from './integrations/byaan-security';

const WOO_API_TIMEOUT_MS = 12_000;
const WOO_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const WOO_MAX_SYNC_PAGES = 20;
export const WOO_PAGE_SIZE = 100;
const WOO_PRODUCT_FIELDS = 'id,name,slug,sku,price,regular_price,sale_price,stock_status,stock_quantity,manage_stock,description,short_description,images,categories,date_modified_gmt,date_modified';
const WOO_ORDER_FIELDS = 'id,number,status,currency,total,total_tax,shipping_total,discount_total,billing,line_items,payment_method,payment_method_title,transaction_id,date_created_gmt,date_created,date_modified_gmt,date_modified,date_paid_gmt,date_paid,date_completed_gmt,date_completed,customer_note';
const DOMAIN_PATTERN = /^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const optionalString = (max: number) => z.string().max(max).nullish().transform(value => value || '');
const optionalNumber = z.number().finite().nullish().transform(value => value ?? null);

const productSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(500),
  slug: optionalString(500),
  sku: optionalString(255),
  price: optionalString(64),
  regular_price: optionalString(64),
  sale_price: optionalString(64),
  stock_status: z.enum(['instock', 'outofstock', 'onbackorder']).catch('instock'),
  stock_quantity: optionalNumber,
  manage_stock: z.boolean().catch(false),
  description: optionalString(100_000),
  short_description: optionalString(25_000),
  images: z.array(z.object({ src: z.string().url().max(1_000) }).passthrough()).max(100).catch([]),
  categories: z.array(z.object({ id: z.number().int(), name: optionalString(255) }).passthrough()).max(100).catch([]),
  date_modified_gmt: optionalString(64),
  date_modified: optionalString(64),
}).passthrough();

const orderSchema = z.object({
  id: z.number().int().positive(),
  number: z.union([z.string(), z.number()]).transform(String).pipe(z.string().max(100)),
  status: z.string().min(1).max(50),
  currency: z.string().min(3).max(10),
  total: optionalString(64),
  total_tax: optionalString(64),
  shipping_total: optionalString(64),
  discount_total: optionalString(64),
  billing: z.object({
    first_name: optionalString(255),
    last_name: optionalString(255),
    email: optionalString(255),
    phone: optionalString(50),
  }).passthrough(),
  shipping: z.record(z.string(), z.unknown()).catch({}),
  line_items: z.array(z.object({
    id: z.number().int().optional(),
    name: z.string().max(500),
    product_id: z.number().int().nonnegative().catch(0),
    variation_id: z.number().int().nonnegative().catch(0),
    quantity: z.number().finite(),
    subtotal: optionalString(64),
    total: optionalString(64),
    sku: optionalString(255),
  }).passthrough()).max(500),
  payment_method: optionalString(100),
  payment_method_title: optionalString(255),
  transaction_id: optionalString(255),
  date_created_gmt: optionalString(64),
  date_created: optionalString(64),
  date_modified_gmt: optionalString(64),
  date_modified: optionalString(64),
  date_paid_gmt: optionalString(64),
  date_paid: optionalString(64),
  date_completed_gmt: optionalString(64),
  date_completed: optionalString(64),
  customer_note: optionalString(10_000),
}).passthrough();

export type WooCommerceProduct = z.infer<typeof productSchema>;
export type WooCommerceOrder = z.infer<typeof orderSchema>;

export class WooCommerceApiError extends Error {
  constructor(public readonly code: 'credentials' | 'endpoint' | 'network' | 'status' | 'response' | 'limit') {
    super(code);
  }
}

export function canonicalWooStoreUrl(input: string): string {
  if (typeof input !== 'string' || input.length > 500 || CONTROL_CHARACTERS.test(input)) {
    throw new WooCommerceApiError('endpoint');
  }
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new WooCommerceApiError('endpoint');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || (parsed.port && parsed.port !== '443')
    || parsed.search
    || parsed.hash
    || !DOMAIN_PATTERN.test(hostname)
    || hostname === 'localhost'
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  ) {
    throw new WooCommerceApiError('endpoint');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname.length > 250 || /\/wp-json(?:\/|$)/i.test(pathname)) {
    throw new WooCommerceApiError('endpoint');
  }
  return `https://${hostname}${pathname}`;
}

function normalizedCredential(value: string, prefix: 'ck_' | 'cs_'): string {
  const normalized = String(value || '').trim();
  if (
    normalized.length < 23
    || normalized.length > 160
    || !normalized.startsWith(prefix)
    || !/^[a-zA-Z0-9_]+$/.test(normalized)
  ) {
    throw new WooCommerceApiError('credentials');
  }
  return normalized;
}

export async function createPinnedWooHttpsAgent(storeUrl: string): Promise<https.Agent> {
  const parsed = new URL(canonicalWooStoreUrl(storeUrl));
  const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateOrSpecialAddress(item.address))) {
    throw new WooCommerceApiError('endpoint');
  }
  const pinned = addresses[0];
  return new https.Agent({
    keepAlive: false,
    lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
  });
}

function parseBoundedJson(data: unknown): unknown {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  if (buffer.byteLength > WOO_MAX_RESPONSE_BYTES) throw new WooCommerceApiError('response');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    throw new WooCommerceApiError('response');
  }
}

function positiveHeader(value: unknown, fallback: number): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export class WooCommerceClient {
  private readonly storeUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;

  constructor(settings: Pick<WooCommerceSettings, 'storeUrl' | 'consumerKey' | 'consumerSecret'>) {
    this.storeUrl = canonicalWooStoreUrl(settings.storeUrl);
    this.consumerKey = normalizedCredential(settings.consumerKey, 'ck_');
    this.consumerSecret = normalizedCredential(settings.consumerSecret, 'cs_');
  }

  private trustedUrl(endpoint: string): string {
    if (!endpoint.startsWith('/') || CONTROL_CHARACTERS.test(endpoint) || endpoint.includes('\\')) {
      throw new WooCommerceApiError('endpoint');
    }
    const root = new URL(`${this.storeUrl}/`);
    const apiRoot = new URL('wp-json/wc/v3/', root);
    const url = new URL(endpoint.slice(1), apiRoot);
    if (url.origin !== root.origin || !url.pathname.startsWith(apiRoot.pathname) || url.username || url.password) {
      throw new WooCommerceApiError('endpoint');
    }
    return url.toString();
  }

  private async request(endpoint: string, options: {
    method?: Method;
    params?: Record<string, string | number>;
    body?: Record<string, unknown>;
  } = {}): Promise<{ body: unknown; headers: Record<string, unknown> }> {
    let response;
    try {
      response = await axios.request<ArrayBuffer>({
        url: this.trustedUrl(endpoint),
        method: options.method || 'GET',
        params: options.params,
        data: options.body,
        auth: { username: this.consumerKey, password: this.consumerSecret },
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: WOO_API_TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: WOO_MAX_RESPONSE_BYTES,
        maxBodyLength: 64 * 1024,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        httpsAgent: await createPinnedWooHttpsAgent(this.storeUrl),
      });
    } catch (error) {
      if (error instanceof WooCommerceApiError) throw error;
      throw new WooCommerceApiError('network');
    }
    if (response.status < 200 || response.status >= 300) throw new WooCommerceApiError('status');
    return { body: parseBoundedJson(response.data), headers: response.headers as Record<string, unknown> };
  }

  async testConnection(): Promise<{ version?: string; name?: string; currency?: string }> {
    const { body } = await this.request('/system_status');
    const parsed = z.object({
      environment: z.object({ version: optionalString(50) }).passthrough().optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
    }).passthrough().safeParse(body);
    if (!parsed.success) throw new WooCommerceApiError('response');
    return { version: parsed.data.environment?.version || undefined };
  }

  async getProductsPage(page: number): Promise<{ items: WooCommerceProduct[]; total: number; totalPages: number }> {
    if (!Number.isInteger(page) || page < 1 || page > WOO_MAX_SYNC_PAGES) throw new WooCommerceApiError('limit');
    const { body, headers } = await this.request('/products', {
      params: { page, per_page: WOO_PAGE_SIZE, orderby: 'id', order: 'asc', _fields: WOO_PRODUCT_FIELDS },
    });
    const parsed = z.array(productSchema).max(WOO_PAGE_SIZE).safeParse(body);
    if (!parsed.success) throw new WooCommerceApiError('response');
    return {
      items: parsed.data,
      total: positiveHeader(headers['x-wp-total'], parsed.data.length),
      totalPages: positiveHeader(headers['x-wp-totalpages'], parsed.data.length === WOO_PAGE_SIZE ? page + 1 : page),
    };
  }

  async getOrdersPage(page: number): Promise<{ items: WooCommerceOrder[]; total: number; totalPages: number }> {
    if (!Number.isInteger(page) || page < 1 || page > WOO_MAX_SYNC_PAGES) throw new WooCommerceApiError('limit');
    const { body, headers } = await this.request('/orders', {
      params: { page, per_page: WOO_PAGE_SIZE, orderby: 'id', order: 'asc', _fields: WOO_ORDER_FIELDS },
    });
    const parsed = z.array(orderSchema).max(WOO_PAGE_SIZE).safeParse(body);
    if (!parsed.success) throw new WooCommerceApiError('response');
    return {
      items: parsed.data,
      total: positiveHeader(headers['x-wp-total'], parsed.data.length),
      totalPages: positiveHeader(headers['x-wp-totalpages'], parsed.data.length === WOO_PAGE_SIZE ? page + 1 : page),
    };
  }

  async updateOrder(orderId: number, update: { status: string; customer_note?: string }): Promise<WooCommerceOrder> {
    if (!Number.isInteger(orderId) || orderId < 1) throw new WooCommerceApiError('endpoint');
    const { body } = await this.request(`/orders/${orderId}`, { method: 'PUT', body: update });
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) throw new WooCommerceApiError('response');
    return parsed.data;
  }
}

export function createWooCommerceClient(settings: Pick<WooCommerceSettings, 'storeUrl' | 'consumerKey' | 'consumerSecret'>): WooCommerceClient {
  return new WooCommerceClient(settings);
}

export function validateStoreUrl(url: string): boolean {
  try {
    canonicalWooStoreUrl(url);
    return true;
  } catch {
    return false;
  }
}
