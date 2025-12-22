# إصلاح خطأ قاعدة البيانات في صفحة اختبار ساري

## المشكلة
كان هناك خطأ 500 في API `testSari.createConversation` عند محاولة فتح صفحة `/merchant/test-sari`:

```
Failed query: select ... from merchants where merchants.userId = ?
Unknown column 'setupcompleted' in 'field list'
```

## السبب
- MySQL يحول أسماء الأعمدة إلى lowercase بشكل افتراضي في بعض الإعدادات
- Schema في Drizzle كان يستخدم camelCase (مثل `setupCompleted`)
- قاعدة البيانات كانت تبحث عن `setupcompleted` (كل الحروف صغيرة)
- الأعمدة التالية كانت مفقودة:
  - `setupCompleted`
  - `setupCompletedAt`
  - `workingHoursType`
  - `workingHours`

## الحل
تم إضافة الأعمدة المفقودة إلى جدول `merchants` باستخدام SQL:

```sql
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS setupCompleted TINYINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS setupCompletedAt TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS workingHoursType ENUM('24_7','weekdays','custom') DEFAULT 'weekdays',
ADD COLUMN IF NOT EXISTS workingHours TEXT;
```

## التحقق
تم اختبار الإصلاح باستخدام سكريبت اختبار:
```bash
pnpm exec tsx test-db-connection.mjs
```

النتيجة: ✅ نجح الاستعلام وتم جلب بيانات merchant بنجاح

## الملفات المعدلة
1. `server/routers.ts` - إضافة error handling أفضل في `createConversation` API
2. `client/src/pages/merchant/TestSari.tsx` - إضافة eslint-disable comment
3. `drizzle/schema.ts` - لم يتم تعديله (تم الاحتفاظ بـ camelCase)

## ملاحظات
- لم يتم استخدام `pnpm db:push` لأنه كان يحاول إنشاء جميع الجداول من جديد
- تم استخدام ALTER TABLE مباشرة لإضافة الأعمدة المفقودة فقط
- Schema في Drizzle يحتفظ بـ camelCase للتوافق مع باقي الكود
