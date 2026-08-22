# Calendly integration runbook

آخر تحديث: 2026-08-23  
النطاق: ربط Personal Access Token، تسجيل Webhook، inbox دائم، مزامنة المدعوين، وإشعار واتساب الاختياري.

## عقد الإنتاج

- يُنشئ الخادم اشتراك Calendly تلقائيًا عبر `POST /webhook_subscriptions` بنطاق `user` وللحدثين `invitee.created` و`invitee.canceled` فقط.
- عنوان callback يحتوي معرف endpoint عشوائيًا بطول 43 حرفًا؛ لا يحتوي `merchantId` ولا أي اعتماد.
- لكل اتصال مفتاح توقيع عشوائي مستقل، مخزن مشفرًا في `platform_integrations.webhook_signing_secret`.
- التحقق يستخدم `Calendly-Webhook-Signature` وHMAC-SHA256 على `timestamp.rawBody` مع نافذة ±5 دقائق ومقارنة ثابتة الزمن.
- لا يُحفظ payload في inbox. تحفظ خلاصة الحدث وURI الحدث والمدعو فقط، ثم يجلب العامل النسخة canonical من `api.calendly.com`.
- الإسقاط المحلي مبني على هوية المدعو، لأن الحدث الجماعي قد يحتوي عدة مدعوين.
- تأكيد واتساب opt-in ومتوقف افتراضيًا، ومفتاح الإرسال idempotent مشتق من الحدث الموثق.

مراجع المزود:

- [إنشاء اشتراك Webhook واستقبال أحداث المواعيد](https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions)
- [نطاقات API المطلوبة](https://developer.calendly.com/scopes)
- [Personal Access Tokens](https://developer.calendly.com/how-to-authenticate-with-personal-access-tokens)
- [سلوك أحداث إعادة الجدولة](https://developer.calendly.com/see-how-webhook-payloads-change-when-invitees-reschedule-events)

## المتطلبات

1. `FIELD_ENCRYPTION_KEY` مضبوط بقيمة مستقرة لا تقل عن 32 حرفًا.
2. `CALENDLY_WEBHOOK_BASE_URL` يساوي origin عام HTTPS مثل `https://sary.live`. عند غيابه في الإنتاج يستخدم `https://sary.live` فقط.
3. رمز Calendly يملك أقل الصلاحيات اللازمة: `users:read`, `scheduled_events:read`, `invitees:read`, `webhooks:write`.
4. خطة Calendly تدعم Webhooks. رفض 403 يظهر للتاجر كمتطلب خطة/صلاحيات، لا كنجاح كاذب.

## ترتيب النشر الإلزامي

1. خذ backup قابلاً للاستعادة.
2. طبّق `drizzle/0039_calendly_webhook_ingress.sql` قبل تشغيل الإصدار.
3. شغّل `pnpm security:encrypt-secrets` بعد الترحيل لتشفير أي tokens تاريخية والعمود الجديد.
4. أعد ربط كل اتصال Calendly نشط قديم. المسار السابق `/api/webhooks/calendly/:merchantId` متقاعد عمدًا ولا يُرحّل.
5. شغّل `pnpm preflight:calendly-webhook-identity`. يجب أن تكون القيم التالية صفرًا:
   - `activeConnectionsMissingRegistration`
   - `plaintextAccessTokens`
   - `plaintextSigningSecrets`
6. تحقق من `/ready` داخليًا ثم افتح صفحة Calendly للتاجر وتأكد أن الحالة «مسجل تلقائيًا».

`legacyCalendlyAppointments` قيمة معلوماتية: الصفوف القديمة في جدول `appointments` لا تملك هوية مدعو صالحة. لا تحذفها آليًا؛ راجعها ثم صدّر/أرشف ما يلزم وفق سياسة الاحتفاظ.

## اختبار canary

استخدم متجر اختبار وخطة Calendly تدعم Webhooks:

1. اربط PAT جديدًا وتأكد أن الواجهة لا تعرض endpoint أو signing key.
2. احجز موعدًا بمدعو واحد. يجب أن يرتفع `recentTotal` ثم `recentCompleted` خلال 30 ثانية.
3. أعد إرسال نفس raw body والتوقيع ضمن النافذة. يجب أن يعود 200 دون موعد أو إشعار ثانٍ.
4. غيّر بايتًا واحدًا في body أو استخدم timestamp أقدم من 5 دقائق. يجب أن يعود 401 بلا receipt.
5. ألغ الموعد. يجب أن يتحول الإسقاط نفسه إلى `cancelled`، لا أن يُنشأ سجل ثانٍ.
6. فعّل تأكيد واتساب صراحة واختبر حجزًا جديدًا برقم `text_reminder_number` صالح. تحقق من صف واحد في `whatsapp_message_deliveries` حتى بعد retry.
7. عطّل قاعدة البيانات مؤقتًا في staging فقط: المدخل يعيد 503، وبعد عودتها يعاد التسليم ويعالجه العامل.
8. أوقف العامل بعد claim ثم أعد التشغيل بعد 10 دقائق؛ يجب استرداد lease دون أثر مزدوج.

## المراقبة

- `awaiting > 0` لأكثر من دقيقتين: تنبيه P2.
- `manualReview > 0`: تنبيه P1 ومراجعة `last_error` كرمز محدود بلا payload.
- فرق `recentTotal - recentCompleted`: backlog أو خطأ مزود/اعتماد.
- لا تسجل PAT أو signing key أو اسم/بريد/هاتف المدعو في logs.

## التدوير والفصل

- إعادة الربط تولد endpoint ومفتاح توقيع جديدين تحت advisory lock لكل متجر.
- بعد نجاح التسجيل والحفظ، يحذف الخادم الاشتراك السابق best-effort. حتى لو فشل الحذف، endpoint السابق يصبح غير مرتبط ويُرفض.
- تغيير مستخدم Calendly يمسح receipts والإسقاط السابقين ذريًا قبل اعتماد الحساب الجديد.
- الفصل يحاول حذف الاشتراك البعيد ثم يحذف الاتصال محليًا؛ cascade يحذف inbox والإسقاط، وأي إرسال لاحق يُرفض.

## rollback

لا تعد إلى callback المبني على `merchantId` أو السر العالمي. عند وجود مانع:

1. عطّل اتصال Calendly المتأثر أو افصله.
2. اترك `0039` والجداول كما هي؛ هي إضافية وآمنة للنسخة السابقة.
3. أصلح العامل/الصلاحيات ثم أعد الربط بمفتاح وendpoint جديدين.
4. لا تعاود معالجة `manual_review` بإرسال واتساب يدويًا قبل التحقق من `whatsapp_message_deliveries` لتجنب الإرسال المزدوج.
