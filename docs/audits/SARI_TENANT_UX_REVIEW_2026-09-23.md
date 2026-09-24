# فحص تجربة لوحة التاجر في ساري

23 سبتمبر 2026 — نسخة المشروع المحلية؛ مرجع Git: 9c6bf9112c889a91eff47045f476a9f346a0ab3d.

## النتيجة

التقييم التقديري لسهولة الاستخدام: **5/10**. هذا حكم مراجعة خبير، وليس نتيجة SUS أو دراسة مستخدمين. الوظائف واسعة، لكن نصوصًا خاطئة ومسارات مكسورة ومقاييس غير متسقة تجعل إنجاز المهمة والثقة باللوحة أصعب. الأولوية لصحة السلوك والنصوص، ثم تبسيط التنظيم.

| المحور | الدرجة /10 | السبب |
|---|---:|---|
| تعلم الواجهة والعثور على الوظيفة | 5 | كثرة الصفحات وتكرار الوجهات |
| إنجاز المهام اليومية | 5 | محادثات مقيدة بصفحة واحدة وتعديل حملة مكسور |
| وضوح اللغة والتغذية الراجعة | 3 | عناوين وتنبيهات لا تطابق المقصود |
| الثقة بالحالة والأرقام | 4 | مؤشرات تشغيل ثابتة وتعريفات غير موحدة |
| الجوال والتنقل | 5 | استجابة موجودة لكن المهمة تحتاج تمريرًا طويلًا |
| الاتساق والإتاحة | 6 | مكونات مشتركة وإصلاحات جيدة لكن التغطية غير كاملة |
| إدارة النماذج والإعداد | 7 | إنشاء خدمة نجح، مع كثرة إعدادات متفرقة |

## النطاق والمنهج

- حصر 122 مسارًا و102 ملف صفحة و49 عنصر قائمة؛ راجعت المسارات والمكونات والنصوص والاستعلامات، وزرت المسارات الـ122 في المتصفح المحلي. عدد المسارات يشمل البدائل والتحويلات وصفحات التفاصيل والعودة من التكامل والدفع.
- أنشأت MySQL مستقلًا على 127.0.0.1:3317 باسم sari_ux_test، وطبقت ملفات الترحيل. لم أغيّر قاعدة المشروع الأصلية أو إعداد .env. تعطلت البداية بسبب بيانات دخول MySQL الأصلية، ثم بسبب اختلاف حالة أسماء الجداول على ويندوز؛ حُل التشغيل باستخدام قاعدة مستقلة lower_case_table_names=2.
- التطبيق الحالي على http://127.0.0.1:3017 بحساب تجريبي، بلا مفاتيح مزودين فعلية. المهام الخلفية معطلة ومشغل الفحص يحظر الاتصالات الخارجية.
- بيانات البداية: 65 محادثة ورسائلها، 6 منتجات، 10 طلبات، باقة نشطة ومسودة حملة وإشعار. أُنشئت خدمة إضافية من الواجهة بسعر 150 ريال ومدة 60 دقيقة وتحقق ظهورها.
- فُحص العرض المكتبي والجوال 390×844، والبحث عن عميل خارج الصفحة الأولى، وتعديل الحملة، وإضافة خدمة، وحالات عدم الربط والسجل المفقود وعودة الدفع الناقصة.
- نجحت 42 حالة في 5 ملفات اختبارات حالية: route recovery، semantic i18n، core accessibility، language truth، onboarding state machine. نجاحها لا ينفي العيوب المكتشفة؛ عدد منها يفحص بنية المصدر فقط.
- **حدود التغطية:** زيارة كل مسار لا تعني تنفيذ جميع فروع كل خاصية. التكاملات الخارجية والدفع والإرسال الفعلي والذكاء الاصطناعي المرتبط بمزود لم تُنفذ. صفحات تفاصيل الخدمات والمدفوعات فُحصت أيضًا بسجلات غير موجودة. بعض القراءات التلقائية تلت ظهور العنوان؛ لا تُستخدم الأصفار العابرة وحدها دليلاً على عيب. النتائج الحرجة مدعومة بالمصدر أو بإعادة تجربة محددة.

## ما يعمل جيدًا

وجود تخطيط مشترك وRTL، حالة عدم الربط مع عودة في بيان وزد والتقويم، استيراد متعدد المصادر، مكونات تحميل، حالات استعادة دلالية في الكوبونات ومقارنة الباقات والاستخدام وتصدير Sheets، وفصل الموافقة الصريحة لتفعيل حملات المناسبات. هذه الأجزاء تستحق الحفاظ عليها وتعميمها.

## المشكلات والتحسينات

P1 يعيق مهمة أو يضلل قرارًا أساسيًا؛ P2 يؤثر بوضوح في الثقة والسرعة؛ P3 تحسين اتساق. لا توجد هنا دعوى فحص أمني شامل.

### UX01 · P1 — نصوص واجهة خاطئة في صفحات أساسية

**الدليل:** مؤكد محليًا وفي المصدر.

العملاء بعنوان «تم إضافة الملاحظة»، إعدادات التقويم بعنوان تحذير الفصل، الولاء بعنوان «تم الحفظ بنجاح»، وطلبات WooCommerce بعنوان «تمت المزامنة بنجاح». ظهرت قبل أي إجراء. تشمل المشكلة سلة وSheets والولاء والعملاء والتقارير المجدولة والأتمتة والعملة وساحة التجربة.

**التوصية:** استبدال مفاتيح textN/auto_N بمفاتيح دلالية ومراجعة السياق والحقول والتنبيهات، لا مجرد وجود الترجمة.

**معيار القبول:** افتح كل صفحة دون إجراء: عنوان صحيح، حقول تصف مدخلاتها، لا رسالة نجاح أو فشل ثابتة. اختبر النجاح والفشل للنماذج.

**المصدر:** `client/src/locales/ar.json`، `client/src/pages/SallaIntegration.tsx:49`، `client/src/pages/Customers.tsx`.

### UX02 · P1 — المحادثات بعد أول 50 غير متاحة والبحث محدود

