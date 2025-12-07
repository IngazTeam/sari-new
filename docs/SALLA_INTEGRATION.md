# دليل تكامل Salla API

## 📋 نظرة عامة

تم تطوير تكامل كامل مع Salla API يتيح للتجار:
- ✅ ربط متجرهم في Salla تلقائياً
- ✅ مزامنة المنتجات والأسعار والصور
- ✅ تخزين المنتجات محلياً للرد السريع
- ✅ إنشاء طلبات من الواتساب مباشرة في Salla
- ✅ تحديث تلقائي للمخزون

---

## 🏗️ البنية التقنية

### 1. قاعدة البيانات

#### جدول `salla_connections`
يخزن بيانات الربط مع Salla لكل تاجر.

```sql
- id: معرف فريد
- merchantId: معرف التاجر (unique)
- storeUrl: رابط المتجر (https://mystore.salla.sa)
- accessToken: Personal Access Token من Salla
- syncStatus: حالة المزامنة (active, syncing, error, paused)
- lastSyncAt: آخر وقت مزامنة
- syncErrors: أخطاء المزامنة (JSON)
- createdAt, updatedAt
```

#### جدول `sync_logs`
يسجل جميع عمليات المزامنة.

```sql
- id: معرف فريد
- merchantId: معرف التاجر
- syncType: نوع المزامنة (full_sync, stock_sync, single_product)
- status: حالة العملية (success, failed, in_progress)
- itemsSynced: عدد العناصر المزامنة
- errors: الأخطاء (JSON)
- startedAt, completedAt
```

#### جدول `orders`
يخزن الطلبات من الواتساب.

```sql
- id: معرف فريد
- merchantId: معرف التاجر
- sallaOrderId: معرف الطلب في Salla
- orderNumber: رقم الطلب للعرض
- customerPhone, customerName, customerEmail
- address, city
- items: تفاصيل المنتجات (JSON)
- totalAmount: المبلغ الإجمالي (بالهللات)
- discountCode: كود الخصم
- status: حالة الطلب
- paymentUrl: رابط الدفع من Salla
- trackingNumber: رقم التتبع
- notes, createdAt, updatedAt
```

#### تحديثات جدول `products`
تم إضافة حقول جديدة:
```sql
- sallaProductId: معرف المنتج في Salla
- lastSyncedAt: آخر وقت مزامنة
```

---

### 2. ملف التكامل (`server/integrations/salla.ts`)

#### Class: `SallaIntegration`

**Constructor:**
```typescript
new SallaIntegration(merchantId: number, accessToken: string)
```

**Methods:**

##### `fullSync(): Promise<{ success: boolean; synced: number }>`
- جلب جميع المنتجات من Salla
- يتم تلقائياً يومياً في الساعة 3 صباحاً
- يحفظ: الاسم، السعر، الصورة، الوصف، الكمية، الفئة

##### `syncStock(): Promise<{ success: boolean; updated: number }>`
- تحديث الكميات المتوفرة فقط
- يتم تلقائياً كل ساعة
- أسرع من المزامنة الكاملة

##### `createOrder(orderData): Promise<{ success, orderNumber, paymentUrl, orderId }>`
- إنشاء طلب جديد في Salla
- يُستخدم عند الطلب من الواتساب
- يرجع رابط الدفع للعميل

##### `syncSingleProduct(sallaProductId): Promise<{ success: boolean }>`
- تحديث منتج واحد فقط
- يُستخدم عند استقبال webhook من Salla

##### `getOrderStatus(sallaOrderId): Promise<{ status, trackingNumber, trackingUrl }>`
- الحصول على حالة الطلب من Salla
- يُستخدم لتتبع الطلبات

##### `testConnection(): Promise<{ success: boolean; storeInfo? }>`
- اختبار الاتصال بـ Salla
- يُستخدم قبل حفظ بيانات الربط

---

### 3. دوال قاعدة البيانات (`server/db.ts`)

#### Salla Connections
```typescript
createSallaConnection(connection): Promise<SallaConnection>
getSallaConnectionByMerchantId(merchantId): Promise<SallaConnection>
updateSallaConnection(merchantId, data): Promise<void>
deleteSallaConnection(merchantId): Promise<void>
getAllSallaConnections(): Promise<SallaConnection[]>
```

