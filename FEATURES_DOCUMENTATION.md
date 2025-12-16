# توثيق الميزات الجديدة - العروض المحدودة الوقت والـ A/B Testing

## نظرة عامة

تم إضافة نظام شامل لتحسين معدل التحويل على صفحة تجربة ساري من خلال:
1. **نظام العروض المحدودة الوقت** - عروض خاصة مع عداد تنازلي
2. **نظام A/B Testing** - اختبار متغيرات مختلفة للنافذة المنبثقة

---

## 1. نظام العروض المحدودة الوقت

### الجداول المستخدمة

```sql
CREATE TABLE limited_time_offers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,           -- عنوان العرض (مثل "خصم 20%")
  titleAr VARCHAR(255) NOT NULL,         -- عنوان العرض بالعربية
  description TEXT NOT NULL,             -- وصف العرض
  descriptionAr TEXT NOT NULL,           -- وصف العرض بالعربية
  discountPercentage INT,                -- نسبة الخصم (مثل 20)
  discountAmount INT,                    -- مبلغ الخصم (بالريال)
  durationMinutes INT NOT NULL,          -- مدة العرض بالدقائق
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### الدوال المتاحة

#### الحصول على العروض النشطة
```typescript
const offers = await db.getActiveLimitedTimeOffers();
```

#### إنشاء عرض جديد
```typescript
const offer = await db.createLimitedTimeOffer({
  title: "20% Discount",
  titleAr: "خصم 20%",
  description: "Get 20% off on your first subscription",
  descriptionAr: "احصل على خصم 20% على أول اشتراك",
  discountPercentage: 20,
  durationMinutes: 60,
  isActive: true,
});
```

#### تحديث عرض
```typescript
const updated = await db.updateLimitedTimeOffer(offerId, {
  isActive: false,
});
```

### API Endpoints

#### الحصول على العروض النشطة
```
GET /api/trpc/offers.getActive
```

#### إنشاء عرض جديد (Admin فقط)
```
POST /api/trpc/offers.create
Body: {
  title: string,
  titleAr: string,
  description: string,
  descriptionAr: string,
  discountPercentage?: number,
  discountAmount?: number,
  durationMinutes: number
}
```

#### تحديث عرض (Admin فقط)
```
POST /api/trpc/offers.update
Body: {
  id: number,
  title?: string,
  titleAr?: string,
  description?: string,
  descriptionAr?: string,
  discountPercentage?: number,
  discountAmount?: number,
  durationMinutes?: number,
  isActive?: boolean
}
```

---

## 2. نظام A/B Testing للنافذة المنبثقة

### الجداول المستخدمة

#### جدول المتغيرات
```sql
CREATE TABLE signup_prompt_variants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  variantId VARCHAR(50) UNIQUE NOT NULL,    -- A, B, C, etc.
  title VARCHAR(255) NOT NULL,              -- عنوان النافذة
  description TEXT NOT NULL,                -- وصف النافذة
  ctaText VARCHAR(100) NOT NULL,            -- نص زر الـ CTA
  offerText TEXT,                           -- نص العرض
  showOffer BOOLEAN DEFAULT FALSE,          -- هل نعرض العرض؟
  messageThreshold INT NOT NULL,            -- عدد الرسائل قبل الظهور
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### جدول نتائج الاختبار
```sql
CREATE TABLE signup_prompt_test_results (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sessionId VARCHAR(255) NOT NULL,         -- معرف الجلسة
  variantId VARCHAR(50) NOT NULL,          -- معرف المتغير
  shown BOOLEAN DEFAULT FALSE,             -- هل تم عرض النافذة؟
  clicked BOOLEAN DEFAULT FALSE,           -- هل نقر المستخدم على الـ CTA؟
  converted BOOLEAN DEFAULT FALSE,         -- هل تم التحويل إلى تسجيل؟
  dismissedAt TIMESTAMP,                   -- متى تم إغلاق النافذة؟
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### الدوال المتاحة

#### الحصول على المتغيرات النشطة
```typescript
const variants = await db.getActiveSignupPromptVariants();
```

#### الحصول على متغير عشوائي
```typescript
const randomVariant = await db.getRandomSignupPromptVariant();
```

#### تسجيل نتيجة الاختبار
```typescript
const result = await db.recordSignupPromptTestResult({
  sessionId: "session_123",
  variantId: "A",
  shown: true,
  clicked: false,
  converted: false,
});
```

#### تحديث نتيجة الاختبار
```typescript
const updated = await db.updateSignupPromptTestResult(resultId, {
  clicked: true,
  converted: true,
});
```

#### الحصول على إحصائيات الاختبار
```typescript
const stats = await db.getSignupPromptTestStats(30); // آخر 30 يوم
// Returns: [
//   {
//     variant: "A",
//     shown: 100,
//     clicked: 25,
//     converted: 5,
//     clickRate: 25,
//     conversionRate: 5
//   },
//   ...
// ]
```

### API Endpoints

#### الحصول على المتغيرات النشطة
```
GET /api/trpc/signupPrompt.getVariants
```

#### الحصول على متغير عشوائي
```
GET /api/trpc/signupPrompt.getRandomVariant
```

#### تسجيل نتيجة الاختبار
```
POST /api/trpc/signupPrompt.recordResult
Body: {
  sessionId: string,
  variantId: string,
  shown?: boolean,
  clicked?: boolean,
  converted?: boolean
}
```

#### تحديث نتيجة الاختبار
```
POST /api/trpc/signupPrompt.updateResult
Body: {
  id: number,
  shown?: boolean,
  clicked?: boolean,
  converted?: boolean,
  dismissedAt?: Date
}
```

#### الحصول على إحصائيات الاختبار (Admin فقط)
```
GET /api/trpc/signupPrompt.getStats?days=30
```

#### إنشاء متغير جديد (Admin فقط)
```
POST /api/trpc/signupPrompt.createVariant
Body: {
  variantId: string,
  title: string,
  description: string,
  ctaText: string,
  offerText?: string,
  showOffer?: boolean,
  messageThreshold: number
}
```

#### تحديث متغير (Admin فقط)
```
POST /api/trpc/signupPrompt.updateVariant
Body: {
  id: number,
  title?: string,
  description?: string,
  ctaText?: string,
  offerText?: string,
  showOffer?: boolean,
  messageThreshold?: number,
  isActive?: boolean
}
```

---

## 3. المكونات الأمامية

### SignupPromptDialogEnhanced

مكون النافذة المنبثقة المحسّنة مع دعم العروض والـ A/B Testing.

#### الخصائص
```typescript
interface SignupPromptDialogEnhancedProps {
  isOpen: boolean;              // هل النافذة مفتوحة؟
  onClose: () => void;          // دالة الإغلاق
  sessionId: string;            // معرف الجلسة
  messageCount: number;         // عدد الرسائل
}
```

#### الاستخدام
```typescript
import { SignupPromptDialogEnhanced } from '@/components/SignupPromptDialogEnhanced';