**الدليل:** مؤكد بالتجربة والمصدر.

قاعدة الفحص تحتوي 65 محادثة. القائمة تُحمّل pageSize=50 وcurrentPage=1 دون استخدام setCurrentPage. البحث عن ux-customer-065 يعرض «لا توجد محادثات بعد». العدّاد الكلي 65 لكن النشط والمغلق 40 و10 من الصفحة الحالية فقط.

**التوصية:** بحث خادمي على كامل التيننت، ترقيم أو تحميل إضافي، وإجماليات من المصدر نفسه. حالة لا نتائج تختلف عن عدم وجود محادثات.

**معيار القبول:** أنشئ 65+ محادثة؛ العميل 65 قابل للبحث والفتح، وعدّادات الحالة تتطابق مع العدد الكلي.

**المصدر:** `client/src/pages/merchant/Conversations.tsx:31`، `client/src/pages/merchant/Conversations.tsx:60`، `client/src/pages/merchant/Conversations.tsx:101`.

### UX03 · P1 — تعديل الحملة يفتح 404

**الدليل:** مؤكد بالنقر محليًا.

زر تعديل مسودة الحملة يفتح /merchant/campaigns/1/edit؛ لا تعريف لهذا المسار. ظهر قالب 404 العام خارج لوحة التاجر.

**التوصية:** إضافة مسار ونموذج تعديل للمسودات، أو تحويل الإجراء إلى محرر قائم. الاحتفاظ بسياق لوحة التاجر عند أخطاء المسار.

**معيار القبول:** تعديل مسودة وحفظها ثم إعادة فتحها؛ الحملة المرسلة لا تعرض إجراء تعديل غير صالح.

**المصدر:** `client/src/pages/merchant/Campaigns.tsx:300`، `client/src/App.tsx:336`.

### UX04 · P1 — مقاييس الأداء تطلب تيننت رقم صفر ثم تعرض أصفارًا

**الدليل:** مؤكد بالمصدر؛ واجهة الأصفار شوهدت محليًا.

المسار لا يحتوي merchantId، لكن الصفحة تأخذه من useParams فتستخدم 0. الخادم يرفض المعرف غير المملوك. الواجهة لا تعرض خطأ وتستخدم ||0.

**التوصية:** استخدام التيننت المختار ومنع الاستعلام قبل تحديده، وإظهار الخطأ مع إعادة المحاولة.

**معيار القبول:** المؤشرات تأتي من التيننت الصحيح؛ رفض الطلب يظهر حالة خطأ لا أرقامًا صفرية.

**المصدر:** `client/src/pages/merchant/PerformanceMetrics.tsx:12`، `server/routers-performance.ts:19`.

### UX05 · P1 — تعريف الطلب المكتمل لا يطابق حالات الطلبات

**الدليل:** مؤكد بالمصدر وببيانات الفحص.

ملخص الرئيسية يحسب orders.status=completed بينما enum الطلبات هو pending/paid/processing/shipped/delivered/cancelled. في الفحص كانت هناك طلبات delivered والرئيسية تعرض مكتملة=0. تختلف تعريفات الإيراد بين الأسطح.

**التوصية:** قاموس مؤشرات موحد: تعريف الإيراد المؤكد، الطلب المكتمل، الفترة، العملة والمصدر. لا تُجمع حالات غير موجودة.

**معيار القبول:** بيانات ثابتة لطلب مدفوع ومسلم وملغى ومسترد تعطي نتائج معروفة ومتسقة في الرئيسية والتقارير.

**المصدر:** `server/dashboard-analytics.ts:82`، `drizzle/schema.ts:524`.

### UX06 · P1 — غياب حالات فشل تحميل مميزة

**الدليل:** مؤكد بالمصدر في صفحات متعددة.

الرئيسية ومقاييس الأداء والتحليلات وبعض القوائم لا تفصل فشل القراءة عن الصفر/الفراغ. وجود toast.onError للتعديل لا يعالج فشل query. فحص آلي أولي وجد 18 ملفًا بلا إشارة error عامة؛ هذا مؤشر مراجعة وليس عددًا نهائيًا للعيوب.

**التوصية:** حالات مستقلة للتحميل والفراغ وعدم التطابق وعدم الربط والرفض والخطأ؛ إعادة محاولة تحفظ المرشحات.

**معيار القبول:** أجبر 403/500/انقطاع الاتصال؛ لا أصفار مضللة ولا دعوة إنشاء مكررة.

**المصدر:** `client/src/pages/merchant/Dashboard.tsx:44`، `client/src/pages/merchant/AnalyticsDashboard.tsx:82`.

### UX07 · P2 — حالات تشغيل ثابتة تتناقض مع الواقع

**الدليل:** مؤكد بصريًا.

التيننت بلا رقم واتساب والرد الآلي معطل. الرئيسية تقول وضع الإعداد بينما القائمة تعرض ساري نشط الآن ويتعلم الآن. صفحة Webhook تعرض جاهز ونشط ومفعّل.

**التوصية:** مصدر حالة واحد يربط القناة والإعداد والتفعيل ووقت آخر فحص. استخدم غير متصل أو يحتاج إعداد عند غياب الدليل.

**معيار القبول:** حالات غير مربوط/منقطع/معطل/جاهز متطابقة في جميع الصفحات.

**المصدر:** `client/src/components/DashboardLayout.tsx:548`، `client/src/pages/merchant/WhatsAppWebhookSetup.tsx`.

### UX08 · P2 — تكرار المسارات واختلاف الوعد عن الوجهة

**الدليل:** مؤكد بالتنقل والمصدر.

سجل الرسائل والصوت والتحليلات المتقدمة وغيرها تعرض نفس Analytics. الكلمات المفتاحية تحوّل لتحليل الموقع رغم وصفها إعداد ردود. مسار A/B يفتح الرؤى على تبويب الكلمات المفتاحية.

**التوصية:** وجهة رئيسية واحدة لكل مهمة مع تبويب مرتبط بالرابط؛ تحويل المسارات القديمة مع حفظ الفلتر.