#### Sync Logs
```typescript
createSyncLog(merchantId, syncType, status): Promise<number>
updateSyncLog(id, status, itemsSynced, errors?): Promise<void>
getSyncLogsByMerchantId(merchantId, limit?): Promise<SyncLog[]>
```

#### Products - Salla
```typescript
getProductBySallaId(merchantId, sallaProductId): Promise<Product>
getProductsWithSallaId(merchantId): Promise<Product[]>
updateProductStock(productId, stock): Promise<void>
```

#### Orders
```typescript
createOrder(order): Promise<Order>
getOrderById(id): Promise<Order>
getOrderBySallaId(merchantId, sallaOrderId): Promise<Order>
getOrdersByMerchantId(merchantId): Promise<Order[]>
updateOrderStatus(id, status, trackingNumber?): Promise<void>
updateOrderBySallaId(merchantId, sallaOrderId, data): Promise<void>
```

---

### 4. APIs (tRPC) (`server/routers.ts`)

#### `salla.getConnection`
- الحصول على حالة الربط
- Input: `{ merchantId }`
- Output: `{ connected, storeUrl?, syncStatus?, lastSyncAt? }`

#### `salla.connect`
- ربط متجر Salla
- Input: `{ merchantId, storeUrl, accessToken }`
- Output: `{ success, message }`
- يختبر الاتصال أولاً قبل الحفظ
- يبدأ مزامنة كاملة في الخلفية

#### `salla.disconnect`
- فصل المتجر
- Input: `{ merchantId }`
- Output: `{ success, message }`

#### `salla.syncNow`
- مزامنة يدوية
- Input: `{ merchantId, syncType: 'full' | 'stock' }`
- Output: `{ success, message }`

#### `salla.getSyncLogs`
- الحصول على سجل المزامنة
- Input: `{ merchantId }`
- Output: `SyncLog[]` (آخر 20 عملية)

---

### 5. Cron Jobs (`server/jobs/salla-sync.ts`)

#### المزامنة الكاملة اليومية
```typescript
Schedule: '0 3 * * *' (3:00 AM يومياً)
Function: startDailyFullSync()
```

**ماذا تفعل:**
1. تجلب جميع المتاجر المربوطة
2. تنفذ `fullSync()` لكل متجر
3. ترسل إشعار للتاجر عند النجاح
4. ترسل إشعار للمدير عند الفشل
5. تحدث `syncStatus` في قاعدة البيانات

#### مزامنة المخزون الساعية
```typescript
Schedule: '0 * * * *' (كل ساعة)
Function: startHourlyStockSync()
```

**ماذا تفعل:**
1. تجلب جميع المتاجر المربوطة
2. تنفذ `syncStock()` لكل متجر
3. تحدث الكميات فقط (أسرع)

---

### 6. Webhook Handler (`server/webhooks/salla.ts`)

#### Endpoint
```
POST /api/webhooks/salla
```

#### الأحداث المدعومة

##### `product.updated`
- يحدث: عند تعديل منتج في Salla
- الإجراء: تحديث المنتج في قاعدة بياناتنا
- الدالة: `syncSingleProduct()`

##### `product.deleted`
- يحدث: عند حذف منتج من Salla
- الإجراء: حذف المنتج من قاعدة بياناتنا

##### `product.quantity.updated`
- يحدث: عند تغيير كمية منتج
- الإجراء: تحديث الكمية فوراً

##### `order.updated`
- يحدث: عند تحديث حالة طلب
- الإجراء: تحديث حالة الطلب في قاعدة بياناتنا
- TODO: إرسال إشعار واتساب للعميل عند الشحن

---

### 7. الواجهة الأمامية (`client/src/pages/SallaIntegration.tsx`)

#### المكونات الرئيسية

**Connection Status Card:**
- يعرض حالة الربط (مربوط/غير مربوط)
- رابط المتجر
- حالة المزامنة (نشط، خطأ، جاري المزامنة)
- آخر وقت مزامنة
- أزرار: مزامنة المخزون، مزامنة كاملة، فصل المتجر

**Connection Form:**
- نموذج لإدخال رابط المتجر والـ Token
- تعليمات للحصول على Token من Salla
- زر "ربط المتجر"

