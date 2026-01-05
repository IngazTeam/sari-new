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

// واجهات إنشاء الطلب الجديدة
interface ZidCreateOrderCustomer {
  full_name: string;
  mobile_country_code: string;
  mobile_number: string;
  email?: string;
}

interface ZidCreateOrderConsignee {
  contact: {
    full_name: string;
    mobile_country_code: string;
    mobile_number: string;
    email?: string;
  };
  address: {
    line_1: string;
    line_2?: string;
    city_name: string;
    country_code: string;
  };
}

interface ZidCreateOrderProduct {
  sku: string;
  quantity: number;
  custom_fields?: Array<{
    price_settings?: string;
    group_id?: string;
    name: string;
    value: string;
    type: string;
  }>;
}

interface ZidCreateOrderRequest {
  currency_code: string;
  created_by: 'partner' | 'customer' | 'admin';
  customer: ZidCreateOrderCustomer;
  consignee: ZidCreateOrderConsignee;
  is_gift: boolean;
  is_gifted_consignee_notifiable: boolean;
  products: ZidCreateOrderProduct[];
  shipping_method: {
    type: string;
    id: number;
  };
  payment_method: {
    id: number;
  };
  payment_link_configs?: {
    expiryDateTime: string;
  };
}

interface ZidCreateOrderResponse {
  status: string;
  order: {
    id: number;
    code: string;
    store_id: number;
    order_url: string;
    store_name: string;
    order_status: {
      code: string;
      name: string;
    };
    currency_code: string;
    order_total: string;
    order_total_string: string;
    customer: {
      id: number;
      name: string;
      mobile: string;
      email?: string;
    };
  };
}

interface ZidPaymentMethod {
  id: number;
  enabled: boolean;
  code: string;
  fees: number;
  fees_string: string;
  type: string;
  name: string;
  icons: string[];
}

interface ZidShippingMethod {
  id: number;
  name: string;
  code: string;
  type: string;
  enabled: boolean;
  fees: number;
  fees_string: string;
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

  // ==================== Payment & Shipping Methods ====================

  /**
   * الحصول على طرق الدفع المتاحة
   */
  async getPaymentMethods(): Promise<{ payment_methods: ZidPaymentMethod[] }> {
    return this.makeRequest('/managers/store/payment-methods');
  }

  /**
   * الحصول على طرق الشحن المتاحة
   */
  async getShippingMethods(): Promise<{ shipping_methods: ZidShippingMethod[] }> {
    return this.makeRequest('/managers/store/shipping-methods');
  }

  // ==================== Create Draft Order (New) ====================

  /**
   * إنشاء طلب جديد (Draft Order) - النسخة المحدثة
   * يستخدم لإنشاء طلبات من WhatsApp Bot
   */
  async createDraftOrder(orderData: ZidCreateOrderRequest): Promise<ZidCreateOrderResponse> {
    return this.makeRequest('/managers/store/drafts', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  /**
   * إنشاء طلب من بيانات WhatsApp
   * دالة مساعدة لتحويل بيانات المحادثة إلى طلب Zid
   */
  async createOrderFromWhatsApp(params: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      countryCode?: string;
    };
    products: Array<{
      sku: string;
      quantity: number;
    }>;
    paymentMethodId: number;
    shippingMethodId: number;
    isPaymentLink?: boolean;
  }): Promise<ZidCreateOrderResponse> {
    // استخراج رمز الدولة ورقم الهاتف
    const phoneInfo = this.parsePhoneNumber(params.customerPhone);
    
    // تحضير بيانات الطلب
    const orderRequest: ZidCreateOrderRequest = {
      currency_code: 'SAR',
      created_by: 'partner',
      customer: {
        full_name: params.customerName,
        mobile_country_code: phoneInfo.countryCode,
        mobile_number: phoneInfo.number,
        email: params.customerEmail || '',
      },
      consignee: {
        contact: {
          full_name: params.customerName,
          mobile_country_code: phoneInfo.countryCode,
          mobile_number: phoneInfo.number,
          email: params.customerEmail || '',
        },
        address: {
          line_1: params.address.line1,
          line_2: params.address.line2 || '',
          city_name: params.address.city,
          country_code: params.address.countryCode || 'SA',
        },
      },
      is_gift: false,
      is_gifted_consignee_notifiable: false,
      products: params.products.map(p => ({
        sku: p.sku,
        quantity: p.quantity,
      })),
      shipping_method: {
        type: 'delivery',
        id: params.shippingMethodId,
      },
      payment_method: {
        id: params.paymentMethodId,
      },
    };

    // إضافة إعدادات رابط الدفع إذا كان مطلوباً
    if (params.isPaymentLink) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // صلاحية 7 أيام
      orderRequest.payment_link_configs = {
        expiryDateTime: expiryDate.toISOString(),
      };
    }