**معيار القبول:** كل اسم في القائمة يفتح الوظيفة الموعودة، والرجوع يحفظ السياق والبحث.

**المصدر:** `client/src/App.tsx:953`، `client/src/pages/merchant/AIWhatsAppHub.tsx:53`، `client/src/pages/merchant/InsightsDashboard.tsx:131`.

### UX09 · P2 — ثقل التنقل وترتيب الرئيسية

**الدليل:** مؤكد بصريًا وتقييم تصميمي.

49 عنصرًا في 6 مجموعات؛ أدوات إعداد وتقارير متعددة بجانب مهام التشغيل. في الرئيسية تسبق بطاقات التعلم والمزامنة عنوان الترحيب وملخص المبيعات.

**التوصية:** 8 مجالات عمل واضحة، أدوات متقدمة داخل صفحاتها، بحث شامل بالمرادفات، وبداية يوم تعرض التنبيهات والمهام والأداء.

**معيار القبول:** الوصول للمحادثة أو الطلب خلال نقرتين من الرئيسية؛ معرفة الخطوة التالية دون تمرير طويل.

**المصدر:** `client/src/components/DashboardLayout.tsx:153`، `client/src/pages/merchant/Dashboard.tsx:160`.

### UX10 · P2 — الجوال يجعل المحادثة بعيدة عن المهمة

**الدليل:** مؤكد عند عرض 390×844.

تكدس العدادات الكبيرة قبل قائمة المحادثات؛ قائمة ثابتة 600px ثم مساحة المحادثة أسفلها. شريط الجوال مزدحم وحالة العنوان تختنق. توجد أيضًا عناوين فرعية تعود إلى Menu عند غياب تطابق تام.

**التوصية:** قائمة ثم محادثة بملء المساحة مع عودة واضحة؛ شريط علوي مختصر، تنقل سفلي للمهام المتكررة، فلاتر قابلة للفتح.

**معيار القبول:** اختبار 360/390/768/1440 ولوحة مفاتيح الجوال؛ لا تداخل أو تمرير أفقي للصفحة، زر الرد ظاهر.

**المصدر:** `client/src/pages/merchant/Conversations.tsx:284`، `client/src/components/DashboardLayout.tsx:628`.

### UX11 · P2 — تصدير الرؤى لا يصدر ملفًا

**الدليل:** مؤكد بالمصدر.

handleExportCSV يعرض «جاري تصدير البيانات...» ثم TODO فقط. التحديث كذلك يعلن النجاح دون انتظار اكتمال الطلبات.

**التوصية:** تنفيذ تصدير للفترة والمرشحات الفعلية؛ تعطيل الإجراء مع تفسير إن لم يكن متاحًا؛ النجاح بعد اكتمال العملية.

**معيار القبول:** ينتج ملفًا صحيحًا عند الضغط، والفشل يعرض خطأ قابلًا للاستعادة.

**المصدر:** `client/src/pages/merchant/InsightsDashboard.tsx:41`.

### UX12 · P2 — روابط وسياسات وعودة الدفع القديم غير صحيحة

**الدليل:** مؤكد بالمصدر ومحليًا.

روابط الشروط والخصوصية في Checkout هي #. PaymentSuccess يقرأ query من useLocation الذي يعيد pathname فقط؛ اختبار subscriptionId=1 عرض #0. PaymentCancel لا يتحقق من حالة الخصم. تخص هذه الملاحظة المسارات القديمة، ولا تثبت فشل مسار Tap الحالي.

**التوصية:** استخدام useSearch أو window.location.search، روابط سياسات فعلية، وحالة دفع من الخادم؛ إعادة محاولة تحفظ الباقة.

**معيار القبول:** معرف صحيح يقرأ صحيحًا؛ مرجع ناقص يوضح السبب؛ لا ادعاء عدم الخصم دون تحقق. لا يلزم تنفيذ دفعة حقيقية لاختبار القراءة.

**المصدر:** `client/src/pages/merchant/Checkout.tsx:169`، `client/src/pages/merchant/PaymentSuccess.tsx:15`، `client/src/pages/merchant/PaymentCancel.tsx:10`.

### UX13 · P2 — بقايا كود تظهر للمستخدم

**الدليل:** مؤكد بصريًا.

صفحة مصادر العملاء تعرض // @ts-ignore ضمن محتواها. توجد نصوص ترجمة تحتوي ${error.message} حرفيًا في أدوات واتساب.

**التوصية:** إزالة التعليقات من JSX النصي واستخدام interpolation الصحيح؛ مسح النص المعروض آليًا.

**معيار القبول:** لا يظهر @ts-ignore أو مفاتيح ترجمة أو ${...} في المحتوى النهائي.

**المصدر:** `client/src/pages/merchant/AcquisitionReport.tsx:61`، `client/src/pages/merchant/WhatsAppTest.tsx:84`.

### UX14 · P2 — نموذج تعديل خدمة غير موجودة لا يشرح المشكلة

**الدليل:** مؤكد قبل إنشاء الخدمة.

فتح services/1/edit قبل وجود الخدمة أظهر نموذج تعديل فارغ؛ صفحة services/1 نفسها أظهرت غير موجودة. إنشاء خدمة جديدة بقيمة 150 ومدة 60 نجح لاحقًا.

**التوصية:** حالات loading/error/not-found مستقلة قبل عرض نموذج التعديل، مع العودة للقائمة.

**معيار القبول:** معرف غير موجود لا يعرض حقول تحرير أو زر حفظ؛ إنشاء وتعديل سجل حقيقي يعملان.

**المصدر:** `client/src/pages/merchant/ServiceForm.tsx`.

### UX15 · P2 — إتاحة غير متسقة خارج مجلد merchant

**الدليل:** مؤكد بالمصدر؛ يلزم استكمال اختبار قارئ الشاشة.

الاختبار الحالي يغطي مجلد merchant وأربع صفحات إضافية؛ صفحات مثل ScheduledReports وWhatsAppAutoNotifications خارج هذا النطاق وفيها أزرار أيقونات بلا أسماء وحذف مباشر. توجد main متداخلة في التخطيط الحالي.

