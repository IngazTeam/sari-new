/**
 * WooCommerce REST API Client
 * 
 * This module provides functions to interact with WooCommerce REST API
 * Supports: Products, Orders, Customers, and more
 */

import axios, { AxiosInstance } from 'axios';
import type { WooCommerceSettings } from '../drizzle/schema';

// ==================== Types ====================

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: 'simple' | 'grouped' | 'external' | 'variable';
  status: 'draft' | 'pending' | 'private' | 'publish';
  featured: boolean;
  catalog_visibility: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: string;
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: string;
  backorders_allowed: boolean;
  backordered: boolean;
  sold_individually: boolean;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  images: Array<{
    id: number;
    src: string;
    name: string;
    alt: string;
  }>;
  attributes: any[];
  default_attributes: any[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  meta_data: any[];
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
}

export interface WooCommerceOrder {
  id: number;
  parent_id: number;
  number: string;
  order_key: string;
  created_via: string;
  version: string;
  status: string;
  currency: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  discount_total: string;
  discount_tax: string;
  shipping_total: string;
  shipping_tax: string;
  cart_tax: string;
  total: string;
  total_tax: string;
  prices_include_tax: boolean;
  customer_id: number;
  customer_ip_address: string;
  customer_user_agent: string;
  customer_note: string;
  billing: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  date_paid: string | null;
  date_paid_gmt: string | null;
  date_completed: string | null;
  date_completed_gmt: string | null;
  cart_hash: string;
  meta_data: any[];
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    tax_class: string;
    subtotal: string;
    subtotal_tax: string;
    total: string;
    total_tax: string;
    taxes: any[];
    meta_data: any[];
    sku: string;
    price: number;
  }>;
  tax_lines: any[];
  shipping_lines: any[];
  fee_lines: any[];
  coupon_lines: any[];
  refunds: any[];
}

export interface WooCommerceCustomer {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  username: string;
  billing: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  is_paying_customer: boolean;
  avatar_url: string;
  meta_data: any[];
}

// ==================== WooCommerce Client ====================

export class WooCommerceClient {
  private client: AxiosInstance;
  private storeUrl: string;

  constructor(settings: WooCommerceSettings) {
    this.storeUrl = settings.storeUrl.replace(/\/$/, ''); // Remove trailing slash
    
    this.client = axios.create({
      baseURL: `${this.storeUrl}/wp-json/wc/v3`,
      auth: {
        username: settings.consumerKey,
        password: settings.consumerSecret,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  // ==================== Connection Test ====================

  async testConnection(): Promise<{ success: boolean; message: string; storeInfo?: any }> {
    try {
      const response = await this.client.get('/system_status');
      return {
        success: true,
        message: 'تم الاتصال بنجاح',
        storeInfo: {
          version: response.data.environment?.version || 'Unknown',
          name: response.data.settings?.general?.title || 'Unknown',
        },
      };
    } catch (error: any) {
      console.error('[WooCommerce] Connection test failed:', error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'فشل الاتصال بالمتجر',
      };
    }
  }

  // ==================== Products ====================

  async getProducts(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: string;
    category?: number;
    orderby?: string;
    order?: 'asc' | 'desc';
  }): Promise<WooCommerceProduct[]> {
    try {
      const response = await this.client.get('/products', { params });
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get products failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب المنتجات');
    }
  }

  async getProduct(productId: number): Promise<WooCommerceProduct> {
    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get product failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب المنتج');
    }
  }

  async createProduct(product: Partial<WooCommerceProduct>): Promise<WooCommerceProduct> {
    try {
      const response = await this.client.post('/products', product);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Create product failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل إنشاء المنتج');
    }
  }

  async updateProduct(productId: number, product: Partial<WooCommerceProduct>): Promise<WooCommerceProduct> {
    try {
      const response = await this.client.put(`/products/${productId}`, product);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Update product failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل تحديث المنتج');
    }
  }

  async deleteProduct(productId: number, force: boolean = false): Promise<void> {
    try {
      await this.client.delete(`/products/${productId}`, { params: { force } });
    } catch (error: any) {
      console.error('[WooCommerce] Delete product failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل حذف المنتج');
    }
  }

  async updateProductStock(productId: number, stockQuantity: number): Promise<WooCommerceProduct> {
    try {
      const response = await this.client.put(`/products/${productId}`, {
        stock_quantity: stockQuantity,
        manage_stock: true,
      });
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Update product stock failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل تحديث المخزون');
    }
  }

  // ==================== Orders ====================

  async getOrders(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    customer?: number;
    after?: string;
    before?: string;
    orderby?: string;
    order?: 'asc' | 'desc';
  }): Promise<WooCommerceOrder[]> {
    try {
      const response = await this.client.get('/orders', { params });
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get orders failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب الطلبات');
    }
  }

  async getOrder(orderId: number): Promise<WooCommerceOrder> {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get order failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب الطلب');
    }
  }

