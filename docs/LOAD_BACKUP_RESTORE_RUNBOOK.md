# Runbook الحمل والنسخ الاحتياطي والاستعادة

**المالك:** DevOps، مع شاهد من QA أو Tech Lead  
**النطاق:** staging معزولة قابلة لإعادة الضبط؛ يمنع الحمل على الإنتاج  
**الأهداف:** RPO لا يتجاوز 15 دقيقة، RTO لا يتجاوز 60 دقيقة  
**الحالة الحالية:** الأدوات والحواجز المحلية جاهزة؛ لا يوجد دليل تنفيذ staging بعد

## 1. قواعد أمان غير قابلة للتجاوز

- أداة الحمل تقبل `GET` فقط على `/health` أو `/ready`، بحد أقصى 25 اتصالًا و50 طلبًا/ثانية و10 دقائق.
- `sary.live` وكل نطاق فرعي تحته مرفوضان دائمًا، حتى لو ضُبط خطأً كـstaging.
- أي مضيف غير محلي يجب أن يستخدم HTTPS، ويحتاج `--allow-staging` ومطابقة حرفية مع `LOAD_TEST_STAGING_ORIGIN`.
- يمنع تضمين credentials أو query أو fragment في هدف الحمل.
- الاستعادة تكون إلى قاعدة جديدة يحمل اسمها token مستقلًا من `restore` أو `drill` أو `test`، ولا تطابق المصدر.
- أداة التحقق تقرأ فقط، ولا تنشئ قاعدة أو جدولًا ولا تحذف أي بيانات.
- لا تحفظ كلمات المرور في الأمر أو التقرير أو Git. استخدم secret manager وملف option محميًا عند تشغيل أدوات MySQL الأصلية.

## 2. دليل dry-run قبل أي شبكة

```powershell
pnpm ops:load:dry-run -- --origin=http://127.0.0.1:3000 --path=/health --duration-seconds=30 --concurrency=5 --rps=10
```

يجب أن يظهر `dryRun: true` و`GET` والحدود المطلوبة. تحقق أيضًا أن تجربة `https://sary.live` تفشل بالرمز 2 قبل السماح بتشغيل staging.

## 3. اختبار الحمل على staging

1. أنشئ نسخة staging معزولة من نفس إصدار التطبيق والمخطط، ببيانات مصطنعة أو منزوعة الهوية.
2. فعّل مراقبة CPU والذاكرة وevent loop وMySQL connections/locks/slow queries و5xx قبل الاختبار.
3. شغّل warm-up قصيرًا على `/health`، ثم baseline وpeak على `/ready`. لا تختبر endpoints كتابية بهذه الأداة.
4. مثال PowerShell بعد ضبط السر البيئي خارج history:

```powershell
$env:LOAD_TEST_STAGING_ORIGIN='https://staging.example.internal'
pnpm ops:load -- --origin=https://staging.example.internal --path=/ready --allow-staging --duration-seconds=300 --concurrency=20 --rps=40 --p95-ms=750 --max-error-rate=0.001
```

5. احفظ JSON الناتج ولقطات المقاييس وتوقيت البداية والنهاية ورقم الإصدار في مخزن أدلة محدود الصلاحية، لا في Git.

معيار القبول: اكتمال العدد المخطط، 5xx تساوي صفرًا، إجمالي الخطأ لا يتجاوز الحد المحدد، p95 تحت 750ms، ولا pool exhaustion أو lock storm أو restart. فشل أي شرط يعني Fail وتحليل سبب قبل إعادة الاختبار. نجاح `/ready` لا يثبت أداء رحلات البيع الكتابية؛ يلزم سيناريو k6/Playwright منفصل ببيانات قابلة للمسح قبل إطلاق عام.

## 4. التقاط manifest قبل النسخة

يقرأ الأمر بنية وأعداد تسعة جداول حرجة دون قراءة صفوف أو PII. يجب التقاطه ضمن نفس نقطة الاتساق التي ستُنسخ؛ استخدم snapshot/PITR المدار من المزود متى توفر. إن استُخدم `mysqldump` فليكن عبر option file محمي ومع `--single-transaction --routines --triggers --events --hex-blob`، ثم تشفير الناتج والتحقق من SHA-256 ونقله إلى حساب/منطقة منفصلة. لا تضع password في arguments ولا تعتمد نسخة محفوظة على الخادم نفسه.

```powershell
$env:SOURCE_DATABASE_URL='<from-secret-manager>'
pnpm ops:restore:snapshot -- --manifest=artifacts/ops/restore-drill-YYYYMMDD.json
```

الكتابة تستخدم `wx`: لن تستبدل دليلًا سابقًا بصمت. ملف manifest محلي مستبعد من Git لأنه يحتوي هوية داخلية وأعدادًا تشغيلية.

## 5. تمرين الاستعادة

1. سجل وقت الحادث الافتراضي ووقت أحدث recovery point متاح؛ الفرق هو RPO المقاس ويجب ألا يتجاوز 15 دقيقة.
2. ابدأ ساعة RTO، وأنشئ قاعدة فارغة باسم مثل `sari_restore_drill_YYYYMMDD` بصلاحيات معزولة ومن دون اتصال قنوات أو cron أو بريد.
3. استعد النسخة المشفرة إلى القاعدة الجديدة، طبّق migrations اللازمة، ولا تغيّر DNS أو متغيرات الإنتاج.
4. نفذ المقارنة مع إقرار صريح:

```powershell
$env:SOURCE_DATABASE_URL='<from-secret-manager>'
$env:RESTORE_DATABASE_URL='<isolated-restore-url-from-secret-manager>'
$env:RESTORE_DRILL_ACK='isolated-test-database'
pnpm ops:restore:verify -- --manifest=artifacts/ops/restore-drill-YYYYMMDD.json
```

5. يجب أن تتطابق schema hashes وأعداد الجداول الحرجة. بعدها شغّل `/ready` وsmoke read-only، ثم طابق يدويًا عينة من الطلبات والمحادثات بمراجع غير حساسة.
6. أوقف ساعة RTO عندما تصبح النسخة قابلة للقراءة ويمر readiness والمخطط؛ يجب ألا يتجاوز 60 دقيقة.
7. وثق backup ID وrecovery point وRPO/RTO وcommit والمخطط ونتيجة manifest والمراقب والموافق. حذف قاعدة التمرين إجراء منفصل يحتاج مراجعة هدف صريحة وفق سياسة البيئة.

## 6. الاحتفاظ والتنبيه

- سياسة الاحتفاظ يحددها مالك البيانات والقانون، وتطبق lifecycle rules في مخزن النسخ لا أمر `find -delete` عام.
- اختبر checksum يوميًا، ونبه عند تأخر recovery point عن 15 دقيقة أو فشل job أو فشل التشفير/النسخ خارج المنطقة.
- نفذ restore drill ربع سنويًا وبعد تغيير جوهري للمخطط، واحتفظ بآخر نتيجتين ناجحتين ونتائج الفشل مع إجراءاتها التصحيحية.
- لا تعلن «استعادة مختبرة» أو «RPO/RTO مضمونين» قبل وجود دليل تنفيذ حديث ناجح.
