import cron from 'node-cron';
import {
  createNotification,
  getAllSallaConnections,
  getMerchantById,
} from '../db';
import { SallaIntegration } from '../integrations/salla';
import { notifyOwner } from '../_core/notification';

/**
 * Cron Jobs for Salla Integration
 * 
 * 1. Full Sync: Daily at 3 AM (all products, prices, images)
 * 2. Stock Sync: Every hour (verified current-store product snapshots)
 */

// ========================================
// 1. Daily Full Sync (3 AM)
// ========================================
export function startDailyFullSync() {
  // Run at 3:00 AM every day
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily full sync for all Salla stores');
    
    try {
      const connections = await getAllSallaConnections();
      
      if (connections.length === 0) {
        console.log('[Cron] No active Salla connections found');
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const connection of connections) {
        try {
          console.log(`[Cron] Syncing store for merchant ${connection.merchantId}`);
          
          const salla = new SallaIntegration(connection.merchantId, connection.accessToken);
          const result = await salla.fullSync();
          
          successCount++;
          
          console.log(`[Cron] ✅ Merchant ${connection.merchantId}: ${result.synced} products synced`);
          
          // Notify merchant
          const merchant = await getMerchantById(connection.merchantId);
          if (merchant) {
            await createNotification({
              userId: merchant.userId,
              type: 'success',
              title: 'تم تحديث منتجاتك من Salla',
              message: `تمت مزامنة ${result.synced} منتج بنجاح ✅`,
              link: '/merchant/products',
              isRead: 0,
            });
          }
          
        } catch (error: any) {
          failCount++;
          console.error(`[Cron] ❌ Full sync failed for merchant ${connection.merchantId}:`, 'catalog_sync_unavailable');
          
          // The integration records failure without modifying a reconnected store.
          // Notify owner about failure
          await notifyOwner({
            title: 'فشل مزامنة Salla',
            content: `فشلت مزامنة المتجر للتاجر ${connection.merchantId}: catalog_sync_unavailable`,
          });
        }
      }

      console.log(`[Cron] Daily full sync completed: ${successCount} success, ${failCount} failed`);
      
    } catch (error) {
      console.error('[Cron] Daily full sync job failed');
    }
  });

  console.log('[Cron] Daily full sync job scheduled (3:00 AM)');
}

// ========================================
// 2. Hourly Stock Sync
// ========================================
export function startHourlyStockSync() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Starting hourly stock sync for all Salla stores');
    
    try {
      const connections = await getAllSallaConnections();
      
      if (connections.length === 0) {
        return;
      }

      for (const connection of connections) {
        try {
          const salla = new SallaIntegration(connection.merchantId, connection.accessToken);
          const result = await salla.syncStock();
          
          console.log(`[Cron] ✅ Merchant ${connection.merchantId}: ${result.updated} products updated`);
          
        } catch (error: any) {
          console.error(`[Cron] ❌ Stock sync failed for merchant ${connection.merchantId}:`, 'catalog_sync_unavailable');
          
          // Keep connection authority unchanged after transient catalog failures.
        }
      }
      
    } catch (error) {
      console.error('[Cron] Hourly stock sync job failed');
    }
  });

  console.log('[Cron] Hourly stock sync job scheduled (every hour)');
}

// ========================================
// Initialize all cron jobs
// ========================================
export function initializeSallaCronJobs() {
  startDailyFullSync();
  startHourlyStockSync();
  console.log('[Cron] All Salla sync jobs initialized');
}
