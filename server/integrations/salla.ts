import { majorToMinor, requireMinor } from '../../shared/product-money';
import { sallaShippingSchema, type SallaShipping } from '../../shared/salla-order';
import { sallaExternalId } from '../../shared/salla-sales-observations';
import axios from 'axios';
import { createSyncLog, updateSyncLog } from '../db';
import { sallaCatalogAuthority, assertCatalogReadAuthority, persistSallaCatalogRead, listSallaCatalogPage, finishSallaCatalogSync, type SallaCatalogReceipt } from './salla-catalog';
import { readSallaProductPage, readSallaProductResponse } from './salla-product-normalization';
import type { SallaOrderAuthority } from './salla-order-projection';

const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';
const sallaHttp = axios.create({
  timeout: 10_000,
  maxContentLength: 2 * 1024 * 1024,
  maxBodyLength: 2 * 1024 * 1024,
  maxRedirects: 0,
});

export type SallaStoreIdentity = {
  id: string;
  domain: string;
};

export function normalizeSallaStoreIdentity(value: unknown): SallaStoreIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rawId = typeof candidate.id === 'number' && Number.isSafeInteger(candidate.id)
    ? String(candidate.id)
    : typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (!/^[1-9][0-9]{0,19}$/.test(rawId)) return null;
  if (typeof candidate.domain !== 'string') return null;
  try {
    const url = new URL(candidate.domain.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) return null;
    return { id: rawId, domain: `https://${url.hostname.toLowerCase()}` };
  } catch {
    return null;
  }
}

interface SallaOrderData {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  shipTo?: SallaShipping;
  items: Array<{
    sallaProductId: string;
    quantity: number;
    price: number;
  }>;
  discountCode?: string;
  notes?: string;
}

export class SallaIntegration {
  private accessToken: string;
  private merchantId: number;

  constructor(merchantId: number, accessToken: string) {
    this.merchantId = merchantId;
    this.accessToken = accessToken;
  }

  /** Only authenticated reads of the current store may project catalog data. */
  async fullSync(): Promise<{ success: boolean; synced: number }> {
    const authority = await sallaCatalogAuthority(this.merchantId, this.accessToken);
    const revision = await createSyncLog(this.merchantId, 'full_sync', 'in_progress');
    let synced = 0;
    try {
      const seen = new Set<string>();
      for (let page = 1; page <= 200; page++) {
        await assertCatalogReadAuthority(authority);
        const response = await sallaHttp.get(SALLA_API_BASE + '/products', {
          headers: this.catalogHeaders(), params: { page, per_page: 50 },
        });
        const result = readSallaProductPage(response.data, page);
        if (result.items.some(p => seen.has(p.externalId))) throw Error('Duplicate catalog page');
        for (const product of result.items) {
          seen.add(product.externalId);
          const saved = await persistSallaCatalogRead(authority, revision, product.externalId, product);
          if (saved.applied) synced++;
        }
        if (!result.hasMore) break;
        await this.sleep(1000);
      }
      await finishSallaCatalogSync(authority);
      await updateSyncLog(revision, 'success', synced);
      return { success: true, synced };
    } catch {
      return this.failCatalogSync(revision, synced);
    }
  }

  /** Refresh only verified products from this store, never another integration's IDs. */
  async syncStock(): Promise<{ success: boolean; updated: number }> {
    const authority = await sallaCatalogAuthority(this.merchantId, this.accessToken);
    const revision = await createSyncLog(this.merchantId, 'stock_sync', 'in_progress');
    let updated = 0, cursor = 0, read = 0;
    try {
      while (true) {
        const products = await listSallaCatalogPage(authority, cursor);
        if (!products.length) break;
        for (const p of products) {
          if (++read > 10000) throw Error('Catalog refresh limit exceeded');
          const product = await this.readCatalogProduct(authority, p.external_product_id);
          const saved = await persistSallaCatalogRead(authority, revision, p.external_product_id, product);
          if (saved.applied) updated++;
          cursor = p.id;
          await this.sleep(1000);
        }
      }
      await finishSallaCatalogSync(authority);
      await updateSyncLog(revision, 'success', updated);
      return { success: true, updated };
    } catch {
      return this.failCatalogSync(revision, updated);
    }
  }

  private catalogHeaders() {
    return { Authorization: 'Bearer ' + this.accessToken, Accept: 'application/json' };
  }

  private async readCatalogProduct(authority: SallaOrderAuthority, id: string) {
    sallaExternalId.parse(id);
    await assertCatalogReadAuthority(authority);
    try {
      const response = await sallaHttp.get(SALLA_API_BASE + '/products/' + id, { headers: this.catalogHeaders() });
      return readSallaProductResponse(response.data, id);
    } catch (error: any) {
      // A delete webhook is only a hint. Reconcile with a fresh authenticated GET.
      // Transport failures, forbidden responses and malformed 404s never archive data.
      if (error?.response?.status === 404 && error.response.data?.status === 404 && error.response.data?.success === false) return null;
      throw Error('Salla product read unavailable');
    }
  }

  private async failCatalogSync(revision: number, count: number): Promise<never> {
    try { await updateSyncLog(revision, 'failed', count, 'catalog_sync_unavailable'); } catch { /* preserve safe public error */ }
    throw Error('Salla catalog synchronization unavailable');
  }

