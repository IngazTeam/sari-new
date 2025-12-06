# 🚀 الخطوات التالية لاستكمال مشروع Sari

## ما تم إنجازه ✅

1. **قاعدة البيانات الكاملة** (12 جدول)
   - users, merchants, plans, subscriptions
   - whatsappConnections, products
   - conversations, messages
   - campaigns, supportTickets
   - payments, analytics

2. **ملف db.ts الكامل** مع جميع دوال قاعدة البيانات

3. **التوثيق الشامل**
   - دليل تكامل Green API
   - دليل تكامل OpenAI
   - دليل إدارة المنتجات
   - دليل النشر والتشغيل

4. **سكريبت Seed** لإضافة الباقات الثلاث

---

## ما يجب إكماله 🔨

### المرحلة 1: إكمال Backend APIs (أولوية عالية)

#### 1.1 إنشاء ملف routers.ts الكامل

```typescript
// في server/routers.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import * as db from './db';

// إضافة adminProcedure للصلاحيات
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      // ... (موجود بالفعل)
    }),
  }),

  // إضافة routers للميزات المختلفة
  merchants: router({
    // APIs إدارة التجار
  }),

  products: router({
    // APIs إدارة المنتجات (راجع PRODUCT_MANAGEMENT.md)
  }),

  whatsapp: router({
    // APIs الواتساب (راجع GREEN_API_INTEGRATION.md)
  }),

  conversations: router({
    // APIs المحادثات
  }),

  campaigns: router({
    // APIs الحملات
  }),

  support: router({
    // APIs الدعم
  }),

  analytics: router({
    // APIs الإحصائيات
  }),
});
```

**الوقت المتوقع:** 2-3 أيام

---

### المرحلة 2: تكامل Green API (أولوية عالية)

#### 2.1 إنشاء ملف whatsapp.ts

```typescript
// في server/whatsapp.ts
export async function getQRCode(instanceId: string, apiToken: string) {
  // راجع GREEN_API_INTEGRATION.md - القسم 2
}

export async function checkConnectionStatus(instanceId: string, apiToken: string) {
  // راجع GREEN_API_INTEGRATION.md - القسم 3
}

export async function sendMessage(instanceId: string, apiToken: string, phoneNumber: string, message: string) {
  // راجع GREEN_API_INTEGRATION.md - القسم 5
}

export async function sendImage(instanceId: string, apiToken: string, phoneNumber: string, imageUrl: string, caption?: string) {
  // راجع GREEN_API_INTEGRATION.md - القسم 6
}

export async function sendMessageWithDelay(instanceId: string, apiToken: string, phoneNumber: string, message: string) {
  // راجع GREEN_API_INTEGRATION.md - القسم 7
}
```

#### 2.2 إعداد Webhook

```typescript
// في server/_core/index.ts
app.post('/api/webhook/whatsapp/:merchantId', async (req, res) => {
  // راجع GREEN_API_INTEGRATION.md - القسم 4
});
```

**الوقت المتوقع:** 2-3 أيام

---

### المرحلة 3: تكامل OpenAI (أولوية عالية)

#### 3.1 إنشاء ملف ai.ts

```typescript
// في server/ai.ts
export const SARI_SYSTEM_PROMPT = `...`; // راجع OPENAI_INTEGRATION.md - القسم 2

export async function processTextMessage(messageContent: string, conversationHistory: Message[], merchantProducts: Product[]): Promise<string> {
  // راجع OPENAI_INTEGRATION.md - القسم 3
}

export async function processVoiceMessage(voiceUrl: string, conversationHistory: Message[], merchantProducts: Product[]): Promise<{ transcription: string; response: string }> {
  // راجع OPENAI_INTEGRATION.md - القسم 4
}

export async function processMessageWithAI(messageId: number, conversationId: number, merchantId: number) {
  // راجع OPENAI_INTEGRATION.md - القسم 5
}
```

**الوقت المتوقع:** 2-3 أيام

---

### المرحلة 4: بناء Frontend (أولوية متوسطة)

#### 4.1 صفحات التاجر

```
client/src/pages/merchant/
├── Dashboard.tsx           # الصفحة الرئيسية
├── WhatsAppConnect.tsx     # ربط الواتساب
├── ProductList.tsx         # قائمة المنتجات
├── ProductUpload.tsx       # رفع CSV
├── Conversations.tsx       # سجل المحادثات
├── Analytics.tsx           # التقارير
├── Subscription.tsx        # إدارة الاشتراك
└── Support.tsx            # الدعم الفني
```

#### 4.2 صفحات Admin

```
client/src/pages/admin/
├── Dashboard.tsx           # الصفحة الرئيسية
├── Merchants.tsx          # إدارة التجار
├── Plans.tsx              # إدارة الباقات
├── Campaigns.tsx          # مراقبة الحملات
├── Analytics.tsx          # الإحصائيات الشاملة
└── Support.tsx            # نظام الدعم
```

