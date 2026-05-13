/**
 * Scheduled Messages Cron Job
 * 
 * يفحص الرسائل المجدولة كل دقيقة ويرسلها تلقائياً عند حلول موعدها
 */

import { getScheduledMessagesToSend, updateScheduledMessageLastSent, getConversationsByMerchantId, getDb, getActiveSubscriptionByMerchantId } from "../db.js";
import { sendCampaign as sendWhatsAppCampaign } from "../whatsapp.js";

/**
 * فحص وإرسال الرسائل المجدولة
 */
export async function checkScheduledMessages() {
  console.log("[Scheduled Messages] Checking for messages to send...");
  
  try {
    // الحصول على الرسائل المجدولة التي حان وقتها
    const messages = await getScheduledMessagesToSend();
    
    console.log(`[Scheduled Messages] Found ${messages.length} messages to send`);
    
    if (messages.length === 0) {
      return { checked: 0, sent: 0, failed: 0 };
    }
    
    let sent = 0;
    let failed = 0;
    
    // معالجة كل رسالة
    for (const message of messages) {
      try {
        console.log(`[Scheduled Messages] Processing message ${message.id}: ${message.title}`);
        
        // SEC-FIX: Verify merchant has active subscription before sending
        const subscription = await getActiveSubscriptionByMerchantId(message.merchantId);
        if (!subscription) {
          console.warn(`[Scheduled Messages] Merchant ${message.merchantId} has no active subscription — skipping message ${message.id}`);
          failed++;
          continue;
        }
        
        // التحقق من آخر إرسال (لتجنب الإرسال المتكرر في نفس الدقيقة)
        if (message.lastSentAt) {
          const lastSent = new Date(message.lastSentAt);
          const now = new Date();
          const diffMinutes = Math.floor((now.getTime() - lastSent.getTime()) / 60000);
          
          // إذا تم الإرسال خلال آخر 60 دقيقة، تخطي
          if (diffMinutes < 60) {
            console.log(`[Scheduled Messages] Message ${message.id} was sent ${diffMinutes} minutes ago, skipping`);
            continue;
          }
        }
        
        // الحصول على قائمة العملاء للتاجر
        const conversations = await getConversationsByMerchantId(message.merchantId);
        
        if (conversations.length === 0) {
          console.log(`[Scheduled Messages] No customers found for merchant ${message.merchantId}`);
          // تحديث lastSentAt حتى لو لم يكن هناك عملاء
          await updateScheduledMessageLastSent(message.id);
          sent++;
          continue;
        }
        
        console.log(`[Scheduled Messages] Sending to ${conversations.length} customers`);
        
        // إرسال الرسالة لجميع العملاء
        const recipients = conversations.map(c => c.customerPhone);
        const results = await sendWhatsAppCampaign(
          recipients,
          message.message,
          undefined, // no image
          2, // minDelay
          4  // maxDelay
        );
        
        const successCount = results.filter(r => r.success).length;
        
        // تحديث lastSentAt
        await updateScheduledMessageLastSent(message.id);
        
        console.log(`[Scheduled Messages] Message ${message.id} completed: ${successCount}/${conversations.length} sent`);
        sent++;
        
      } catch (error) {
        console.error(`[Scheduled Messages] Error processing message ${message.id}:`, error);
        failed++;
      }
    }
    
    const result = {
      checked: messages.length,
      sent,
      failed
    };
    
    console.log(`[Scheduled Messages] Job completed:`, result);
    return result;
    
  } catch (error) {
    console.error("[Scheduled Messages] Job error:", error);
    return { checked: 0, sent: 0, failed: 0, error: String(error) };
  }
}

/**
 * Cron Job: يعمل كل دقيقة
 */
export function startScheduledMessagesJob() {
  console.log("[Scheduled Messages Job] Starting cron job (runs every minute)...");
  
  // تشغيل فوري عند البدء
  checkScheduledMessages();
  
  // تشغيل كل دقيقة (60000 ms)
  setInterval(async () => {
    const result = await checkScheduledMessages();
    console.log(`[Scheduled Messages Job] Completed:`, result);
  }, 60000);
}
