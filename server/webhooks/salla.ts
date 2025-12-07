import { Request, Response } from 'express';
import * as db from '../db';
import { SallaIntegration } from '../integrations/salla';
import { processOrderStatusUpdate } from '../automation/order-tracking';

/**
 * Salla Webhook Handler
 * 
 * Handles real-time updates from Salla:
 * - product.updated: Update product details
 * - product.deleted: Remove product from database
 * - product.quantity.updated: Update stock
 * - order.updated: Update order status
 */

interface SallaWebhookEvent {
  event: string;
  merchant: {
    id: string;
    domain: string;
  };
  data: any;
  created_at: string;
}

export async function handleSallaWebhook(req: Request, res: Response) {
  try {
    const event: SallaWebhookEvent = req.body;
    
    console.log(`[Salla Webhook] Received event: ${event.event} from ${event.merchant.domain}`);

    // Find merchant by store URL
    const merchantId = await getMerchantIdByStoreUrl(event.merchant.domain);
    
    if (!merchantId) {
      console.log(`[Salla Webhook] Merchant not found for domain: ${event.merchant.domain}`);
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Get connection
    const connection = await db.getSallaConnectionByMerchantId(merchantId);
    if (!connection) {
      console.log(`[Salla Webhook] No connection found for merchant ${merchantId}`);
      return res.status(404).json({ error: 'Connection not found' });
    }

    const salla = new SallaIntegration(merchantId, connection.accessToken);

    // Handle different event types
    switch (event.event) {
      case 'product.updated':
        await handleProductUpdated(salla, merchantId, event.data);
        break;

      case 'product.deleted':
        await handleProductDeleted(merchantId, event.data);
        break;

      case 'product.quantity.updated':
        await handleProductQuantityUpdated(merchantId, event.data);
        break;

      case 'order.updated':
        await handleOrderUpdated(merchantId, event.data);
        break;

      default:
        console.log(`[Salla Webhook] Unhandled event type: ${event.event}`);
    }

    res.status(200).json({ received: true });
    
  } catch (error: any) {
    console.error('[Salla Webhook] Processing failed:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
}

// ========================================
// Event Handlers
// ========================================

async function handleProductUpdated(salla: SallaIntegration, merchantId: number, data: any) {
  try {
    console.log(`[Salla Webhook] Updating product ${data.id} for merchant ${merchantId}`);
    
    // Sync this specific product
    await salla.syncSingleProduct(data.id);
    
    console.log(`[Salla Webhook] ✅ Product ${data.id} updated successfully`);
  } catch (error: any) {
    console.error(`[Salla Webhook] Failed to update product ${data.id}:`, error.message);
  }
}

async function handleProductDeleted(merchantId: number, data: any) {
  try {
    console.log(`[Salla Webhook] Deleting product ${data.id} for merchant ${merchantId}`);
    
    const product = await db.getProductBySallaId(merchantId, data.id);
    if (product) {
      await db.deleteProduct(product.id);
      console.log(`[Salla Webhook] ✅ Product ${data.id} deleted successfully`);
    }
  } catch (error: any) {
    console.error(`[Salla Webhook] Failed to delete product ${data.id}:`, error.message);
  }
}

async function handleProductQuantityUpdated(merchantId: number, data: any) {
  try {
    console.log(`[Salla Webhook] Updating stock for product ${data.id} for merchant ${merchantId}`);
    
    const product = await db.getProductBySallaId(merchantId, data.id);
    if (product) {
      await db.updateProductStock(product.id, data.quantity || 0);
      console.log(`[Salla Webhook] ✅ Stock updated for product ${data.id}: ${data.quantity}`);
    }
  } catch (error: any) {
    console.error(`[Salla Webhook] Failed to update stock for product ${data.id}:`, error.message);
  }
}

async function handleOrderUpdated(merchantId: number, data: any) {
  try {
    console.log(`[Salla Webhook] Updating order ${data.id} for merchant ${merchantId}`);
    
    // الحصول على الطلب من قاعدة البيانات
    const order = await db.getOrderBySallaId(merchantId, data.id);
    
    if (!order) {
      console.log(`[Salla Webhook] Order ${data.id} not found in database`);
      return;
    }
    
    const newStatus = mapSallaOrderStatus(data.status?.name);
    const trackingNumber = data.shipping?.tracking_number;
    
    // معالجة تحديث الحالة مع إرسال إشعار واتساب تلقائي
    const notified = await processOrderStatusUpdate(
      order.id,
      newStatus,
      trackingNumber
    );
    
    if (notified) {
      console.log(`[Salla Webhook] ✅ Order ${data.id} updated and customer notified`);
    } else {
      console.log(`[Salla Webhook] ✅ Order ${data.id} updated (no notification sent)`);
    }
  } catch (error: any) {
    console.error(`[Salla Webhook] Failed to update order ${data.id}:`, error.message);
  }
}

// ========================================
// Helper Functions
// ========================================

async function getMerchantIdByStoreUrl(domain: string): Promise<number | null> {
  try {
    // Try exact match first
    let storeUrl = `https://${domain}`;
    let connection = await db.getSallaConnectionByMerchantId(0); // This won't work, need a different query
    
    // Since we don't have a query by storeUrl, we'll get all connections and find the match
    const allConnections = await db.getAllSallaConnections();
    const match = allConnections.find(c => 
      c.storeUrl.includes(domain) || domain.includes(c.storeUrl.replace('https://', '').replace('http://', ''))
    );
    
    return match ? match.merchantId : null;
  } catch (error) {
    console.error('[Salla Webhook] Error finding merchant by store URL:', error);
    return null;
  }
}

function mapSallaOrderStatus(sallaStatus: string): 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' {
  const statusMap: Record<string, 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'> = {
    'pending': 'pending',
    'processing': 'processing',
    'shipped': 'shipped',
    'delivered': 'delivered',
    'cancelled': 'cancelled',
    'completed': 'delivered',
  };
  
  return statusMap[sallaStatus?.toLowerCase()] || 'pending';
}