#### 4.3 تحديث App.tsx

```typescript
// في client/src/App.tsx
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";

// Merchant pages
import MerchantDashboard from "./pages/merchant/Dashboard";
import WhatsAppConnect from "./pages/merchant/WhatsAppConnect";
// ... باقي الصفحات

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
// ... باقي الصفحات

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      {/* Merchant routes */}
      <Route path="/merchant/dashboard">
        <DashboardLayout>
          <MerchantDashboard />
        </DashboardLayout>
      </Route>
      
      {/* Admin routes */}
      <Route path="/admin/dashboard">
        <DashboardLayout>
          <AdminDashboard />
        </DashboardLayout>
      </Route>
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
```

**الوقت المتوقع:** 4-5 أيام

---

### المرحلة 5: نظام الباقات والحدود (أولوية متوسطة)

#### 5.1 إنشاء ملف subscription.ts

```typescript
// في server/subscription.ts
export async function checkSubscriptionLimits(merchantId: number): Promise<boolean> {
  // راجع OPENAI_INTEGRATION.md - القسم 8
}

export async function checkVoiceMessageLimit(merchantId: number): Promise<boolean> {
  // راجع OPENAI_INTEGRATION.md - القسم 8
}

export async function notifyMerchantLimitReached(merchantId: number, limitType: 'conversations' | 'voice_messages') {
  // إرسال تنبيه للتاجر
}
```

**الوقت المتوقع:** 1-2 يوم

---

### المرحلة 6: تكامل بوابات الدفع (أولوية منخفضة - يمكن تأجيلها)

#### 6.1 Tap Payment

```typescript
// في server/payment/tap.ts
export async function createTapPayment(amount: number, merchantId: number, subscriptionId: number) {
  // تكامل Tap API
}

export async function handleTapWebhook(webhookData: any) {
  // معالجة Webhook من Tap
}
```

#### 6.2 PayPal

```typescript
// في server/payment/paypal.ts
export async function createPayPalPayment(amount: number, merchantId: number, subscriptionId: number) {
  // تكامل PayPal API
}
```

**الوقت المتوقع:** 2-3 أيام

---

### المرحلة 7: الاختبار (أولوية عالية)

#### 7.1 كتابة اختبارات Vitest

```typescript
// في server/products.test.ts
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("products.uploadCSV", () => {
  it("should parse and insert products from CSV", async () => {
    // ...
  });
});
```

#### 7.2 اختبار يدوي

- [ ] اختبار ربط الواتساب
- [ ] اختبار إرسال واستقبال الرسائل
- [ ] اختبار معالجة الرسائل الصوتية
- [ ] اختبار رفع CSV
- [ ] اختبار نظام الباقات والحدود

**الوقت المتوقع:** 2-3 أيام

---

## الأولويات الموصى بها 🎯

### الأسبوع 1-2: Backend الأساسي
1. ✅ إكمال routers.ts
2. ✅ تكامل Green API
3. ✅ تكامل OpenAI
4. ✅ نظام الباقات والحدود

### الأسبوع 3-4: Frontend
1. ✅ صفحات التاجر الأساسية
2. ✅ صفحات Admin الأساسية
3. ✅ تكامل مع Backend APIs

### الأسبوع 5: الاختبار والنشر
1. ✅ الاختبار الشامل
2. ✅ إصلاح الأخطاء
3. ✅ النشر على VPS

---

## الموارد المطلوبة 📚

### API Keys:
- [ ] OpenAI API Key ([احصل عليه هنا](https://platform.openai.com/api-keys))
- [ ] Green API Credentials ([سجل هنا](https://green-api.com/))
- [ ] Tap API Keys (اختياري - للمرحلة الثانية)
- [ ] PayPal API Keys (اختياري - للمرحلة الثانية)

### Dependencies الإضافية:
```bash
pnpm add papaparse
pnpm add -D @types/papaparse
```

---

## نصائح مهمة 💡

1. **ابدأ بالـ Backend أولاً** - تأكد من عمل جميع APIs قبل بناء Frontend

2. **اختبر كل ميزة على حدة** - لا تنتقل للميزة التالية قبل التأكد من عمل الحالية

3. **استخدم التوثيق المرفق** - جميع الأدلة في مجلد `docs/` تحتوي على أمثلة كاملة

4. **راجع الأخطاء في Logs** - استخدم `pm2 logs` و `console.log` للتصحيح

5. **لا تنسى Seed Data** - شغل `node seed.mjs` قبل البدء

---

## الدعم 🆘

إذا واجهت أي مشاكل:

1. راجع التوثيق في `docs/`
2. تحقق من Logs في `pm2 logs sari`
3. تأكد من صحة المتغيرات البيئية في `.env`
4. راجع الأخطاء في `console.log`

---

**حظاً موفقاً! 🚀**
