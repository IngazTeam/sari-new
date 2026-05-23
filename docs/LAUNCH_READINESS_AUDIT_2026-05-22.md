# تقرير جاهزية إطلاق Sari العام

تاريخ الفحص: 2026-05-22  
نطاق الحكم: إطلاق عام مدفوع ومفتوح للتجار، وليس Beta محدودة  
الدور: مراجعة معمارية + جودة كود + UX Senior

## الحكم التنفيذي

القرار: **No-Go للإطلاق العام حاليا**.

Sari مشروع واسع وطموح وفيه قاعدة منتج غنية جدا: WhatsApp commerce، مساعد AI، مدفوعات، اشتراكات، حملات، ولاء، تقارير، SEO، تكاملات Zid/Salla/WooCommerce/Byaan، ولوحات Merchant/Admin. من ناحية المنتج، الوعد قوي والسوق واضح. لكن من ناحية جاهزية إطلاق عام، النظام لم يصل بعد إلى مستوى الثقة المطلوب لتشغيل تجار حقيقيين على نطاق مفتوح.

التقييم العام:

| المجال | التقييم | الرأي |
| --- | --- | --- |
| القيمة المنتجية | قوي | الموديولات تغطي رحلة تاجر كاملة تقريبا. |
| المعمارية | متوسط إلى ضعيف | النظام يعمل كمنتج كبير، لكن الحدود بين الموديولات أصبحت رخوة جدا. |
| جودة TypeScript | غير جاهز | `tsc --noEmit` يعطي 1834 خطأ. |
| الاختبارات | غير كافية للإطلاق العام | 1027 اختبارا: 480 نجح، 152 فشل، 395 متوقف/متخطى. |
| البناء | مقبول جزئيا | Vite build ينجح، وserver bundle ينجح بتحذيرات مهمة. |
| الأمن | جيد كبداية، غير مكتمل للإطلاق العام | توجد middleware وحماية، لكن هناك مخاطر إعدادات وسجلات وملفات اختبار متعقبة. |
| UX | واعد لكنه مثقل | كثافة المزايا عالية وقد تربك التاجر غير التقني. |

تقديري لجاهزية الإطلاق العام: **55-60%**.  
تقديري لجاهزية Beta محكومة لتجار مختارين: **ممكنة بعد إغلاق blockers الحرجة وتشغيل بيئة اختبار حقيقية**.

## أدلة الفحص

تمت مراجعة البنية والملفات الأساسية وتشغيل فحوصات غير مغيرة للكود:

| الفحص | النتيجة |
| --- | --- |
| حجم الكود | 742 ملفا داخل `server`, `client`, `shared`, `drizzle`. |
| حجم الراوتر المركزي | `server/routers.ts` حوالي 9101 سطر. |
| حجم راوتر الواجهة | `client/src/App.tsx` حوالي 1163 سطر. |
| حجم schema | `drizzle/schema.ts` حوالي 2781 سطر. |
| routes في الواجهة | 192 route، منها 118 merchant و30 admin. |
| TypeScript | فشل: 1834 خطأ. أعلى الأنواع: TS2339=780، TS7006=452، TS2304=108، TS18047=106. |
| Vitest | فشل: 1027 اختبارا، 480 passed، 152 failed، 395 skipped/pending. |
| Vite client build | نجح في 22.84s، لكن chunk رئيسي كبير: `index` حوالي 2.64MB minified / 763.85KB gzip. |
| Server esbuild bundle | نجح، لكن حذر من duplicate keys: `dashboard` و`emailTemplates` في `server/routers.ts`. |
| Git hygiene | ملفات اختبار/جلسات متعقبة: `cookies.txt`, `login_body.json`, `scratch_login.json`, `test_no_storeid.json`, `test_zid_api.json`, `test_page.html`. |

