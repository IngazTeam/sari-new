import cron from 'node-cron';
import { checkAllActiveOrders } from '../automation/order-tracking';

/**
 * Cron Job للتحقق من حالة الطلبات كل ساعة
 * يعمل في الدقيقة 0 من كل ساعة
 */
export function startOrderTrackingJob() {
  // كل ساعة في الدقيقة 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Order Tracking Job] Starting hourly check...');
    
    try {
      const stats = await checkAllActiveOrders();
      
      console.log('[Order Tracking Job] Completed:', {
        checked: stats.checked,
        updated: stats.updated,
        notified: stats.notified,
        errors: stats.errors,
      });
      
      // إذا كان هناك أخطاء كثيرة، يمكن إرسال تنبيه للمدير
      if (stats.errors > 5) {
        console.warn(`[Order Tracking Job] High error count: ${stats.errors}`);
        // TODO: إرسال إشعار للمدير
      }
    } catch (error) {
      console.error('[Order Tracking Job] Fatal error:', error);
    }
  });

  console.log('[Order Tracking Job] Scheduled to run every hour');
}

/**
 * Cron Job للتحقق الفوري (كل 15 دقيقة) للطلبات الحديثة
 * مفيد للطلبات التي تم إنشاؤها حديثاً
 */
export function startRecentOrdersTrackingJob() {
  // كل 15 دقيقة
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Recent Orders Tracking] Starting check...');
    
    try {
      // يمكن إضافة منطق خاص للطلبات الحديثة (آخر 24 ساعة)
      // TODO: تنفيذ checkRecentOrders()
      console.log('[Recent Orders Tracking] Completed');
    } catch (error) {
      console.error('[Recent Orders Tracking] Error:', error);
    }
  });

  console.log('[Recent Orders Tracking] Scheduled to run every 15 minutes');
}