**التوصية:** توليد نطاق فحص الإتاحة من المسارات الفعلية، وتسميات أزرار وسياق الحذف وإدارة التركيز.

**معيار القبول:** كل وظيفة متاحة بلوحة المفاتيح؛ focus واضح؛ dialogs تعيد التركيز؛ عنصر main رئيسي واحد.

**المصدر:** `server/merchant-core-accessibility-pentest.test.ts:13`، `client/src/pages/ScheduledReports.tsx:60`، `client/src/components/DashboardLayout.tsx:301`.

### UX16 · P3 — تحسينات صدق الأرقام والحالات الفارغة

**الدليل:** مؤكد محليًا/المصدر.

0 تقييم يظهر 0.0 كأنه تقييم سلبي؛ استعادة 0 من 0 توصف بالانخفاض؛ صفحة الباقات تعرض وفر 20% ثابتًا بغض النظر عن الأسعار؛ المنتجات المتوفرة تعني النشطة حتى لو المخزون صفر.

**التوصية:** عرض لا توجد بيانات كافية، توضيح تعريف النشط والمتوفر، وحساب المقارنات والخصم من البيانات الفعلية.

**معيار القبول:** صفر عينة لا ينتج حكم أداء، والتوفير والتوفر قابلان للحساب من السجلات.

**المصدر:** `client/src/pages/merchant/OverviewAnalytics.tsx`، `client/src/pages/merchant/SubscriptionPlans.tsx`، `client/src/pages/merchant/Products.tsx`.

## التنظيم المقترح

الرئيسية / المحادثات / المبيعات / المنتجات والخدمات / العملاء / المساعد الذكي / التسويق / التحليلات. الإعدادات والتكاملات والباقة والفريق في موضع ثابت منفصل. جميع الأدوات قابلة للبحث، مع حفظ الروابط القديمة كتوجيهات إلى تبويبات محددة. لا تُحذف الميزات بحجة التبسيط.

- الرئيسية: حالة تشغيل صادقة، ما يحتاجك الآن، أربعة مؤشرات قابلة للفهم، ثم أحدث الطلبات.
- المحادثات: صندوق موحد وبحث شامل ومالك واضح؛ على الجوال قائمة ثم محادثة وزر عودة.
- المبيعات: الطلبات وعروض الأسعار وروابط الدفع والفرص ضمن سياق العميل.
- الكتالوج: المنتجات والخدمات والحجوزات ومقدمو الخدمة والمخزون، مع مصدر البيانات.
- المساعد: المعرفة والسلوك وتجربة الرد والتشغيل، ومراجعة قبل نشر تغييرات المعرفة.
- التسويق: جمهور موافق، رسالة، مراجعة، وجدولة؛ لا نجاح قبل نتيجة فعلية.
- التحليلات: قاموس مؤشرات وفترة ومصدر موحدان مع تصدير يطابق العرض.

## الموك أب وحدود التنفيذ

الموك أب مستقل داخل prototypes/tenant-dashboard، ببيانات توضيحية محفوظة محليًا. يوضح الواجهات الأساسية والتنقل والبحث والمرشحات والنماذج والتفاصيل والحالات، ويعرض دليلًا ينقل كل ملفات الصفحات الـ102 إلى التنظيم الجديد. لا يُعد تنفيذًا لإصلاحات التطبيق، ولا محاكاة كاملة لمنطق المزودين أو الصلاحيات. الأرقام فيه سيناريوهات توضيحية وليست إحصاءات التيننت الفعلي.

## خطة التنفيذ ومعايير الإغلاق

1. إصلاح UX01–UX06 أولًا مع اختبارات سلوك: بحث كامل، تعديل مسودة، بيانات أداء صحيحة، تحميل وفشل واضحان.
2. بناء التخطيط والتنقل الجديدين مع توجيه المسارات القديمة وحفظ المرشحات.
3. نقل المحادثات والطلبات والكتالوج ثم المساعد والتسويق والتحليلات.
4. اختبار حساب مالك وموظف ومشاهد، وتيننت فارغ وكبير ومتعدد المتاجر؛ اختبار الانتقال بين التيننتات دون تسرّب حالة واجهة.
5. فحص 360/390/768/1024/1440، تكبير 200%، لوحة مفاتيح وقارئ شاشة، إلغاء النوافذ وحفظ التركيز والحالات ذات النص الطويل.
6. اختبار مزودين ببيئاتهم التجريبية: ربط وفصل وتجديد صلاحية ومزامنة جزئية وإعادة محاولة وفشل شبكة. اختبار مدفوعات sandbox وإرسال إلى وجهات اختبار فقط.
7. جلسات مع 5 تجار على مهام محددة: العثور على محادثة، تعديل مسودة، إضافة منتج، مراجعة عرض، فهم تنبيه، وتغيير إعداد. سجّل نجاح المهمة وزمنها وأخطاءها قبل/بعد. الهدف المقترح نجاح 90% دون مساعدة؛ ليس نتيجة محققة حاليًا.

لا يجوز وصف التنفيذ بأنه خالٍ من المشكلات قبل اجتياز هذه المعايير.

## سجل كل صفحة

الصفحات أدناه خضعت لقراءة بنيوية وزيارة محلية للمسار أو مساراتها. عمود التحسين يجمع مشكلات مثبتة واقتراحات تصميم؛ تفاصيل درجة الإثبات للمشكلات الرئيسة أعلاه.