ملاحظة مهمة: نجاح Vite/esbuild لا يعوض فشل TypeScript والاختبارات. البناء الحالي يثبت أن bundler قادر على إخراج artifacts، لكنه لا يثبت صحة العقود أو جاهزية التشغيل.

## Launch Blockers

1. **فشل TypeScript على مستوى النظام**

   أكبر blocker هو أن `tsc --noEmit` يفشل بـ 1834 خطأ. المشكلة ليست تجميلية؛ أخطاء مثل `TS2339` في عميل tRPC تعني أن TypeScript فقد ثقته في شكل `AppRouter`، وهذا يضعف أهم ميزة في اختيار tRPC أصلا: عقد type-safe بين الواجهة والخادم.

   أمثلة بارزة:
   - `client/src/_core/hooks/useAuth.ts`: `trpc.useUtils` و`trpc.auth` غير مرئيين للأنواع.
   - كثير من صفحات الواجهة لا ترى routers مثل `aiSettings`, `notifications`, `products`, `merchantSubscription`.
   - `server/routers.ts` فيه مراجع ناقصة ومكررة، منها `notificationPreferences`, `emailTemplates`, وduplicate router keys.

2. **فشل الاختبارات وعدم فصل اختبارات الوحدة عن اختبارات التكامل**

   نتيجة Vitest الحالية لا تصلح كإشارة جاهزية إطلاق عام:
   - 152 اختبارا فاشلا.
   - 395 اختبارا skipped/pending.
   - فشلات كثيرة بسبب `Database not initialized`, مفاتيح Tap غير مضبوطة، أو بيئة تكامل غير متاحة.

   هذا يعني أن المشروع لا يملك حاليا pipeline موثوقا يقول: "هذه النسخة صالحة للإنتاج". حتى لو كان جزء من الفشل بيئيا، فهذا نفسه blocker لأن اختبارات CI يجب أن تعرف كيف تعمل بدون أسرار إنتاجية وبقاعدة اختبار معزولة أو mocks واضحة.

3. **تضارب مفاتيح داخل `appRouter`**

   البناء يحذر من مفاتيح مكررة:
   - `dashboard` موجودة كـ inline router ثم يعاد تعريفها كـ `dashboardRouter`.
   - `emailTemplates` موجودة كـ inline router ثم يعاد تعريفها كـ `emailTemplatesRouter`.

   هذا خطر فعلي، لأن آخر تعريف في object literal يطغى على السابق. النتيجة قد تكون endpoints موجودة في الكود لكنها غير مكشوفة فعليا، أو واجهة تستخدم عقدا مختلفا عن المتوقع.

4. **توسع الراوتر والمداخل إلى حد يصعب ضبطه**

   `server/routers.ts` بحجم 9k+ سطر، و`App.tsx` يحتوي 192 route. هذا ليس عيبا وحده، لكنه مع أخطاء TypeScript والduplicate keys يشير إلى أن النمو صار أسرع من قدرة البنية على ضبط الحدود. أي تغيير صغير في Router أو Schema قد يكسر عشرات الصفحات.

5. **التكاملات الحرجة ليست enforced كمتطلبات إطلاق**

   `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY` مطلوبة، لكن Green API وTap وSMTP وVAPID اختيارية في `validateEnv.ts`. هذا مناسب للتطوير، لكنه غير مناسب لإطلاق عام مدفوع إذا كانت WhatsApp والمدفوعات والإشعارات جزءا من وعد المنتج الأساسي.

## High Priority

1. **تنظيف الحدود المعمارية**

   يجب تفكيك `server/routers.ts` إلى routers نهائية فقط وعدم الجمع بين inline routers وmodular routers لنفس المجال. اجعل `appRouter` registry صغيرا وواضحا، وكل domain يملك ملفه ومسؤولياته.

   الأولوية:
   - إزالة duplicate keys.
   - تثبيت أسماء routers العامة.
   - منع إعادة تعريف المجالات نفسها في أكثر من مكان.
   - تشغيل `tsc` بعد كل خطوة.

