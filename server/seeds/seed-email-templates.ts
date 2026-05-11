/**
 * Seed Email Templates
 * يُنشئ القوالب الافتراضية لنظام البريد الإلكتروني
 * 
 * Usage: npx tsx server/seeds/seed-email-templates.ts
 */

import { getDb } from "../db";

const BRAND_COLOR = "#10b981";
const BRAND_NAME = "ساري";

// ─── Shared HTML wrapper ───────────────────────────────────────────
function wrapHtml(bodyContent: string): string {
  return `<tr>
  <td style="padding: 40px 30px;">
    ${bodyContent}
  </td>
</tr>`;
}

// ─── Templates ─────────────────────────────────────────────────────
const templates = [
  {
    name: "welcome",
    displayName: "ترحيب بتاجر جديد",
    description: "يُرسل تلقائياً عند تسجيل تاجر جديد في المنصة",
    subject: "مرحباً بك في ساري! 🎉",
    variables: JSON.stringify(["merchantName", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, ${BRAND_COLOR}, #059669); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 36px;">🎉</span>
        </div>
        <h1 style="color: #1f2937; font-size: 28px; margin: 0 0 10px;">مرحباً {{merchantName}}!</h1>
        <p style="color: #6b7280; font-size: 16px; margin: 0;">تم تسجيلك بنجاح في منصة ${BRAND_NAME}</p>
      </div>
      <div style="background: #f0fdf4; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h3 style="color: #166534; margin: 0 0 12px; font-size: 16px;">✅ ابدأ الآن في 3 خطوات:</h3>
        <ol style="color: #374151; margin: 0; padding-right: 20px; line-height: 2;">
          <li>اربط حسابك على واتساب</li>
          <li>أضف منتجاتك أو خدماتك</li>
          <li>فعّل ساري وابدأ البيع تلقائياً</li>
        </ol>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/dashboard" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">ابدأ الآن</a>
      </div>
    `),
    textContent: `مرحباً {{merchantName}}!\n\nتم تسجيلك بنجاح في منصة ساري.\n\nابدأ الآن:\n1. اربط حسابك على واتساب\n2. أضف منتجاتك أو خدماتك\n3. فعّل ساري وابدأ البيع تلقائياً\n\nرابط لوحة التحكم: {{appUrl}}/merchant/dashboard`,
  },
  {
    name: "new_order",
    displayName: "إشعار طلب جديد",
    description: "يُرسل عند استلام طلب جديد من عميل عبر واتساب",
    subject: "🛒 طلب جديد #{{orderNumber}}",
    variables: JSON.stringify(["orderNumber", "customerName", "totalAmount", "merchantName", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background: #dbeafe; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">🛒</span>
        </div>
        <h1 style="color: #1f2937; font-size: 24px; margin: 0;">طلب جديد!</h1>
      </div>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">رقم الطلب</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; font-size: 14px;">#{{orderNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-size: 14px;">العميل</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; border-top: 1px solid #e5e7eb; font-size: 14px;">{{customerName}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-size: 14px;">المبلغ</td>
            <td style="padding: 8px 0; color: ${BRAND_COLOR}; font-weight: bold; text-align: left; border-top: 1px solid #e5e7eb; font-size: 18px;">{{totalAmount}} ريال</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/orders" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض الطلب</a>
      </div>
    `),
    textContent: `طلب جديد!\n\nرقم الطلب: #{{orderNumber}}\nالعميل: {{customerName}}\nالمبلغ: {{totalAmount}} ريال\n\nعرض الطلب: {{appUrl}}/merchant/orders`,
  },
  {
    name: "order_status_changed",
    displayName: "تحديث حالة الطلب",
    description: "يُرسل عند تغيير حالة طلب (قيد التجهيز، تم الشحن، تم التسليم)",
    subject: "📦 تحديث على الطلب #{{orderNumber}}",
    variables: JSON.stringify(["orderNumber", "customerName", "totalAmount", "merchantName", "orderStatus", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background: #fef3c7; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">📦</span>
        </div>
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تحديث حالة الطلب</h1>
        <p style="color: #6b7280; margin: 0;">الطلب #{{orderNumber}} — {{customerName}}</p>
      </div>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #92400e; font-size: 14px; margin: 0 0 8px;">الحالة الجديدة</p>
        <p style="color: #78350f; font-size: 20px; font-weight: bold; margin: 0;">{{orderStatus}}</p>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/orders" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض التفاصيل</a>
      </div>
    `),
    textContent: `تحديث حالة الطلب\n\nالطلب: #{{orderNumber}}\nالعميل: {{customerName}}\nالحالة: {{orderStatus}}\n\nعرض التفاصيل: {{appUrl}}/merchant/orders`,
  },
  {
    name: "new_review",
    displayName: "تقييم جديد من عميل",
    description: "يُرسل عند استلام تقييم جديد من عميل",
    subject: "⭐ تقييم جديد من {{customerName}}",
    variables: JSON.stringify(["customerName", "productName", "rating", "merchantName", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تقييم جديد!</h1>
        <p style="color: #6b7280; margin: 0;">من {{customerName}}</p>
      </div>
      <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 32px; margin: 0 0 12px;">{{rating}}</p>
        <p style="color: #374151; font-size: 16px; font-weight: bold; margin: 0;">{{productName}}</p>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/reviews" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض التقييمات</a>
      </div>
    `),
    textContent: `تقييم جديد!\n\nمن: {{customerName}}\nالمنتج: {{productName}}\nالتقييم: {{rating}}\n\nعرض التقييمات: {{appUrl}}/merchant/reviews`,
  },
  {
    name: "campaign_completed",
    displayName: "اكتمال حملة تسويقية",
    description: "يُرسل عند اكتمال إرسال حملة تسويقية عبر واتساب",
    subject: "📊 تقرير الحملة: {{campaignName}}",
    variables: JSON.stringify(["campaignName", "recipientsCount", "successCount", "failedCount", "merchantName", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background: #ede9fe; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">📊</span>
        </div>
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تقرير الحملة</h1>
        <p style="color: #6b7280; margin: 0;">{{campaignName}}</p>
      </div>
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; background: #f0fdf4; border-radius: 10px; padding: 16px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">المستلمون</p>
          <p style="color: #1f2937; font-size: 24px; font-weight: bold; margin: 0;">{{recipientsCount}}</p>
        </div>
        <div style="flex: 1; background: #f0fdf4; border-radius: 10px; padding: 16px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">نجح</p>
          <p style="color: #16a34a; font-size: 24px; font-weight: bold; margin: 0;">{{successCount}}</p>
        </div>
        <div style="flex: 1; background: #fef2f2; border-radius: 10px; padding: 16px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">فشل</p>
          <p style="color: #dc2626; font-size: 24px; font-weight: bold; margin: 0;">{{failedCount}}</p>
        </div>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/campaigns" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض الحملات</a>
      </div>
    `),
    textContent: `تقرير الحملة: {{campaignName}}\n\nالمستلمون: {{recipientsCount}}\nنجح: {{successCount}}\nفشل: {{failedCount}}\n\nعرض الحملات: {{appUrl}}/merchant/campaigns`,
  },
  {
    name: "weekly_report",
    displayName: "التقرير الأسبوعي",
    description: "تقرير أسبوعي تلقائي يلخص أداء المتجر",
    subject: "📈 تقريرك الأسبوعي — {{merchantName}}",
    variables: JSON.stringify(["merchantName", "totalOrders", "totalRevenue", "newCustomers", "totalMessages", "topProduct", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">📈 تقريرك الأسبوعي</h1>
        <p style="color: #6b7280; margin: 0;">{{merchantName}} — ملخص أداء الأسبوع</p>
      </div>
      <div style="margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; padding: 12px; background: #eff6ff; border-radius: 8px 0 0 0; text-align: center; border: 1px solid #dbeafe;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الطلبات</p>
              <p style="color: #1e40af; font-size: 22px; font-weight: bold; margin: 0;">{{totalOrders}}</p>
            </td>
            <td style="width: 50%; padding: 12px; background: #f0fdf4; border-radius: 0 8px 0 0; text-align: center; border: 1px solid #bbf7d0;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الإيرادات</p>
              <p style="color: #166534; font-size: 22px; font-weight: bold; margin: 0;">{{totalRevenue}} ر.س</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px; background: #fefce8; border-radius: 0 0 0 8px; text-align: center; border: 1px solid #fde68a;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">عملاء جدد</p>
              <p style="color: #92400e; font-size: 22px; font-weight: bold; margin: 0;">{{newCustomers}}</p>
            </td>
            <td style="padding: 12px; background: #faf5ff; border-radius: 0 0 8px 0; text-align: center; border: 1px solid #e9d5ff;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الرسائل</p>
              <p style="color: #7c3aed; font-size: 22px; font-weight: bold; margin: 0;">{{totalMessages}}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/dashboard" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض لوحة التحكم</a>
      </div>
    `),
    textContent: `تقريرك الأسبوعي — {{merchantName}}\n\nالطلبات: {{totalOrders}}\nالإيرادات: {{totalRevenue}} ر.س\nعملاء جدد: {{newCustomers}}\nالرسائل: {{totalMessages}}\n\nلوحة التحكم: {{appUrl}}/merchant/dashboard`,
  },
  {
    name: "password_reset",
    displayName: "إعادة تعيين كلمة المرور",
    description: "يُرسل عند طلب إعادة تعيين كلمة المرور",
    subject: "🔐 إعادة تعيين كلمة المرور",
    variables: JSON.stringify(["merchantName", "resetLink", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background: #fef2f2; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">🔐</span>
        </div>
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">إعادة تعيين كلمة المرور</h1>
        <p style="color: #6b7280; margin: 0;">مرحباً {{merchantName}}</p>
      </div>
      <p style="color: #374151; font-size: 15px; line-height: 1.8; text-align: center; margin-bottom: 24px;">
        تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد.
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="{{resetLink}}" style="display: inline-block; background: #ef4444; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">إعادة تعيين كلمة المرور</a>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
    `),
    textContent: `إعادة تعيين كلمة المرور\n\nمرحباً {{merchantName}}\n\nتلقينا طلباً لإعادة تعيين كلمة المرور. إذا لم تطلب ذلك، تجاهل هذا البريد.\n\nرابط إعادة التعيين: {{resetLink}}\n\nالرابط صالح لمدة ساعة واحدة.`,
  },
  {
    name: "subscription_activated",
    displayName: "تفعيل الاشتراك",
    description: "يُرسل عند تفعيل اشتراك جديد أو تجديد اشتراك",
    subject: "✅ تم تفعيل اشتراكك — {{planName}}",
    variables: JSON.stringify(["merchantName", "planName", "expiryDate", "appUrl"]),
    htmlContent: wrapHtml(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="background: #dcfce7; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">✅</span>
        </div>
        <h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تم تفعيل اشتراكك!</h1>
        <p style="color: #6b7280; margin: 0;">مرحباً {{merchantName}}</p>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">الباقة</td>
            <td style="padding: 8px 0; color: #166534; font-weight: bold; text-align: left; font-size: 16px;">{{planName}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #bbf7d0; font-size: 14px;">تاريخ الانتهاء</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; border-top: 1px solid #bbf7d0; font-size: 14px;">{{expiryDate}}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center;">
        <a href="{{appUrl}}/merchant/subscription" style="display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">إدارة الاشتراك</a>
      </div>
    `),
    textContent: `تم تفعيل اشتراكك!\n\nمرحباً {{merchantName}}\n\nالباقة: {{planName}}\nتاريخ الانتهاء: {{expiryDate}}\n\nإدارة الاشتراك: {{appUrl}}/merchant/subscription`,
  },
];

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("🔧 Seeding email templates...\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ Database connection failed");
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const tmpl of templates) {
    // Check if already exists
    const existing = await db.query.emailTemplates.findFirst({
      where: (emailTemplates: any, { eq }: any) => eq(emailTemplates.name, tmpl.name),
    });

    if (existing) {
      console.log(`⏭️  ${tmpl.name} — already exists (skipping)`);
      skipped++;
      continue;
    }

    await db.insert(require("../../drizzle/schema").emailTemplates).values({
      name: tmpl.name,
      displayName: tmpl.displayName,
      description: tmpl.description,
      subject: tmpl.subject,
      htmlContent: tmpl.htmlContent,
      textContent: tmpl.textContent,
      variables: tmpl.variables,
      isCustom: 0,
    });

    console.log(`✅ ${tmpl.name} — ${tmpl.displayName}`);
    created++;
  }

  console.log(`\n📊 Done! Created: ${created} | Skipped: ${skipped} | Total: ${templates.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
