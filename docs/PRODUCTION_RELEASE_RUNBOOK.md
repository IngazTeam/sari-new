# Runbook نشر Sary إلى الإنتاج

هذا المسار هو المدخل الوحيد المسموح لنشر `sary.live`. السكربتان القديمان مجرد wrappers إلى `scripts/deploy-production.sh`، ولا يوجد `--force` أو `git reset --hard` أو `db:push` أو بناء داخل النسخة التي تخدم المستخدمين.

## شروط البدء

1. يجب أن يكون commit المطلوب هو `origin/main` حرفيًا، وأن تكون بوابتا GitHub Actions خضراوين.
2. تؤخذ نسخة قاعدة بيانات مشفرة، ثم يُثبت restore فعليًا أو يُراجع أحدث تمرين صالح. لا يكفي نجاح أمر النسخ وحده.
3. يراجع المشغل نتائج preflight وهجرة البيانات التاريخية والتكاملات النشطة. أي عدد غير صفري أو اعتماد غير مشفر يوقف التفعيل.
4. لا تُستخدم مفاتيح Tap أو Meta أو Green الحية في canary الأول. يبدأ الاختبار بمفاتيح sandbox ومتجر داخلي ثم عميل تجريبي موافق.
5. ملف الأسرار خارج Git، قابل للقراءة لمستخدم النشر، وغير قابل للوصول إلى `other` على النظام.
6. ملف build مستقل لا يحتوي إلا مفاتيح `VITE_*` العامة المقصود تضمينها في المتصفح. لا تضع فيه DB أو tokens أو server secrets.

## متغيرات التشغيل

لا تضع القيم الحساسة في سجل الأوامر أو التقرير. جهزها في جلسة النشر من secret manager:

```text
SARI_RELEASE_SHA=<full-40-char-origin-main-sha>
SARI_SOURCE_DIR=<read-only-source-checkout>
SARI_RELEASE_ROOT=<dedicated-release-directory>
SARI_ENV_FILE=<absolute-shared-env-file>
SARI_BUILD_ENV_FILE=<absolute-public-vite-only-env-file>
SARI_PUBLIC_ORIGIN=https://sary.live
SARI_BACKUP_ID=<verified-backup-reference>
SARI_BACKUP_VERIFIED_AT=<ISO-8601-within-60-minutes>
SARI_DEPLOY_CONFIRM=deploy-sary-production:<same-sha>
SARI_SCHEMA_CONFIRM=migrate-sary-production:<same-sha>
DATABASE_URL=<from-secret-manager>
```

ثم شغّل `bash scripts/deploy-production.sh` كمستخدم النشر غير root.

## ما تنفذه البوابة

```text
flock واحد للنشر
→ fetch origin/main دون reset للمصدر
→ worktree معزولة بالـSHA المطلوب
→ ربط ملف VITE العام فقط وحذف DATABASE_URL/RUN_MYSQL_INTEGRATION من بيئة الاختبار
→ pnpm frozen install + audit + type-check + release tests + schema check + build
→ تبديل رابط البيئة داخل الإصدار إلى ملف runtime السري
→ preflights القديمة وcampaign 0042/0043/0044 قبل migration
→ drizzle migrations المسجلة
→ postflights للمخطط والتكاملات والحملات
→ PM2 startOrReload مع wait_ready من كل worker
→ GET /ready ويجب أن يثبت database=connected وschema=current
→ تبديل symlink current ذريًا وتسجيل SHA/backup ID بلا أسرار
```

الإصدار القديم يبقى عاملًا أثناء التحضير والهجرة. لا يبدأ الإصدار الجديد أي cron أو outbox worker قبل نجاح اتصال DB وعقد المخطط الكامل. عدد workers الافتراضي اثنان، والحد الأعلى أربعة لحماية ميزانية اتصالات MySQL.

## الفشل والتراجع

- الفشل قبل PM2 يوقف العملية ويترك التطبيق القديم كما هو.
- الفشل بعد محاولة PM2 يعيد تحميل إصدار التطبيق السابق تلقائيًا إن كان `current` معروفًا.
- migrations لا تُحذف تلقائيًا ولا يُنفذ schema rollback من السكربت. التراجع التلقائي للكود يفترض أن migrations توسعية ومتوافقة خلفيًا؛ خلاف ذلك يجب إيقاف النشر قبل migration واستخدام خطة استعادة معتمدة.
- لا تحذف worktree الفاشلة قبل حفظ logs ونتائج preflight ورقم النسخة. تنظيف الإصدارات القديمة عملية منفصلة ومراجعة الهدف إلزامية.

## إثبات ما بعد النشر

1. افحص `/health`؛ يجب ألا يعرض سوى الحالة العامة. افحص `/ready`؛ يجب أن يعيد `database=connected` و`schema=current`.
2. تحقق من SHA المنشور ومن أن PM2 لا يعيد التشغيل في حلقة، ثم راقب 5xx وp95 وDB pool وoutbox backlog وmanual review مدة 30 دقيقة.
3. نفذ tenant A/B للقراءات والكتابات، ثم Tap test، ثم webhook replay، ثم campaign opt-in/withdrawal على sandbox.
4. ابدأ canary بمتجر داخلي. لا توسع إلى العملاء التجريبيين قبل 24 ساعة بلا P0 أو drift أو رسائل مكررة.