    return this.createDraftOrder(orderRequest);
  }

  /**
   * تحليل رقم الهاتف واستخراج رمز الدولة
   */
  private parsePhoneNumber(phone: string): { countryCode: string; number: string } {
    // إزالة أي رموز غير رقمية
    const cleaned = phone.replace(/\D/g, '');
    
    // التحقق من رمز الدولة السعودية
    if (cleaned.startsWith('966')) {
      return {
        countryCode: '966',
        number: cleaned.substring(3),
      };
    }
    
    // التحقق من رمز الإمارات
    if (cleaned.startsWith('971')) {
      return {
        countryCode: '971',
        number: cleaned.substring(3),
      };
    }
    
    // التحقق من رمز الكويت
    if (cleaned.startsWith('965')) {
      return {
        countryCode: '965',
        number: cleaned.substring(3),
      };
    }
    
    // التحقق من رمز البحرين
    if (cleaned.startsWith('973')) {
      return {
        countryCode: '973',
        number: cleaned.substring(3),
      };
    }
    
    // التحقق من رمز قطر
    if (cleaned.startsWith('974')) {
      return {
        countryCode: '974',
        number: cleaned.substring(3),
      };
    }
    
    // التحقق من رمز عمان
    if (cleaned.startsWith('968')) {
      return {
        countryCode: '968',
        number: cleaned.substring(3),
      };
    }
    
    // افتراضي: السعودية
    if (cleaned.startsWith('5') && cleaned.length === 9) {
      return {
        countryCode: '966',
        number: cleaned,
      };
    }
    
    // إرجاع الرقم كما هو مع افتراض السعودية
    return {
      countryCode: '966',
      number: cleaned,
    };
  }

  /**
   * البحث عن منتج بواسطة SKU
   */
  async findProductBySku(sku: string): Promise<ZidProduct | null> {
    try {
      const { products } = await this.getProducts(1, 100);
      return products.find(p => p.sku === sku) || null;
    } catch (error) {
      console.error('Error finding product by SKU:', error);
      return null;
    }
  }

  /**
   * الحصول على طريقة دفع رابط الدفع (ZidPay)
   */
  async getPaymentLinkMethod(): Promise<ZidPaymentMethod | null> {
    try {
      const { payment_methods } = await this.getPaymentMethods();
      return payment_methods.find(pm => pm.code === 'payment_link.zidpay' && pm.enabled) || null;
    } catch (error) {
      console.error('Error getting payment link method:', error);
      return null;
    }
  }

  /**
   * الحصول على طريقة الدفع عند الاستلام (COD)
   */
  async getCODPaymentMethod(): Promise<ZidPaymentMethod | null> {
    try {
      const { payment_methods } = await this.getPaymentMethods();
      return payment_methods.find(pm => pm.code === 'cod' && pm.enabled) || null;
    } catch (error) {
      console.error('Error getting COD payment method:', error);
      return null;
    }
  }
}

export default ZidClient;

// تصدير الواجهات للاستخدام الخارجي
export type {
  ZidConfig,
  ZidTokenResponse,
  ZidProduct,
  ZidOrder,
  ZidCustomer,
  ZidCreateOrderRequest,
  ZidCreateOrderResponse,
  ZidCreateOrderCustomer,
  ZidCreateOrderConsignee,
  ZidCreateOrderProduct,
  ZidPaymentMethod,
  ZidShippingMethod,
};
