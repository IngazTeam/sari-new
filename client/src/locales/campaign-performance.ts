export const campaignPerformanceAr = {
  list: 'قائمة الحملات', performance: 'أداء الحملات', title: 'ما الذي وصل إلى مزود واتساب؟',
  scope: 'هذه الأرقام تثبت قبول المزود للرسالة فقط. لا تثبت التسليم أو القراءة أو تحقيق مبيعات.',
  allTime: 'ملخص الحملات المكتملة · جميع الفترات', completed: '{{count}} حملة مكتملة',
  accepted: 'قبول مؤكد من المزود', unconfirmed: 'دون قبول مؤكد', rate: 'نسبة قبول المزود',
  sample: 'من أصل {{count}} مستلم في الحملات المكتملة', noSample: 'لا توجد عينة لحساب النسبة',
  unconfirmedHint: 'قد يشمل فشل الإرسال أو الاستبعاد؛ راجع تقرير الحملة لمعرفة السبب.',
  timeline: 'القبول اليومي', timelineScope: 'سجلات القبول لجميع الحملات خلال الفترة المختارة. الأيام حسب UTC؛ تغيير الفترة يغيّر هذا القسم فقط.',
  period: 'فترة الاتجاه اليومي', days7: '7 أيام', days30: '30 يومًا', days90: '90 يومًا',
  periodTotal: '{{count}} رسالة بقبول مؤكد خلال الفترة', dailyTable: 'عرض الأرقام اليومية',
  date: 'التاريخ (UTC)', chart: 'اتجاه القبول اليومي من {{start}} إلى {{end}}؛ أعلى قيمة يومية {{max}}',
  empty: 'لا توجد رسائل بقبول مؤكد خلال هذه الفترة', emptyHint: 'جرّب فترة أطول أو راجع الحملات. هذا لا يصف حالة التسليم لدى العميل.',
  loading: 'جارٍ تحميل بيانات الحملات…', loadFailed: 'تعذّر تحميل بيانات الحملات',
  loadHint: 'لا يمكن تأكيد الأرقام الآن. أعد المحاولة لتحميلها.', retry: 'إعادة المحاولة', refresh: 'تحديث البيانات',
};

export type CampaignPerformanceCopy = { [K in keyof typeof campaignPerformanceAr]: string };
export const campaignPerformanceEn: CampaignPerformanceCopy = {
  list: 'Campaign list', performance: 'Campaign performance', title: 'What did WhatsApp’s provider accept?',
  scope: 'These counts confirm provider acceptance only. They do not confirm delivery, reading, or sales.',
  allTime: 'Completed campaigns · all time', completed: '{{count}} completed campaigns',
  accepted: 'Confirmed provider acceptance', unconfirmed: 'Without confirmed acceptance', rate: 'Provider acceptance rate',
  sample: 'Out of {{count}} recipients in completed campaigns', noSample: 'No sample to calculate a rate',
  unconfirmedHint: 'May include sending failures or excluded recipients. Check the campaign report for the reason.',
  timeline: 'Daily acceptance', timelineScope: 'Acceptance logs for all campaigns within the selected period. Days use UTC; changing the period only affects this section.',
  period: 'Daily trend period', days7: '7 days', days30: '30 days', days90: '90 days',
  periodTotal: '{{count}} messages with confirmed acceptance in this period', dailyTable: 'View daily numbers',
  date: 'Date (UTC)', chart: 'Daily acceptance from {{start}} to {{end}}; highest daily count {{max}}',
  empty: 'No messages with confirmed acceptance in this period', emptyHint: 'Try a longer period or review your campaigns. This does not describe delivery to the customer.',
  loading: 'Loading campaign data…', loadFailed: 'Could not load campaign data',
  loadHint: 'The numbers cannot be confirmed right now. Retry to load them.', retry: 'Retry', refresh: 'Refresh data',
};
