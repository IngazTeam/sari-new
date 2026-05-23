// @ts-nocheck
/**
 * نظام حجز المواعيد عبر WhatsApp Bot
 * يتعامل مع طلبات حجز المواعيد من العملاء تلقائياً
 */

import {
  createAppointment,
  getActiveStaff,
  getAvailableTimeSlots,
  getGoogleIntegrationStatus,
  getServiceById,
  getServicesForBooking,
  getStaffById,
} from './db';
import { invokeLLM } from "./_core/llm";

/**
 * اكتشاف ما إذا كانت الرسالة تتعلق بحجز موعد
 */
export async function isAppointmentRequest(message: string): Promise<boolean> {
  const appointmentKeywords = [
    "موعد",
    "حجز",
    "موعد",
    "أبي موعد",
    "أبغى موعد",
    "أريد موعد",
    "ممكن موعد",
    "متى فاضي",
    "متى متاح",
    "وقت فاضي",
    "حجز موعد",
    "appointment",
    "booking",
    "book",
    "schedule",
  ];

  const lowerMessage = message.toLowerCase();
  return appointmentKeywords.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}

/**
 * استخراج تفاصيل الموعد من رسالة العميل باستخدام AI
 */
export async function extractAppointmentDetails(
  message: string,
  merchantId: number
): Promise<{
  serviceName?: string;
  preferredDate?: string;
  preferredTime?: string;
  staffName?: string;
} | null> {
  try {
    const services = await getServicesForBooking(merchantId);
    const staff = await getActiveStaff(merchantId);

    const systemPrompt = `أنت مساعد ذكي لاستخراج تفاصيل حجز المواعيد من رسائل العملاء.

الخدمات المتاحة:
${services.map((s) => `- ${s.name} (${s.duration} دقيقة، ${s.price} ريال)`).join("\n")}

الموظفين المتاحين:
${staff.map((s) => `- ${s.name} (${s.specialization})`).join("\n")}

استخرج من رسالة العميل:
1. اسم الخدمة (إذا ذكرها)
2. التاريخ المفضل (إذا ذكره)
3. الوقت المفضل (إذا ذكره)
4. اسم الموظف (إذا ذكره)

أرجع JSON فقط بدون أي نص إضافي.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "appointment_details",
          strict: true,
          schema: {
            type: "object",
            properties: {
              serviceName: {
                type: "string",
                description: "اسم الخدمة المطلوبة",
              },
              preferredDate: {
                type: "string",
                description: "التاريخ المفضل بصيغة YYYY-MM-DD",
              },
              preferredTime: {
                type: "string",
                description: "الوقت المفضل بصيغة HH:MM",
              },
              staffName: {
                type: "string",
                description: "اسم الموظف المطلوب",
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // @ts-ignore
    const details = JSON.parse(content);
    return details;
  } catch (error) {
    console.error("[AppointmentBot] Error extracting details:", error);
    return null;
  }
}

/**
 * الحصول على الأوقات المتاحة للحجز
 */
export async function getAvailableSlots(
  merchantId: number,
  serviceId: number,
  date: string,
  staffId?: number
): Promise<string[]> {
  try {
    const slots = await getAvailableTimeSlots(
      merchantId,
      serviceId,
      date,
      // @ts-ignore
      staffId
    );
    // @ts-ignore
    return slots;
  } catch (error) {
    console.error("[AppointmentBot] Error getting available slots:", error);
    return [];
  }
}

/**
 * تنسيق الأوقات المتاحة للعرض
 */
function formatAvailableSlots(slots: string[]): string {
  if (slots.length === 0) {
    return "للأسف لا توجد أوقات متاحة في هذا اليوم.";
  }

  const formatted = slots.map((slot, index) => {
    const time = new Date(`2000-01-01T${slot}`);
    const timeStr = time.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${index + 1}. ${timeStr}`;
  });

  return `الأوقات المتاحة:\n\n${formatted.join("\n")}`;
}

/**
 * معالجة طلب حجز موعد
 */