  /**
   * إنشاء طلب في Salla
   */
  async createOrder(orderData: SallaOrderData): Promise<{
    success: boolean;
    orderNumber: string;
    paymentUrl?: string;
    orderId: string;
    amountMinor: number;
    currency: 'SAR';
  }> {
    if (!orderData.items.length) throw new Error('Empty Salla order');
    const shipTo = sallaShippingSchema.parse(orderData.shipTo);
    for (const item of orderData.items) {
      requireMinor(item.price);
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !/^[1-9][0-9]*$/.test(item.sallaProductId)) throw new Error('Invalid Salla item');
    }
    console.log(`[Salla] Creating order for merchant ${this.merchantId}`);
    
    try {
      const response = await sallaHttp.post(
        `${SALLA_API_BASE}/orders`,
        {
          customer: {
            name: orderData.customerName,
            mobile: orderData.phone,
            email: orderData.email || `${orderData.phone}@temp.sary.live`
          },
          products: orderData.items.map(item => ({
            identifier_type: 'id',
            identifier: item.sallaProductId,
            quantity: item.quantity,
          })),
          receiver: {
            name: orderData.customerName,
            country_code: 'SA',
            phone: orderData.phone,
            notify: false,
          },
          delivery_method: 'shipping',
          ship_to: shipTo,
          payment: { status: 'pending', method: 'cod' },
          notes: orderData.notes || `طلب من ساري - ${new Date().toISOString()}`,
          ...(orderData.discountCode ? { coupon: orderData.discountCode } : {})
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      const sallaOrder = response.data.data;

      // Transport returns the provider result; the caller owns the single local insert.
      const amount = sallaOrder?.amounts?.total;
      const currency = (amount && typeof amount === 'object' ? amount.currency : undefined) || sallaOrder?.currency;
      if (response.data.success !== true || currency !== 'SAR' || (sallaOrder.currency && sallaOrder.currency !== 'SAR') || !sallaOrder?.id || !sallaOrder?.reference_id) throw new Error('Unverified Salla order result');
      const amountMinor = majorToMinor(typeof amount === 'object' ? amount.amount : amount);
      const orderId = String(sallaOrder.id);
      const orderNumber = String(sallaOrder.reference_id);
      if ([sallaOrder.id,sallaOrder.reference_id].some(id => typeof id !== 'string' && (typeof id !== 'number' || !Number.isSafeInteger(id)))) throw new Error('Unsafe Salla order identity');
      if (![orderId, orderNumber].every(id => /^[1-9][0-9]{0,19}$/.test(id))) throw new Error('Invalid Salla order identity');
      let paymentUrl: string | undefined;
      if (typeof sallaOrder.urls?.checkout === 'string' && sallaOrder.urls.checkout) {
        const url = new URL(sallaOrder.urls.checkout);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Invalid Salla checkout URL');
        paymentUrl = url.toString();
      }

      console.log(`[Salla] Order created successfully: ${sallaOrder.reference_id}`);

      return {
        success: true,
        orderNumber,
        paymentUrl,
        orderId,
        amountMinor,
        currency: 'SAR'
      };
      
    } catch (error: any) {
      console.error('[Salla] Order creation failed:', { status: error?.response?.status });
      throw new Error('تعذر التحقق من نتيجة إنشاء الطلب في سلة');
    }
  }

  async syncSingleProduct(id: string, receipt?: SallaCatalogReceipt): Promise<{ success: boolean }> {
    sallaExternalId.parse(id);
    const authority = await sallaCatalogAuthority(this.merchantId, this.accessToken, receipt?.storeId);
    const revision = await createSyncLog(this.merchantId, 'single_product', 'in_progress');
    try {
      const product = await this.readCatalogProduct(authority, id);
      const saved = await persistSallaCatalogRead(authority, revision, id, product, receipt);
      await updateSyncLog(revision, 'success', saved.applied ? 1 : 0);
      return { success: true };
    } catch {
      return this.failCatalogSync(revision, 0);
    }
  }

  /**
   * الحصول على حالة الطلب
   */
  async getOrderStatus(sallaOrderId: string): Promise<{
    status: string;
    trackingNumber?: string;
    trackingUrl?: string;
  }> {
    try {
      sallaExternalId.parse(sallaOrderId);
      const response = await sallaHttp.get(
        `${SALLA_API_BASE}/orders/${sallaOrderId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      const order = response.data?.data;
      const identity = typeof order?.id === 'number' && Number.isSafeInteger(order.id) ? String(order.id) : order?.id;
      if (response.data?.success !== true || response.data?.status !== 200 || !sallaExternalId.safeParse(identity).success
        || identity !== sallaOrderId || typeof order?.status?.slug !== 'string' || !/^[a-z_]{1,40}$/.test(order.status.slug)) {
        throw new Error('Invalid Salla order response');
      }

      return {
        status: order.status.slug,
        trackingNumber: typeof order.shipping?.tracking_number === 'string'
          ? order.shipping.tracking_number.slice(0, 100) : undefined,
      };
    } catch {
      // Axios errors can contain Authorization headers and the customer's complete order.
      throw new Error('Salla order status unavailable');
    }
  }

  /**
   * اختبار الاتصال بـ Salla
   */
  async testConnection(): Promise<{ success: boolean; storeInfo?: SallaStoreIdentity }> {
    try {
      const response = await sallaHttp.get(`${SALLA_API_BASE}/store/info`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      const storeInfo = normalizeSallaStoreIdentity(response.data.data);
      return storeInfo ? { success: true, storeInfo } : { success: false };
    } catch (error: any) {
      console.error('[Salla] Connection test failed:', error.response?.data || error.message);
      return { success: false };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