2. **إصلاح عقد tRPC قبل أي UX أو Feature جديد**

   طالما `createTRPCReact<AppRouter>()` ينهار نوعيا، فالواجهة تعمل بلا شبكة أمان حقيقية. يجب حل السبب الجذري في `AppRouter` أولا، ثم إصلاح أخطاء الواجهة الناتجة.

3. **إنشاء Test Matrix واقعي**

   قسّم الاختبارات إلى:
   - Unit: تعمل بدون DB وبدون مفاتيح خارجية.
   - Integration: تحتاج DB test مع migrations/seed.
   - External smoke: Green API/Tap/OpenAI/Webhooks باستخدام sandbox أو mocks.

   معيار الإطلاق العام المقترح:
   - `tsc --noEmit` = 0 أخطاء.
   - Unit tests = 100% pass.
   - Integration smoke للمسارات الحرجة = pass.
   - لا توجد skipped tests غير مبررة في CI.

4. **تنظيف Git والملفات التجريبية**

   الملفات المتعقبة مثل `cookies.txt`, `login_body.json`, `scratch_login.json`, `test_page.html`, وملفات استجابات Zid الكبيرة يجب مراجعتها. حتى لو لم تحتو أسرارا الآن، وجود هذا النمط في repo إنتاجي يرفع احتمال تسريب بيانات جلسات أو بيانات عملاء لاحقا.

5. **تشديد بيئة الإنتاج**

   للإطلاق العام، يجب أن يفشل التشغيل إذا غابت تكاملات تعد جزءا من الباقة المباعة. مثال: إذا WhatsApp هو الميزة الأساسية، فلا يكفي أن تكون Green API optional في production.

## تقييم الأمن

نقاط قوة:

- يوجد `Helmet` وCSP وCORS في `server/_core/security.ts`.
- يوجد rate limiting منفصل للمصادقة والـ API والـ webhooks في `server/_core/rateLimiter.ts`.
- يوجد `validateEnv` وhealth/ready endpoints.
- المصادقة تستخدم JWT secret بطول أدنى وتدعم cookie وBearer.
- توجد إشارات واضحة إلى إصلاحات pentest داخل الكود، وهذا إيجابي.

مخاطر:

- `corsConfig` يسمح بطلبات بلا origin في production. هذا قد يكون مقبولا لبعض server-to-server calls، لكنه يحتاج تضييقا حسب المسار لا كسياسة عامة.
- `auth-routes.ts` يسجل email المستخدم في logs عند محاولة الدخول ونجاحها. هذا مفيد للتشخيص لكنه يحتاج سياسة logging إنتاجية لا تكشف PII.
- ملفات اختبار وجلسات متعقبة في Git.
- لا يوجد دليل كاف من الفحص الحالي على اختبار tenant isolation لكل المسارات الحساسة، رغم وجود بعض اختبارات pentest الجيدة.

## تقييم UX

نقاط قوة:

- المنتج يغطي رحلة تاجر واسعة: setup, WhatsApp, products, conversations, campaigns, payments, analytics, loyalty, integrations.
- يوجد DashboardLayout موحد، lazy loading للصفحات، skeletons، i18n، theme، currency.
- تقسيم القائمة إلى مجموعات merchant/admin خطوة صحيحة لأن النظام كبير.

مخاطر UX:

- كثافة الواجهة عالية جدا: 118 route للتاجر وحده. التاجر الجديد قد لا يعرف أين يبدأ أو ما الذي يجب فعله أولا.
- القائمة الجانبية تجمع عمليات يومية، إعدادات عميقة، AI، تكاملات، تقارير، SEO/تحليلات في سطح واحد. هذا مناسب لفريق داخلي خبير، لكنه ثقيل على merchant SMB.
- `DashboardLayout` يعرض شاشة تسجيل دخول بدل redirect مباشر عند غياب المستخدم. هذا مقبول، لكنه يحتاج مراجعة ضمن flow موحد للجلسات المنتهية.
- لا يوجد من نتائج الفحص ما يثبت E2E لمسارات UX الحرجة: signup -> setup wizard -> connect WhatsApp -> import products -> receive message -> AI reply -> order/payment.
- نجاح build مع chunk رئيسي كبير يعني أن الأداء الأولي قد يكون مقبولا على desktop، لكنه يحتاج Lighthouse/Web Vitals على أجهزة متوسطة وشبكات أبطأ.

