# دليل نشر وتشغيل قناة WhatsApp وتكامل بيان

**التاريخ:** 21 أغسطس 2026\
**النطاق:** Meta Cloud API، Green API القديم، بيان، تسليم الرسائل، وإعادة المحاولة\
**قاعدة القرار:** نجاح الاختبارات المحلية لا يساوي اعتمادًا إنتاجيًا؛ يلزم إثبات sandbox ثم canary.

## 1. ما تغيّر

- أصبحت قناة WhatsApp خلف واجهة مزود واحدة: `meta_cloud` و`green_api` و`mock` للاختبارات فقط.
- أصبح إرسال النص والوسائط والقوالب يسجل محاولة دائمة بمفتاح idempotency ومعرف المزود وحالة متزايدة الرتبة.
- أضيف Meta Embedded Signup؛ المتصفح يمرر code لمرة واحدة ومعرفي WABA والرقم فقط، بينما يبقى App Secret وaccess token في الخادم.
- يتحقق webhook الخاص بـMeta من البايتات الخام عبر `X-Hub-Signature-256` قبل JSON parsing.
- يتحقق webhook الخاص بـGreen من Bearer خاص بكل instance، مشتق بمفتاح خادمي ولا يخزن كنص صريح.
- اتصال بيان يبدأ `pending_verification` ولا يصبح حيًا قبل ownership challenge موقّع من النطاق نفسه.
- طلبات بيان الصادرة موقعة ومثبتة DNS ومن دون redirects، وأحداث التفعيل/الإلغاء تمر عبر outbox دائم مع backoff.

## 2. متغيرات البيئة المطلوبة

### مشتركة

- `FIELD_ENCRYPTION_KEY`: مفتاح قوي ثابت من secret manager. يلزم لتشفير tokens وأسرار بيان ومفاتيح المنصة.
- `VITE_APP_URL`: الأصل العام الدقيق، مثل `https://sary.live`، بلا مسار إضافي.

### Meta

- `META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`: قيمة عشوائية مستقلة لا تقل عن 32 بايت.
- `META_GRAPH_API_VERSION`: نسخة مدعومة ومختبرة، بصيغة مثل `v23.0`؛ لا تغيّرها تلقائيًا.
- `VITE_META_APP_ID`: نفس App ID العام.
- `VITE_META_CONFIG_ID`: Configuration ID الخاص بـEmbedded Signup.
- `VITE_META_GRAPH_API_VERSION`: تطابق نسخة الخادم.

### Green API القديم

- `GREEN_WEBHOOK_TOKEN_KEY`: مفتاح مستقل مشتق منه Bearer لكل instance. عند غيابه يستخدم `FIELD_ENCRYPTION_KEY`، لكن المفتاح المستقل هو الإعداد المفضل.

لا يوضع `META_APP_SECRET` أو access token أو مفاتيح Green أو أسرار بيان في `VITE_*` أو logs أو ملفات المستودع.

## 3. Preflight قاعدة البيانات

قبل migration `0008_outgoing_thor_girl.sql` على نسخة staging مستعادة:

1. افحص تكرار `LOWER(TRIM(tenant_domain))` في `byaan_connections`.
2. افحص تكرار `instance_id` في `whatsapp_instances`.
3. افحص الصفوف ذات domain غير صالح أو credentials يتعذر فكها.
4. خذ backup قابلًا للاستعادة وسجل أعداد الصفوف لكل جدول متأثر.
5. عالج أي تعارض بقرار ملكية موثق. لا تحذف ولا تختر سجلًا آليًا.

المهاجرة تفشل قبل DDL الدائم عند وجود تكرار، ثم تضيف:

- `whatsapp_message_deliveries`
- `byaan_outbox`
- `byaan_webhook_receipts`
- حقول provider والتحقق والقيود والفهارس اللازمة

بعدها يجب أن تبقى اتصالات بيان القديمة غير مفعلة حتى تجتاز challenge؛ هذا fail-closed مقصود.

## 4. نشر staging

1. طبّق migration بحساب migrations منفصل.
2. شغّل `/ready` وتحقق من متطلبات المخطط الجديدة.
3. أعد تسجيل webhook لكل Green instance من لوحة التاجر حتى يضاف Bearer الجديد. لا تعتبر instance جاهزًا قبل نجاح فحص المزود.
4. اضبط Meta callback على:
   - GET/POST: `/api/webhooks/meta`
   - Verify token: القيمة السرية نفسها في البيئة
