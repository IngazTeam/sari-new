import type { NewWooCommerceOrder, NewWooCommerceProduct } from '../../drizzle/schema';
import {
  WOO_MAX_SYNC_PAGES,
  type WooCommerceClient,
  type WooCommerceOrder,
  type WooCommerceProduct,
  WooCommerceApiError,
} from '../woocommerce';

function mysqlTimestamp(value: string): string {
  const isoLike = value.replace(' ', 'T');
  const normalized = isoLike && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? `${isoLike}Z` : isoLike;
  const date = new Date(normalized);
  if (!value || !Number.isFinite(date.getTime())) throw new WooCommerceApiError('response');
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function optionalTimestamp(value: string): string | null {
  return value ? mysqlTimestamp(value) : null;
}

function decimal(value: string, fallback = '0'): string {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99_999_999.99) {
    throw new WooCommerceApiError('response');
  }
  return parsed.toFixed(2);
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

function providerUpdatedAt(value: { date_modified_gmt: string; date_modified: string }, fallback: string): string {
  return mysqlTimestamp(value.date_modified_gmt || value.date_modified || fallback);
}

export function normalizeWooCommerceProduct(
  merchantId: number,
  product: WooCommerceProduct,
  syncedAt: string,
): NewWooCommerceProduct {
  const price = decimal(product.price || product.sale_price || product.regular_price || '0');
  return {
    merchantId,
    wooProductId: product.id,
    name: text(product.name, 500) || `WooCommerce ${product.id}`,
    slug: text(product.slug, 500) || `woocommerce-${product.id}`,
    sku: text(product.sku, 255) || null,
    price,
    regularPrice: product.regular_price ? decimal(product.regular_price) : price,
    salePrice: product.sale_price ? decimal(product.sale_price) : null,
    stockStatus: product.stock_status,
    stockQuantity: product.stock_quantity,
    manageStock: product.manage_stock ? 1 : 0,
    description: text(product.description, 100_000) || null,
    shortDescription: text(product.short_description, 25_000) || null,
    imageUrl: product.images[0]?.src || null,
    categories: JSON.stringify(product.categories.map(category => ({ id: category.id, name: text(category.name, 255) }))),
    lastSyncAt: syncedAt,
    providerUpdatedAt: providerUpdatedAt(product, syncedAt),
    syncStatus: 'synced',
  };
}

export function normalizeWooCommerceOrder(
  merchantId: number,
  order: WooCommerceOrder,
  syncedAt: string,
): NewWooCommerceOrder {
  const createdAt = mysqlTimestamp(order.date_created_gmt || order.date_created);
  const lineItems = order.line_items.map(item => ({
    id: item.id,
    name: text(item.name, 500),
    product_id: item.product_id,
    variation_id: item.variation_id,
    quantity: item.quantity,
    subtotal: decimal(item.subtotal),
    total: decimal(item.total),
    sku: text(item.sku, 255),
  }));
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.subtotal), 0).toFixed(2);
  const billing = {
    first_name: text(order.billing.first_name, 255),
    last_name: text(order.billing.last_name, 255),
    email: text(order.billing.email, 255).toLowerCase(),
    phone: text(order.billing.phone, 50),
  };
  return {
    merchantId,
    wooOrderId: order.id,
    orderNumber: text(order.number, 100) || String(order.id),
    status: text(order.status, 50),
    currency: text(order.currency, 10).toUpperCase(),
    total: decimal(order.total),
    subtotal,
    totalTax: decimal(order.total_tax),
    shippingTotal: decimal(order.shipping_total),
    discountTotal: decimal(order.discount_total),
    customerEmail: billing.email || null,
    customerPhone: billing.phone || null,
    customerName: text(`${billing.first_name} ${billing.last_name}`, 255) || null,
    billingAddress: JSON.stringify(billing),
    shippingAddress: null,
    lineItems: JSON.stringify(lineItems),
    paymentMethod: text(order.payment_method, 100) || null,
    paymentMethodTitle: text(order.payment_method_title, 255) || null,
    transactionId: text(order.transaction_id, 255) || null,
    orderDate: createdAt,
    paidDate: optionalTimestamp(order.date_paid_gmt || order.date_paid),
    completedDate: optionalTimestamp(order.date_completed_gmt || order.date_completed),
    lastSyncAt: syncedAt,
    providerUpdatedAt: providerUpdatedAt(order, createdAt),
    syncStatus: 'synced',
    customerNote: text(order.customer_note, 10_000) || null,
  };
}

async function collectPages<T extends { id: number }>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number; totalPages: number }>,
): Promise<T[]> {
  const first = await fetchPage(1);
  if (first.totalPages > WOO_MAX_SYNC_PAGES) throw new WooCommerceApiError('limit');
  const expectedPages = Math.max(1, first.totalPages);
  const expectedTotal = first.total;
  const items = [...first.items];
  for (let page = 2; page <= expectedPages; page += 1) {
    const current = await fetchPage(page);
    if (current.totalPages !== expectedPages || current.total !== expectedTotal) throw new WooCommerceApiError('response');
    items.push(...current.items);
  }
  if (items.length !== expectedTotal || new Set(items.map(item => item.id)).size !== items.length) {
    throw new WooCommerceApiError('response');
  }
  return items;
}

export async function fetchWooCommerceProducts(client: WooCommerceClient): Promise<WooCommerceProduct[]> {
  return collectPages(page => client.getProductsPage(page));
}

export async function fetchWooCommerceOrders(client: WooCommerceClient): Promise<WooCommerceOrder[]> {
  return collectPages(page => client.getOrdersPage(page));
}

export function wooSyncTimestamp(now = new Date()): string {
  return now.toISOString().slice(0, 23).replace('T', ' ');
}
