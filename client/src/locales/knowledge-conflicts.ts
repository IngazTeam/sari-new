export const knowledgeConflictsEn = {
  teachingTitle: "Compare this teaching with current knowledge",
  teachingHelp:
    "AI compares the complete saved teaching with enabled knowledge sections, FAQs, policy pages and confirmed setup fields. Nothing is published by this check. Review the text and proposed changes yourself.",
  teachingAnalyze: "Compare policies with AI",
  teachingAnalyzing: "Comparing policies…",
  teachingError:
    "The comparison was not confirmed. Reload the review; the proposal remains disabled.",
  teachingUnavailable:
    "The original teaching or full comparison context is unavailable. Restore the source or submit a complete new teaching before approval.",
  teachingPending:
    "Run the comparison before approving. Knowledge changes invalidate an earlier comparison.",
  teachingReady:
    "Read every proposed replacement before approving. Only records marked for replacement will stop being used.",
  teachingBlocked:
    "The comparison needs manual resolution. Conflicting FAQs, pages and setup answers must be corrected at their source; this review cannot disable them. An incomplete replacement or duplicate also needs review.",
  teachingCompatible: "Keep this source",
  teachingReplace: "Stop using this source on approval",
  teachingReview: "Resolve before approval",
  teachingUncompared: "Not compared yet",
  teachingSources: "Sources included in the comparison ({{count}})",
  teachingApprove: "Approve teaching and apply the displayed replacements",
  indexed: "Indexing reported ready; test an answer separately.",
  indexPending:
    "Indexing is not confirmed. The saved decision remains in effect.",
  title: "Knowledge proposals to review",
  description:
    "Read the full proposal and the linked current record before deciding. A pending proposal is not approved knowledge.",
  loading: "Loading proposals…",
  loadError: "Could not read proposals. This does not mean there are none.",
  retry: "Reload proposals",
  empty: "No proposals waiting for review",
  count: "{{count}} proposals · page {{page}} of {{pages}}",
  review: "Review proposal",
  previous: "Previous",
  next: "Next",
  readOnly:
    "You can read proposals. Saving decisions requires permission to manage the assistant.",
  reviewTitle: "Review the decision",
  proposal: "Proposed text",
  current: "Current linked text",
  previousText: "Previous text when the proposal was recorded",
  reason: "Reason recorded with the proposal",
  source: "Source",
  linked:
    "Approving will enable this proposal and stop using only the linked current record. Both records stay saved. Other sources and conversation messages remain.",
  unlinked:
    "There is no verified link to a current record. Approving enables this proposal on its own; it does not stop other information or prove that the conflict is resolved.",
  unavailable:
    "The source link or current record is unavailable. Approval is blocked. You can close this proposal without enabling it.",
  blocked:
    "Approval is unavailable because of the source, expiry, injection settings or a parent that is not active. Closing without enabling remains available.",
  approve: "Approve proposal",
  replace: "Approve and stop using previous record",
  reject: "Close without enabling",
  rejectHelp:
    "Closing without enabling keeps this proposal saved and disabled. The current linked record stays unchanged.",
  ack: "I reviewed both the text and the effect of this decision.",
  save: "Save decision",
  saving: "Saving decision…",
  close: "Close review",
  choose: "Choose a decision first",
  reviewError: "Could not load the full review. No decision can be saved.",
  changed:
    "The proposal, linked knowledge or source changed. Reload the review and approve again.",
  missing:
    "This proposal is no longer pending. Reload the list to check its current state.",
  unknown:
    "The result is not confirmed. Reload the list before making another decision.",
  denied:
    "The decision was rejected. Check your permissions and reload the review.",
  saved: "Decision saved. Read the updated list. No customer message was sent.",
  reloadReview: "Reload review",
  retained: "Close without saving this decision?",
  retainedHelp:
    "Your selection and approval will be cleared. Saved knowledge will not change.",
  keep: "Keep reviewing",
  discard: "Close review",
  active: "Eligible setting: enabled",
  inactive: "Eligible setting: disabled",
  indexing:
    "This decision does not prove answer quality. Approval attempts indexing after saving; provider failure does not undo the saved decision.",
};
export type KnowledgeConflictsCopy = {
  [K in keyof typeof knowledgeConflictsEn]: string;
};
export const knowledgeConflictsAr: KnowledgeConflictsCopy = {
  teachingTitle: "مقارنة التعليم بالمعرفة الحالية",
  teachingHelp:
    "يقارن AI نص التعليم المحفوظ كاملًا بأقسام المعرفة المفعلة والأسئلة الشائعة وصفحات السياسات وحقول الإعداد المؤكدة. الفحص لا ينشر شيئًا؛ راجع النص والتغييرات المقترحة بنفسك.",
  teachingAnalyze: "مقارنة السياسات بالذكاء الاصطناعي",
  teachingAnalyzing: "جارٍ مقارنة السياسات…",
  teachingError:
    "لم تتأكد المقارنة. أعد تحميل المراجعة؛ يبقى الاقتراح غير مفعّل.",
  teachingUnavailable:
    "تعذر التحقق من مصدر التعليم أو قراءة سياق المقارنة كاملًا. استعد المصدر أو أرسل تعليمًا جديدًا كاملًا قبل الاعتماد.",
  teachingPending:
    "أجرِ المقارنة قبل الاعتماد. تغيّر المعرفة يبطل المقارنة السابقة.",
  teachingReady:
    "راجع كل استبدال مقترح قبل الاعتماد. سيتوقف استخدام السجلات المحددة للاستبدال فقط.",
  teachingBlocked:
    "تحتاج المقارنة معالجة يدوية. صحّح التعارض في السؤال الشائع أو الصفحة أو إجابة الإعداد من مصدره؛ هذه المراجعة لا تعطلها. الاستبدال غير المكتمل أو التكرار يحتاج مراجعة أيضًا.",
  teachingCompatible: "الإبقاء على هذا المصدر",
  teachingReplace: "إيقاف استخدام هذا المصدر عند الاعتماد",
  teachingReview: "يحتاج حسمًا قبل الاعتماد",
  teachingUncompared: "لم يُقارن بعد",
  teachingSources: "المصادر المشمولة بالمقارنة ({{count}})",
  teachingApprove: "اعتماد التعليم وتنفيذ الاستبدالات المعروضة",
  indexed: "أفادت الفهرسة بالجاهزية؛ جرّب الإجابة للتحقق من جودتها.",
  indexPending: "لم تتأكد جاهزية الفهرسة. يبقى القرار المحفوظ ساريًا.",
  title: "اقتراحات معرفة تحتاج مراجعتك",
  description:
    "اقرأ الاقتراح كاملًا والسجل الحالي المرتبط به قبل القرار. الاقتراح المعلّق ليس معرفة معتمدة.",
  loading: "جارٍ تحميل الاقتراحات…",
  loadError: "تعذر قراءة الاقتراحات. هذا لا يعني عدم وجودها.",
  retry: "إعادة تحميل الاقتراحات",
  empty: "لا توجد اقتراحات تنتظر المراجعة",
  count: "{{count}} اقتراح · صفحة {{page}} من {{pages}}",
  review: "مراجعة الاقتراح",
  previous: "السابق",
  next: "التالي",
  readOnly: "يمكنك قراءة الاقتراحات. حفظ القرار يتطلب صلاحية إدارة المساعد.",
  reviewTitle: "مراجعة القرار",
  proposal: "النص المقترح",
  current: "النص الحالي المرتبط",
  previousText: "النص السابق وقت تسجيل الاقتراح",
  reason: "السبب المسجل مع الاقتراح",
  source: "المصدر",
  linked:
    "الاعتماد يفعّل الاقتراح ويوقف استخدام السجل الحالي المرتبط فقط. يبقى السجلان محفوظين، وتبقى المصادر الأخرى ورسائل المحادثات.",
  unlinked:
    "لا يوجد ربط موثوق بسجل حالي. الاعتماد يفعّل هذا الاقتراح وحده؛ لا يوقف المعلومات الأخرى ولا يثبت حسم التعارض.",
  unavailable:
    "تعذر التحقق من ربط المصدر أو السجل الحالي. الاعتماد متوقف؛ يمكنك إغلاق الاقتراح دون تفعيله.",
  blocked:
    "الاعتماد غير متاح بسبب المصدر أو الصلاحية الزمنية أو إعدادات الاستخدام أو قسم أب غير مفعّل. يمكنك الإغلاق دون تفعيل.",
  approve: "اعتماد الاقتراح",
  replace: "اعتماد وإيقاف استخدام السابق",
  reject: "إغلاق دون تفعيل",
  rejectHelp:
    "عند الإغلاق دون تفعيل، يبقى الاقتراح محفوظًا وغير مفعّل، ويظل السجل الحالي المرتبط دون تغيير.",
  ack: "راجعت النص وأثر القرار وأوافق عليه.",
  save: "حفظ القرار",
  saving: "جارٍ حفظ القرار…",
  close: "إغلاق المراجعة",
  choose: "اختر القرار أولًا",
  reviewError: "تعذر تحميل المراجعة الكاملة؛ لا يمكن حفظ قرار.",
  changed:
    "تغيّر الاقتراح أو المعرفة المرتبطة أو المصدر. حدّث المراجعة ووافق من جديد.",
  missing: "لم يعد الاقتراح معلقًا. حدّث القائمة للتحقق من حالته الحالية.",
  unknown: "نتيجة القرار غير مؤكدة. حدّث القائمة قبل اتخاذ قرار آخر.",
  denied: "رُفض القرار. تحقق من الصلاحيات وحدّث المراجعة.",
  saved: "حُفظ القرار. راجع القائمة المحدثة. لم تُرسل رسالة عميل.",
  reloadReview: "تحديث المراجعة",
  retained: "إغلاق دون حفظ هذا القرار؟",
  retainedHelp: "سيُمسح الاختيار والموافقة. لن تتغير المعرفة المحفوظة.",
  keep: "متابعة المراجعة",
  discard: "إغلاق المراجعة",
  active: "إعداد الاستخدام: مفعّل",
  inactive: "إعداد الاستخدام: غير مفعّل",
  indexing:
    "هذا القرار لا يثبت جودة الإجابة. يحاول الاعتماد الفهرسة بعد الحفظ؛ تعذر المزود لا يلغي القرار المحفوظ.",
};