## المسارات الحرجة قبل الإطلاق

يجب اختبار هذه المسارات end-to-end على staging:

1. تسجيل تاجر جديد، تحقق البريد/الجوال، إنشاء merchant.
2. إكمال Setup Wizard بالكامل مع business template.
3. ربط WhatsApp instance، قراءة QR، استقبال webhook، إرسال أول رد.
4. رفع/مزامنة المنتجات من CSV وZid/Salla/WooCommerce.
5. محادثة عميل فعلية: سؤال منتج، اقتراح AI، إنشاء طلب، إرسال رابط دفع.
6. دفع Tap sandbox/production small amount، webhook، تحديث الاشتراك أو الطلب.
7. انتهاء/تجاوز حدود الاشتراك: منع feature بشكل مفهوم وغير مدمر.
8. لوحة Admin: إدارة تاجر، خطة، فاتورة، طلب WhatsApp، مراقبة أخطاء.
9. فشل التكاملات: Green API down، OpenAI timeout، Tap declined، webhook مكرر.
10. تعدد التجار: التأكد من عدم تسرب محادثات/منتجات/طلبات بين merchants.

## خطة إصلاح مقترحة

### الأسبوع 1: إغلاق blockers

- إصلاح duplicate router keys.
- إعادة تثبيت شكل `AppRouter` حتى يعود `trpc.*` typed في الواجهة.
- خفض أخطاء `tsc` إلى صفر أو إلى قائمة محدودة موثقة ومقبولة مؤقتا.
- فصل الاختبارات البيئية عن unit tests وتشغيل unit suite موثوق.
- تنظيف الملفات المتعقبة غير الإنتاجية.

### الأسبوع 2: جاهزية تشغيل

- إعداد staging مطابق للإنتاج مع DB test ومفاتيح sandbox.
- تشغيل E2E smoke للمسارات العشرة الحرجة.
- ضبط env validation حسب `NODE_ENV=production`.
- إعداد logging policy: request id، إخفاء PII/secrets، وربط logs بالتنبيهات.
- مراجعة CORS/webhooks لكل route وليس كسياسة عامة فقط.

### الأسبوع 3: UX وإطلاق محكوم

- تبسيط first-run experience للتاجر: checklist واضحة داخل المنتج، لا مجرد صفحات كثيرة.
- تحسين empty/error states للتكاملات.
- قياس الأداء على landing + dashboard + conversations + setup wizard.
- إطلاق Beta مغلقة لتجار حقيقيين بعد نجاح CI/E2E، ثم قرار إطلاق عام بناء على telemetry.

## الخلاصة

Sari ليس مشروعا ضعيفا؛ بالعكس، هو مشروع غني وفيه عمل منتجي كبير. المشكلة ليست غياب المزايا، بل أن المزايا سبقت صلابة النظام. للإطلاق العام، المطلوب الآن ليس إضافة Features جديدة، بل تثبيت الأساس: TypeScript، حدود routers، اختبارات قابلة للتكرار، بيئة staging، وUX onboarding أبسط.

رأيي النهائي: **لا تطلقه إطلاقا عاما الآن**.  
الخطوة الصحيحة: **hardening sprint لمدة 2-3 أسابيع**، ثم Beta محكومة، ثم إطلاق عام فقط بعد أن تصبح الفحوصات الأساسية خضراء ومثبتة في CI.