**Sync Logs:**
- جدول يعرض آخر 20 عملية مزامنة
- يوضح: النوع، الحالة، عدد المنتجات، التاريخ

**Info Card:**
- شرح كيفية عمل التكامل
- جدول المزامنة التلقائية

---

## 🚀 كيفية الاستخدام

### للتاجر:

#### 1. الحصول على Personal Access Token من Salla

1. سجل دخول إلى لوحة تحكم Salla
2. اذهب إلى **الإعدادات** → **API**
3. اضغط على **Create Token**
4. اختر الصلاحيات المطلوبة:
   - `products:read` - قراءة المنتجات
   - `products:write` - تعديل المخزون
   - `orders:read` - قراءة الطلبات
   - `orders:write` - إنشاء طلبات
   - `customers:read` - قراءة العملاء
   - `customers:write` - إنشاء حسابات
5. انسخ الـ Token (سيظهر مرة واحدة فقط!)

#### 2. ربط المتجر في ساري

1. اذهب إلى **ربط متجر Salla** من القائمة الجانبية
2. أدخل رابط متجرك (مثال: `https://mystore.salla.sa`)
3. الصق الـ Token الذي نسخته
4. اضغط على **ربط المتجر**
5. انتظر حتى تكتمل المزامنة الأولى (قد تستغرق دقائق حسب عدد المنتجات)

#### 3. التحقق من المزامنة

1. تحقق من صفحة **المنتجات** - يجب أن تظهر جميع منتجاتك
2. راجع **سجل المزامنة** للتأكد من نجاح العملية
3. جرب **مزامنة المخزون** يدوياً للتأكد من عمل النظام

#### 4. تسجيل Webhook في Salla (اختياري - للتحديثات الفورية)

1. في لوحة تحكم Salla، اذهب إلى **الإعدادات** → **Webhooks**
2. اضغط على **Add Webhook**
3. أدخل URL: `https://your-domain.com/api/webhooks/salla`
4. اختر الأحداث:
   - `product.updated`
   - `product.deleted`
   - `product.quantity.updated`
   - `order.updated`
5. احفظ

---

### للمطور:

#### إضافة ميزة جديدة تستخدم Salla API

```typescript
// في server/routers.ts أو ملف منفصل

import { SallaIntegration } from './integrations/salla';
import * as db from './db';

// مثال: الحصول على تفاصيل منتج من Salla
async function getProductDetails(merchantId: number, sallaProductId: string) {
  // 1. احصل على connection
  const connection = await db.getSallaConnectionByMerchantId(merchantId);
  if (!connection) {
    throw new Error('Store not connected');
  }

  // 2. أنشئ instance من SallaIntegration
  const salla = new SallaIntegration(merchantId, connection.accessToken);

  // 3. استخدم Salla API
  const response = await axios.get(
    `https://api.salla.dev/admin/v2/products/${sallaProductId}`,
    {
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Accept': 'application/json'
      }
    }
  );

  return response.data.data;
}
```

---

## 📊 استراتيجية التخزين المحلي

### لماذا التخزين المحلي؟

**بدون التخزين:**
```
عميل: عندكم آيفون 15؟
→ API call إلى Salla (500-1000ms)
→ معالجة البيانات (100ms)
→ الرد (إجمالي: 1+ ثانية)
```

**مع التخزين:**
```
عميل: عندكم آيفون 15؟
→ استعلام من قاعدة بياناتنا (10-50ms)
→ الرد (إجمالي: 50-100ms)

