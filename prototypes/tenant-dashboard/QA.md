# التحقق — 27 سبتمبر 2026

تحديث 28 سبتمبر: نجح 10 اختبارات جديدة لعقل ساري و8 اختبارات رجوع للموك أب. يشمل ذلك مراجعة الملفات، علاج الفجوات على مراحل، النسبة الموزونة وكفاية العينة، ومنع تفسير إضافة ملف على أنها تحسن في البيع. تقرير التوسعة وأدلة المتصفح في `docs/audits/tenant-brain-2026-09-28/`. نتائج الاختبارات الأوسع أدناه تخص الدفعة السابقة.

## النتيجة

- 106 اختبارات ناجحة في 13 ملفًا: صفحات الموك أب، استعادة الأخطاء، تفاصيل الخدمة المفقودة، المسارات والتحويلات، الإتاحة، مفاتيح الترجمة الدلالية، التسجيل، الإعداد، الاشتراك وملف العميل.
- 31 فحصًا أمنيًا حيًا ناجحًا على HTTP وMySQL محليين: عزل التيننت، منع IDOR، صلاحيات المشاهد، حدود المدخلات والبحث الحرفي، الحقول المملوكة للخادم، جدولة الحملات، مخططات الروابط الآمنة وإبطال الجلسة. نُظفت سجلات الفحص التي أنشأها السكربت.
- TypeScript: نجح `tsc --noEmit --incremental false`.
- البناء: نجح بناء العميل والخادم والعامل وفحص حجم الحزمة باستخدام Node 22.23.2؛ حزمة المدخل 102315 بايت gzip.
- الترجمة: 7601 استدعاء و248 مفتاحًا ديناميكيًا؛ لا مفاتيح مفقودة أو ديناميكية غير محلولة أو أخطاء interpolation.
- `git diff --check`: لا أخطاء مسافات.

## المتصفح

- Chrome عبر أداة المتصفح: 125 وجهة غير تحويلية في الموك أب، عند 1440×1000 و390×844. انتُظر مؤشر المسار في DOM قبل القياس؛ لا عنوان صفحة مفقود أو تجاوز أفقي في القياسات المسجلة.
- 118 وجهة فعلية و8 تحويلات في التطبيق عند عرض الجوال. تفاصيل ذات معرفات غير موجودة وحالات عدم ربط المزودين. أُعيدت زيارة صفحات التحميل المتأخر والتفاصيل وSheets بعد التعديلات.
- 404 الفعلية فُحصت على الويب والجوال؛ بقي إطار التاجر وظهرت روابط الاستعادة. جُرّب /merchant/ وتحقق التحويل إلى الرئيسية.
- جُربت إضافة منتج والبحث عنه في الموك أب عبر المتصفح. تغطي اختبارات DOM أيضًا الحفظ وإعادة الفتح وحماية النص من HTML، التصفية، الحالات، الإضافة، الاستيراد بعد المراجعة، تقدم الحملة، حفظ checkbox غير المحدد، واختيار الباقة.
- لقطات وأدلة منظمة في `docs/audits/tenant-pages-2026-09-27/`.

## البيئة والحدود

التطبيق المحلي على 3018، قاعدة جديدة `sari_pages_test` على 3317، الموك أب على 4329. لا اتصالات خارجية ولا معاملات دفع أو رسائل حقيقية. زيارة صفحة وتحقق العرض لا يساوي اختبار جميع فروع خصائصها. اختبارات الأمان محددة النطاق وليست شهادة اختراق شاملة.

لم يُنشر التحديث إلى sary.live. بقيت ملاحظات بيانات وتسميات فرعية موثقة في REPORT.md؛ إعادة تنظيمها التفصيلية موجودة في الموك أب وليست كلها منفذة في التطبيق.

## إعادة التشغيل

```bash
node scripts/testing/run-isolated.mjs server/merchant-page-prototype.test.ts server/merchant-workspace-navigation.test.ts server/merchant-recovery-ui.test.ts server/merchant-detail-recovery.test.ts server/customer-profile-canonical-pentest.test.ts server/mobile-navigation-soft404-pentest.test.ts server/merchant-ux-route-recovery-pentest.test.ts server/merchant-core-accessibility-pentest.test.ts server/merchant-semantic-i18n-pentest.test.ts server/merchant-setup-ui.test.ts server/merchant-setup-navigation.test.ts server/signup-ux-accessibility-pentest.test.ts server/subscription-state-pentest.test.ts
node scripts/testing/audit-tenant-pages.mjs
node prototypes/tenant-dashboard/build-pages.mjs
node scripts/testing/report-tenant-pages.mjs
node prototypes/tenant-dashboard/serve.mjs
```

المراجعة السابقة: تقرير سبتمبر 23 محفوظ في `site/report.html` ووثائق فحص مساحة التاجر بتاريخ سبتمبر 24. التقرير الحالي هو `site/report-latest.html`.