  async createOrder(order: Partial<WooCommerceOrder>): Promise<WooCommerceOrder> {
    try {
      const response = await this.client.post('/orders', order);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Create order failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل إنشاء الطلب');
    }
  }

  async updateOrder(orderId: number, order: Partial<WooCommerceOrder>): Promise<WooCommerceOrder> {
    try {
      const response = await this.client.put(`/orders/${orderId}`, order);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Update order failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل تحديث الطلب');
    }
  }

  async updateOrderStatus(orderId: number, status: string): Promise<WooCommerceOrder> {
    try {
      const response = await this.client.put(`/orders/${orderId}`, { status });
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Update order status failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل تحديث حالة الطلب');
    }
  }

  // ==================== Customers ====================

  async getCustomers(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    email?: string;
    role?: string;
    orderby?: string;
    order?: 'asc' | 'desc';
  }): Promise<WooCommerceCustomer[]> {
    try {
      const response = await this.client.get('/customers', { params });
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get customers failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب العملاء');
    }
  }

  async getCustomer(customerId: number): Promise<WooCommerceCustomer> {
    try {
      const response = await this.client.get(`/customers/${customerId}`);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Get customer failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل جلب العميل');
    }
  }

  async createCustomer(customer: Partial<WooCommerceCustomer>): Promise<WooCommerceCustomer> {
    try {
      const response = await this.client.post('/customers', customer);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Create customer failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل إنشاء العميل');
    }
  }

  async updateCustomer(customerId: number, customer: Partial<WooCommerceCustomer>): Promise<WooCommerceCustomer> {
    try {
      const response = await this.client.put(`/customers/${customerId}`, customer);
      return response.data;
    } catch (error: any) {
      console.error('[WooCommerce] Update customer failed:', error.message);
      throw new Error(error.response?.data?.message || 'فشل تحديث العميل');
    }
  }
}

// ==================== Helper Functions ====================

/**
 * Create a WooCommerce client instance from settings
 */
export function createWooCommerceClient(settings: WooCommerceSettings): WooCommerceClient {
  return new WooCommerceClient(settings);
}

/**
 * Validate WooCommerce store URL
 */
export function validateStoreUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Format WooCommerce price (string) to number
 */
export function formatPrice(price: string): number {
  return parseFloat(price) || 0;
}

/**
 * Format stock status to Arabic
 */
export function formatStockStatus(status: string): string {
  const statusMap: Record<string, string> = {
    instock: 'متوفر',
    outofstock: 'غير متوفر',
    onbackorder: 'متوفر قريباً',
  };
  return statusMap[status] || status;
}

/**
 * Format order status to Arabic
 */
export function formatOrderStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'قيد الانتظار',
    processing: 'قيد المعالجة',
    'on-hold': 'معلق',
    completed: 'مكتمل',
    cancelled: 'ملغي',
    refunded: 'مسترجع',
    failed: 'فاشل',
  };
  return statusMap[status] || status;
}