| الصفحة | المسارات | التوصية | المصدر |
|---|---|---|---|
| الإعداد الأولي | `/merchant/setup-wizard` | اختصار رحلة الإعداد إلى النشاط والمعرفة والقناة والتجربة؛ إبقاء التقدم قابلًا للاستكمال. | client/src/pages/SetupWizard.tsx |
| نظرة عامة | `/merchant/dashboard` | تقديم مهام اليوم وملخص الأداء على تفاصيل تعلم المخ والمزامنة؛ توحيد حالة التشغيل. | client/src/pages/merchant/Dashboard.tsx |
| مركز المساعد | `/merchant/ai-hub` | توحيد المعرفة والسلوك والتجربة والتشغيل؛ تصحيح وجهتي الكلمات المفتاحية والصوت. | client/src/pages/merchant/AIWhatsAppHub.tsx |
| مركز التحليلات | `/merchant/analytics-hub` | استخدام تبويبات واضحة لتعريفات المؤشرات بدل بطاقات متشابهة. | client/src/pages/merchant/AnalyticsHub.tsx |
| الحملات | `/merchant/campaigns` | إصلاح تعديل المسودة المكسور وتصحيح نص تأكيد الإرسال. | client/src/pages/merchant/Campaigns.tsx |
| إنشاء حملة | `/merchant/campaigns/new` | خطوات جمهور ثم رسالة ثم مراجعة؛ بيان الموافقة وعدد المستلمين والتوقيت قبل الجدولة. | client/src/pages/merchant/NewCampaign.tsx |
| تفاصيل الحملة | `/merchant/campaigns/:id` | إظهار سياق الحملة وإجراء متابعة؛ توضيح قبول المزود مقابل التسليم. | client/src/pages/merchant/CampaignDetails.tsx |
| تقرير الحملة | `/merchant/campaigns/:id/report` | تصحيح عنوان نجاح الإرسال ليوافق معنى الحالة؛ تمييز الخطأ عن حملة غير موجودة. | client/src/pages/merchant/CampaignReport.tsx |
| المنتجات | `/merchant/products` | توضيح الفرق بين النشط والمتوفر بالمخزون؛ إظهار مصدر المنتج وحالة مزامنته. | client/src/pages/merchant/Products.tsx |
| استيراد المنتجات | `/merchant/products/upload` | معاينة الأعمدة والأخطاء والتكرارات قبل الاعتماد مع ملخص بعد الاستيراد. | client/src/pages/merchant/UploadProducts.tsx |
| المحادثات | `/merchant/conversations` | إصلاح حد 50 والبحث؛ جعل الجوال قائمة ثم محادثة؛ نقل العدادات إلى ملخص مضغوط. | client/src/pages/merchant/Conversations.tsx |
| أرقام واتساب | `/merchant/whatsapp`<br>`/merchant/whatsapp-instances` | معالج ربط واحد يوضح Meta وQR وحالة كل خطوة دون ادعاء نشاط غير مؤكد. | client/src/pages/merchant/WhatsAppInstancesPage.tsx |
| ربط سلة | `/merchant/salla` | إعادة بناء النصوص الدلالية للعناوين والحقول والتنبيهات؛ عنوان الصفحة الحالي رسالة تحقق. | client/src/pages/SallaIntegration.tsx |
| ربط بيان | `/merchant/integrations/byaan` | إيضاح مصدر الحقيقة وما يُدار من بيان مع وقت آخر مزامنة وإجراء معالجة. | client/src/pages/merchant/ByaanIntegration.tsx |
| بيان: الدورات والمتدربون | `/merchant/byaan-dashboard` | الحالة غير المرتبطة توفر رابطًا واضحًا؛ اختبار المزامنة يحتاج بيئة بيان تجريبية. | client/src/pages/ByaanDashboard.tsx |
| ربط زد | `/merchant/integrations/zid`<br>`/merchant/zid/settings` | الربط عبر OAuth واضح؛ إضافة ملخص متطلبات وسجل محاولات مفهوم. | client/src/pages/merchant/ZidIntegration.tsx |
| نتيجة تفويض زد | `/merchant/zid/callback` | حالة التفويض الناقص مفهومة؛ الحفاظ على مسار عودة مباشر. | client/src/pages/ZidCallback.tsx |
| منتجات زد | `/merchant/zid/products` | حالة عدم الربط واضحة؛ توحيدها ضمن المنتجات مع مرشح المصدر. | client/src/pages/ZidProducts.tsx |
| سجل مزامنة زد | `/merchant/zid/sync-logs` | توضيح نوع الفشل والإجراء ووقت آخر نجاح؛ ترقيم بدل حد ثابت. | client/src/pages/ZidSyncLogs.tsx |
| ربط WooCommerce | `/merchant/woocommerce/settings` | تقليل المصطلحات في المسار الأساسي وإخفاء تفاصيل Webhook ضمن إعدادات متقدمة. | client/src/pages/merchant/WooCommerceSettings.tsx |
| منتجات WooCommerce | `/merchant/woocommerce/products` | العنوان والعدادات غير متوافقة مع المقصود؛ إعادة تعيين النصوص. | client/src/pages/WooCommerceProducts.tsx |
| طلبات WooCommerce | `/merchant/woocommerce/orders` | العناوين تعرض رسائل نجاح وفشل ثابتة؛ توحيد النصوص والبحث عبر النتائج. | client/src/pages/WooCommerceOrders.tsx |
| تحليلات WooCommerce | `/merchant/woocommerce/analytics` | تعريف الإيراد المكتمل وعدم ادعاء تحويل غير موثوق نقطتان جيدتان؛ دمج مرشح المصدر. | client/src/pages/merchant/WooCommerceAnalytics.tsx |
| ربط Calendly | `/merchant/integrations/calendly` | معالج اتصال واختبار واضح؛ تحويل خطوات الرمز إلى شرح مختصر ومرجع متقدم. | client/src/pages/merchant/CalendlyIntegration.tsx |
| كوبونات الخصم | `/merchant/discounts` | نصوص دلالية وحالات خطأ وفراغ جيدة؛ معاينة أثر الخصم قبل الحفظ. | client/src/pages/DiscountCodes.tsx |
| إحالات التجار | `/merchant/referrals` | فصل إحالة تاجر جديد عن ولاء عملاء المتجر؛ توضيح شروط اكتساب المكافأة. | client/src/pages/merchant/Referrals.tsx |
| السلات المتروكة | `/merchant/abandoned-carts` | تصحيح رسالة نجاح الاستعادة؛ توضيح مصدر السلة وشروط إرسال التذكير. | client/src/pages/merchant/AbandonedCartsPage.tsx |
| حملات المناسبات | `/merchant/occasion-campaigns` | التفعيل الصريح جيد؛ تصحيح رسالة نجاح التبديل وعرض موعد المنطقة الزمنية. | client/src/pages/merchant/OccasionCampaignsPage.tsx |
| العروض الترويجية | `/merchant/promotions` | تمييز العرض المقترح للمساعد عن كوبون الخصم والحملة المرسلة. | client/src/pages/merchant/Promotions.tsx |
| تحليلات المبيعات | `/merchant/analytics` | منع عرض أصفار قبل التحميل أو عند فشل الاستعلامات؛ تعريف كل مؤشر. | client/src/pages/merchant/AnalyticsDashboard.tsx |
| تحليلات الرسائل | `/merchant/message-analytics`<br>`/merchant/sari-analytics`<br>`/merchant/advanced-analytics`<br>`/merchant/analytics-dashboard`<br>`/merchant/voice-messages`<br>`/merchant/analysis` | ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة. | client/src/pages/merchant/Analytics.tsx |
| نظرة الأداء | `/merchant/overview-analytics` | عدم وصف 0 من 0 بأنه أداء ضعيف؛ استخدام لا توجد بيانات كافية. | client/src/pages/merchant/OverviewAnalytics.tsx |
| الطلبات | `/merchant/orders` | عرض تحذير استرداد طلبات زد فقط عندما يرتبط الحساب بزد أو توجد حالات فعلية. | client/src/pages/merchant/Orders.tsx |
| تشخيص واتساب | `/merchant/whatsapp-test` | أداة متقدمة؛ لا تظهر مفاتيح المزود كمسار إعداد يومي للتاجر. | client/src/pages/merchant/WhatsAppTest.tsx |
| دليل QR القديم | `/merchant/greenapi-setup` | إبقاؤه كمرجع للقناة القديمة ضمن معالج القناة، لا مسارًا موازيًا أساسيًا. | client/src/pages/merchant/GreenAPISetupGuide.tsx |
| تجربة المساعد | `/merchant/test-sari` | توحيد مع ساحة التجربة؛ إظهار مصدر المعرفة وحدود التجربة قبل الإرسال. | client/src/pages/merchant/TestSari.tsx |
| مقاييس المساعد | `/merchant/metrics-dashboard`<br>`/merchant/try-sari-analytics` | تحديد مصدر المقاييس والحد الأدنى للعينة؛ منع المقارنات على بيانات مفقودة. | client/src/pages/merchant/MetricsDashboard.tsx |
| تشخيص Webhook | `/merchant/whatsapp-webhook-setup` | إزالة مؤشرات جاهز ونشط ومفعل الثابتة في بيئة لا تملك قناة. | client/src/pages/merchant/WhatsAppWebhookSetup.tsx |
| سلوك المساعد | `/merchant/bot-settings` | تقليل طول الصفحة؛ تبويبات للسلوك والدوام والتحويل مع حفظ وحالة تغييرات واضحة. | client/src/pages/merchant/BotSettings.tsx |
| التدخل البشري | `/merchant/human-takeover` | ربط القائمة بالمحادثات مباشرة مع مدة الإيقاف ومالك المحادثة. | client/src/pages/merchant/HumanTakeoverSettings.tsx |
| شخصيات المساعد | `/merchant/virtual-team` | تحديد حدود الأدوار وأولوية التحويل؛ عدم خلطه بأعضاء الفريق الحقيقيين. | client/src/pages/merchant/VirtualTeamPage.tsx |
| معرفة المساعد | `/merchant/sari-brain` | تقسيم الصفحة الكبيرة إلى مصادر ومراجعات وقواعد؛ فصل إعادة الضبط في منطقة مستقلة. | client/src/pages/merchant/SariBrain.tsx |
| ساحة التجربة | `/merchant/sari-playground` | تصحيح النصوص المنزاحة وإزالة نشط ومتصل الثابتة؛ دمجها مع التجربة الأساسية. | client/src/pages/SariPlayground.tsx |
| عروض الأسعار | `/merchant/sales-hub` | استخدام اسم عروض الأسعار؛ معاينة قبل الإرسال وسياق العميل وحالة العرض. | client/src/pages/merchant/SalesHub.tsx |
| فرص البيع | `/merchant/sales-pipeline` | ربط الحالات بالفرص والمحادثات؛ عرض خطأ الاستعلام بدل العدادات الصفرية. | client/src/pages/merchant/SalesPipeline.tsx |
| مصادر العملاء | `/merchant/acquisition-report` | إزالة تعليق @ts-ignore الظاهر فعليًا وإضافة وصف الإسناد. | client/src/pages/merchant/AcquisitionReport.tsx |
| قوالب عروض الأسعار | `/merchant/quotation-templates` | معاينة الجوال وPDF؛ تمييز مسودة القالب من النسخة المعتمدة. | client/src/pages/merchant/QuotationTemplates.tsx |
| مكتبة الوسائط | `/merchant/media-library` | الحصة والفراغ واضحان؛ إظهار التقدم والفشل لكل ملف ومرجع استخدامه. | client/src/pages/merchant/MediaLibrary.tsx |
| الرسائل المجدولة | `/merchant/scheduled-messages` | بيان التوقيت والجمهور والموافقة وإمكانية إيقاف الجدولة. | client/src/pages/merchant/ScheduledMessages.tsx |
| الردود السريعة | `/merchant/quick-responses` | إتاحتها داخل المحادثة مع البحث والمعاينة، إضافة إلى الإدارة. | client/src/pages/merchant/QuickResponses.tsx |
| الرؤى والاقتراحات وA/B | `/merchant/insights`<br>`/merchant/ai-suggestions`<br>`/merchant/ab-tests` | تصدير CSV غير منفذ؛ فتح تبويب A/B عند دخول مساره؛ انتظار نجاح التحديث. | client/src/pages/merchant/InsightsDashboard.tsx |
| مقاييس الأداء | `/merchant/performance-metrics` | إصلاح merchantId=0 القادم من مسار لا يحوي هذا المعرف، وإظهار الرفض كخطأ. | client/src/pages/merchant/PerformanceMetrics.tsx |
| مزامنة Google Sheets | `/merchant/data-sync` | إجراء ربط قبل مزامنة الآن؛ بيان عدم التفعيل بدل تعليمات تبدو كحالة تشغيل. | client/src/pages/merchant/DataSync.tsx |
| تقييمات المنتجات | `/merchant/reviews` | توحيد التقييمات مع تقييمات الخدمات مع مرشح النوع وحالات الرد والخطأ. | client/src/pages/merchant/Reviews.tsx |
| تقييمات الحجوزات | `/merchant/booking-reviews` | دمج قائمة الردود ضمن مركز العملاء مع تمييز الخدمة. | client/src/pages/merchant/BookingReviews.tsx |
| إشعارات الطلبات | `/merchant/order-notifications` | معاينة المتغيرات والرسالة قبل التفعيل؛ دمجها ضمن مركز الأتمتة. | client/src/pages/merchant/OrderNotificationsSettings.tsx |
| الحساب والمتجر | `/merchant/settings` | فصل الحساب والمتجر والمعرفة؛ عدم تكرار رفع ملف المعرفة في مكانين. | client/src/pages/merchant/Settings.tsx |
| الخصوصية | `/merchant/privacy-center` | حافظ على وضوح نطاق التصدير وخطوات طلب الحقوق؛ اختبار النتائج دون حذف حقيقي. | client/src/pages/merchant/PrivacyCenter.tsx |
| الإشعارات | `/merchant/notifications` | تجميع حسب الحاجة للإجراء وربط كل تنبيه بوجهته؛ توحيد المنطقة الزمنية. | client/src/pages/merchant/NotificationsPage.tsx |
| لغة المساعد | `/merchant/language-settings` | تسمية لغة ردود المساعد بوضوح وفصلها عن لغة الواجهة والعملة. | client/src/pages/merchant/LanguageSettings.tsx |
| ربط Google Calendar | `/merchant/calendar/settings` | عنوان الصفحة الحالي تحذير فصل؛ إعادة تعيين النصوص بالكامل. | client/src/pages/CalendarSettings.tsx |
| التقويم | `/merchant/calendar` | حالة عدم الربط مفهومة؛ عرض حجوزات ساري مستقلة عن ربط تقويم خارجي إن أمكن. | client/src/pages/CalendarPage.tsx |
| مقدمو الخدمات | `/merchant/staff` | فصل مقدمي الخدمات عن أعضاء صلاحيات اللوحة؛ ربط الخدمة والتوفر. | client/src/pages/StaffManagement.tsx |
| الفريق والصلاحيات | `/merchant/team` | المهام والصلاحيات مفهومة؛ إظهار المالك الحالي بدل إحصاء مالكين صفر. | client/src/pages/merchant/TeamManagement.tsx |
| الخدمات | `/merchant/services` | إنشاء خدمة وحفظها نجح؛ بطاقة موجزة وسعر ومدة واضحان. | client/src/pages/merchant/ServicesManagement.tsx |
| إضافة وتعديل خدمة | `/merchant/services/new`<br>`/merchant/services/:id/edit` | النصوص الجديدة جيدة؛ يجب رفض تعديل معرف غير موجود بدل نموذج فارغ. | client/src/pages/merchant/ServiceForm.tsx |
| تفاصيل الخدمة | `/merchant/services/:id` | حالة غير موجودة مع عودة جيدة؛ ربط الحجز ومقدمي الخدمة في مكان واحد. | client/src/pages/ServiceDetails.tsx |
| الحجوزات | `/merchant/bookings` | وضع يوم وأسبوع وقائمة؛ تثبيت حالة الحجز وتوقيته والمنطقة الزمنية. | client/src/pages/BookingsManagement.tsx |
| تصنيفات الخدمات | `/merchant/service-categories` | إدارة ضمن الكتالوج؛ حالة الفراغ والإضافة واضحتان. | client/src/pages/merchant/ServiceCategories.tsx |
| حزم الخدمات | `/merchant/service-packages` | معاينة القيمة والتوفير والخدمات المضمنة قبل الحفظ. | client/src/pages/merchant/ServicePackages.tsx |
| ربط Google Sheets | `/merchant/sheets/settings` | نجح الإعداد وفشل الإعداد عناوين ثابتة خاطئة؛ تصحيح النصوص. | client/src/pages/SheetsSettings.tsx |
| تصدير المحادثات | `/merchant/sheets/export` | حالات خطأ وفراغ جيدة؛ توضيح نطاق تحديد الكل وإتاحة التصدير لما بعد 100. | client/src/pages/SheetsExport.tsx |
| تقارير Google Sheets | `/merchant/sheets/reports` | عناوين نجاح ثابتة؛ عرض توليد/جدولة حقيقي وحالة آخر تشغيل. | client/src/pages/SheetsReports.tsx |
| مخزون Google Sheets | `/merchant/sheets/inventory` | تصحيح العناوين؛ معاينة الفرق قبل استبدال المخزون. | client/src/pages/SheetsInventory.tsx |
| المدفوعات | `/merchant/payments`<br>`/merchant/merchant-payments` | توحيد المسارين المتكررين وعنوان h1؛ فصل مدفوعات العملاء عن فواتير ساري. | client/src/pages/merchant/Payments.tsx |
| تفاصيل معاملة | `/merchant/payments/:id` | غير موجودة مع رجوع جيد؛ إضافة حالة تحقق غير مؤكدة بدلاً من الجزم. | client/src/pages/PaymentDetails.tsx |
| روابط الدفع | `/merchant/payment-links` | نسخ الرابط بعد نجاح clipboard فقط؛ ملخص العميل والمبلغ والصلاحية. | client/src/pages/merchant/PaymentLinks.tsx |
| بوابة دفع العملاء | `/merchant/payment-settings` | إعداد منفصل عن اشتراك ساري؛ فحص الاتصال وحالة المتطلبات بوضوح. | client/src/pages/merchant/PaymentSettings.tsx |
| إعدادات الولاء | `/merchant/loyalty/settings` | إعادة بناء النصوص؛ العناوين والحقول تستدعي رسائل نجاح وفشل غير مناسبة. | client/src/pages/LoyaltySettings.tsx |
| مستويات الولاء | `/merchant/loyalty/tiers` | تصحيح النصوص وعرض قواعد الترقية والمزايا بجدول مقارن. | client/src/pages/LoyaltyTiers.tsx |
| مكافآت الولاء | `/merchant/loyalty/rewards` | تصحيح النصوص؛ توضيح الرصيد والتكلفة والتوفر قبل الاستبدال. | client/src/pages/LoyaltyRewards.tsx |
| عملاء الولاء | `/merchant/loyalty/customers` | تصحيح رؤوس الجدول والعدادات؛ سجل سبب تعديل النقاط. | client/src/pages/LoyaltyCustomers.tsx |
| صحة التكاملات | `/merchant/integrations-dashboard` | إعادة تعيين النصوص؛ عدم عرض نسبة نجاح 100% عندما لا توجد عمليات. | client/src/pages/IntegrationsDashboard.tsx |
| التكاملات | `/merchant/platform-integrations` | بطاقات مصدر وحالة ووقت آخر نجاح وإجراء واحد لكل بطاقة. | client/src/pages/PlatformIntegrations.tsx |
| تفضيلات الإشعارات | `/merchant/notification-settings` | توحيدها مع إشعارات المتصفح والطلبات مع الفصل بين المستلم والعميل. | client/src/pages/NotificationSettings.tsx |
| عملة المتجر | `/merchant/currency-settings` | القيم المعروضة والعناوين منزاحة؛ فصل تغيير وحدة العرض عن تحويل المبالغ. | client/src/pages/CurrencySettings.tsx |
| إشعارات المتصفح | `/merchant/push-notifications` | طلب الإذن بعد فعل واضح؛ اختصار التفاصيل التقنية ضمن تشخيص. | client/src/pages/merchant/PushNotificationsSettings.tsx |
| التقارير المجدولة | `/merchant/scheduled-reports` | عنوان حذف التقرير وأزرار تحقق خاطئة؛ أسماء صحيحة وحذف مع تأكيد. | client/src/pages/ScheduledReports.tsx |
| أتمتة رسائل العملاء | `/merchant/whatsapp-auto-notifications` | العنوان إلغاء الطلب غير صحيح؛ معاينة لكل حدث وحذف محمي ومسمى. | client/src/pages/WhatsAppAutoNotifications.tsx |
| التقارير | `/merchant/reports` | مراجعة أسماء الفلاتر والتبويبات وربط كل تصدير بفترته ومرشحه. | client/src/pages/Reports.tsx |
| الباقة والفواتير | `/merchant/subscriptions`<br>`/merchant/subscription`<br>`/merchant/my-subscription` | ثلاثة مسارات لنفس الصفحة؛ اعتماد واحد مع تحويل البقية والمحافظة على العودة. | client/src/pages/merchant/MySubscription.tsx |
| استهلاك الرسائل | `/merchant/usage` | دمجها مع الاستخدام الموحد وتوضيح مصدر العدادات ودورة إعادة التعيين. | client/src/pages/merchant/Usage.tsx |
| حدود الاستخدام | `/merchant/usage-dashboard` | حالات الاستعادة جيدة؛ توحيد الحدود وتعريف العملاء مقابل المحادثات. | client/src/pages/merchant/UsageDashboard.tsx |
| الباقات | `/merchant/subscription/plans` | احتساب التوفير السنوي من الأسعار الفعلية بدل نسبة ثابتة؛ تمييز الباقة الحالية. | client/src/pages/merchant/SubscriptionPlans.tsx |
| مقارنة الباقات | `/merchant/subscription/compare` | نصوص دلالية وحدود فعلية جيدة؛ عرض مناسب للجوال دون ازدحام. | client/src/pages/ComparePlans.tsx |
| بدء الاشتراك المدفوع | `/merchant/checkout` | إصلاح روابط الشروط والخصوصية # وإضافة عودة عندما تكون الباقة غير موجودة. | client/src/pages/merchant/Checkout.tsx |
| نتيجة دفع الاشتراك | `/merchant/payment/success` | قراءة search الصحيحة؛ المرجع المرسل يظهر #0 حاليًا في هذا المسار القديم. | client/src/pages/merchant/PaymentSuccess.tsx |
| إلغاء دفع الاشتراك | `/merchant/payment/cancel` | لا تجزم بعدم الخصم دون تحقق؛ الاحتفاظ بخيار الباقة عند إعادة المحاولة. | client/src/pages/merchant/PaymentCancel.tsx |
| العملاء | `/merchant/customers` | عنوان تم إضافة الملاحظة ثابت وخاطئ؛ تصحيح النصوص وتجميع سجل العميل. | client/src/pages/Customers.tsx |
| تحليل الموقع | `/merchant/smart-analysis` | معالج اكتشاف ثم معاينة ثم استيراد إلى المعرفة؛ حالة تقدم موثوقة. | client/src/pages/SmartAnalysis.tsx |
| تحليل المنافسين | `/merchant/competitor-analysis` | ميزة متقدمة ضمن الرؤى؛ بيان آخر تحليل ومصدر المقارنة. | client/src/pages/CompetitorAnalysis.tsx |
| ملف العميل | `/merchant/customers/:phone` | أسماء مؤشرات الحالة خاطئة؛ سجل موحد للمحادثات والطلبات والتقييمات. | client/src/pages/CustomerDetails.tsx |

### التحويلات الستة

- /merchant/chat-orders → /merchant/orders
- /merchant/whatsapp-setup → /merchant/whatsapp
- /merchant/sari-personality → /merchant/bot-settings
- /merchant/website-analysis → /merchant/smart-analysis
- /merchant/keywords → /merchant/smart-analysis
- /merchant/weekly-reports → /merchant/reports
