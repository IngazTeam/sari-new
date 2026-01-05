/**
 * Zid E-commerce Platform API Integration
 * 
 * This module provides integration with Zid API for:
 * - Product synchronization
 * - Order creation and management
 * - Inventory updates
 * - Webhook handling
 * 
 * Zid API Documentation: https://docs.zid.sa/
 */

interface ZidConfig {
  accessToken: string;
  managerToken: string;
  storeId: string;
}

interface ZidProduct {
  id: string;
  sku?: string;
  name: {
    ar?: string;
    en?: string;
  };
  description?: {
    ar?: string;
    en?: string;
  };
  price: number;
  sale_price?: number;
  currency: string;
  quantity: number;
  is_available: boolean;
  images?: string[];
  main_image?: string;
  category?: {
    id: string;
    name: string;
  };
  is_active: boolean;
  is_published: boolean;
}

interface ZidOrder {
  id: string;
  order_number: string;
  customer: {
    name: string;
    email?: string;
    phone: string;
  };
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  shipping?: {
    address: any;
    method?: string;
    cost?: number;
  };
  created_at: string;
}

interface ZidCreateOrderPayload {
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  shipping_address?: {
    city: string;
    district?: string;
    street?: string;
    building_number?: string;
    postal_code?: string;
  };
  notes?: string;
}

const ZID_API_BASE = 'https://api.zid.sa/v1';

/**
 * Make authenticated request to Zid API
 */
async function makeZidRequest(
  config: ZidConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${ZID_API_BASE}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.accessToken}`,
    'X-Manager-Token': config.managerToken,
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Zid API Error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    return await response.json();
  } catch (error: any) {
    console.error('Zid API Request Failed:', error);
    throw error;
  }
}

/**
 * Get all products from Zid store
 */
export async function getZidProducts(
  config: ZidConfig,
  page: number = 1,
  perPage: number = 50
): Promise<{ products: ZidProduct[]; total: number; hasMore: boolean }> {
  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/products?page=${page}&per_page=${perPage}`,
    { method: 'GET' }
  );

  return {
    products: response.products || [],
    total: response.pagination?.total || 0,
    hasMore: response.pagination?.current_page < response.pagination?.total_pages,
  };
}

/**
 * Get single product details from Zid
 */
export async function getZidProduct(
  config: ZidConfig,
  productId: string
): Promise<ZidProduct> {
  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/products/${productId}`,
    { method: 'GET' }
  );

  return response.product;
}

/**
 * Update product inventory in Zid
 */
export async function updateZidProductInventory(
  config: ZidConfig,
  productId: string,
  quantity: number
): Promise<void> {
  await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/products/${productId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }
  );
}

/**
 * Create order in Zid
 */
export async function createZidOrder(
  config: ZidConfig,
  orderData: ZidCreateOrderPayload
): Promise<ZidOrder> {
  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/orders`,
    {
      method: 'POST',
      body: JSON.stringify(orderData),
    }
  );

  return response.order;
}

/**
 * Get order details from Zid
 */
export async function getZidOrder(
  config: ZidConfig,
  orderId: string
): Promise<ZidOrder> {
  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/orders/${orderId}`,
    { method: 'GET' }
  );

  return response.order;
}

/**
 * Get all orders from Zid store
 */
export async function getZidOrders(
  config: ZidConfig,
  page: number = 1,
  perPage: number = 50,
  filters?: {
    status?: string;
    payment_status?: string;
    from_date?: string;
    to_date?: string;
  }
): Promise<{ orders: ZidOrder[]; total: number; hasMore: boolean }> {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
    ...(filters || {}),
  });

  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/orders?${queryParams}`,
    { method: 'GET' }
  );

  return {
    orders: response.orders || [],
    total: response.pagination?.total || 0,
    hasMore: response.pagination?.current_page < response.pagination?.total_pages,
  };
}

/**
 * Update order status in Zid
 */
export async function updateZidOrderStatus(
  config: ZidConfig,
  orderId: string,
  status: string
): Promise<void> {
  await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/orders/${orderId}/status`,
    {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }
  );
}

/**
 * Register webhook in Zid
 */
export async function registerZidWebhook(
  config: ZidConfig,
  webhookUrl: string,
  events: string[]
): Promise<{ id: string; url: string; events: string[] }> {
  const response = await makeZidRequest(
    config,
    `/manager/store/${config.storeId}/webhooks`,
    {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events,
      }),
    }
  );

  return response.webhook;
}

/**
 * Verify Zid webhook signature
 */
export async function verifyZidWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Zid uses HMAC SHA256 for webhook signatures
  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Import all products from Zid to Sari
 */
export async function importAllZidProducts(
  config: ZidConfig,
  onProgress?: (current: number, total: number) => void
): Promise<ZidProduct[]> {
  const allProducts: ZidProduct[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { products, total, hasMore: more } = await getZidProducts(config, page, 50);
    allProducts.push(...products);
    
    if (onProgress) {
      onProgress(allProducts.length, total);
    }

    hasMore = more;
    page++;
  }

  return allProducts;
}

export type {
  ZidConfig,
  ZidProduct,
  ZidOrder,
  ZidCreateOrderPayload,
};
