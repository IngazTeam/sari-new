/**
 * نظام التقارير التلقائية في Google Sheets
 * يولد تقارير يومية/أسبوعية/شهرية تلقائياً
 */

import {
  getGoogleIntegration,
  getMerchantById,
  getWhatsAppInstancesByMerchantId,
} from "./db";
import * as sheets from "./_core/googleSheets";
import { collectSheetReportData } from "./sheets-report-source";
import {
  sheetsReportData,
  sheetOrderValuesText,
  sheetReportPeriod,
  type SheetsReportData as ReportData,
} from "../shared/sheets-report-data";
import { getPool } from "./db/connection";

/**
 * توليد تقرير يومي
 */
export async function generateDailyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const { start, end } = sheetReportPeriod("daily");
    const data = await collectSheetReportData(merchantId, start, end);

    // حفظ التقرير في Google Sheets
    await saveReportToSheets(merchantId, "يومي", data);

    return {
      success: true,
      data,
      message: "تم توليد التقرير اليومي بنجاح",
    };
  } catch (error: any) {
    console.error(
      "[Sheets Reports] Error generating daily report:",
      "unconfirmed"
    );
    return {
      success: false,
      message: "فشل توليد التقرير اليومي",
    };
  }
}

/**
 * توليد تقرير أسبوعي
 */
export async function generateWeeklyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const { start, end } = sheetReportPeriod("weekly");
    const data = await collectSheetReportData(merchantId, start, end);

    await saveReportToSheets(merchantId, "أسبوعي", data);

    return {
      success: true,
      data,
      message: "تم توليد التقرير الأسبوعي بنجاح",
    };
  } catch (error: any) {
    console.error(
      "[Sheets Reports] Error generating weekly report:",
      "unconfirmed"
    );
    return {
      success: false,
      message: "فشل توليد التقرير الأسبوعي",
    };
  }
}

/**
 * توليد تقرير شهري
 */
export async function generateMonthlyReport(merchantId: number): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const { start, end } = sheetReportPeriod("monthly");
    const data = await collectSheetReportData(merchantId, start, end);

    await saveReportToSheets(merchantId, "شهري", data);

    return {
      success: true,
      data,
      message: "تم توليد التقرير الشهري بنجاح",
    };
  } catch (error: any) {
    console.error(
      "[Sheets Reports] Error generating monthly report:",
      "unconfirmed"
    );
    return {
      success: false,
      message: "فشل توليد التقرير الشهري",
    };
  }
}

/**
 * حفظ التقرير في Google Sheets
 */
async function saveReportToSheets(
  merchantId: number,
  reportType: string,
  data: ReportData
): Promise<void> {
  const integration = await getGoogleIntegration(merchantId, "sheets");

  if (!integration || !integration.isActive || !integration.sheetId) {
    throw new Error("Google Sheets غير مربوط");
  }

  const spreadsheetId = integration.sheetId;

  const current = async () => {
    const next = await getGoogleIntegration(merchantId, "sheets");
    if (
      !next?.isActive ||
      next.id !== integration.id ||
      next.sheetId !== spreadsheetId
    )
      throw Error("Report destination changed");
  };
  const acknowledged = (result: { success: boolean }) => {
    if (result.success !== true) throw Error("Report write unconfirmed");
  };
  // Creation may report an existing tab; a successful literal header write proves availability.
  await sheets.addSheet(merchantId, spreadsheetId, "التقارير", {
    redactErrors: true,
  });
  await current();
  acknowledged(
    await sheets.writeToSheet(
      merchantId,
      spreadsheetId,
      "التقارير!A1:H1",
      [
        [
          "تاريخ التقرير UTC",
          "نوع التقرير",
          "الفترة UTC",
          "الطلبات المسجلة",
          "قيمة الطلبات غير الملغاة حسب العملة — ليست إيرادًا محصلًا",
          "المحادثات المنشأة",
          "الرسائل في الفترة",
          "ملفات العملاء المنشأة",
        ],
      ],
      { raw: true }
    )
  );
  const values =
    sheetOrderValuesText(data) +
    ` | مبالغ مستبعدة: ${data.excludedAmounts} | طلبات بلا بنود موثوقة: ${data.excludedItemOrders}`;
  acknowledged(
    await sheets.appendToSheet(
      merchantId,
      spreadsheetId,
      "التقارير!A:H",
      [
        [
          new Date().toISOString(),
          reportType,
          data.period,
          String(data.totalOrders),
          values,
          String(data.totalConversations),
          String(data.totalMessages),
          String(data.newCustomers),
        ],
      ],
      { raw: true, beforeSend: current }
    )
  );
  const title = `أكثر المنتجات مبيعاً - ${reportType}`;
  await sheets.addSheet(merchantId, spreadsheetId, title, {
    redactErrors: true,
  });
  await current();
  const productRows = [
    ["المنتج الأكثر طلبًا — طلبات غير ملغاة", "الكمية المسجلة"],
    ...data.topProducts.map(p => [p.name, String(p.count)]),
    ...Array.from({ length: 5 - data.topProducts.length }, () => ["", ""]),
  ];
  acknowledged(
    await sheets.writeToSheet(
      merchantId,
      spreadsheetId,
      `'${title}'!A1:B6`,
      productRows,
      { raw: true }
    )
  );
  const pool = await getPool();
  if (!pool) throw Error("Report storage unavailable");
  const [updated] = await pool.execute<any>(
    "UPDATE google_integrations SET last_sync=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND integration_type='sheets' AND is_active=1 AND sheet_id=?",
    [integration.id, merchantId, spreadsheetId]
  );
  if (updated?.affectedRows !== 1) throw Error("Report save unconfirmed");
}