سرعة أكبر بـ 10-20 مرة! 🚀
```

### ما نخزنه محلياً:
- ✅ المنتجات (الاسم، السعر، الصورة، الوصف)
- ✅ الكميات (مع تحديث دوري)
- ✅ الطلبات (للتتبع والتقارير)
- ✅ العملاء (لتاريخ الشراء)

### ما نتصل بـ Salla لأجله:
- 📞 إنشاء طلب جديد
- 📞 إنشاء كود خصم
- 📞 تحديث المخزون (دوري)
- 📞 تتبع الشحنة

### جدول المزامنة:
```
- مزامنة كاملة: مرة يومياً (3 صباحاً)
- مزامنة المخزون: كل ساعة
- Webhook: فوري عند أي تغيير
```

---

## ⚠️ التحديات والحلول

### 1. Rate Limiting
**المشكلة:** Salla تحد الطلبات بـ 60 request/minute

**الحل:**
- تأخير 1 ثانية بين كل طلب
- إعادة المحاولة بعد 60 ثانية عند hit rate limit
- استخدام queue system (Bull/BullMQ) للطلبات الكثيرة

### 2. Token Expiration
**المشكلة:** Personal Access Token دائم لكن قد يُلغى

**الحل:**
- اختبار الاتصال قبل كل مزامنة
- تحديث `syncStatus` إلى `error` عند فشل الاتصال
- إشعار التاجر لتحديث Token

### 3. Webhook Reliability
**المشكلة:** Webhooks قد تفشل أو تتأخر

**الحل:**
- المزامنة الدورية كـ fallback
- تخزين failed webhooks للمراجعة
- Retry mechanism (3 محاولات)

### 4. Data Mapping
**المشكلة:** Salla تستخدم IDs مختلفة

**الحل:**
- حقل `sallaProductId` في جدول products
- حقل `sallaOrderId` في جدول orders
- دوال `getProductBySallaId()` و `getOrderBySallaId()`

### 5. المزامنة الأولية
**المشكلة:** متجر به 10,000 منتج = 200 request = 3+ دقائق

**الحل:**
- Background job مع progress tracking
- تقسيم إلى batches (50 منتج لكل batch)
- إشعار التاجر عند الانتهاء

---

## 🧪 الاختبار

### اختبار الربط
```bash
# في المتصفح
1. اذهب إلى /merchant/salla
2. أدخل بيانات متجر تجريبي
3. تحقق من نجاح الربط
4. راجع سجل المزامنة
```

### اختبار المزامنة اليدوية
```bash
# في المتصفح
1. اضغط على "مزامنة المخزون"
2. انتظر الإشعار
3. تحقق من تحديث المنتجات
```

### اختبار Webhook
```bash
# استخدم Postman أو curl
curl -X POST https://your-domain.com/api/webhooks/salla \
  -H "Content-Type: application/json" \
  -d '{
    "event": "product.updated",
    "merchant": {
      "id": "123",
      "domain": "mystore.salla.sa"
    },
    "data": {
      "id": "product_123",
      "name": "Test Product",
      "quantity": 50
    },
    "created_at": "2024-01-01T00:00:00Z"
  }'
```

### اختبار Cron Jobs
```bash
# في server/jobs/salla-sync.ts
# غيّر الجدول الزمني لاختبار أسرع:
cron.schedule('*/2 * * * *', ...) // كل دقيقتين بدلاً من كل ساعة

# راقب logs:
tail -f logs/salla-sync.log
```

---

## 📝 TODO (تحسينات مستقبلية)

- [ ] إضافة دعم OAuth 2.0 (بدلاً من Personal Token فقط)
- [ ] Queue system (Bull/BullMQ) لإدارة الطلبات
- [ ] Redis caching للمنتجات الأكثر طلباً
- [ ] Progress bar للمزامنة الأولية
- [ ] Retry logic أفضل للـ webhooks
- [ ] إشعارات واتساب تلقائية عند شحن الطلب
- [ ] تقارير تحليلية للمبيعات من Salla
- [ ] دعم متعدد المتاجر (تاجر واحد = عدة متاجر Salla)
- [ ] Webhook signature verification
- [ ] Rate limiting dashboard للمراقبة

---

## 🔗 روابط مفيدة

- [Salla API Documentation](https://docs.salla.dev/)
- [Salla Partner Portal](https://partners.salla.sa/)
- [Salla Webhooks Guide](https://docs.salla.dev/docs/webhooks)
- [Personal Access Token Guide](https://docs.salla.dev/docs/authentication#personal-access-token)

---

## 📞 الدعم

للمساعدة أو الإبلاغ عن مشاكل:
- فتح ticket في صفحة الدعم
- التواصل مع فريق التطوير

---

**تم إنشاء هذا الدليل في:** ${new Date().toLocaleDateString('ar-SA')}
**الإصدار:** 1.0.0
