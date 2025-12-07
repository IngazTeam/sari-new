import cron from 'node-cron';
import * as db from '../db';
import { SallaIntegration } from '../integrations/salla';
import { notifyOwner } from '../_core/notification';

/**
 * Cron Jobs for Salla Integration
 * 
 * 1. Full Sync: Daily at 3 AM (all products, prices, images)
 * 2. Stock Sync: Every hour (quantities only)
 */

// ========================================
// 1. Daily Full Sync (3 AM)
// ========================================
export function startDailyFullSync() {
  // Run at 3:00 AM every day
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily full sync for all Salla stores');
    
    try {
      const connections = await db.getAllSallaConnections();
      
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
          const merchant = await db.getMerchantById(connection.merchantId);
          if (merchant) {
            await db.createNotification({
              userId: merchant.userId,
              type: 'success',
              title: 'تم تحديث منتجاتك من Salla',
              message: `تمت مزامنة ${result.synced} منتج بنجاح ✅`,
              link: '/merchant/products',
              isRead: false,
            });
          }
          
        } catch (error: any) {
          failCount++;
          console.error(`[Cron] ❌ Full sync failed for merchant ${connection.merchantId}:`, error.message);
          
          // Update connection status
          await db.updateSallaConnection(connection.merchantId, {
            syncStatus: 'error',
            syncErrors: JSON.stringify({
              message: error.message,
              timestamp: new Date(),
            }),
          });
          
          // Notify owner about failure
          await notifyOwner({
            title: 'فشل مزامنة Salla',
            content: `فشلت مزامنة المتجر للتاجر ${connection.merchantId}: ${error.message}`,
          });
        }
      }

      console.log(`[Cron] Daily full sync completed: ${successCount} success, ${failCount} failed`);
      
    } catch (error) {
      console.error('[Cron] Daily full sync job failed:', error);
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
      const connections = await db.getAllSallaConnections();
      
      if (connections.length === 0) {
        return;
      }

      for (const connection of connections) {
        try {
          const salla = new SallaIntegration(connection.merchantId, connection.accessToken);
          const result = await salla.syncStock();
          
          console.log(`[Cron] ✅ Merchant ${connection.merchantId}: ${result.updated} products updated`);
          
        } catch (error: any) {
          console.error(`[Cron] ❌ Stock sync failed for merchant ${connection.merchantId}:`, error.message);
          
          // Don't update status to error for stock sync failures
          // (full sync will handle it)
        }
      }
      
    } catch (error) {
      console.error('[Cron] Hourly stock sync job failed:', error);
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