5. أكمل Embedded Signup بحساب Meta اختباري وWABA اختباري.
6. أنشئ اتصال بيان بنطاق tenant مخصص للاختبار، خذ challenge، وأثبت echo الموقّع قبل التفعيل.

## 5. مصفوفة قبول القناة

| الحالة | المتوقع |
|---|---|
| Meta: نص صادر | صف delivery واحد، provider ID، ثم `sent/delivered/read` دون رجوع للحالة السابقة |
| Meta: نص وزر واردان | رسالة واحدة لكل provider message ID ورد قابل للتتبع |
| Meta: صوت/صورة/ملف | تنزيل من Graph الموثوق فقط، حد 16MB، تخزين داخلي ثم معالجة |
| Meta: توقيع خاطئ/قديم | 401، بلا side effect |
| Green: Bearer ناقص أو لinstance آخر | 401، بلا side effect |
| إعادة webhook نفسه | لا طلب ولا رسالة مكررة |
| إرسال بالمفتاح نفسه | تعاد نتيجة المحاولة الأصلية ولا يرسل المزود مرتين |
| تعطل المزود | delivery=`failed` بسبب منقح، ولا ادعاء نجاح للمستخدم |
| بيان قبل التحقق | لا sync ولا live API |
| بيان: DNS خاص أو redirect | رفض الطلب |
| بيان: توقيع/وقت/delivery ID مكرر | رفض أو نتيجة idempotent بلا تنفيذ ثانٍ |
| outbox عند 5xx/timeout | retry بزيادة backoff ثم `delivered` أو `failed` قابل للمراقبة |

نفذ 10 دورات متتالية للنص، والصوت، وإعادة webhook. القبول: صفر تكرار، صفر تسرب tenant، وكل نجاح له provider ID أو معرف عمل محفوظ.

## 6. Canary والإنتاج

1. ابدأ بمتجر داخلي واحد ثم عميل تجريبي واحد موافق.
2. راقب 24 ساعة: معدل قبول المزود، delivered، failed، webhook 401، replay، backlog وp95.
3. وسّع إلى العملاء الثلاثة بعد نجاح الأهداف، ثم 25% و50% و100%.
4. أوقف التوسع إذا ظهر cross-tenant واحد، تكرار مالي/رسالة، فقد webhook، backlog متزايد أو معدل فشل يتجاوز الحد التشغيلي المعتمد.

### استعلامات تشغيلية مطلوبة

- عدد `byaan_outbox` حسب status وأقدم `available_at`.
- عدد `whatsapp_message_deliveries` حسب provider/status خلال 5 و60 دقيقة.
- provider message IDs المكررة، ويجب أن تكون صفرًا بفضل القيد.
- webhooks المرفوضة حسب السبب من counters منقحة، بلا token أو payload.

## 7. التدوير والاستجابة للحوادث

- عند اشتباه Meta: ألغ token من Meta، دوّر App Secret/verify token، أعد Embedded Signup، ثم اختبر webhook.
- عند اشتباه Green: دوّر `GREEN_WEBHOOK_TOKEN_KEY` وأعد تسجيل جميع webhooks قبل إعادة التفعيل.
- عند اشتباه بيان: عطّل الاتصال، دوّر secret، أعد ownership challenge، ولا تعاود sync قبل نجاحه.
- لا تطبع Authorization أو signatures أو raw bodies أو أرقام العملاء في incident logs.

## 8. Rollback

- rollback التشغيلي هو إيقاف تفعيل instance/connection وإيقاف worker أو canary، لا حذف جداول التسليم أو outbox.
- لا تعكس migration بعد بدء استقبال deliveries؛ احتفظ بالبيانات لإعادة التشغيل والتدقيق.
- رسائل `processing` القديمة تعاد إلى retry بواسطة stale-lease recovery. تحقق من عدم وجود عاملين غير منسقين قبل التشغيل.

## 9. ما يبقى محجوبًا

- اعتماد Meta production ومراجعة Business/WABA.
- مفاتيح Green وMeta sandbox فعلية وإثبات التسليم الخارجي.
- tenant بيان اختباري يعكس عقد `/api/sari` الجديد.
- migration/restore drill على نسخة مماثلة للإنتاج.
- مراقبة وتنبيهات فعلية واختبار حمل مستقل.

حتى إغلاق هذه البنود، الحالة الصحيحة هي **مكتمل محليًا / External E2E Blocked** وليست جاهزية إطلاق عام.
