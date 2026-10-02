export const calendarConnectionEn = {
  manage: "Manage connection",
  loading: "Loading connection status…",
  unknown: "Connection status unavailable",
  permission:
    "Integration management permission is required to view this connection.",
  eyebrow: "Appointments and integrations",
  title: "Google Calendar",
  description:
    "Connect a calendar for appointment sync. Review individual events and reminders from the calendar.",
  back: "Open calendar",
  refresh: "Refresh status",
  status: "Connection settings",
  configured: "Connection saved",
  unlinked: "Not connected",
  credentials_invalid: "Reconnect required",
  oauth_disabled: "Provider unavailable",
  needs_destination: "Calendar not selected",
  configuredHint:
    "These are the saved settings. They do not confirm that Google is reachable or that every event is synced.",
  unlinkedHint: "Connect your Google account to prepare calendar sync.",
  credentialsHint:
    "Saved access is missing or invalid. Reconnect to renew access.",
  disabledHint:
    "Google connection is unavailable in platform settings. You can still disconnect locally.",
  destinationHint:
    "Reconnect to select the primary calendar of your Google account.",
  destination: "Saved calendar",
  primary: "Primary calendar",
  unavailable: "Not recorded",
  lastSync: "Last recorded sync",
  appointments: "Appointments kept in Sari",
  connect: "Connect Google Calendar",
  reconnect: "Reconnect Google Calendar",
  connecting: "Opening Google…",
  connectHint:
    "Continue to Google in this tab. The selected account’s primary calendar will be used. Previous appointment links stay in their records.",
  connectFailed:
    "Could not start the connection. Refresh the status before trying again.",
  rateLimit:
    "A connection was just started. Wait a few seconds, then refresh before trying again.",
  providerDisabled:
    "Google connection is not available. Contact your platform administrator.",
  disconnect: "Disconnect from Sari",
  disconnectTitle: "Disconnect Google Calendar?",
  disconnectHint:
    "Sari will remove its saved access. Appointments and their history remain. Google events will not be cancelled, and Google account permissions are not revoked here.",
  retained: "{{count}} appointments will remain in Sari.",
  reviewed: "I understand what disconnecting changes.",
  cancel: "Keep connection",
  confirm: "Confirm disconnect",
  disconnecting: "Disconnecting…",
  disconnected:
    "Saved access was removed. Your appointments are still available.",
  uncertain:
    "The result could not be confirmed. Refresh the status before repeating the action.",
  changed:
    "Connection settings changed. Close this review and refresh the status.",
  callbackConnected:
    "Returned from Google. Use the current connection status below to check the result.",
  callbackCancelled:
    "Google permission was declined. Your existing settings were not changed by that request.",
  callbackFailed:
    "The connection was not completed. Refresh the status and start again.",
  callbackSession:
    "The connection session expired. Sign in again before reconnecting.",
  reminders: "Events and reminders",
  remindersHint:
    "Check sync evidence and reminder outcomes inside each appointment. A saved connection does not mean reminders have been sent.",
  privacy: "Manage Google account access",
  privacyHint:
    "To revoke Google permissions too, review third-party access in your Google account.",
};
export const calendarConnectionAr: typeof calendarConnectionEn = {
  manage: "إدارة الاتصال",
  loading: "جارٍ قراءة حالة الاتصال…",
  unknown: "تعذرت قراءة حالة الاتصال",
  permission: "تحتاج صلاحية إدارة التكاملات لعرض هذا الاتصال.",
  eyebrow: "المواعيد والتكاملات",
  title: "تقويم Google",
  description:
    "اربط تقويمًا لمزامنة المواعيد، وراجع نتيجة كل حدث وتذكير من التقويم.",
  back: "فتح التقويم",
  refresh: "تحديث الحالة",
  status: "إعدادات الاتصال",
  configured: "إعداد الاتصال محفوظ",
  unlinked: "غير متصل",
  credentials_invalid: "يحتاج إعادة ربط",
  oauth_disabled: "الربط غير متاح",
  needs_destination: "لم يُحدد التقويم",
  configuredHint:
    "هذه الإعدادات المحفوظة؛ لا تؤكد وصول Google الآن أو مزامنة جميع الأحداث.",
  unlinkedHint: "اربط حساب Google لتجهيز مزامنة التقويم.",
  credentialsHint:
    "بيانات الوصول المحفوظة ناقصة أو غير صالحة. أعد الربط لتجديد الوصول.",
  disabledHint:
    "ربط Google غير متاح في إعدادات المنصة. يمكنك فصل الوصول المحفوظ محليًا.",
  destinationHint: "أعد الربط لاختيار التقويم الأساسي لحساب Google.",
  destination: "التقويم المحفوظ",
  primary: "التقويم الأساسي",
  unavailable: "غير مسجل",
  lastSync: "آخر مزامنة مسجلة",
  appointments: "المواعيد المحفوظة في ساري",
  connect: "ربط تقويم Google",
  reconnect: "إعادة ربط تقويم Google",
  connecting: "جارٍ فتح Google…",
  connectHint:
    "ستنتقل إلى Google في هذا التبويب. سيُستخدم التقويم الأساسي للحساب المختار، وتبقى روابط المواعيد السابقة في سجلاتها.",
  connectFailed: "تعذر بدء الربط. حدّث الحالة قبل المحاولة مرة أخرى.",
  rateLimit:
    "بدأ طلب ربط للتو. انتظر بضع ثوانٍ ثم حدّث الحالة قبل المحاولة مجددًا.",
  providerDisabled: "ربط Google غير متاح. تواصل مع مسؤول المنصة.",
  disconnect: "فصل الاتصال من ساري",
  disconnectTitle: "فصل تقويم Google؟",
  disconnectHint:
    "سيحذف ساري بيانات الوصول المحفوظة. تبقى المواعيد وسجلها، ولا تُلغى أحداث Google ولا تُسحب صلاحية حساب Google من هنا.",
  retained: "ستبقى {{count}} من المواعيد محفوظة في ساري.",
  reviewed: "فهمت ما يتغير عند فصل الاتصال.",
  cancel: "إبقاء الاتصال",
  confirm: "تأكيد الفصل",
  disconnecting: "جارٍ الفصل…",
  disconnected: "حُذفت بيانات الوصول المحفوظة، وما زالت مواعيدك متاحة.",
  uncertain: "تعذر التأكد من النتيجة. حدّث الحالة قبل تكرار الإجراء.",
  changed: "تغيرت إعدادات الاتصال. أغلق المراجعة وحدّث الحالة.",
  callbackConnected:
    "عدت من Google. اعتمد حالة الاتصال الحالية أدناه للتحقق من النتيجة.",
  callbackCancelled:
    "رُفض منح صلاحية Google. لم يغير هذا الطلب إعداداتك السابقة.",
  callbackFailed: "لم يكتمل الربط. حدّث الحالة ثم ابدأ مجددًا.",
  callbackSession: "انتهت جلسة الربط. سجل الدخول مجددًا قبل إعادة الربط.",
  reminders: "الأحداث والتذكيرات",
  remindersHint:
    "راجع دليل المزامنة ونتائج التذكيرات داخل كل موعد. حفظ الاتصال لا يعني إرسال التذكيرات.",
  privacy: "إدارة وصول حساب Google",
  privacyHint:
    "لسحب صلاحية Google أيضًا، راجع وصول التطبيقات الخارجية في حساب Google.",
};
