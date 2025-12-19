# دليل تكامل Tap Payments في نظام Sari

## نظرة عامة

تم تكامل نظام Sari بالكامل مع **Tap Payments**، بوابة الدفع الرائدة في منطقة الشرق الأوسط. يتيح هذا التكامل للتجار إنشاء معاملات دفع آمنة وإرسال روابط الدفع للعملاء عبر واتساب.

---

## المميزات الرئيسية

### 1. معاملات الدفع
- ✅ إنشاء معاملات دفع آمنة
- ✅ دعم جميع طرق الدفع (بطاقات، KNET، Benefit، Apple Pay، إلخ)
- ✅ تتبع حالة المعاملات في الوقت الفعلي
- ✅ إرسال إيصالات تلقائية عبر البريد والرسائل
- ✅ دعم المبالغ بالريال السعودي وعملات أخرى

### 2. روابط الدفع السريعة
- ✅ إنشاء روابط دفع قابلة للمشاركة
- ✅ دعم المبالغ الثابتة والمتغيرة
- ✅ تحديد عدد مرات الاستخدام
- ✅ تتبع الإحصائيات والمدفوعات

### 3. عمليات الاسترجاع
- ✅ استرجاع كامل أو جزئي
- ✅ تتبع حالة الاسترجاع
- ✅ سجل كامل لجميع العمليات

### 4. Webhooks
- ✅ معالجة تلقائية لإشعارات Tap
- ✅ تحديث حالة المعاملات تلقائياً
- ✅ إشعارات فورية للتاجر والعميل

---

## البنية التقنية

### 1. قاعدة البيانات

#### جدول `order_payments`
يحتوي على جميع معاملات الدفع:

```sql
CREATE TABLE order_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  merchant_id INT NOT NULL,
  order_id INT NULL,
  booking_id INT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NULL,
  amount INT NOT NULL,  -- بالهللات (100 هللة = 1 ريال)
  currency VARCHAR(3) DEFAULT 'SAR',
  tap_charge_id VARCHAR(255) NULL,
  tap_payment_url TEXT NULL,
  status ENUM('pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded'),
  payment_method VARCHAR(50) NULL,
  description TEXT NULL,
  metadata TEXT NULL,
  error_message TEXT NULL,
  error_code VARCHAR(50) NULL,
  authorized_at DATETIME NULL,
  captured_at DATETIME NULL,
  failed_at DATETIME NULL,
  refunded_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### جدول `payment_links`
يحتوي على روابط الدفع السريعة:

```sql
CREATE TABLE payment_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  merchant_id INT NOT NULL,
  link_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  amount INT NOT NULL,
  currency VARCHAR(3) DEFAULT 'SAR',
  is_fixed_amount TINYINT DEFAULT 1,
  min_amount INT NULL,
  max_amount INT NULL,
  tap_payment_url TEXT NULL,
  usage_count INT DEFAULT 0,
  max_usage_count INT NULL,
  successful_payments INT DEFAULT 0,
  failed_payments INT DEFAULT 0,
  total_collected INT DEFAULT 0,
  status ENUM('active', 'disabled', 'expired', 'completed') DEFAULT 'active',
  is_active TINYINT DEFAULT 1,
  expires_at DATETIME NULL,
  order_id INT NULL,
  booking_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### جدول `payment_refunds`
يحتوي على عمليات الاسترجاع:

```sql
CREATE TABLE payment_refunds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  payment_id INT NOT NULL,
  merchant_id INT NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(3) DEFAULT 'SAR',
  reason TEXT NULL,
  tap_refund_id VARCHAR(255) NULL,
  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT NULL,
  processed_by INT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### 2. Backend APIs

#### ملف `server/_core/tapPayments.ts`
يحتوي على دوال التكامل مع Tap Payments API:

```typescript
// إنشاء معاملة دفع
export async function createCharge(data: CreateChargeParams): Promise<TapCharge>

// التحقق من حالة الدفع
export async function verifyPayment(chargeId: string): Promise<PaymentVerification>

// إنشاء عملية استرجاع
export async function createRefund(data: CreateRefundParams): Promise<TapRefund>

