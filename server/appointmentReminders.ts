/**
 * نظام التذكيرات التلقائية للمواعيد
 * يتم تشغيله كل ساعة للتحقق من المواعيد القادمة وإرسال التذكيرات
 */

import { getAllMerchantsWithCalendar, getAppointmentsForReminder, markReminderSent } from './db';
import { sendTextMessage } from "./whatsapp";

export interface ReminderConfig {
  hours24Before: boolean;
  hours1Before: boolean;
}

/**
 * إرسال تذكيرات للمواعيد القادمة
 * يتم استدعاؤها كل ساعة من Cron Job
 */
export async function sendAppointmentReminders(merchantId: number): Promise<void> {
  try {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // الحصول على المواعيد التي تحتاج تذكير قبل 24 ساعة
    const appointments24h = await getAppointmentsForReminder(
      merchantId,
      in24Hours,
      in25Hours
    );

    // الحصول على المواعيد التي تحتاج تذكير قبل 1 ساعة
    const appointments1h = await getAppointmentsForReminder(
      merchantId,
      in1Hour,
      in2Hours
    );

    // إرسال تذكيرات 24 ساعة
    for (const appointment of appointments24h) {
      if (!appointment.reminder24hSent) {
        await sendReminder(appointment, "24h");
        await markReminderSent(appointment.id, "24h");
      }
    }

    // إرسال تذكيرات 1 ساعة
    for (const appointment of appointments1h) {
      if (!appointment.reminder1hSent) {
        await sendReminder(appointment, "1h");
        await markReminderSent(appointment.id, "1h");
      }
    }

    console.log(
      `[Reminders] Sent ${appointments24h.length} 24h reminders and ${appointments1h.length} 1h reminders for merchant ${merchantId}`
    );
  } catch (error) {
    console.error(`[Reminders] Error sending reminders for merchant ${merchantId}:`, error);
    throw error;
  }
}

/**
 * إرسال تذكير واحد عبر WhatsApp
 */
async function sendReminder(
  appointment: any,
  type: "24h" | "1h"
): Promise<void> {
  try {
    const appointmentDate = new Date(appointment.startTime);
    const timeStr = appointmentDate.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const dateStr = appointmentDate.toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let message = "";
    if (type === "24h") {
      message = `
🔔 *تذكير بموعدك*

مرحباً ${appointment.customerName} 👋

نذكرك بموعدك القادم:

📅 *التاريخ:* ${dateStr}
⏰ *الوقت:* ${timeStr}
💼 *الخدمة:* ${appointment.serviceName}
👤 *الموظف:* ${appointment.staffName}

نتطلع لرؤيتك! ✨

_إذا كنت بحاجة لإلغاء أو تعديل الموعد، يرجى إعلامنا._
      `.trim();
    } else {
      message = `
⏰ *تذكير: موعدك خلال ساعة!*

مرحباً ${appointment.customerName} 👋

موعدك سيبدأ خلال ساعة واحدة:

⏰ *الوقت:* ${timeStr}
💼 *الخدمة:* ${appointment.serviceName}
👤 *الموظف:* ${appointment.staffName}

نراك قريباً! 🎯
      `.trim();
    }

    await sendTextMessage(
      appointment.customerPhone,
      message
    );

    console.log(
      `[Reminders] Sent ${type} reminder to ${appointment.customerPhone} for appointment ${appointment.id}`
    );
  } catch (error) {
    console.error(
      `[Reminders] Error sending ${type} reminder for appointment ${appointment.id}:`,
      error
    );
    throw error;
  }
}

/**
 * تشغيل نظام التذكيرات لجميع التجار
 */
export async function runRemindersForAllMerchants(): Promise<void> {
  try {
    const merchants = await getAllMerchantsWithCalendar();
    
    console.log(`[Reminders] Running reminders for ${merchants.length} merchants`);
    
    for (const merchant of merchants) {
      try {
        await sendAppointmentReminders(merchant.id);
      } catch (error) {
        console.error(`[Reminders] Failed for merchant ${merchant.id}:`, error);
        // استمر مع التجار الآخرين حتى لو فشل أحدهم
      }
    }
    
    console.log(`[Reminders] Completed reminders run`);
  } catch (error) {
    console.error("[Reminders] Error in runRemindersForAllMerchants:", error);
    throw error;
  }
}