export default function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [messageCount, setMessageCount] = useState(0);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Show Signup Prompt
      </button>
      
      <SignupPromptDialogEnhanced
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        sessionId={sessionId}
        messageCount={messageCount}
      />
    </>
  );
}
```

### AdminABTestDashboard

لوحة تحكم Admin لمراقبة نتائج الاختبار وإنشاء متغيرات جديدة.

#### الميزات
- عرض الإحصائيات الإجمالية (عدد العروض، النقرات، معدل التحويل)
- مقارنة أداء المتغيرات المختلفة
- إنشاء متغيرات جديدة
- تصفية البيانات حسب عدد الأيام

#### الوصول
```
/admin/ab-test-dashboard
```

### TrySariEnhanced

صفحة تجربة ساري المحسّنة مع دعم العروض والـ A/B Testing.

#### الميزات
- محادثة تفاعلية مع ساري
- عرض النافذة المنبثقة تلقائياً بعد عدد معين من الرسائل
- تتبع الجلسة والتحويلات
- عرض مميزات ساري

#### الوصول
```
/try-sari-enhanced
```

---

## 4. سير العمل

### عملية A/B Testing

1. **إنشاء المتغيرات**: يقوم Admin بإنشاء متغيرات مختلفة للنافذة المنبثقة
2. **عرض النافذة**: عند وصول المستخدم لعدد معين من الرسائل، يتم عرض متغير عشوائي
3. **تسجيل النتائج**: يتم تسجيل ما إذا تم عرض النافذة، النقر عليها، والتحويل
4. **تحليل النتائج**: يمكن للـ Admin مراقبة أداء كل متغير
5. **تحسين**: يتم اختيار المتغير الأفضل أداءً

### مثال على التطبيق

```typescript
// 1. الحصول على متغير عشوائي
const variant = await db.getRandomSignupPromptVariant();

// 2. عرض النافذة
showDialog(variant);

// 3. تسجيل أن النافذة تم عرضها
const result = await db.recordSignupPromptTestResult({
  sessionId: "session_123",
  variantId: variant.variantId,
  shown: true,
});

