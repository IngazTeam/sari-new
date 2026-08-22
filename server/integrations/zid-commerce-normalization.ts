export type NormalizedZidOrder = {
  externalId: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  totalAmount: string;
  totalAmountCents: number | null;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  sariStatus: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  items: string;
  shippingMethod: string | null;
  orderDate: string | null;
  lastSyncedAt: string;
};

export type NormalizedZidCustomer = {
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  totalOrders: number;
  totalSpent: string;
  isActive: number;
  lastOrderAt: string | null;
  lastSyncedAt: string;
};

export class ZidCommerceSyncError extends Error {
  constructor(public readonly code:
    | 'invalid_order'
    | 'invalid_customer'
    | 'invalid_page'
    | 'invalid_cursor'
    | 'limit') {
    super(code);
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function requiredExternalId(value: unknown, kind: 'order' | 'customer'): string {
  const candidate = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  const maxLength = kind === 'order' ? 96 : 255;
  if (!candidate || candidate.length > maxLength || /[\u0000-\u001f\u007f]/.test(candidate)) {
    throw new ZidCommerceSyncError(kind === 'order' ? 'invalid_order' : 'invalid_customer');
  }
  return candidate;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown, code: 'invalid_order' | 'invalid_customer'): { major: string; cents: number } {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 99_999_999.99) {
    throw new ZidCommerceSyncError(code);
  }
  const cents = Math.round(parsed * 100);
  return { major: (cents / 100).toFixed(2), cents };
}

function nonNegativeInt(value: unknown, code: 'invalid_order' | 'invalid_customer'): number {
  const parsed = finiteNumber(value ?? 0);
  if (parsed === null || parsed < 0 || parsed > 2_147_483_647) {
    throw new ZidCommerceSyncError(code);
  }
  return Math.floor(parsed);
}

function mysqlTimestamp(value: unknown, now: Date): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const candidate = value.trim();
  const mysqlMatch = candidate.match(/^(20\d{2}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (mysqlMatch) {
    const normalized = `${mysqlMatch[1]} ${mysqlMatch[2]}`;
    const timestamp = Date.parse(normalized.replace(' ', 'T') + 'Z');
    return Number.isNaN(timestamp) || timestamp > now.getTime() + 86_400_000 ? null : normalized;
  }
  const parsed = new Date(candidate);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() < 2000
    || parsed.getUTCFullYear() > 2100
    || parsed.getTime() > now.getTime() + 86_400_000
  ) {
    return null;
  }
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

export function normalizeZidPhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const candidate = String(value).trim();
  if (!candidate || candidate.length > 50 || candidate.includes('*') || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return null;
  }
  if (!/^\+?[0-9\s().-]+$/.test(candidate)) return null;
  let digits = candidate.replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  if (!/^\d{8,15}$/.test(digits) || /^0+$/.test(digits)) return null;
  return digits;
}

function email(value: unknown): string | null {
  const candidate = text(value, 320);
  if (!candidate || candidate.includes('*') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

function currency(value: unknown): string {
  const candidate = text(value, 3)?.toUpperCase() || 'SAR';
  if (!/^[A-Z]{3}$/.test(candidate)) throw new ZidCommerceSyncError('invalid_order');
  return candidate;
}

function orderStatuses(value: unknown): Pick<NormalizedZidOrder, 'status' | 'sariStatus'> {
  const normalized = (text(value, 50) || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['cancelled', 'canceled', 'reversed'].includes(normalized)) {
    return { status: 'cancelled', sariStatus: 'cancelled' };
  }
  if (['refunded', 'partially_reversed'].includes(normalized)) {
    return { status: 'refunded', sariStatus: 'cancelled' };
  }
  if (['delivered', 'completed'].includes(normalized)) {
    return { status: 'completed', sariStatus: 'delivered' };
  }
  if (['shipped', 'indelivery', 'in_delivery'].includes(normalized)) {
    return { status: 'processing', sariStatus: 'shipped' };
  }
  if (['paid'].includes(normalized)) {
    return { status: 'processing', sariStatus: 'paid' };
  }
  if (['processing', 'preparing', 'ready', 'confirmed', 'new'].includes(normalized)) {
    return { status: 'processing', sariStatus: 'processing' };
  }
  return { status: 'pending', sariStatus: 'pending' };
}

function paymentStatus(value: unknown): NormalizedZidOrder['paymentStatus'] {
  const normalized = (text(value, 50) || '').toLowerCase();
  if (['paid', 'completed', 'captured'].includes(normalized)) return 'paid';
  if (['refunded', 'reversed'].includes(normalized)) return 'refunded';
  if (['failed', 'declined', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  return 'pending';
}

function normalizedItems(order: Record<string, any>): string {
  const rawItems = Array.isArray(order.products)
    ? order.products
    : Array.isArray(order.items)
      ? order.items
      : Array.isArray(order.line_items) ? order.line_items : [];
  if (rawItems.length > 500) throw new ZidCommerceSyncError('invalid_order');
  return JSON.stringify(rawItems.map((rawItem) => {
    const item = record(rawItem);
    const quantity = nonNegativeInt(item.quantity ?? item.qty ?? 0, 'invalid_order');
    const rawPrice = item.price ?? item.total ?? item.unit_price;
    const price = rawPrice === undefined || rawPrice === null ? null : money(rawPrice, 'invalid_order').cents;
    return {
      id: text(String(item.id ?? item.product_id ?? ''), 100),
      name: text(item.name ?? item.title, 255),
      quantity,
      price,
    };
  }));
}

export function normalizeZidOrder(value: unknown, now = new Date()): NormalizedZidOrder {
  const order = record(value);
  const customer = record(order.customer);
  const billingAddress = record(order.billing_address);
  const orderStatus = record(order.order_status);
  const displayStatus = record(order.display_status);
  const total = money(order.order_total ?? order.transaction_amount ?? order.total, 'invalid_order');
  const orderCurrency = currency(order.currency_code ?? order.currency);
  const mappedStatus = orderStatuses(orderStatus.code ?? displayStatus.code ?? order.status);
  const shipping = record(order.shipping);
  const shippingMethod = record(shipping.method);
  return {
    externalId: requiredExternalId(order.id, 'order'),
    orderNumber: text(String(order.invoice_number ?? order.code ?? order.order_number ?? order.reference_id ?? ''), 100),
    customerName: text(customer.name ?? order.customer_name ?? billingAddress.name, 255),
    customerEmail: email(customer.email ?? order.customer_email ?? billingAddress.email),
    customerPhone: normalizeZidPhone(customer.mobile ?? customer.phone ?? order.customer_phone ?? billingAddress.phone),
    totalAmount: total.major,
    totalAmountCents: (orderCurrency === 'SAR' || orderCurrency === 'USD') && total.cents <= 2_147_483_647
      ? total.cents
      : null,
    currency: orderCurrency,
    ...mappedStatus,
    paymentStatus: paymentStatus(order.payment_status),
    items: normalizedItems(order),
    shippingMethod: text(shippingMethod.name ?? shippingMethod.shipping_method ?? shipping.method_name, 255),
    orderDate: mysqlTimestamp(order.created_at ?? order.issue_date, now),
    lastSyncedAt: now.toISOString().slice(0, 19).replace('T', ' '),
  };
}

export function normalizeZidCustomer(value: unknown, now = new Date()): NormalizedZidCustomer {
  const customer = record(value);
  const totalSpent = money(customer.order_total_payments ?? customer.total_spent ?? 0, 'invalid_customer');
  return {
    externalId: requiredExternalId(customer.id, 'customer'),
    name: text(customer.name ?? customer.nickname ?? customer.business_name, 255),
    email: email(customer.email ?? customer.pivotEmail),
    phone: normalizeZidPhone(customer.mobile ?? customer.pivotMobile),
    totalOrders: nonNegativeInt(customer.order_counts ?? 0, 'invalid_customer'),
    totalSpent: totalSpent.major,
    isActive: customer.is_active === false || customer.is_active === 0 ? 0 : 1,
    lastOrderAt: mysqlTimestamp(customer.last_order_date, now),
    lastSyncedAt: now.toISOString().slice(0, 19).replace('T', ' '),
  };
}