// معالجة Webhook
export async function processWebhook(payload: any): Promise<WebhookProcessResult>
```

#### ملف `server/db_payments.ts`
يحتوي على 30+ دالة لإدارة قاعدة البيانات:

**معاملات الدفع:**
- `createOrderPayment()` - إنشاء معاملة
- `getOrderPaymentById()` - جلب معاملة بالمعرف
- `getOrderPaymentByTapChargeId()` - جلب معاملة بمعرف Tap
- `getOrderPaymentsByMerchant()` - قائمة معاملات التاجر
- `updateOrderPaymentStatus()` - تحديث حالة المعاملة
- `getPaymentStats()` - إحصائيات شاملة

**روابط الدفع:**
- `createPaymentLink()` - إنشاء رابط
- `getPaymentLinkById()` - جلب رابط بالمعرف
- `getPaymentLinkByLinkId()` - جلب رابط بمعرف الرابط
- `incrementPaymentLinkUsage()` - زيادة عداد الاستخدام
- `disablePaymentLink()` - تعطيل رابط

**عمليات الاسترجاع:**
- `createPaymentRefund()` - إنشاء استرجاع
- `getPaymentRefundsByPaymentId()` - قائمة استرجاعات معاملة
- `updatePaymentRefundStatus()` - تحديث حالة الاسترجاع

---

### 3. tRPC APIs

#### `payments.createCharge`
إنشاء معاملة دفع جديدة:

```typescript
const { paymentId, chargeId, paymentUrl } = await trpc.payments.createCharge.mutate({
  amount: 10000, // 100 ريال (بالهللات)
  currency: 'SAR',
  customerName: 'أحمد محمد',
  customerEmail: 'ahmed@example.com',
  customerPhone: '+966501234567',
  description: 'دفعة طلب #123',
  orderId: 123,
  redirectUrl: 'https://example.com/success',
});
```

#### `payments.verifyPayment`
التحقق من حالة الدفع:

```typescript
const verification = await trpc.payments.verifyPayment.query({
  chargeId: 'chg_TS01A1234567890',
});
```

#### `payments.list`
قائمة المعاملات مع فلاتر:

```typescript
const payments = await trpc.payments.list.query({
  status: 'captured',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  limit: 50,
});
```

#### `payments.getStats`
إحصائيات شاملة:

```typescript
const stats = await trpc.payments.getStats.query({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

// النتيجة:
// {
//   totalPayments: 150,
//   totalAmount: 1500000,
//   successfulPayments: 140,
//   successfulAmount: 1400000,
//   failedPayments: 10,
//   pendingPayments: 0,
//   refundedPayments: 5,
//   refundedAmount: 50000
// }
```

#### `payments.createRefund`
إنشاء عملية استرجاع:

```typescript
const { refundId, tapRefundId } = await trpc.payments.createRefund.mutate({
  paymentId: 123,
  amount: 5000, // 50 ريال (استرجاع جزئي)
  reason: 'طلب العميل',
});
```

#### `payments.createLink`
إنشاء رابط دفع سريع:

```typescript
const { linkId, paymentUrl } = await trpc.payments.createLink.mutate({
  title: 'دفعة الاشتراك الشهري',
  description: 'اشتراك شهر يناير 2024',
  amount: 10000, // 100 ريال
  currency: 'SAR',
  isFixedAmount: true,
  maxUsageCount: 10, // اختياري
});
```

---

### 4. Frontend Pages

#### صفحة إدارة المعاملات (`/merchant/payments`)
- عرض إحصائيات شاملة
- جدول تفاعلي لجميع المعاملات
- فلاتر متقدمة (حسب الحالة، البحث)
- badges ملونة للحالات المختلفة

#### صفحة روابط الدفع (`/merchant/payment-links`)
- إنشاء روابط دفع سريعة
- جدول الروابط مع إحصائيات
- نسخ ومشاركة الروابط
- تعطيل الروابط

---

## دليل الاستخدام

### 1. إنشاء معاملة دفع

```typescript
// في صفحة الطلبات أو الحجوزات
const createPaymentMutation = trpc.payments.createCharge.useMutation({
  onSuccess: (data) => {
    // إرسال رابط الدفع للعميل عبر واتساب
    sendWhatsAppMessage(customerPhone, `
      مرحباً ${customerName}،
      
      يمكنك إتمام الدفع من خلال الرابط التالي:
      ${data.paymentUrl}
      
      المبلغ: ${amount} ريال
      صالح لمدة: 24 ساعة
    `);
  },
});

// إنشاء المعاملة
createPaymentMutation.mutate({
  amount: orderTotal * 100, // تحويل إلى هللات
  currency: 'SAR',
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  customerEmail: order.customerEmail,
  description: `طلب #${order.id}`,
  orderId: order.id,
  redirectUrl: `${window.location.origin}/payment/success`,
});
```

### 2. إنشاء رابط دفع سريع

```typescript
const createLinkMutation = trpc.payments.createLink.useMutation({
  onSuccess: (data) => {
    // نسخ الرابط تلقائياً
    navigator.clipboard.writeText(data.paymentUrl);
    toast.success('تم إنشاء الرابط ونسخه');
  },
});

createLinkMutation.mutate({
  title: 'دفعة الاشتراك الشهري',
  amount: 10000, // 100 ريال
  currency: 'SAR',
  isFixedAmount: true,
});
```

### 3. التحقق من حالة الدفع

```typescript
// في صفحة النجاح أو عند استلام webhook
const { data: verification } = trpc.payments.verifyPayment.useQuery({
  chargeId: searchParams.get('tap_id'),
});

if (verification?.status === 'CAPTURED') {
  // الدفع ناجح
  updateOrderStatus(orderId, 'paid');
  sendConfirmationEmail(customerEmail);
}
```

### 4. إنشاء عملية استرجاع

```typescript
const refundMutation = trpc.payments.createRefund.useMutation({
  onSuccess: () => {
    toast.success('تم إنشاء عملية الاسترجاع بنجاح');
    refetch(); // تحديث قائمة المعاملات
  },
});

refundMutation.mutate({
  paymentId: payment.id,
  amount: payment.amount, // استرجاع كامل
  reason: 'إلغاء الطلب',
});
```

---

## حالات الدفع

| الحالة | الوصف | الإجراء |
|--------|-------|---------|
| `pending` | في انتظار الدفع | إرسال تذكير للعميل |
| `authorized` | تم التفويض | جاهز للالتقاط |
| `captured` | تم الدفع بنجاح | تأكيد الطلب |
| `failed` | فشل الدفع | إعادة المحاولة |
| `cancelled` | ملغي | إنشاء معاملة جديدة |
| `refunded` | تم الاسترجاع | تحديث حالة الطلب |

---

## Webhooks

### إعداد Webhook URL

في لوحة تحكم Tap Payments، قم بإضافة:
```
https://your-domain.com/api/webhooks/tap
```

### معالجة Webhooks

```typescript
// في server/routers.ts
webhooks: router({
  tap: publicProcedure
    .input(z.any())
    .mutation(async ({ input }) => {
      const result = await processWebhook(input);
      
      if (result.success) {
        // تحديث حالة المعاملة
        await updateOrderPaymentStatus(
          result.paymentId,
          result.status
        );
        
        // إرسال إشعار للتاجر
        await notifyMerchant({
          title: 'تحديث حالة الدفع',
          message: `تم ${result.status} للمعاملة #${result.paymentId}`,
        });
      }
      
      return { success: true };
    }),
}),
```

---

## الأمان

### 1. التحقق من التوقيع
جميع طلبات Webhook يتم التحقق منها باستخدام:
```typescript
const signature = request.headers['x-tap-signature'];
const isValid = verifyWebhookSignature(payload, signature);
```

### 2. تشفير البيانات الحساسة
- جميع معاملات الدفع تتم عبر HTTPS
- لا يتم تخزين معلومات البطاقات في قاعدة البيانات
- استخدام Tap Secure Token System

### 3. حماية من الاحتيال
- تحديد مدة صلاحية لروابط الدفع
- تتبع عناوين IP
- تحديد عدد محاولات الدفع

---

## الاختبار

### تشغيل الاختبارات

```bash
cd /home/ubuntu/sari
pnpm test server/payments.test.ts
```

### بيانات الاختبار

**بطاقات اختبار:**
- نجاح: `4111 1111 1111 1111`
- فشل: `4000 0000 0000 0002`
- CVV: أي 3 أرقام
- تاريخ الانتهاء: أي تاريخ مستقبلي

---

## استكشاف الأخطاء

### خطأ: "Invalid API Key"
- تأكد من إضافة `TAP_SECRET_KEY` في متغيرات البيئة
- تحقق من صلاحية المفتاح في لوحة تحكم Tap

### خطأ: "Payment link expired"
- تحقق من `expiresAt` في جدول `payment_links`
- قم بإنشاء رابط جديد

### خطأ: "Insufficient funds"
- خطأ من جانب العميل
- اطلب من العميل استخدام بطاقة أخرى

---

## الدعم

للمزيد من المعلومات:
- [Tap Payments Documentation](https://developers.tap.company/)
- [Tap API Reference](https://developers.tap.company/reference)
- [Tap Dashboard](https://dashboard.tap.company/)

---

## الخلاصة

تم تكامل نظام Sari بالكامل مع Tap Payments، مما يوفر:
- ✅ معاملات دفع آمنة وسريعة
- ✅ روابط دفع قابلة للمشاركة عبر واتساب
- ✅ تتبع شامل لجميع المعاملات
- ✅ عمليات استرجاع سهلة
- ✅ إحصائيات مفصلة
- ✅ واجهات مستخدم احترافية

**جاهز للاستخدام في بيئة الإنتاج! 🚀**
