export const appointmentCreateEn = {
  title: "New appointment",
  hint: "Choose the service and time, add the customer, then review the appointment.",
  back: "Back to calendar",
  service: "Service",
  staff: "Provider",
  optional: "Optional",
  date: "Appointment date",
  time: "Start time",
  phone: "Customer phone",
  name: "Customer name",
  notes: "Notes",
  invalid: "Check this field.",
  phoneError:
    "Enter a phone number with 8–20 digits, optionally starting with +.",
  staffError: "This provider is not assigned to the selected service.",
  serviceError: "Choose an active service with a valid duration.",
  availability: "Suggested times",
  check: "Check available times",
  loading: "Checking availability…",
  noSlots: "No suggested times were found for this selection.",
  availabilityError:
    "Availability could not be verified. Refresh before using a suggestion.",
  advisory:
    "Times are suggestions in Riyadh time. The slot is reserved only when the appointment is saved.",
  manual: "You can enter a time manually. Conflicts are checked when saving.",
  end: "Ends at",
  review: "Review appointment",
  confirm: "Save appointment",
  cancel: "Continue editing",
  reviewHint:
    "The appointment is recorded in Sari. If Google is connected, Sari also attempts to add its event; review the sync result separately.",
  saving: "Saving appointment…",
  unsaved: "Your changes have not been saved.",
  readOnly:
    "You need appointment management permission to create an appointment.",
  sourceError:
    "Current service or permission data is unavailable. Refresh before saving.",
  refresh: "Refresh",
  uncertain:
    "The result is not confirmed. Keep this request ID and check its result before repeating the action.",
  request: "Request ID",
  verify: "Check request result",
  checking: "Checking request…",
  notFound:
    "No record was found for this request yet. Any retry uses the same request ID to prevent duplicates.",
  retry: "Retry the same request",
  recorded: "Appointment recorded",
  syncReview:
    "Google sync needs review. Open the appointment to check the evidence.",
  unavailable:
    "The request was recorded, but its appointment is no longer available. It will not be recreated.",
  open: "Open appointment",
  storage:
    "The pending request ID could not be retained in this browser. Nothing was sent. Enable session storage before saving.",
  restored:
    "A pending request was restored. Check its result before starting another appointment.",
  leaveTitle: "Leave this form?",
  leaveHint:
    "Unsaved fields will be lost. A pending request ID stays in this browser so you can check its result.",
  leave: "Leave form",
  none: "Not specified",
  blocked:
    "The result could not be read. Do not start a new request for this appointment.",
};
export const appointmentCreateAr: typeof appointmentCreateEn = {
  title: "موعد جديد",
  hint: "اختر الخدمة والوقت، وأضف بيانات العميل، ثم راجع الموعد.",
  back: "العودة للتقويم",
  service: "الخدمة",
  staff: "مقدم الخدمة",
  optional: "اختياري",
  date: "تاريخ الموعد",
  time: "وقت البداية",
  phone: "رقم العميل",
  name: "اسم العميل",
  notes: "ملاحظات",
  invalid: "راجع هذه الخانة.",
  phoneError: "أدخل رقمًا من 8 إلى 20 رقمًا، ويمكن أن يبدأ بعلامة +.",
  staffError: "مقدم الخدمة غير مخصص للخدمة المختارة.",
  serviceError: "اختر خدمة مفعّلة ذات مدة صحيحة.",
  availability: "أوقات مقترحة",
  check: "فحص الأوقات المتاحة",
  loading: "جارٍ فحص التوفر…",
  noSlots: "لم نجد أوقاتًا مقترحة لهذا الاختيار.",
  availabilityError: "تعذر التحقق من التوفر. حدّث النتيجة قبل استخدام اقتراح.",
  advisory: "الأوقات مقترحة بتوقيت الرياض. لا يُحجز الوقت إلا عند حفظ الموعد.",
  manual: "يمكنك إدخال الوقت يدويًا؛ يُفحص التعارض عند الحفظ.",
  end: "ينتهي الساعة",
  review: "مراجعة الموعد",
  confirm: "حفظ الموعد",
  cancel: "متابعة التعديل",
  reviewHint:
    "يُسجل الموعد في ساري. إذا كان Google مرتبطًا، يحاول ساري إضافة الحدث أيضًا؛ راجع نتيجة المزامنة بشكل مستقل.",
  saving: "جارٍ حفظ الموعد…",
  unsaved: "لم تُحفظ التعديلات بعد.",
  readOnly: "تحتاج صلاحية إدارة المواعيد لإنشاء موعد.",
  sourceError:
    "تعذرت قراءة الخدمة أو الصلاحية الحالية. حدّث البيانات قبل الحفظ.",
  refresh: "تحديث",
  uncertain:
    "لم تتأكد النتيجة. احتفظ بمعرّف الطلب وافحص نتيجته قبل تكرار الإجراء.",
  request: "معرّف الطلب",
  verify: "فحص نتيجة الطلب",
  checking: "جارٍ فحص الطلب…",
  notFound:
    "لا يوجد سجل لهذا الطلب حتى الآن. تستخدم إعادة المحاولة معرّف الطلب نفسه لمنع التكرار.",
  retry: "إعادة نفس الطلب",
  recorded: "تم تسجيل الموعد",
  syncReview: "مزامنة Google تحتاج مراجعة. افتح الموعد لفحص الدليل.",
  unavailable: "الطلب مسجل لكن موعده لم يعد متاحًا، ولن يُعاد إنشاؤه.",
  open: "فتح الموعد",
  storage:
    "تعذر الاحتفاظ بمعرّف الطلب المعلق في هذا المتصفح. لم يُرسل شيء. اسمح بتخزين الجلسة قبل الحفظ.",
  restored: "استُعيد طلب معلق. افحص نتيجته قبل بدء موعد آخر.",
  leaveTitle: "مغادرة النموذج؟",
  leaveHint:
    "ستفقد الخانات غير المحفوظة. يبقى معرّف الطلب المعلق في هذا المتصفح لتتمكن من فحص نتيجته.",
  leave: "مغادرة النموذج",
  none: "غير محدد",
  blocked: "تعذرت قراءة النتيجة. لا تبدأ طلبًا جديدًا لهذا الموعد.",
};
