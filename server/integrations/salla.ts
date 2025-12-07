import axios from 'axios';
import * as db from '../db';

const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';

interface SallaProduct {
  id: string;
  name: string;
  description?: string;
  price: string;
  sale_price?: string;
  quantity: number;
  sku?: string;
  main_image?: string;
  images?: Array<{ url: string }>;
  categories?: Array<{ name: string }>;
}

interface SallaOrderData {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
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

  /**
   * المزامنة الكاملة - جلب جميع المنتجات من Salla
   */
  async fullSync(): Promise<{ success: boolean; synced: number }> {
    console.log(`[Salla] Starting full sync for merchant ${this.merchantId}`);
    const startTime = Date.now();
    
    try {
      // إنشاء سجل مزامنة
      const logId = await db.createSyncLog(this.merchantId, 'full_sync', 'in_progress');
      
      let page = 1;
      let totalSynced = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const response = await axios.get(`${SALLA_API_BASE}/products`, {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json'
            },
            params: {
              page,
              per_page: 50
            }
          });

          const products: SallaProduct[] = response.data.data;
          
          if (!products || products.length === 0) {
            hasMore = false;
            break;
          }

          // حفظ المنتجات في قاعدة بياناتنا
          for (const sallaProduct of products) {
            await this.saveProductLocally(sallaProduct);
            totalSynced++;
          }

          // التحقق من وجود صفحات إضافية
          hasMore = response.data.pagination?.hasMorePages || false;
          page++;
          
          // Rate limiting: 1 request per second
          await this.sleep(1000);
          
        } catch (error: any) {
          if (error.response?.status === 429) {
            // Rate limit hit - wait 60 seconds
            console.log('[Salla] Rate limit hit, waiting 60 seconds...');
            await this.sleep(60000);
            continue; // Retry same page
          }
          throw error;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Salla] Full sync completed: ${totalSynced} products in ${duration}ms`);
      
      // تحديث سجل المزامنة
      await db.updateSyncLog(logId, 'success', totalSynced);
      
      // تحديث حالة الاتصال
      await db.updateSallaConnection(this.merchantId, {
        syncStatus: 'active',
        lastSyncAt: new Date()
      });
      
      return { success: true, synced: totalSynced };
      
    } catch (error: any) {
      console.error('[Salla] Full sync failed:', error.message);
      
      await db.updateSallaConnection(this.merchantId, {
        syncStatus: 'error',
        syncErrors: JSON.stringify({ message: error.message, timestamp: new Date() })
      });
      
      throw error;
    }
  }

  /**
   * مزامنة المخزون فقط - تحديث الكميات المتوفرة
   */
  async syncStock(): Promise<{ success: boolean; updated: number }> {
    console.log(`[Salla] Starting stock sync for merchant ${this.merchantId}`);
    
    try {
      const logId = await db.createSyncLog(this.merchantId, 'stock_sync', 'in_progress');
      
      // جلب جميع منتجات التاجر التي لها salla_product_id
      const localProducts = await db.getProductsWithSallaId(this.merchantId);
      
      let updated = 0;

      for (const product of localProducts) {
        try {
          const response = await axios.get(
            `${SALLA_API_BASE}/products/${product.sallaProductId}`,
            {
              headers: { 
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json'
              }
            }
          );

          const sallaProduct = response.data.data;
          const newQuantity = sallaProduct.quantity || 0;
          
          // تحديث الكمية في قاعدة بياناتنا
          await db.updateProductStock(product.id, newQuantity);
          updated++;
          
          // Rate limiting
          await this.sleep(1000);
          
        } catch (error: any) {
          console.error(`[Salla] Failed to sync stock for product ${product.id}:`, error.message);
          // نكمل مع باقي المنتجات
        }
      }

      await db.updateSyncLog(logId, 'success', updated);
      
      console.log(`[Salla] Stock sync completed: ${updated} products updated`);
      return { success: true, updated };
      
    } catch (error: any) {
      console.error('[Salla] Stock sync failed:', error);
      throw error;
    }
  }

  /**
   * حفظ منتج من Salla في قاعدة بياناتنا
   */
  private async saveProductLocally(sallaProduct: SallaProduct): Promise<void> {
    try {
      // التحقق إذا المنتج موجود
      const existing = await db.getProductBySallaId(this.merchantId, sallaProduct.id);

      // تحويل السعر من string إلى integer (بالهللات)
      const price = Math.round(parseFloat(sallaProduct.price) * 100);
      const salePrice = sallaProduct.sale_price 
        ? Math.round(parseFloat(sallaProduct.sale_price) * 100) 
        : null;

      const productData = {
        merchantId: this.merchantId,
        sallaProductId: sallaProduct.id,
        name: sallaProduct.name,
        description: sallaProduct.description || '',
        price: salePrice || price, // استخدم سعر التخفيض إذا كان موجوداً
        imageUrl: sallaProduct.main_image || sallaProduct.images?.[0]?.url || null,
        category: sallaProduct.categories?.[0]?.name || 'عام',
        stock: sallaProduct.quantity || 0,
        isActive: sallaProduct.quantity > 0,
        lastSyncedAt: new Date()
      };

      if (existing) {
        // تحديث المنتج الموجود
        await db.updateProduct(existing.id, productData);
      } else {
        // إضافة منتج جديد
        await db.createProduct(productData);
      }
    } catch (error) {
      console.error(`[Salla] Failed to save product ${sallaProduct.id}:`, error);
      throw error;
    }
  }

  /**
   * إنشاء طلب في Salla
   */
  async createOrder(orderData: SallaOrderData): Promise<{
    success: boolean;
    orderNumber: string;
    paymentUrl?: string;
    orderId: string;
  }> {
    console.log(`[Salla] Creating order for merchant ${this.merchantId}`);
    
    try {
      const response = await axios.post(
        `${SALLA_API_BASE}/orders`,
        {
          customer: {
            first_name: orderData.customerName.split(' ')[0],
            last_name: orderData.customerName.split(' ').slice(1).join(' ') || 'العميل',
            mobile: orderData.phone,
            email: orderData.email || `${orderData.phone}@temp.sari.sa`
          },
          items: orderData.items.map(item => ({
            product_id: item.sallaProductId,
            quantity: item.quantity,
            price: item.price / 100 // تحويل من هللات إلى ريال
          })),
          shipping: {
            name: orderData.customerName,
            address: orderData.address,
            city: orderData.city || 'الرياض',
            country: 'SA',
            phone: orderData.phone
          },
          payment_method: 'cod', // Cash on delivery
          notes: orderData.notes || `طلب من ساري - ${new Date().toISOString()}`,
          coupon_code: orderData.discountCode || null
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

      // حفظ الطلب في قاعدة بياناتنا
      await db.createOrder({
        merchantId: this.merchantId,
        sallaOrderId: sallaOrder.id,
        orderNumber: sallaOrder.reference_id,
        customerPhone: orderData.phone,
        customerName: orderData.customerName,
        customerEmail: orderData.email,
        address: orderData.address,
        city: orderData.city,
        items: JSON.stringify(orderData.items),
        totalAmount: Math.round(sallaOrder.amounts.total * 100), // تحويل إلى هللات
        discountCode: orderData.discountCode,
        status: 'pending',
        paymentUrl: sallaOrder.payment_url,
        notes: orderData.notes
      });

      console.log(`[Salla] Order created successfully: ${sallaOrder.reference_id}`);

      return {
        success: true,
        orderNumber: sallaOrder.reference_id,
        paymentUrl: sallaOrder.payment_url,
        orderId: sallaOrder.id
      };
      
    } catch (error: any) {
      console.error('[Salla] Order creation failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'فشل إنشاء الطلب في Salla');
    }
  }

  /**
   * تحديث منتج واحد فقط
   */
  async syncSingleProduct(sallaProductId: string): Promise<{ success: boolean }> {
    try {
      const logId = await db.createSyncLog(this.merchantId, 'single_product', 'in_progress');
      
      const response = await axios.get(
        `${SALLA_API_BASE}/products/${sallaProductId}`,
        {
          headers: { 
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      await this.saveProductLocally(response.data.data);
      await db.updateSyncLog(logId, 'success', 1);
      
      return { success: true };
    } catch (error: any) {
      console.error(`[Salla] Failed to sync product ${sallaProductId}:`, error);
      throw error;
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
      const response = await axios.get(
        `${SALLA_API_BASE}/orders/${sallaOrderId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      const order = response.data.data;

      return {
        status: order.status.name,
        trackingNumber: order.shipping?.tracking_number,
        trackingUrl: order.shipping?.tracking_url
      };
    } catch (error: any) {
      console.error(`[Salla] Failed to get order status ${sallaOrderId}:`, error);
      throw error;
    }
  }

  /**
   * اختبار الاتصال بـ Salla
   */
  async testConnection(): Promise<{ success: boolean; storeInfo?: any }> {
    try {
      const response = await axios.get(`${SALLA_API_BASE}/store/info`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      return {
        success: true,
        storeInfo: response.data.data
      };
    } catch (error: any) {
      console.error('[Salla] Connection test failed:', error.response?.data || error.message);
      return { success: false };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