// 4. عند النقر على الزر
await db.updateSignupPromptTestResult(result.id, {
  clicked: true,
  converted: true,
});

// 5. الحصول على الإحصائيات
const stats = await db.getSignupPromptTestStats(30);
console.log(stats);
// [
//   { variant: "A", shown: 100, clicked: 25, converted: 5, clickRate: 25, conversionRate: 5 },
//   { variant: "B", shown: 100, clicked: 30, converted: 8, clickRate: 30, conversionRate: 8 },
// ]
```

---

## 5. أمثلة الاستخدام

### إضافة عرض جديد عبر API

```bash
curl -X POST http://localhost:3000/api/trpc/offers.create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Limited Time: 30% Off",
    "titleAr": "عرض محدود: خصم 30%",
    "description": "Subscribe now and get 30% discount for 3 months",
    "descriptionAr": "اشترك الآن واحصل على خصم 30% لمدة 3 أشهر",
    "discountPercentage": 30,
    "durationMinutes": 120
  }'
```

### إنشاء متغير جديد عبر API

```bash
curl -X POST http://localhost:3000/api/trpc/signupPrompt.createVariant \
  -H "Content-Type: application/json" \
  -d '{
    "variantId": "C",
    "title": "Limited Time Offer!",
    "description": "Get 30% off when you subscribe today",
    "ctaText": "Claim Your Discount",
    "offerText": "Use code SAVE30 at checkout",
    "showOffer": true,
    "messageThreshold": 3
  }'
```

### الحصول على إحصائيات الاختبار

```bash
curl http://localhost:3000/api/trpc/signupPrompt.getStats?days=30
```

---

## 6. أفضل الممارسات

### عند إنشاء متغيرات جديدة
1. **اختبر متغيراً واحداً في المرة**: غيّر عنصراً واحداً فقط (العنوان أو الوصف أو الـ CTA)
2. **استخدم عينة كبيرة**: تأكد من حصول كل متغير على عدد كافٍ من الزيارات
3. **اترك الاختبار يعمل**: دع الاختبار يعمل لمدة كافية (أسبوع على الأقل)

### عند تحليل النتائج
1. **ركز على معدل التحويل**: هذا هو المقياس الأهم
2. **تحقق من الدلالة الإحصائية**: تأكد من أن الفرق كبير بما يكفي
3. **لا تتسرع**: انتظر حتى يكون لديك بيانات كافية

### عند تطبيق النتائج
1. **اختر المتغير الأفضل**: استخدم المتغير الذي حقق أفضل نتائج
2. **قم بتحديث المتغيرات**: عطّل المتغيرات السيئة الأداء
3. **ابدأ اختبار جديد**: ابدأ اختبار متغيرات جديدة

---

## 7. استكشاف الأخطاء

### المشكلة: النافذة لا تظهر
**الحل**: تحقق من أن:
- المتغير نشط (`isActive = true`)
- عدد الرسائل وصل لـ `messageThreshold`
- الجلسة تم تسجيلها بشكل صحيح

### المشكلة: الإحصائيات لا تُحدّث
**الحل**: تحقق من أن:
- يتم استدعاء `recordSignupPromptTestResult` عند عرض النافذة
- يتم استدعاء `updateSignupPromptTestResult` عند النقر/التحويل
- معرف الجلسة صحيح

### المشكلة: العرض لا يظهر في النافذة
**الحل**: تحقق من أن:
- العرض نشط (`isActive = true`)
- المتغير له `showOffer = true`
- العرض موجود في قاعدة البيانات

---

## 8. الخطوات التالية

1. **تحسين الواجهة**: إضافة رسوم بيانية أكثر تفصيلاً
2. **الإشعارات**: إرسال إشعارات عند تحقيق أهداف معينة
3. **التكامل مع Google Analytics**: تتبع الأحداث الخارجية
4. **الاختبارات المتعددة**: دعم اختبارات متزامنة لعناصر مختلفة
5. **التنبؤات**: استخدام ML للتنبؤ بأفضل متغير

---

## الملفات المضافة

- `server/routers-offers.ts` - APIs للعروض والـ A/B Testing
- `server/db.ts` - دوال قاعدة البيانات (تم التحديث)
- `client/src/components/SignupPromptDialogEnhanced.tsx` - مكون النافذة المحسّنة
- `client/src/pages/AdminABTestDashboard.tsx` - لوحة تحكم Admin
- `client/src/pages/TrySariEnhanced.tsx` - صفحة التجربة المحسّنة

---

## المساعدة والدعم

للأسئلة أو المشاكل، يرجى التواصل مع فريق التطوير.