/**
 * توليد تقرير مخصص
 */
export async function generateCustomReport(
  merchantId: number,
  startDate: Date,
  endDate: Date
): Promise<{
  success: boolean;
  data?: ReportData;
  message: string;
}> {
  try {
    const data = await collectSheetReportData(merchantId, startDate, endDate);

    await saveReportToSheets(merchantId, "مخصص", data);

    return {
      success: true,
      data,
      message: "تم توليد التقرير المخصص بنجاح",
    };
  } catch (error: any) {
    console.error(
      "[Sheets Reports] Error generating custom report:",
      "unconfirmed"
    );
    return {
      success: false,
      message: "فشل توليد التقرير المخصص",
    };
  }
}

/**
 * إرسال التقرير عبر WhatsApp
 */
export async function sendReportViaWhatsApp(
  merchantId: number,
  reportType: string,
  data: ReportData
): Promise<{ success: boolean; message: string }> {
  try {
    data = sheetsReportData.parse(data);
    if (data.merchantId !== merchantId) throw Error("Report scope mismatch");
    const merchant = await getMerchantById(merchantId);
    if (!merchant || !merchant.phone) {
      return { success: false, message: "رقم التاجر غير متوفر" };
    }

    // RPT-01 FIX: Use merchant's own WhatsApp instance (not global ENV credentials)
    const instances = await getWhatsAppInstancesByMerchantId(merchantId);
    const activeInstance = instances.find((i: any) => i.status === "active");
    if (!activeInstance) {
      console.warn(
        `[Sheets Reports] No active WhatsApp instance for merchant ${merchantId} — skipping report send`
      );
      return { success: false, message: "لا يوجد اتصال واتساب نشط" };
    }

    // تنسيق التقرير
    const reportMessage = `
📊 *تقرير ${reportType}*

📅 الفترة: ${data.period}

📦 *الطلبات:* ${data.totalOrders}
💰 *قيمة الطلبات غير الملغاة:* ${sheetOrderValuesText(data)}
هذه قيم طلبات مسجلة وليست إيرادًا محصلًا.
مبالغ مستبعدة: ${data.excludedAmounts} · طلبات بلا بنود موثوقة: ${data.excludedItemOrders}
💬 *المحادثات:* ${data.totalConversations}
✉️ *الرسائل:* ${data.totalMessages}
👥 *ملفات عملاء منشأة:* ${data.newCustomers}

🏆 *أكثر المنتجات طلبًا في الطلبات غير الملغاة:*
${data.topProducts.length > 0 ? data.topProducts.map((p, i) => `${i + 1}. ${p.name} (${p.count})`).join("\n") : "لا بنود موثوقة في هذه الفترة"}

📈 *الطلبات حسب الحالة:*
${
  Object.keys(data.ordersByStatus).length > 0
    ? Object.entries(data.ordersByStatus)
        .map(([status, count]) => `• ${translateOrderStatus(status)}: ${count}`)
        .join("\n")
    : "لا توجد طلبات"
}

---
تم إنشاء التقرير بواسطة ساري 🤖
    `.trim();

    // إرسال الرسالة عبر WhatsApp instance التاجر
    const { sendMessageWithCredentials } = await import("./whatsapp");
    const result = await sendMessageWithCredentials(
      (activeInstance as any).instanceId,
      (activeInstance as any).token,
      (activeInstance as any).apiUrl || "https://api.green-api.com",
      merchant.phone,
      reportMessage
    );

    if (result.success !== true || !result.messageId) {
      console.error(
        `[Sheets Reports] WhatsApp send failed for merchant ${merchantId}:`,
        "unconfirmed"
      );
      return { success: false, message: "تعذر تأكيد إرسال التقرير" };
    }

    console.log(
      `[Sheets Reports] ✅ ${reportType} report sent via WhatsApp to merchant ${merchantId}`
    );
    return {
      success: true,
      message: "قُبل التقرير لدى مزود واتساب؛ التسليم غير مؤكد",
    };
  } catch (error: any) {
    console.error(
      "[Sheets Reports] Error sending report via WhatsApp:",
      "unconfirmed"
    );
    return {
      success: false,
      message: "فشل إرسال التقرير",
    };
  }
}

/**
 * ترجمة حالة الطلب إلى العربية
 */
function translateOrderStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    pending: "قيد الانتظار",
    confirmed: "مؤكد",
    processing: "قيد المعالجة",
    shipped: "تم الشحن",
    delivered: "تم التوصيل",
    cancelled: "ملغي",
    refunded: "تم الاسترجاع",
  };

  return statusMap[status] || status;
}
