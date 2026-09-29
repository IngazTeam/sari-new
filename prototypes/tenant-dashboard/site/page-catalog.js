window.TENANT_PAGES = [
  {
    "route": "/merchant/setup-wizard",
    "title": "الإعداد الأولي",
    "group": "settings",
    "file": "client/src/pages/SetupWizard.tsx",
    "note": "اختصار رحلة الإعداد إلى النشاط والمعرفة والقناة والتجربة؛ إبقاء التقدم قابلًا للاستكمال.",
    "kind": "setup",
    "action": "متابعة",
    "labels": [
      "اسم النشاط",
      "نوع النشاط",
      "رقم التواصل"
    ],
    "sample": "متجر نواة"
  },
  {
    "route": "/merchant",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/dashboard",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "overview",
    "action": "راجع مهام اليوم",
    "labels": [
      "المهمة",
      "الأولوية",
      "المسؤول",
      "الحالة"
    ],
    "sample": "محادثة تحتاج ردًا"
  },
  {
    "route": "/merchant/",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/dashboard",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "overview",
    "action": "راجع مهام اليوم",
    "labels": [
      "المهمة",
      "الأولوية",
      "المسؤول",
      "الحالة"
    ],
    "sample": "محادثة تحتاج ردًا"
  },
  {
    "route": "/merchant/dashboard",
    "title": "نظرة عامة",
    "group": "overview",
    "file": "client/src/pages/merchant/Dashboard.tsx",
    "note": "تقديم مهام اليوم وملخص الأداء على تفاصيل تعلم المخ والمزامنة؛ توحيد حالة التشغيل.",
    "kind": "overview",
    "action": "راجع مهام اليوم",
    "labels": [
      "المهمة",
      "الأولوية",
      "المسؤول",
      "الحالة"
    ],
    "sample": "محادثة تحتاج ردًا"
  },
  {
    "route": "/merchant/ai-hub",
    "title": "مركز المساعد",
    "group": "ai",
    "file": "client/src/pages/merchant/AIWhatsAppHub.tsx",
    "note": "توحيد المعرفة والسلوك والتجربة والتشغيل؛ تصحيح وجهتي الكلمات المفتاحية والصوت.",
    "kind": "hub",
    "action": "جرّب ساري",
    "labels": [
      "المعرفة",
      "أسلوب الرد",
      "قناة واتساب",
      "التجربة"
    ],
    "sample": "المساعد الذكي"
  },
  {
    "route": "/merchant/analytics-hub",
    "title": "مركز التحليلات",
    "group": "analytics",
    "file": "client/src/pages/merchant/AnalyticsHub.tsx",
    "note": "استخدام تبويبات واضحة لتعريفات المؤشرات بدل بطاقات متشابهة.",
    "kind": "hub",
    "action": "افتح تقرير المبيعات",
    "labels": [
      "المبيعات",
      "المحادثات",
      "العملاء",
      "الحملات"
    ],
    "sample": "تقارير النشاط"
  },
  {
    "route": "/merchant/campaigns",
    "title": "الحملات",
    "group": "marketing",
    "file": "client/src/pages/merchant/Campaigns.tsx",
    "note": "إصلاح تعديل المسودة المكسور وتصحيح نص تأكيد الإرسال.",
    "kind": "list",
    "action": "حملة جديدة",
    "labels": [
      "الحملة",
      "الجمهور",
      "موعد الإرسال",
      "الحالة"
    ],
    "sample": "عرض نهاية الأسبوع"
  },
  {
    "route": "/merchant/campaigns/new",
    "title": "إنشاء حملة",
    "group": "marketing",
    "file": "client/src/pages/merchant/NewCampaign.tsx",
    "note": "خطوات جمهور ثم رسالة ثم مراجعة؛ بيان الموافقة وعدد المستلمين والتوقيت قبل الجدولة.",
    "kind": "compose",
    "action": "حفظ المسودة",
    "labels": [
      "اسم الحملة",
      "الجمهور",
      "محتوى الرسالة",
      "موعد الإرسال"
    ],
    "sample": "عرض نهاية الأسبوع"
  },
  {
    "route": "/merchant/campaigns/:id/edit",
    "title": "إنشاء حملة",
    "group": "marketing",
    "file": "client/src/pages/merchant/NewCampaign.tsx",
    "note": "خطوات جمهور ثم رسالة ثم مراجعة؛ بيان الموافقة وعدد المستلمين والتوقيت قبل الجدولة.",
    "kind": "compose",
    "action": "حفظ المسودة",
    "labels": [
      "اسم الحملة",
      "الجمهور",
      "محتوى الرسالة",
      "موعد الإرسال"
    ],
    "sample": "عرض نهاية الأسبوع"
  },
  {
    "route": "/merchant/campaigns/:id",
    "title": "تفاصيل الحملة",
    "group": "marketing",
    "file": "client/src/pages/merchant/CampaignDetails.tsx",
    "note": "إظهار سياق الحملة وإجراء متابعة؛ توضيح قبول المزود مقابل التسليم.",
    "kind": "detail",
    "action": "تعديل المسودة",
    "labels": [
      "اسم الحملة",
      "الجمهور",
      "الموافقة",
      "الحالة"
    ],
    "sample": "عرض نهاية الأسبوع"
  },
  {
    "route": "/merchant/campaigns/:id/report",
    "title": "تقرير الحملة",
    "group": "analytics",
    "file": "client/src/pages/merchant/CampaignReport.tsx",
    "note": "تصحيح عنوان نجاح الإرسال ليوافق معنى الحالة؛ تمييز الخطأ عن حملة غير موجودة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المستلمون",
      "قبله المزود",
      "تم التسليم",
      "تعذّر التسليم"
    ],
    "sample": "نتائج الحملة"
  },
  {
    "route": "/merchant/products",
    "title": "المنتجات",
    "group": "catalog",
    "file": "client/src/pages/merchant/Products.tsx",
    "note": "توضيح الفرق بين النشط والمتوفر بالمخزون؛ إظهار مصدر المنتج وحالة مزامنته.",
    "kind": "list",
    "action": "إضافة منتج",
    "labels": [
      "المنتج",
      "السعر",
      "المخزون",
      "المصدر"
    ],
    "sample": "بن كولومبيا"
  },
  {
    "route": "/merchant/products/upload",
    "title": "استيراد المنتجات",
    "group": "catalog",
    "file": "client/src/pages/merchant/UploadProducts.tsx",
    "note": "معاينة الأعمدة والأخطاء والتكرارات قبل الاعتماد مع ملخص بعد الاستيراد.",
    "kind": "import",
    "action": "معاينة الاستيراد",
    "labels": [
      "اسم المنتج",
      "رمز المنتج",
      "السعر",
      "المخزون"
    ],
    "sample": "بن كولومبيا"
  },
  {
    "route": "/merchant/conversations",
    "title": "المحادثات",
    "group": "inbox",
    "file": "client/src/pages/merchant/Conversations.tsx",
    "note": "إصلاح حد 50 والبحث؛ جعل الجوال قائمة ثم محادثة؛ نقل العدادات إلى ملخص مضغوط.",
    "kind": "inbox",
    "action": "محادثة جديدة",
    "labels": [
      "العميل",
      "آخر رسالة",
      "المسؤول",
      "الحالة"
    ],
    "sample": "نورة · سؤال عن طلب"
  },
  {
    "route": "/merchant/whatsapp",
    "title": "أرقام واتساب",
    "group": "settings",
    "file": "client/src/pages/merchant/WhatsAppInstancesPage.tsx",
    "note": "معالج ربط واحد يوضح Meta وQR وحالة كل خطوة دون ادعاء نشاط غير مؤكد.",
    "kind": "integration",
    "action": "ربط رقم واتساب",
    "labels": [
      "القناة",
      "الرقم",
      "حالة الاتصال",
      "آخر تحقق"
    ],
    "sample": "واتساب المتجر"
  },
  {
    "route": "/merchant/salla",
    "title": "ربط سلة",
    "group": "settings",
    "file": "client/src/pages/SallaIntegration.tsx",
    "note": "إعادة بناء النصوص الدلالية للعناوين والحقول والتنبيهات؛ عنوان الصفحة الحالي رسالة تحقق.",
    "kind": "integration",
    "action": "ربط متجر سلة",
    "labels": [
      "المتجر",
      "المنتجات",
      "الطلبات",
      "آخر مزامنة"
    ],
    "sample": "متجر سلة"
  },
  {
    "route": "/merchant/integrations/byaan",
    "title": "ربط بيان",
    "group": "settings",
    "file": "client/src/pages/merchant/ByaanIntegration.tsx",
    "note": "إيضاح مصدر الحقيقة وما يُدار من بيان مع وقت آخر مزامنة وإجراء معالجة.",
    "kind": "integration",
    "action": "ربط بيان",
    "labels": [
      "الأكاديمية",
      "الدورات",
      "المتدربون",
      "آخر مزامنة"
    ],
    "sample": "أكاديمية نواة"
  },
  {
    "route": "/merchant/byaan-dashboard",
    "title": "بيان: الدورات والمتدربون",
    "group": "settings",
    "file": "client/src/pages/ByaanDashboard.tsx",
    "note": "الحالة غير المرتبطة توفر رابطًا واضحًا؛ اختبار المزامنة يحتاج بيئة بيان تجريبية.",
    "kind": "list",
    "action": "مراجعة المزامنة",
    "labels": [
      "الدورة",
      "المتدربون",
      "المقاعد",
      "المصدر"
    ],
    "sample": "أساسيات التسويق"
  },
  {
    "route": "/merchant/integrations/zid",
    "title": "ربط زد",
    "group": "settings",
    "file": "client/src/pages/merchant/ZidIntegration.tsx",
    "note": "الربط عبر OAuth واضح؛ إضافة ملخص متطلبات وسجل محاولات مفهوم.",
    "kind": "integration",
    "action": "ربط متجر زد",
    "labels": [
      "المتجر",
      "المنتجات",
      "الطلبات",
      "آخر مزامنة"
    ],
    "sample": "متجر زد"
  },
  {
    "route": "/merchant/zid/settings",
    "title": "ربط زد",
    "group": "settings",
    "file": "client/src/pages/merchant/ZidIntegration.tsx",
    "note": "الربط عبر OAuth واضح؛ إضافة ملخص متطلبات وسجل محاولات مفهوم.",
    "kind": "integration",
    "action": "ربط متجر زد",
    "labels": [
      "المتجر",
      "المنتجات",
      "الطلبات",
      "آخر مزامنة"
    ],
    "sample": "متجر زد"
  },
  {
    "route": "/merchant/zid/callback",
    "title": "نتيجة تفويض زد",
    "group": "settings",
    "file": "client/src/pages/ZidCallback.tsx",
    "note": "حالة التفويض الناقص مفهومة؛ الحفاظ على مسار عودة مباشر.",
    "kind": "result",
    "action": "العودة إلى التكاملات",
    "labels": [
      "المتجر",
      "حالة التفويض",
      "وقت التحقق"
    ],
    "sample": "نتيجة الربط"
  },
  {
    "route": "/merchant/zid/products",
    "title": "منتجات زد",
    "group": "catalog",
    "file": "client/src/pages/ZidProducts.tsx",
    "note": "حالة عدم الربط واضحة؛ توحيدها ضمن المنتجات مع مرشح المصدر.",
    "kind": "list",
    "action": "مزامنة المنتجات",
    "labels": [
      "المنتج",
      "السعر",
      "المخزون",
      "آخر مزامنة"
    ],
    "sample": "بن كولومبيا"
  },
  {
    "route": "/merchant/zid/sync-logs",
    "title": "سجل مزامنة زد",
    "group": "settings",
    "file": "client/src/pages/ZidSyncLogs.tsx",
    "note": "توضيح نوع الفشل والإجراء ووقت آخر نجاح؛ ترقيم بدل حد ثابت.",
    "kind": "list",
    "action": "تحديث السجل",
    "labels": [
      "العملية",
      "وقت البدء",
      "السجلات",
      "النتيجة"
    ],
    "sample": "مزامنة الكتالوج"
  },
  {
    "route": "/merchant/woocommerce/settings",
    "title": "ربط WooCommerce",
    "group": "settings",
    "file": "client/src/pages/merchant/WooCommerceSettings.tsx",
    "note": "تقليل المصطلحات في المسار الأساسي وإخفاء تفاصيل Webhook ضمن إعدادات متقدمة.",
    "kind": "integration",
    "action": "ربط المتجر",
    "labels": [
      "رابط المتجر",
      "حالة الاتصال",
      "المزامنة",
      "آخر تحقق"
    ],
    "sample": "WooCommerce"
  },
  {
    "route": "/merchant/woocommerce/products",
    "title": "منتجات WooCommerce",
    "group": "catalog",
    "file": "client/src/pages/WooCommerceProducts.tsx",
    "note": "العنوان والعدادات غير متوافقة مع المقصود؛ إعادة تعيين النصوص.",
    "kind": "list",
    "action": "مزامنة المنتجات",
    "labels": [
      "المنتج",
      "السعر",
      "المخزون",
      "آخر مزامنة"
    ],
    "sample": "بن كولومبيا"
  },
  {
    "route": "/merchant/woocommerce/orders",
    "title": "طلبات WooCommerce",
    "group": "sales",
    "file": "client/src/pages/WooCommerceOrders.tsx",
    "note": "العناوين تعرض رسائل نجاح وفشل ثابتة؛ توحيد النصوص والبحث عبر النتائج.",
    "kind": "list",
    "action": "تحديث الطلبات",
    "labels": [
      "الطلب",
      "العميل",
      "القيمة",
      "الحالة"
    ],
    "sample": "طلب متجر #1048"
  },
  {
    "route": "/merchant/woocommerce/analytics",
    "title": "تحليلات WooCommerce",
    "group": "analytics",
    "file": "client/src/pages/merchant/WooCommerceAnalytics.tsx",
    "note": "تعريف الإيراد المكتمل وعدم ادعاء تحويل غير موثوق نقطتان جيدتان؛ دمج مرشح المصدر.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/integrations/calendly",
    "title": "ربط Calendly",
    "group": "settings",
    "file": "client/src/pages/merchant/CalendlyIntegration.tsx",
    "note": "معالج اتصال واختبار واضح؛ تحويل خطوات الرمز إلى شرح مختصر ومرجع متقدم.",
    "kind": "integration",
    "action": "ربط Calendly",
    "labels": [
      "الحساب",
      "نوع الموعد",
      "التذكيرات",
      "آخر مزامنة"
    ],
    "sample": "مواعيد نواة"
  },
  {
    "route": "/merchant/chat-orders",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/orders",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "list",
    "action": "فتح تفاصيل الطلب",
    "labels": [
      "الطلب",
      "العميل",
      "القيمة",
      "الحالة"
    ],
    "sample": "طلب #1048"
  },
  {
    "route": "/merchant/discounts",
    "title": "كوبونات الخصم",
    "group": "marketing",
    "file": "client/src/pages/DiscountCodes.tsx",
    "note": "نصوص دلالية وحالات خطأ وفراغ جيدة؛ معاينة أثر الخصم قبل الحفظ.",
    "kind": "list",
    "action": "كوبون جديد",
    "labels": [
      "الكوبون",
      "قيمة الخصم",
      "مرات الاستخدام",
      "الصلاحية"
    ],
    "sample": "WELCOME10"
  },
  {
    "route": "/merchant/referrals",
    "title": "إحالات التجار",
    "group": "settings",
    "file": "client/src/pages/merchant/Referrals.tsx",
    "note": "فصل إحالة تاجر جديد عن ولاء عملاء المتجر؛ توضيح شروط اكتساب المكافأة.",
    "kind": "list",
    "action": "نسخ رابط الدعوة",
    "labels": [
      "التاجر",
      "تاريخ الدعوة",
      "المكافأة",
      "الحالة"
    ],
    "sample": "دعوة نواة"
  },
  {
    "route": "/merchant/abandoned-carts",
    "title": "السلات المتروكة",
    "group": "marketing",
    "file": "client/src/pages/merchant/AbandonedCartsPage.tsx",
    "note": "تصحيح رسالة نجاح الاستعادة؛ توضيح مصدر السلة وشروط إرسال التذكير.",
    "kind": "list",
    "action": "مراجعة المتابعة",
    "labels": [
      "العميل",
      "قيمة السلة",
      "آخر نشاط",
      "المتابعة"
    ],
    "sample": "سلة نورة"
  },
  {
    "route": "/merchant/occasion-campaigns",
    "title": "حملات المناسبات",
    "group": "marketing",
    "file": "client/src/pages/merchant/OccasionCampaignsPage.tsx",
    "note": "التفعيل الصريح جيد؛ تصحيح رسالة نجاح التبديل وعرض موعد المنطقة الزمنية.",
    "kind": "list",
    "action": "تجهيز حملة مناسبة",
    "labels": [
      "المناسبة",
      "الجمهور",
      "التاريخ",
      "الحالة"
    ],
    "sample": "اليوم الوطني"
  },
  {
    "route": "/merchant/promotions",
    "title": "العروض الترويجية",
    "group": "marketing",
    "file": "client/src/pages/merchant/Promotions.tsx",
    "note": "تمييز العرض المقترح للمساعد عن كوبون الخصم والحملة المرسلة.",
    "kind": "list",
    "action": "عرض جديد",
    "labels": [
      "العرض",
      "المنتجات",
      "الخصم",
      "الفترة"
    ],
    "sample": "باقة القهوة"
  },
  {
    "route": "/merchant/analytics",
    "title": "تحليلات المبيعات",
    "group": "analytics",
    "file": "client/src/pages/merchant/AnalyticsDashboard.tsx",
    "note": "منع عرض أصفار قبل التحميل أو عند فشل الاستعلامات؛ تعريف كل مؤشر.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/message-analytics",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المحادثات",
      "الرسائل",
      "تحويل للفريق",
      "زمن الرد"
    ],
    "sample": "أداء المحادثات"
  },
  {
    "route": "/merchant/overview-analytics",
    "title": "نظرة الأداء",
    "group": "analytics",
    "file": "client/src/pages/merchant/OverviewAnalytics.tsx",
    "note": "عدم وصف 0 من 0 بأنه أداء ضعيف؛ استخدام لا توجد بيانات كافية.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/orders",
    "title": "الطلبات",
    "group": "sales",
    "file": "client/src/pages/merchant/Orders.tsx",
    "note": "عرض تحذير استرداد طلبات زد فقط عندما يرتبط الحساب بزد أو توجد حالات فعلية.",
    "kind": "list",
    "action": "فتح تفاصيل الطلب",
    "labels": [
      "الطلب",
      "العميل",
      "القيمة",
      "الحالة"
    ],
    "sample": "طلب #1048"
  },
  {
    "route": "/merchant/whatsapp-instances",
    "title": "أرقام واتساب",
    "group": "settings",
    "file": "client/src/pages/merchant/WhatsAppInstancesPage.tsx",
    "note": "معالج ربط واحد يوضح Meta وQR وحالة كل خطوة دون ادعاء نشاط غير مؤكد.",
    "kind": "integration",
    "action": "ربط رقم واتساب",
    "labels": [
      "القناة",
      "الرقم",
      "حالة الاتصال",
      "آخر تحقق"
    ],
    "sample": "واتساب المتجر"
  },
  {
    "route": "/merchant/whatsapp-setup",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/whatsapp",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "integration",
    "action": "ربط رقم واتساب",
    "labels": [
      "القناة",
      "الرقم",
      "حالة الاتصال",
      "آخر تحقق"
    ],
    "sample": "واتساب المتجر"
  },
  {
    "route": "/merchant/whatsapp-test",
    "title": "تشخيص واتساب",
    "group": "settings",
    "file": "client/src/pages/merchant/WhatsAppTest.tsx",
    "note": "أداة متقدمة؛ لا تظهر مفاتيح المزود كمسار إعداد يومي للتاجر.",
    "kind": "form",
    "action": "معاينة الاختبار",
    "labels": [
      "رقم الاختبار",
      "نوع الرسالة",
      "محتوى الرسالة"
    ],
    "sample": "اختبار قناة المتجر"
  },
  {
    "route": "/merchant/greenapi-setup",
    "title": "دليل QR القديم",
    "group": "settings",
    "file": "client/src/pages/merchant/GreenAPISetupGuide.tsx",
    "note": "إبقاؤه كمرجع للقناة القديمة ضمن معالج القناة، لا مسارًا موازيًا أساسيًا.",
    "kind": "guide",
    "action": "الانتقال إلى ربط واتساب",
    "labels": [
      "اختيار القناة",
      "تفويض الربط",
      "التحقق",
      "تجربة الاستقبال"
    ],
    "sample": "إعداد واتساب"
  },
  {
    "route": "/merchant/test-sari",
    "title": "تجربة المساعد",
    "group": "ai",
    "file": "client/src/pages/merchant/TestSari.tsx",
    "note": "توحيد مع ساحة التجربة؛ إظهار مصدر المعرفة وحدود التجربة قبل الإرسال.",
    "kind": "assistant",
    "action": "اختبر الإجابة",
    "labels": [
      "سؤال العميل",
      "الإجابة",
      "المصدر",
      "التقييم"
    ],
    "sample": "كم سعر بن كولومبيا؟"
  },
  {
    "route": "/merchant/metrics-dashboard",
    "title": "مقاييس المساعد",
    "group": "analytics",
    "file": "client/src/pages/merchant/MetricsDashboard.tsx",
    "note": "تحديد مصدر المقاييس والحد الأدنى للعينة؛ منع المقارنات على بيانات مفقودة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "الإجابات",
      "مصادر موثوقة",
      "تحويل للفريق",
      "التقييم"
    ],
    "sample": "جودة المساعد"
  },
  {
    "route": "/merchant/whatsapp-webhook-setup",
    "title": "تشخيص Webhook",
    "group": "settings",
    "file": "client/src/pages/merchant/WhatsAppWebhookSetup.tsx",
    "note": "إزالة مؤشرات جاهز ونشط ومفعل الثابتة في بيئة لا تملك قناة.",
    "kind": "guide",
    "action": "الانتقال إلى ربط واتساب",
    "labels": [
      "اختيار القناة",
      "تفويض الربط",
      "التحقق",
      "تجربة الاستقبال"
    ],
    "sample": "إعداد واتساب"
  },
  {
    "route": "/merchant/bot-settings",
    "title": "سلوك المساعد",
    "group": "ai",
    "file": "client/src/pages/merchant/BotSettings.tsx",
    "note": "تقليل طول الصفحة؛ تبويبات للسلوك والدوام والتحويل مع حفظ وحالة تغييرات واضحة.",
    "kind": "form",
    "action": "حفظ الإعدادات",
    "labels": [
      "أسلوب الرد",
      "رسالة الترحيب",
      "ساعات العمل",
      "حدود المساعد"
    ],
    "sample": "ودود وواضح"
  },
  {
    "route": "/merchant/human-takeover",
    "title": "التدخل البشري",
    "group": "inbox",
    "file": "client/src/pages/merchant/HumanTakeoverSettings.tsx",
    "note": "ربط القائمة بالمحادثات مباشرة مع مدة الإيقاف ومالك المحادثة.",
    "kind": "form",
    "action": "حفظ القواعد",
    "labels": [
      "وقت انتظار الفريق",
      "عبارات التحويل",
      "خارج الدوام",
      "رسالة التحويل"
    ],
    "sample": "نحوّلك إلى أحد أعضاء الفريق"
  },
  {
    "route": "/merchant/virtual-team",
    "title": "شخصيات المساعد",
    "group": "ai",
    "file": "client/src/pages/merchant/VirtualTeamPage.tsx",
    "note": "تحديد حدود الأدوار وأولوية التحويل؛ عدم خلطه بأعضاء الفريق الحقيقيين.",
    "kind": "list",
    "action": "شخصية جديدة",
    "labels": [
      "الشخصية",
      "الدور",
      "الأسلوب",
      "الحالة"
    ],
    "sample": "مساعد المبيعات"
  },
  {
    "route": "/merchant/sari-brain",
    "title": "عقل ساري",
    "group": "ai",
    "file": "client/src/pages/merchant/SariBrain.tsx",
    "note": "تقسيم الصفحة الكبيرة إلى مصادر ومراجعات وقواعد؛ فصل إعادة الضبط في منطقة مستقلة.",
    "kind": "knowledge",
    "action": "إضافة ملف معرفة",
    "labels": [
      "النتائج",
      "ملفات المعرفة",
      "الفجوات",
      "احتراف المبيعات"
    ],
    "sample": "نتائج عقل ساري"
  },
  {
    "route": "/merchant/sari-playground",
    "title": "ساحة التجربة",
    "group": "ai",
    "file": "client/src/pages/SariPlayground.tsx",
    "note": "تصحيح النصوص المنزاحة وإزالة نشط ومتصل الثابتة؛ دمجها مع التجربة الأساسية.",
    "kind": "assistant",
    "action": "اختبر الإجابة",
    "labels": [
      "سؤال العميل",
      "الإجابة",
      "المصدر",
      "التقييم"
    ],
    "sample": "كم سعر بن كولومبيا؟"
  },
  {
    "route": "/merchant/sari-analytics",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المحادثات",
      "الرسائل",
      "تحويل للفريق",
      "زمن الرد"
    ],
    "sample": "أداء المحادثات"
  },
  {
    "route": "/merchant/sales-hub",
    "title": "عروض الأسعار",
    "group": "sales",
    "file": "client/src/pages/merchant/SalesHub.tsx",
    "note": "استخدام اسم عروض الأسعار؛ معاينة قبل الإرسال وسياق العميل وحالة العرض.",
    "kind": "list",
    "action": "عرض سعر جديد",
    "labels": [
      "العرض",
      "العميل",
      "الإجمالي",
      "الحالة"
    ],
    "sample": "عرض تجهيز مكتب"
  },
  {
    "route": "/merchant/sales-pipeline",
    "title": "فرص البيع",
    "group": "sales",
    "file": "client/src/pages/merchant/SalesPipeline.tsx",
    "note": "ربط الحالات بالفرص والمحادثات؛ عرض خطأ الاستعلام بدل العدادات الصفرية.",
    "kind": "pipeline",
    "action": "فرصة جديدة",
    "labels": [
      "الفرصة",
      "العميل",
      "القيمة",
      "المرحلة"
    ],
    "sample": "تجهيز ركن القهوة"
  },
  {
    "route": "/merchant/acquisition-report",
    "title": "مصادر العملاء",
    "group": "analytics",
    "file": "client/src/pages/merchant/AcquisitionReport.tsx",
    "note": "إزالة تعليق @ts-ignore الظاهر فعليًا وإضافة وصف الإسناد.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "الزوار",
      "العملاء الجدد",
      "المحادثات",
      "الطلبات"
    ],
    "sample": "مصادر العملاء"
  },
  {
    "route": "/merchant/quotation-templates",
    "title": "قوالب عروض الأسعار",
    "group": "sales",
    "file": "client/src/pages/merchant/QuotationTemplates.tsx",
    "note": "معاينة الجوال وPDF؛ تمييز مسودة القالب من النسخة المعتمدة.",
    "kind": "list",
    "action": "قالب جديد",
    "labels": [
      "القالب",
      "نوع العرض",
      "آخر تعديل",
      "الحالة"
    ],
    "sample": "عرض خدمات شهري"
  },
  {
    "route": "/merchant/media-library",
    "title": "مكتبة الوسائط",
    "group": "catalog",
    "file": "client/src/pages/merchant/MediaLibrary.tsx",
    "note": "الحصة والفراغ واضحان؛ إظهار التقدم والفشل لكل ملف ومرجع استخدامه.",
    "kind": "media",
    "action": "إضافة ملف",
    "labels": [
      "الملف",
      "النوع",
      "الحجم",
      "الاستخدام"
    ],
    "sample": "دليل المنتجات"
  },
  {
    "route": "/merchant/scheduled-messages",
    "title": "الرسائل المجدولة",
    "group": "marketing",
    "file": "client/src/pages/merchant/ScheduledMessages.tsx",
    "note": "بيان التوقيت والجمهور والموافقة وإمكانية إيقاف الجدولة.",
    "kind": "list",
    "action": "جدولة رسالة",
    "labels": [
      "الرسالة",
      "المستلم",
      "الموعد",
      "الحالة"
    ],
    "sample": "متابعة استفسار"
  },
  {
    "route": "/merchant/sari-personality",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/bot-settings",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "form",
    "action": "حفظ الإعدادات",
    "labels": [
      "أسلوب الرد",
      "رسالة الترحيب",
      "ساعات العمل",
      "حدود المساعد"
    ],
    "sample": "ودود وواضح"
  },
  {
    "route": "/merchant/quick-responses",
    "title": "الردود السريعة",
    "group": "inbox",
    "file": "client/src/pages/merchant/QuickResponses.tsx",
    "note": "إدارة القواعد والبحث والتصفية والترقيم، مسودة ومراجعة تعارض وحذف مراجع، ومعاينة مطابقة محلية. فهم السياق له الأولوية؛ عداد الاختيار لا يثبت التسليم أو المبيعات.",
    "kind": "list",
    "action": "رد سريع جديد",
    "labels": [
      "العبارة",
      "الرد",
      "الكلمات المفتاحية",
      "الحالة"
    ],
    "sample": "مدة التوصيل"
  },
  {
    "route": "/merchant/insights",
    "title": "الرؤى والاقتراحات وA/B",
    "group": "analytics",
    "file": "client/src/pages/merchant/InsightsDashboard.tsx",
    "note": "تصدير CSV غير منفذ؛ فتح تبويب A/B عند دخول مساره؛ انتظار نجاح التحديث.",
    "kind": "list",
    "action": "مراجعة الاقتراحات",
    "labels": [
      "الاقتراح",
      "المصدر",
      "الأثر المتوقع",
      "الحالة"
    ],
    "sample": "اختصار رسالة الترحيب"
  },
  {
    "route": "/merchant/advanced-analytics",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المحادثات",
      "الرسائل",
      "تحويل للفريق",
      "زمن الرد"
    ],
    "sample": "أداء المحادثات"
  },
  {
    "route": "/merchant/analytics-dashboard",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/performance-metrics",
    "title": "مقاييس الأداء",
    "group": "analytics",
    "file": "client/src/pages/merchant/PerformanceMetrics.tsx",
    "note": "إصلاح merchantId=0 القادم من مسار لا يحوي هذا المعرف، وإظهار الرفض كخطأ.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "الإجابات",
      "مصادر موثوقة",
      "تحويل للفريق",
      "التقييم"
    ],
    "sample": "جودة المساعد"
  },
  {
    "route": "/merchant/data-sync",
    "title": "مزامنة Google Sheets",
    "group": "settings",
    "file": "client/src/pages/merchant/DataSync.tsx",
    "note": "إجراء ربط قبل مزامنة الآن؛ بيان عدم التفعيل بدل تعليمات تبدو كحالة تشغيل.",
    "kind": "integration",
    "action": "مراجعة المزامنة",
    "labels": [
      "المصدر",
      "السجلات",
      "آخر مزامنة",
      "النتيجة"
    ],
    "sample": "مصادر بيانات المتجر"
  },
  {
    "route": "/merchant/reviews",
    "title": "تقييمات المنتجات",
    "group": "customers",
    "file": "client/src/pages/merchant/Reviews.tsx",
    "note": "توحيد التقييمات مع تقييمات الخدمات مع مرشح النوع وحالات الرد والخطأ.",
    "kind": "list",
    "action": "قراءة التقييمات",
    "labels": [
      "العميل",
      "التقييم",
      "التعليق",
      "التاريخ"
    ],
    "sample": "تجربة نورة"
  },
  {
    "route": "/merchant/booking-reviews",
    "title": "تقييمات الحجوزات",
    "group": "customers",
    "file": "client/src/pages/merchant/BookingReviews.tsx",
    "note": "دمج قائمة الردود ضمن مركز العملاء مع تمييز الخدمة.",
    "kind": "list",
    "action": "قراءة التقييمات",
    "labels": [
      "العميل",
      "التقييم",
      "التعليق",
      "التاريخ"
    ],
    "sample": "تجربة نورة"
  },
  {
    "route": "/merchant/order-notifications",
    "title": "إشعارات الطلبات",
    "group": "settings",
    "file": "client/src/pages/merchant/OrderNotificationsSettings.tsx",
    "note": "معاينة المتغيرات والرسالة قبل التفعيل؛ دمجها ضمن مركز الأتمتة.",
    "kind": "form",
    "action": "حفظ التفضيلات",
    "labels": [
      "تأكيد الطلب",
      "تحديث الشحن",
      "اكتمال الطلب",
      "قالب الرسالة"
    ],
    "sample": "إشعارات الطلبات"
  },
  {
    "route": "/merchant/settings",
    "title": "الحساب والمتجر",
    "group": "settings",
    "file": "client/src/pages/merchant/Settings.tsx",
    "note": "فصل الحساب والمتجر والمعرفة؛ عدم تكرار رفع ملف المعرفة في مكانين.",
    "kind": "form",
    "action": "حفظ التغييرات",
    "labels": [
      "اسم المتجر",
      "اسم المسؤول",
      "البريد الإلكتروني",
      "رقم التواصل"
    ],
    "sample": "متجر نواة"
  },
  {
    "route": "/merchant/privacy-center",
    "title": "الخصوصية",
    "group": "settings",
    "file": "client/src/pages/merchant/PrivacyCenter.tsx",
    "note": "حافظ على وضوح نطاق التصدير وخطوات طلب الحقوق؛ اختبار النتائج دون حذف حقيقي.",
    "kind": "privacy",
    "action": "طلب نسخة من البيانات",
    "labels": [
      "تصدير البيانات",
      "الموافقات",
      "الجلسات",
      "حذف الحساب"
    ],
    "sample": "بيانات حسابك"
  },
  {
    "route": "/merchant/notifications",
    "title": "الإشعارات",
    "group": "overview",
    "file": "client/src/pages/merchant/NotificationsPage.tsx",
    "note": "تجميع حسب الحاجة للإجراء وربط كل تنبيه بوجهته؛ توحيد المنطقة الزمنية.",
    "kind": "list",
    "action": "تحديد الكل كمقروء",
    "labels": [
      "الإشعار",
      "القسم",
      "التاريخ",
      "الحالة"
    ],
    "sample": "محادثة تحتاج تدخلك"
  },
  {
    "route": "/merchant/language-settings",
    "title": "لغة المساعد",
    "group": "ai",
    "file": "client/src/pages/merchant/LanguageSettings.tsx",
    "note": "تسمية لغة ردود المساعد بوضوح وفصلها عن لغة الواجهة والعملة.",
    "kind": "form",
    "action": "حفظ اللغة",
    "labels": [
      "لغة المساعد",
      "اللهجة",
      "رسالة الترحيب"
    ],
    "sample": "العربية"
  },
  {
    "route": "/merchant/calendar/settings",
    "title": "ربط Google Calendar",
    "group": "settings",
    "file": "client/src/pages/CalendarSettings.tsx",
    "note": "عنوان الصفحة الحالي تحذير فصل؛ إعادة تعيين النصوص بالكامل.",
    "kind": "integration",
    "action": "ربط Google Calendar",
    "labels": [
      "الحساب",
      "التقويم",
      "التذكيرات",
      "آخر مزامنة"
    ],
    "sample": "تقويم المتجر"
  },
  {
    "route": "/merchant/calendar",
    "title": "التقويم",
    "group": "catalog",
    "file": "client/src/pages/CalendarPage.tsx",
    "note": "حالة عدم الربط مفهومة؛ عرض حجوزات ساري مستقلة عن ربط تقويم خارجي إن أمكن.",
    "kind": "calendar",
    "action": "موعد جديد",
    "labels": [
      "الموعد",
      "العميل",
      "المقدم",
      "الوقت"
    ],
    "sample": "جلسة استشارية"
  },
  {
    "route": "/merchant/staff",
    "title": "مقدمو الخدمات",
    "group": "catalog",
    "file": "client/src/pages/StaffManagement.tsx",
    "note": "فصل مقدمي الخدمات عن أعضاء صلاحيات اللوحة؛ ربط الخدمة والتوفر.",
    "kind": "list",
    "action": "إضافة مقدم خدمة",
    "labels": [
      "الاسم",
      "التخصص",
      "الخدمات",
      "التوفر"
    ],
    "sample": "سارة أحمد"
  },
  {
    "route": "/merchant/team",
    "title": "الفريق والصلاحيات",
    "group": "settings",
    "file": "client/src/pages/merchant/TeamManagement.tsx",
    "note": "المهام والصلاحيات مفهومة؛ إظهار المالك الحالي بدل إحصاء مالكين صفر.",
    "kind": "list",
    "action": "دعوة عضو",
    "labels": [
      "العضو",
      "البريد الإلكتروني",
      "الدور",
      "الحالة"
    ],
    "sample": "سارة أحمد"
  },
  {
    "route": "/merchant/services",
    "title": "الخدمات",
    "group": "catalog",
    "file": "client/src/pages/merchant/ServicesManagement.tsx",
    "note": "إنشاء خدمة وحفظها نجح؛ بطاقة موجزة وسعر ومدة واضحان.",
    "kind": "list",
    "action": "إضافة خدمة",
    "labels": [
      "الخدمة",
      "المدة",
      "السعر",
      "التوفر"
    ],
    "sample": "استشارة تسويقية"
  },
  {
    "route": "/merchant/services/new",
    "title": "إضافة وتعديل خدمة",
    "group": "catalog",
    "file": "client/src/pages/merchant/ServiceForm.tsx",
    "note": "النصوص الجديدة جيدة؛ يجب رفض تعديل معرف غير موجود بدل نموذج فارغ.",
    "kind": "form",
    "action": "حفظ الخدمة",
    "labels": [
      "اسم الخدمة",
      "المدة بالدقائق",
      "السعر بالريال",
      "الوصف"
    ],
    "sample": "استشارة تسويقية"
  },
  {
    "route": "/merchant/services/:id/edit",
    "title": "إضافة وتعديل خدمة",
    "group": "catalog",
    "file": "client/src/pages/merchant/ServiceForm.tsx",
    "note": "النصوص الجديدة جيدة؛ يجب رفض تعديل معرف غير موجود بدل نموذج فارغ.",
    "kind": "form",
    "action": "حفظ الخدمة",
    "labels": [
      "اسم الخدمة",
      "المدة بالدقائق",
      "السعر بالريال",
      "الوصف"
    ],
    "sample": "استشارة تسويقية"
  },
  {
    "route": "/merchant/services/:id",
    "title": "تفاصيل الخدمة",
    "group": "catalog",
    "file": "client/src/pages/ServiceDetails.tsx",
    "note": "حالة غير موجودة مع عودة جيدة؛ ربط الحجز ومقدمي الخدمة في مكان واحد.",
    "kind": "detail",
    "action": "تعديل الخدمة",
    "labels": [
      "الخدمة",
      "المدة",
      "السعر",
      "مقدم الخدمة"
    ],
    "sample": "استشارة تسويقية"
  },
  {
    "route": "/merchant/bookings",
    "title": "الحجوزات",
    "group": "catalog",
    "file": "client/src/pages/BookingsManagement.tsx",
    "note": "وضع يوم وأسبوع وقائمة؛ تثبيت حالة الحجز وتوقيته والمنطقة الزمنية.",
    "kind": "list",
    "action": "حجز جديد",
    "labels": [
      "الحجز",
      "العميل",
      "الخدمة",
      "الموعد"
    ],
    "sample": "حجز #208"
  },
  {
    "route": "/merchant/service-categories",
    "title": "تصنيفات الخدمات",
    "group": "catalog",
    "file": "client/src/pages/merchant/ServiceCategories.tsx",
    "note": "إدارة ضمن الكتالوج؛ حالة الفراغ والإضافة واضحتان.",
    "kind": "list",
    "action": "تصنيف جديد",
    "labels": [
      "التصنيف",
      "الوصف",
      "الخدمات",
      "الحالة"
    ],
    "sample": "الاستشارات"
  },
  {
    "route": "/merchant/service-packages",
    "title": "حزم الخدمات",
    "group": "catalog",
    "file": "client/src/pages/merchant/ServicePackages.tsx",
    "note": "معاينة القيمة والتوفير والخدمات المضمنة قبل الحفظ.",
    "kind": "list",
    "action": "حزمة جديدة",
    "labels": [
      "الحزمة",
      "الخدمات",
      "السعر",
      "الحالة"
    ],
    "sample": "انطلاقة المشروع"
  },
  {
    "route": "/merchant/sheets/settings",
    "title": "ربط Google Sheets",
    "group": "settings",
    "file": "client/src/pages/SheetsSettings.tsx",
    "note": "نجح الإعداد وفشل الإعداد عناوين ثابتة خاطئة؛ تصحيح النصوص.",
    "kind": "integration",
    "action": "ربط Google Sheets",
    "labels": [
      "الحساب",
      "الجدول",
      "نطاق المزامنة",
      "آخر تحديث"
    ],
    "sample": "بيانات المتجر"
  },
  {
    "route": "/merchant/sheets/export",
    "title": "تصدير المحادثات",
    "group": "analytics",
    "file": "client/src/pages/SheetsExport.tsx",
    "note": "حالات خطأ وفراغ جيدة؛ توضيح نطاق تحديد الكل وإتاحة التصدير لما بعد 100.",
    "kind": "import",
    "action": "معاينة التصدير",
    "labels": [
      "المحادثة",
      "العميل",
      "عدد الرسائل",
      "آخر نشاط"
    ],
    "sample": "محادثات الأسبوع"
  },
  {
    "route": "/merchant/sheets/reports",
    "title": "تقارير Google Sheets",
    "group": "analytics",
    "file": "client/src/pages/SheetsReports.tsx",
    "note": "عناوين نجاح ثابتة؛ عرض توليد/جدولة حقيقي وحالة آخر تشغيل.",
    "kind": "analytics",
    "action": "تجهيز التقرير",
    "labels": [
      "المبيعات",
      "الطلبات",
      "العملاء",
      "المحادثات"
    ],
    "sample": "تقارير الجدول"
  },
  {
    "route": "/merchant/sheets/inventory",
    "title": "مخزون Google Sheets",
    "group": "catalog",
    "file": "client/src/pages/SheetsInventory.tsx",
    "note": "تصحيح العناوين؛ معاينة الفرق قبل استبدال المخزون.",
    "kind": "list",
    "action": "مراجعة المخزون",
    "labels": [
      "المنتج",
      "رمز المنتج",
      "المخزون",
      "آخر مزامنة"
    ],
    "sample": "بن كولومبيا"
  },
  {
    "route": "/merchant/payments",
    "title": "المدفوعات",
    "group": "sales",
    "file": "client/src/pages/merchant/Payments.tsx",
    "note": "توحيد المسارين المتكررين وعنوان h1؛ فصل مدفوعات العملاء عن فواتير ساري.",
    "kind": "list",
    "action": "فتح تفاصيل المعاملة",
    "labels": [
      "المعاملة",
      "العميل",
      "المبلغ",
      "الحالة"
    ],
    "sample": "معاملة #304"
  },
  {
    "route": "/merchant/payments/:id",
    "title": "تفاصيل معاملة",
    "group": "sales",
    "file": "client/src/pages/PaymentDetails.tsx",
    "note": "غير موجودة مع رجوع جيد؛ إضافة حالة تحقق غير مؤكدة بدلاً من الجزم.",
    "kind": "detail",
    "action": "العودة للمدفوعات",
    "labels": [
      "المعاملة",
      "العميل",
      "المبلغ",
      "حالة المزود"
    ],
    "sample": "معاملة #304"
  },
  {
    "route": "/merchant/payment-links",
    "title": "روابط الدفع",
    "group": "sales",
    "file": "client/src/pages/merchant/PaymentLinks.tsx",
    "note": "نسخ الرابط بعد نجاح clipboard فقط؛ ملخص العميل والمبلغ والصلاحية.",
    "kind": "list",
    "action": "رابط دفع جديد",
    "labels": [
      "الرابط",
      "الغرض",
      "المبلغ",
      "الصلاحية"
    ],
    "sample": "طلب تجهيز مكتب"
  },
  {
    "route": "/merchant/payment-settings",
    "title": "بوابة دفع العملاء",
    "group": "settings",
    "file": "client/src/pages/merchant/PaymentSettings.tsx",
    "note": "إعداد منفصل عن اشتراك ساري؛ فحص الاتصال وحالة المتطلبات بوضوح.",
    "kind": "integration",
    "action": "مراجعة الربط",
    "labels": [
      "بوابة الدفع",
      "وضع الاختبار",
      "حالة الربط",
      "آخر تحقق"
    ],
    "sample": "Tap Payments"
  },
  {
    "route": "/merchant/loyalty/settings",
    "title": "إعدادات الولاء",
    "group": "marketing",
    "file": "client/src/pages/LoyaltySettings.tsx",
    "note": "إعادة بناء النصوص؛ العناوين والحقول تستدعي رسائل نجاح وفشل غير مناسبة.",
    "kind": "form",
    "action": "حفظ البرنامج",
    "labels": [
      "اسم البرنامج",
      "نقاط لكل ريال",
      "قيمة استبدال النقاط",
      "صلاحية النقاط"
    ],
    "sample": "نقاط نواة"
  },
  {
    "route": "/merchant/loyalty/tiers",
    "title": "مستويات الولاء",
    "group": "marketing",
    "file": "client/src/pages/LoyaltyTiers.tsx",
    "note": "تصحيح النصوص وعرض قواعد الترقية والمزايا بجدول مقارن.",
    "kind": "list",
    "action": "مستوى جديد",
    "labels": [
      "المستوى",
      "النقاط المطلوبة",
      "المزايا",
      "العملاء"
    ],
    "sample": "المستوى الذهبي"
  },
  {
    "route": "/merchant/loyalty/rewards",
    "title": "مكافآت الولاء",
    "group": "marketing",
    "file": "client/src/pages/LoyaltyRewards.tsx",
    "note": "تصحيح النصوص؛ توضيح الرصيد والتكلفة والتوفر قبل الاستبدال.",
    "kind": "list",
    "action": "مكافأة جديدة",
    "labels": [
      "المكافأة",
      "النقاط",
      "النوع",
      "الحالة"
    ],
    "sample": "خصم على الطلب القادم"
  },
  {
    "route": "/merchant/loyalty/customers",
    "title": "عملاء الولاء",
    "group": "customers",
    "file": "client/src/pages/LoyaltyCustomers.tsx",
    "note": "تصحيح رؤوس الجدول والعدادات؛ سجل سبب تعديل النقاط.",
    "kind": "list",
    "action": "عرض رصيد العميل",
    "labels": [
      "العميل",
      "المستوى",
      "النقاط",
      "آخر حركة"
    ],
    "sample": "نورة أحمد"
  },
  {
    "route": "/merchant/integrations-dashboard",
    "title": "صحة التكاملات",
    "group": "settings",
    "file": "client/src/pages/IntegrationsDashboard.tsx",
    "note": "إعادة تعيين النصوص؛ عدم عرض نسبة نجاح 100% عندما لا توجد عمليات.",
    "kind": "hub",
    "action": "تحديث العرض",
    "labels": [
      "المنصة",
      "آخر مزامنة",
      "نسبة النجاح",
      "الأخطاء"
    ],
    "sample": "حالة التكاملات"
  },
  {
    "route": "/merchant/platform-integrations",
    "title": "التكاملات",
    "group": "settings",
    "file": "client/src/pages/PlatformIntegrations.tsx",
    "note": "بطاقات مصدر وحالة ووقت آخر نجاح وإجراء واحد لكل بطاقة.",
    "kind": "hub",
    "action": "إضافة تكامل",
    "labels": [
      "واتساب",
      "سلة",
      "زد",
      "Google"
    ],
    "sample": "قنواتك ومصادرك"
  },
  {
    "route": "/merchant/notification-settings",
    "title": "تفضيلات الإشعارات",
    "group": "settings",
    "file": "client/src/pages/NotificationSettings.tsx",
    "note": "توحيدها مع إشعارات المتصفح والطلبات مع الفصل بين المستلم والعميل.",
    "kind": "form",
    "action": "حفظ التفضيلات",
    "labels": [
      "قناة التنبيه",
      "الطلبات الجديدة",
      "الرسائل الجديدة",
      "المواعيد"
    ],
    "sample": "تفضيلات التنبيه"
  },
  {
    "route": "/merchant/currency-settings",
    "title": "عملة المتجر",
    "group": "settings",
    "file": "client/src/pages/CurrencySettings.tsx",
    "note": "القيم المعروضة والعناوين منزاحة؛ فصل تغيير وحدة العرض عن تحويل المبالغ.",
    "kind": "form",
    "action": "حفظ العملة",
    "labels": [
      "عملة المتجر",
      "طريقة عرض السعر"
    ],
    "sample": "الريال السعودي"
  },
  {
    "route": "/merchant/push-notifications",
    "title": "إشعارات المتصفح",
    "group": "settings",
    "file": "client/src/pages/merchant/PushNotificationsSettings.tsx",
    "note": "طلب الإذن بعد فعل واضح؛ اختصار التفاصيل التقنية ضمن تشخيص.",
    "kind": "form",
    "action": "معاينة الإشعارات",
    "labels": [
      "إشعارات المتصفح",
      "تنبيه الطلبات",
      "تنبيه المحادثات"
    ],
    "sample": "إشعارات هذا الجهاز"
  },
  {
    "route": "/merchant/scheduled-reports",
    "title": "التقارير المجدولة",
    "group": "analytics",
    "file": "client/src/pages/ScheduledReports.tsx",
    "note": "عنوان حذف التقرير وأزرار تحقق خاطئة؛ أسماء صحيحة وحذف مع تأكيد.",
    "kind": "list",
    "action": "تقرير مجدول جديد",
    "labels": [
      "التقرير",
      "المستلم",
      "التكرار",
      "الموعد"
    ],
    "sample": "ملخص الأسبوع"
  },
  {
    "route": "/merchant/whatsapp-auto-notifications",
    "title": "أتمتة رسائل العملاء",
    "group": "marketing",
    "file": "client/src/pages/WhatsAppAutoNotifications.tsx",
    "note": "العنوان إلغاء الطلب غير صحيح؛ معاينة لكل حدث وحذف محمي ومسمى.",
    "kind": "form",
    "action": "قالب رسالة جديد",
    "labels": [
      "الحدث",
      "نص الرسالة",
      "المتغيرات",
      "حالة الإعداد"
    ],
    "sample": "قوالب رسائل العملاء"
  },
  {
    "route": "/merchant/reports",
    "title": "التقارير",
    "group": "analytics",
    "file": "client/src/pages/Reports.tsx",
    "note": "مراجعة أسماء الفلاتر والتبويبات وربط كل تصدير بفترته ومرشحه.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/subscriptions",
    "title": "الباقة والاستخدام",
    "group": "settings",
    "file": "client/src/pages/merchant/MySubscription.tsx",
    "note": "ثلاثة مسارات لنفس الصفحة؛ اعتماد واحد مع تحويل البقية والمحافظة على العودة.",
    "kind": "billing",
    "action": "عرض الباقات",
    "labels": [
      "الباقة",
      "الفترة",
      "الاستخدام",
      "الفاتورة"
    ],
    "sample": "باقة النمو"
  },
  {
    "route": "/merchant/usage",
    "title": "استهلاك الرسائل",
    "group": "settings",
    "file": "client/src/pages/merchant/Usage.tsx",
    "note": "دمجها مع الاستخدام الموحد وتوضيح مصدر العدادات ودورة إعادة التعيين.",
    "kind": "analytics",
    "action": "مراجعة الباقة",
    "labels": [
      "المحادثات",
      "الرسائل",
      "الصوت",
      "المتبقي"
    ],
    "sample": "استخدام الباقة"
  },
  {
    "route": "/merchant/usage-dashboard",
    "title": "حدود الاستخدام",
    "group": "settings",
    "file": "client/src/pages/merchant/UsageDashboard.tsx",
    "note": "حالات الاستعادة جيدة؛ توحيد الحدود وتعريف العملاء مقابل المحادثات.",
    "kind": "analytics",
    "action": "مراجعة الباقة",
    "labels": [
      "المحادثات",
      "الرسائل",
      "الصوت",
      "المتبقي"
    ],
    "sample": "استخدام الباقة"
  },
  {
    "route": "/merchant/subscription/plans",
    "title": "الباقات",
    "group": "settings",
    "file": "client/src/pages/merchant/SubscriptionPlans.tsx",
    "note": "احتساب التوفير السنوي من الأسعار الفعلية بدل نسبة ثابتة؛ تمييز الباقة الحالية.",
    "kind": "plans",
    "action": "مقارنة الباقات",
    "labels": [
      "البداية",
      "النمو",
      "الأعمال"
    ],
    "sample": "اختر ما يناسب نشاطك"
  },
  {
    "route": "/merchant/subscription/compare",
    "title": "مقارنة الباقات",
    "group": "settings",
    "file": "client/src/pages/ComparePlans.tsx",
    "note": "نصوص دلالية وحدود فعلية جيدة؛ عرض مناسب للجوال دون ازدحام.",
    "kind": "plans",
    "action": "مقارنة الباقات",
    "labels": [
      "البداية",
      "النمو",
      "الأعمال"
    ],
    "sample": "اختر ما يناسب نشاطك"
  },
  {
    "route": "/merchant/subscription",
    "title": "الباقة والاستخدام",
    "group": "settings",
    "file": "client/src/pages/merchant/MySubscription.tsx",
    "note": "ثلاثة مسارات لنفس الصفحة؛ اعتماد واحد مع تحويل البقية والمحافظة على العودة.",
    "kind": "billing",
    "action": "عرض الباقات",
    "labels": [
      "الباقة",
      "الفترة",
      "الاستخدام",
      "الفاتورة"
    ],
    "sample": "باقة النمو"
  },
  {
    "route": "/merchant/checkout",
    "title": "بدء الاشتراك المدفوع",
    "group": "settings",
    "file": "client/src/pages/merchant/Checkout.tsx",
    "note": "إصلاح روابط الشروط والخصوصية # وإضافة عودة عندما تكون الباقة غير موجودة.",
    "kind": "checkout",
    "action": "مراجعة الاشتراك",
    "labels": [
      "الباقة",
      "دورة الفوترة",
      "الإجمالي",
      "الضريبة"
    ],
    "sample": "باقة النمو"
  },
  {
    "route": "/merchant/payment/success",
    "title": "نتيجة دفع الاشتراك",
    "group": "settings",
    "file": "client/src/pages/merchant/PaymentSuccess.tsx",
    "note": "قراءة search الصحيحة؛ المرجع المرسل يظهر #0 حاليًا في هذا المسار القديم.",
    "kind": "result",
    "action": "مراجعة حالة الدفع",
    "labels": [
      "المعاملة",
      "المبلغ",
      "حالة المزود",
      "آخر تحقق"
    ],
    "sample": "عملية الاشتراك"
  },
  {
    "route": "/merchant/payment/cancel",
    "title": "إلغاء دفع الاشتراك",
    "group": "settings",
    "file": "client/src/pages/merchant/PaymentCancel.tsx",
    "note": "لا تجزم بعدم الخصم دون تحقق؛ الاحتفاظ بخيار الباقة عند إعادة المحاولة.",
    "kind": "result",
    "action": "العودة إلى الباقة",
    "labels": [
      "الباقة",
      "المبلغ",
      "الحالة"
    ],
    "sample": "لم يكتمل الدفع"
  },
  {
    "route": "/merchant/tools",
    "title": "جميع الأدوات",
    "group": "settings",
    "file": "client/src/pages/merchant/Tools.tsx",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "directory",
    "action": "ابحث عن أداة",
    "labels": [
      "القسم",
      "الأداة",
      "المهمة"
    ],
    "sample": "جميع الصفحات"
  },
  {
    "route": "/merchant/customers",
    "title": "العملاء",
    "group": "customers",
    "file": "client/src/pages/Customers.tsx",
    "note": "عنوان تم إضافة الملاحظة ثابت وخاطئ؛ تصحيح النصوص وتجميع سجل العميل.",
    "kind": "list",
    "action": "عرض ملف العميل",
    "labels": [
      "العميل",
      "المحادثات",
      "الطلبات",
      "آخر نشاط"
    ],
    "sample": "نورة أحمد"
  },
  {
    "route": "/merchant/website-analysis",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/smart-analysis",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "analysis",
    "action": "معاينة التحليل",
    "labels": [
      "رابط الموقع",
      "نطاق التحليل",
      "اللغة"
    ],
    "sample": "موقع النشاط"
  },
  {
    "route": "/merchant/smart-analysis",
    "title": "تحليل الموقع",
    "group": "ai",
    "file": "client/src/pages/SmartAnalysis.tsx",
    "note": "معالج اكتشاف ثم معاينة ثم استيراد إلى المعرفة؛ حالة تقدم موثوقة.",
    "kind": "analysis",
    "action": "معاينة التحليل",
    "labels": [
      "رابط الموقع",
      "نطاق التحليل",
      "اللغة"
    ],
    "sample": "موقع النشاط"
  },
  {
    "route": "/merchant/competitor-analysis",
    "title": "تحليل المنافسين",
    "group": "analytics",
    "file": "client/src/pages/CompetitorAnalysis.tsx",
    "note": "ميزة متقدمة ضمن الرؤى؛ بيان آخر تحليل ومصدر المقارنة.",
    "kind": "analysis",
    "action": "معاينة التحليل",
    "labels": [
      "رابط الموقع",
      "نطاق التحليل",
      "اللغة"
    ],
    "sample": "موقع النشاط"
  },
  {
    "route": "/merchant/customers/:phone",
    "title": "ملف العميل",
    "group": "customers",
    "file": "client/src/pages/CustomerDetails.tsx",
    "note": "أسماء مؤشرات الحالة خاطئة؛ سجل موحد للمحادثات والطلبات والتقييمات.",
    "kind": "detail",
    "action": "فتح المحادثة",
    "labels": [
      "العميل",
      "الطلبات",
      "قيمة الطلبات",
      "رصيد الولاء"
    ],
    "sample": "نورة أحمد"
  },
  {
    "route": "/merchant/ai-suggestions",
    "title": "الرؤى والاقتراحات وA/B",
    "group": "analytics",
    "file": "client/src/pages/merchant/InsightsDashboard.tsx",
    "note": "تصدير CSV غير منفذ؛ فتح تبويب A/B عند دخول مساره؛ انتظار نجاح التحديث.",
    "kind": "list",
    "action": "مراجعة الاقتراحات",
    "labels": [
      "الاقتراح",
      "المصدر",
      "الأثر المتوقع",
      "الحالة"
    ],
    "sample": "اختصار رسالة الترحيب"
  },
  {
    "route": "/merchant/keywords",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/quick-responses",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "list",
    "action": "رد سريع جديد",
    "labels": [
      "العبارة",
      "الرد",
      "الكلمات المفتاحية",
      "الحالة"
    ],
    "sample": "مدة التوصيل"
  },
  {
    "route": "/merchant/voice-messages",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المحادثات",
      "الرسائل",
      "تحويل للفريق",
      "زمن الرد"
    ],
    "sample": "أداء المحادثات"
  },
  {
    "route": "/merchant/analysis",
    "title": "تحليلات الرسائل",
    "group": "analytics",
    "file": "client/src/pages/merchant/Analytics.tsx",
    "note": "ستة مسارات لواجهة واحدة؛ فصل التحليلات عن إعدادات الصوت وإضافة فترة موحدة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "المحادثات",
      "الرسائل",
      "تحويل للفريق",
      "زمن الرد"
    ],
    "sample": "أداء المحادثات"
  },
  {
    "route": "/merchant/weekly-reports",
    "title": "مدخل لوحة التاجر",
    "group": "settings",
    "redirect": "/merchant/reports",
    "note": "مسار مسجل ضمن مساحة التاجر؛ توحيد التنقل وحالات الصفحة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "قيمة الطلبات",
      "الطلبات",
      "متوسط الطلب",
      "العملاء"
    ],
    "sample": "أداء المتجر"
  },
  {
    "route": "/merchant/ab-tests",
    "title": "الرؤى والاقتراحات وA/B",
    "group": "analytics",
    "file": "client/src/pages/merchant/InsightsDashboard.tsx",
    "note": "تصدير CSV غير منفذ؛ فتح تبويب A/B عند دخول مساره؛ انتظار نجاح التحديث.",
    "kind": "list",
    "action": "مراجعة الاقتراحات",
    "labels": [
      "الاقتراح",
      "المصدر",
      "الأثر المتوقع",
      "الحالة"
    ],
    "sample": "اختصار رسالة الترحيب"
  },
  {
    "route": "/merchant/try-sari-analytics",
    "title": "مقاييس المساعد",
    "group": "analytics",
    "file": "client/src/pages/merchant/MetricsDashboard.tsx",
    "note": "تحديد مصدر المقاييس والحد الأدنى للعينة؛ منع المقارنات على بيانات مفقودة.",
    "kind": "analytics",
    "action": "تصدير التقرير",
    "labels": [
      "الإجابات",
      "مصادر موثوقة",
      "تحويل للفريق",
      "التقييم"
    ],
    "sample": "جودة المساعد"
  },
  {
    "route": "/merchant/merchant-payments",
    "title": "المدفوعات",
    "group": "sales",
    "file": "client/src/pages/merchant/Payments.tsx",
    "note": "توحيد المسارين المتكررين وعنوان h1؛ فصل مدفوعات العملاء عن فواتير ساري.",
    "kind": "list",
    "action": "فتح تفاصيل المعاملة",
    "labels": [
      "المعاملة",
      "العميل",
      "المبلغ",
      "الحالة"
    ],
    "sample": "معاملة #304"
  },
  {
    "route": "/merchant/my-subscription",
    "title": "الباقة والاستخدام",
    "group": "settings",
    "file": "client/src/pages/merchant/MySubscription.tsx",
    "note": "ثلاثة مسارات لنفس الصفحة؛ اعتماد واحد مع تحويل البقية والمحافظة على العودة.",
    "kind": "billing",
    "action": "عرض الباقات",
    "labels": [
      "الباقة",
      "الفترة",
      "الاستخدام",
      "الفاتورة"
    ],
    "sample": "باقة النمو"
  },
  {
    "route": "/merchant/preview-state/missing",
    "title": "صفحة غير موجودة",
    "group": "overview",
    "kind": "state",
    "state": "missing",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/error",
    "title": "تعذّر تحميل الصفحة",
    "group": "overview",
    "kind": "state",
    "state": "error",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/offline",
    "title": "انقطاع الاتصال",
    "group": "overview",
    "kind": "state",
    "state": "offline",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/forbidden",
    "title": "صلاحية غير كافية",
    "group": "overview",
    "kind": "state",
    "state": "forbidden",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/session",
    "title": "تسجيل الدخول",
    "group": "overview",
    "kind": "state",
    "state": "session",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/loading",
    "title": "تحميل البيانات",
    "group": "overview",
    "kind": "state",
    "state": "loading",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  },
  {
    "route": "/merchant/preview-state/empty",
    "title": "بداية جديدة",
    "group": "overview",
    "kind": "state",
    "state": "empty",
    "action": "إعادة المحاولة",
    "labels": [],
    "sample": "",
    "note": "حالة واضحة، سبب مختصر، وإجراء متابعة."
  }
];