export async function handleAppointmentRequest(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  message: string
): Promise<string> {
  try {
    // التحقق من اتصال Google Calendar
    const calendarStatus = await getGoogleIntegrationStatus(merchantId);
    if (!calendarStatus?.isActive) {
      return "عذراً، نظام حجز المواعيد غير متاح حالياً. يرجى التواصل معنا مباشرة.";
    }

    // استخراج تفاصيل الموعد
    const details = await extractAppointmentDetails(message, merchantId);

    // الحصول على الخدمات المتاحة
    const services = await getServicesForBooking(merchantId);

    if (services.length === 0) {
      return "عذراً، لا توجد خدمات متاحة للحجز حالياً.";
    }

    // إذا لم يحدد العميل خدمة، اعرض الخدمات المتاحة
    if (!details?.serviceName) {
      const servicesList = services
        .map(
          (s, i) =>
            `${i + 1}. ${s.name} - ${s.duration} دقيقة (${s.price} ريال)`
        )
        .join("\n");

      return `أهلاً بك! 👋

يسعدنا حجز موعد لك. لدينا الخدمات التالية:

${servicesList}

أي خدمة تبي تحجز لها؟`;
    }

    // البحث عن الخدمة المطلوبة
    const service = services.find(
      (s) =>
        s.name.toLowerCase().includes(details.serviceName!.toLowerCase()) ||
        details.serviceName!.toLowerCase().includes(s.name.toLowerCase())
    );

    if (!service) {
      return `عذراً، لم أجد خدمة "${details.serviceName}". 

الخدمات المتاحة لدينا:
${services.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}

أي خدمة تبي تحجز لها؟`;
    }

    // إذا لم يحدد تاريخ، اسأله
    if (!details.preferredDate) {
      return `تمام! اخترت خدمة "${service.name}" 👍

متى تبي الموعد؟ (مثال: غداً، يوم السبت، 2024-03-15)`;
    }

    // تحويل التاريخ إلى صيغة قياسية
    const targetDate = parseDate(details.preferredDate);
    if (!targetDate) {
      return "عذراً، لم أفهم التاريخ. ممكن تكتبه بصيغة أوضح؟ (مثال: غداً، يوم السبت، 2024-03-15)";
    }

    // الحصول على الأوقات المتاحة
    const dateStr = targetDate.toISOString().split("T")[0];
    const availableSlots = await (getAvailableSlots as any)(
      merchantId,
      service.id,
      dateStr
    );

    if (availableSlots.length === 0) {
      return `للأسف لا توجد أوقات متاحة في ${formatDateArabic(targetDate)} 😔

تبي تجرب يوم ثاني؟`;
    }

    // عرض الأوقات المتاحة
    return `تمام! 👍

${formatAvailableSlots(availableSlots)}

أي وقت يناسبك؟ (اكتب الرقم أو الوقت)`;
  } catch (error) {
    console.error("[AppointmentBot] Error handling appointment:", error);
    return "خلني أتحقق من المواعيد المتاحة وأرجع لك 🔍 أو تقدر تتواصل معنا مباشرة 🙏";
  }
}

/**
 * تأكيد حجز الموعد
 */
export async function confirmAppointment(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  serviceId: number,
  date: string,
  time: string,
  staffId?: number
): Promise<{ success: boolean; message: string; appointmentId?: number }> {
  try {
    // حجز الموعد
    const appointment = await (createAppointment as any)({
      merchantId,
      customerName,
      customerPhone,
      serviceId,
      staffId: staffId || null,
      appointmentDate: date,
      startTime: time,
      status: "confirmed",
      notes: "تم الحجز عبر WhatsApp Bot",
    });

    if (!appointment) {
      return {
        success: false,
        message: "عذراً، فشل حجز الموعد. يرجى المحاولة مرة أخرى.",
      };
    }

    const service = await getServiceById(serviceId);
    const staff = staffId ? await getStaffById(staffId) : null;

    const appointmentDate = new Date(`${date}T${time}`);
    const dateStr = formatDateArabic(appointmentDate);
    const timeStr = appointmentDate.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const message = `تم تأكيد موعدك بنجاح! ✅

📋 تفاصيل الموعد:
• الخدمة: ${service?.name}
• التاريخ: ${dateStr}
• الوقت: ${timeStr}
${staff ? `• الموظف: ${staff.name}` : ""}
// @ts-ignore
• المدة: ${service?.duration} دقيقة
// @ts-ignore
• السعر: ${service?.price} ريال

سيتم إرسال تذكير لك قبل الموعد بـ 24 ساعة وساعة واحدة.

نتطلع لرؤيتك! 🌟`;

    // إرسال إشعار بالموعد الجديد
    try {
      const { notifyNewAppointment } = await import('./_core/notificationService');
      await notifyNewAppointment(
        merchantId, 
        appointment.id, 
        customerName, 
        service?.name || 'خدمة', 
        appointmentDate
      );
    } catch (error) {
      console.error('[Notification] Failed to send new appointment notification:', error);
    }

    return {
      success: true,
      message,
      appointmentId: appointment.id,
    };
  } catch (error) {
    console.error("[AppointmentBot] Error confirming appointment:", error);
    return {
      success: false,
      message: "خلني أتأكد من تأكيد موعدك وأرجع لك 🔍 جرب مرة ثانية أو تواصل معنا مباشرة 🙏",
    };
  }
}

/**
 * تحويل نص التاريخ إلى Date object
 */
function parseDate(dateStr: string): Date | null {
  try {
    const today = new Date();
    const lowerDate = dateStr.toLowerCase();

    // اليوم
    if (lowerDate.includes("اليوم") || lowerDate === "today") {
      return today;
    }

    // غداً
    if (lowerDate.includes("غد") || lowerDate === "tomorrow") {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // بعد غد
    if (lowerDate.includes("بعد غد")) {
      const afterTomorrow = new Date(today);
      afterTomorrow.setDate(afterTomorrow.getDate() + 2);
      return afterTomorrow;
    }

    // أيام الأسبوع
    const daysMap: { [key: string]: number } = {
      السبت: 6,
      الأحد: 0,
      الاثنين: 1,
      الثلاثاء: 2,
      الأربعاء: 3,
      الخميس: 4,
      الجمعة: 5,
      saturday: 6,
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
    };

    for (const [dayName, dayNum] of Object.entries(daysMap)) {
      if (lowerDate.includes(dayName)) {
        const targetDate = new Date(today);
        const currentDay = today.getDay();
        let daysToAdd = dayNum - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        return targetDate;
      }
    }

    // تاريخ بصيغة YYYY-MM-DD
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * تنسيق التاريخ بالعربي
 */
function formatDateArabic(date: Date): string {
  return date.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}