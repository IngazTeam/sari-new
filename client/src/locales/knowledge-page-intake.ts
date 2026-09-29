export const knowledgePageIntakeEn = {
  permissionFailed:
    "Permissions could not be checked. Retry before adding a page.",
  title: "Add a website page",
  description:
    "Preview one public HTTPS page, review its full text, then save it paused.",
  url: "Page URL",
  prepare: "Preview page",
  busy: "Working…",
  invalid: "Enter a public HTTPS URL without login details.",
  failed:
    "The page could not be read. Use a public text or HTML page (up to 2 MB). Pages that require login or JavaScript may need a text file instead.",
  limit:
    "The page limit (50) or pending preview limit (5 for 30 minutes) has been reached.",
  exists:
    "This URL already has a saved page or website section. Review existing knowledge first.",
  review: "Review website text",
  effect:
    "Saves this exact text as one page and one linked knowledge section. Both stay paused until you enable use from Review page. Existing knowledge stays intact.",
  fullText: "Full text to save",
  advisory: "Optional AI classification",
  advisoryHelp:
    "This is a suggestion, possibly based on only the first part of the text. It does not measure quality and is not saved as separate sections.",
  noAnalysis:
    "Automatic classification is unavailable. You can still review the full source text.",
  expires: "Preview valid until",
  acknowledge:
    "I reviewed the full text and agree to save the page and its linked section paused.",
  save: "Save paused",
  close: "Close",
  open: "Open review",
  saved: "The page and its linked section were saved with use paused.",
  changed:
    "This request was saved earlier. Its page or section has since changed or one was removed. Review the current records.",
  deleted:
    "This request was saved earlier, then both records were removed. They have not been recreated.",
  pageId: "Page ID",
  sectionId: "Section ID",
  expired:
    "This preview expired or is unavailable. Prepare a new preview; no automatic save was performed.",
  recover: "Check saved result",
  uncertain:
    "The save result could not be confirmed. Check the receipt before starting another request.",
  checking: "Checking the previous request…",
  storage:
    "The browser could not keep the request reference. Saving is blocked so an interrupted request cannot be duplicated.",
  another: "Start another page",
  retry: "Retry",
  readOnly:
    "You can review receipts. Adding pages requires knowledge management permission.",
  indexing:
    "The records were saved, but search indexing could not be confirmed. This does not enable use or undo the save.",
  conflict:
    "Knowledge is changing. Check the result and review again before saving.",
};
export type KnowledgePageIntakeCopy = typeof knowledgePageIntakeEn;
export const knowledgePageIntakeAr: KnowledgePageIntakeCopy = {
  permissionFailed: "تعذر التحقق من الصلاحيات. أعد المحاولة قبل إضافة صفحة.",
  title: "إضافة صفحة موقع",
  description:
    "عاين صفحة HTTPS عامة، راجع نصها كاملًا، ثم احفظها بحالة متوقفة.",
  url: "رابط الصفحة",
  prepare: "معاينة الصفحة",
  busy: "جارٍ التنفيذ…",
  invalid: "أدخل رابط HTTPS عامًا دون بيانات تسجيل دخول.",
  failed:
    "تعذرت قراءة الصفحة. استخدم صفحة نصية أو HTML عامة (حتى 2 ميجابايت). الصفحات التي تتطلب الدخول أو JavaScript قد تحتاج ملفًا نصيًا بدلًا منها.",
  limit: "وصلت لحد الصفحات (50) أو المعاينات المعلقة (5 لمدة 30 دقيقة).",
  exists:
    "للرابط صفحة محفوظة أو قسم معرفة من الموقع. راجع المعرفة الموجودة أولًا.",
  review: "مراجعة نص الموقع",
  effect:
    "سيُحفظ هذا النص نفسه كصفحة واحدة وقسم معرفة مرتبط بها. يبقيان متوقفين حتى تُفعّل الاستخدام من «مراجعة الصفحة». تبقى المعرفة الموجودة كما هي.",
  fullText: "النص الكامل الذي سيُحفظ",
  advisory: "تصنيف آلي اختياري",
  advisoryHelp:
    "اقتراح قد يعتمد على بداية النص فقط. لا يقيس الجودة ولا يُحفظ كأقسام مستقلة.",
  noAnalysis: "التصنيف الآلي غير متاح. يمكنك مراجعة نص المصدر كاملًا.",
  expires: "المعاينة صالحة حتى",
  acknowledge:
    "راجعت النص كاملًا وأوافق على حفظ الصفحة وقسمها المرتبط بحالة متوقفة.",
  save: "حفظ بحالة متوقفة",
  close: "إغلاق",
  open: "فتح المراجعة",
  saved: "تم حفظ الصفحة وقسمها المرتبط مع إيقاف الاستخدام.",
  changed:
    "حُفظ هذا الطلب سابقًا ثم تغيّرت الصفحة أو القسم أو حُذف أحدهما. راجع السجلات الحالية.",
  deleted: "حُفظ هذا الطلب سابقًا ثم حُذفت الصفحة والقسم. لم يُعاد إنشاؤهما.",
  pageId: "رقم الصفحة",
  sectionId: "رقم القسم",
  expired:
    "انتهت المعاينة أو لم تعد متاحة. جهّز معاينة جديدة؛ لم يحدث حفظ تلقائي.",
  recover: "التحقق من نتيجة الحفظ",
  uncertain: "تعذر تأكيد نتيجة الحفظ. تحقق من الإيصال قبل بدء طلب آخر.",
  checking: "جارٍ التحقق من الطلب السابق…",
  storage:
    "تعذر الاحتفاظ بمرجع الطلب في المتصفح. أُوقف الحفظ لتجنب تكراره عند انقطاع الاتصال.",
  another: "بدء صفحة أخرى",
  retry: "إعادة المحاولة",
  readOnly: "يمكنك مراجعة الإيصالات. إضافة الصفحات تتطلب صلاحية إدارة المعرفة.",
  indexing:
    "حُفظت السجلات، لكن لم تتأكد فهرسة البحث. هذا لا يُفعّل الاستخدام ولا يلغي الحفظ.",
  conflict:
    "هناك تغيير جارٍ في المعرفة. تحقق من النتيجة وراجعها مجددًا قبل الحفظ.",
};
