/**
 * Zid API Client
 * التكامل مع منصة زد للتجارة الإلكترونية
 */

interface ZidConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  managerToken?: string;
}

interface ZidTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  Authorization: string;
}

interface ZidProduct {
  id: number;
  name: { ar: string; en: string };
  description?: { ar: string; en: string };
  price: number;
  quantity: number;
  sku?: string;
  images?: Array<{ url: string }>;
  is_active: boolean;
}

interface ZidOrder {
  id: number;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  customer: {
    id: number;
    name: string;
    email?: string;
    mobile?: string;
  };
  items: Array<{
    product_id: number;
    quantity: number;
    price: number;
  }>;
  created_at: string;
}

interface ZidCustomer {
  id: number;
  name: string;
  email?: string;
  mobile?: string;
  total_orders: number;
  total_spent: number;
}

export class ZidClient {
  private baseUrl = 'https://api.zid.sa/v1';
  private oauthUrl = 'https://oauth.zid.sa';
  private config: ZidConfig;

  constructor(config: ZidConfig) {
    this.config = config;
  }

  /**
   * الحصول على رابط التفويض OAuth
   */
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
    });

    return `${this.oauthUrl}/oauth/authorize?${params.toString()}`;
  }

  /**
   * تبديل الكود بـ Access Token
   */
  async exchangeCodeForToken(code: string): Promise<ZidTokenResponse> {
    const response = await fetch(`${this.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`فشل في الحصول على Token: ${error}`);
    }

    const data = await response.json();
    
    // حفظ الـ tokens
    this.config.accessToken = data.access_token;
    this.config.managerToken = data.Authorization;

    return data;
  }

  /**
   * تجديد Access Token
   */
  async refreshAccessToken(refreshToken: string): Promise<ZidTokenResponse> {
    const response = await fetch(`${this.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`فشل في تجديد Token: ${error}`);
    }

    const data = await response.json();
    
    // تحديث الـ tokens
    this.config.accessToken = data.access_token;
    this.config.managerToken = data.Authorization;

    return data;
  }

  /**
   * إجراء طلب API عام
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.config.accessToken || !this.config.managerToken) {
      throw new Error('يجب المصادقة أولاً');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ar',
      'Authorization': `Bearer ${this.config.managerToken}`,
      'X-Manager-Token': this.config.accessToken,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zid API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ==================== Products APIs ====================

  /**
   * الحصول على قائمة المنتجات
   */
  async getProducts(page = 1, perPage = 50): Promise<{
    products: ZidProduct[];
    pagination: { total: number; current_page: number; last_page: number };
  }> {
    return this.makeRequest(`/products?page=${page}&per_page=${perPage}`);
  }

  /**
   * الحصول على منتج محدد
   */
  async getProduct(productId: number): Promise<ZidProduct> {
    return this.makeRequest(`/products/${productId}`);
  }

  /**
   * إنشاء منتج جديد
   */
  async createProduct(product: Partial<ZidProduct>): Promise<ZidProduct> {
    return this.makeRequest('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  /**
   * تحديث منتج
   */
  async updateProduct(
    productId: number,
    updates: Partial<ZidProduct>
  ): Promise<ZidProduct> {
    return this.makeRequest(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * حذف منتج
   */
  async deleteProduct(productId: number): Promise<void> {
    return this.makeRequest(`/products/${productId}`, {
      method: 'DELETE',
    });
  }

  /**
   * تحديث المخزون
   */
  async updateInventory(
    productId: number,
    quantity: number
  ): Promise<ZidProduct> {
    return this.updateProduct(productId, { quantity });
  }

  // ==================== Orders APIs ====================

  /**
   * الحصول على قائمة الطلبات
   */
  async getOrders(page = 1, perPage = 50): Promise<{
    orders: ZidOrder[];
    pagination: { total: number; current_page: number; last_page: number };
  }> {
    return this.makeRequest(
      `/managers/store/orders?page=${page}&per_page=${perPage}`
    );
  }

  /**
   * الحصول على طلب محدد
   */
  async getOrder(orderId: number): Promise<ZidOrder> {
    return this.makeRequest(`/managers/store/orders/${orderId}/view`);
  }

  /**
   * إنشاء طلب جديد (Draft Order)
   */
  async createOrder(order: Partial<ZidOrder>): Promise<ZidOrder> {
    return this.makeRequest('/managers/store/drafts', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  /**
   * تحديث حالة الطلب
   */
  async updateOrderStatus(
    orderId: number,
    status: string
  ): Promise<ZidOrder> {
    return this.makeRequest(
      `/managers/store/orders/${orderId}/change-order-status`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      }
    );
  }

  // ==================== Customers APIs ====================

  /**
   * الحصول على قائمة العملاء
   */
  async getCustomers(page = 1, perPage = 50): Promise<{
    customers: ZidCustomer[];
    pagination: { total: number; current_page: number; last_page: number };
  }> {
    return this.makeRequest(
      `/managers/store/customers?page=${page}&per_page=${perPage}`
    );
  }

  /**
   * الحصول على عميل محدد
   */
  async getCustomer(customerId: number): Promise<ZidCustomer> {
    return this.makeRequest(`/managers/store/customers/${customerId}`);
  }

  // ==================== Webhooks ====================

  /**
   * إنشاء Webhook
   */
  async createWebhook(event: string, url: string, conditions?: Record<string, any>): Promise<any> {
    return this.makeRequest('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        event,
        url,
        conditions,
      }),
    });
  }

  /**
   * الحصول على قائمة Webhooks
   */
  async getWebhooks(): Promise<any[]> {
    return this.makeRequest('/webhooks');
  }

  /**
   * حذف Webhook
   */
  async deleteWebhook(webhookId: number): Promise<void> {
    return this.makeRequest(`/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  }
}

export default ZidClient;
