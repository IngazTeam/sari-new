/**
 * Scheduled Campaigns Cron Job
 * 
 * يفحص الحملات المجدولة كل دقيقة ويرسلها تلقائياً عند حلول موعدها
 */

import { getCampaignById, updateCampaign, getConversationsByMerchantId, getPrimaryWhatsAppInstance, getDb } from "../db.js";
import { sendCampaign as sendWhatsAppCampaign } from "../whatsapp.js";

/**
 * فحص وإرسال الحملات المجدولة
 */
export async function checkScheduledCampaigns() {
  console.log("[Scheduled Campaigns] Checking for campaigns to send...");
  
  try {
    // استعلام SQL مباشر للحصول على الحملات المجدولة التي حان وقتها
    const db = await getDb();
    if (!db) {
      console.error("[Scheduled Campaigns] Database not available");
      return { checked: 0, sent: 0, failed: 0 };
    }
    const { campaigns } = await import("../../drizzle/schema.js");
    const { and, eq, lte } = await import("drizzle-orm");
    
    const now = new Date();
    
    // الحصول على الحملات المجدولة التي حان وقتها (scheduledAt <= now AND status = 'scheduled')
    const scheduledCampaigns = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, "scheduled"),
          lte(campaigns.scheduledAt, now)
        )
      );
    
    console.log(`[Scheduled Campaigns] Found ${scheduledCampaigns.length} campaigns to send`);
    
    if (scheduledCampaigns.length === 0) {
      return { checked: 0, sent: 0, failed: 0 };
    }
    
    let sent = 0;
    let failed = 0;
    
    // معالجة كل حملة
    for (const campaign of scheduledCampaigns) {
      try {
        console.log(`[Scheduled Campaigns] Processing campaign ${campaign.id}: ${campaign.name}`);
        
        // تحديث الحالة إلى "sending"
        await updateCampaign(campaign.id, { status: "sending" });
        
        // الحصول على WhatsApp instance للتاجر
        const instance = await getPrimaryWhatsAppInstance(campaign.merchantId);
        
        if (!instance) {
          console.error(`[Scheduled Campaigns] No WhatsApp instance found for merchant ${campaign.merchantId}`);
          await updateCampaign(campaign.id, { 
            status: "failed"
          });
          failed++;
          continue;
        }
        
        // الحصول على قائمة العملاء
        const conversations = await getConversationsByMerchantId(campaign.merchantId);
        
        if (conversations.length === 0) {
          console.log(`[Scheduled Campaigns] No customers found for merchant ${campaign.merchantId}`);
          await updateCampaign(campaign.id, { 
            status: "completed",
            totalRecipients: 0,
            sentCount: 0
          });
          sent++;
          continue;
        }
        
        console.log(`[Scheduled Campaigns] Sending to ${conversations.length} customers`);
        
        // إرسال الرسالة لجميع العملاء
        const recipients = conversations.map(c => c.customerPhone);
        const results = await sendWhatsAppCampaign(
          recipients,
          campaign.message,
          campaign.imageUrl || undefined,
          3, // minDelay
          6  // maxDelay
        );
        
        const successCount = results.filter(r => r.success).length;
        
        // تحديث الحملة بعد الإرسال
        await updateCampaign(campaign.id, {
          status: "completed",
          sentCount: successCount,
          totalRecipients: conversations.length
        });
        
        console.log(`[Scheduled Campaigns] Campaign ${campaign.id} completed: ${successCount}/${conversations.length} sent`);
        sent++;
        
      } catch (error) {
        console.error(`[Scheduled Campaigns] Error processing campaign ${campaign.id}:`, error);
        await updateCampaign(campaign.id, { status: "failed" });
        failed++;
      }
    }
    
    const result = {
      checked: scheduledCampaigns.length,
      sent,
      failed
    };
    
    console.log(`[Scheduled Campaigns] Job completed:`, result);
    return result;
    
  } catch (error) {
    console.error("[Scheduled Campaigns] Job error:", error);
    return { checked: 0, sent: 0, failed: 0, error: String(error) };
  }
}

/**
 * Cron Job: يعمل كل دقيقة
 */
export function startScheduledCampaignsJob() {
  console.log("[Scheduled Campaigns Job] Starting cron job (runs every minute)...");
  
  // تشغيل فوري عند البدء
  checkScheduledCampaigns();
  
  // تشغيل كل دقيقة (60000 ms)
  setInterval(async () => {
    const result = await checkScheduledCampaigns();
    console.log(`[Scheduled Campaigns Job] Completed:`, result);
  }, 60000);
}
