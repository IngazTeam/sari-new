export const campaignPerformanceAr = {
  list: 'قائمة الحملات', performance: 'أداء الحملات', title: 'ماذا تخبرك أرقام الحملات؟',
  scope: 'الأرقام مأخوذة من سجلات حملاتك. القبول المسجل لا يعني التسليم أو القراءة أو المبيعات.',
  records: 'سجلات النجاح', checkedAt: 'آخر قراءة: {{date}} (UTC)',
  allTime: 'ملخص الحملات المكتملة · جميع الفترات', completed: '{{count}} حملة مكتملة',
  accepted: 'قبول مسجل', unconfirmed: 'دون قبول مسجل', rate: 'نسبة القبول المسجل',
  sample: 'من أصل {{count}} مستلم في الحملات المكتملة', noSample: 'لا توجد عينة لحساب النسبة',
  unconfirmedHint: 'قد يشمل فشل الإرسال أو الاستبعاد؛ راجع تقرير الحملة لمعرفة السبب.',
  timeline: 'سجلات النجاح اليومية', timelineScope: 'سجلات نجاح الإرسال لجميع الحملات خلال الفترة المختارة وحتى وقت القراءة. الأيام حسب UTC؛ لا تساوي بالضرورة عدادات الحملات المكتملة أعلاه.',
  period: 'فترة الاتجاه اليومي', days7: '7 أيام', days30: '30 يومًا', days90: '90 يومًا',
  periodTotal: '{{count}} سجل نجاح خلال الفترة', dailyTable: 'عرض الأرقام اليومية',
  date: 'التاريخ (UTC)', chart: 'اتجاه القبول اليومي من {{start}} إلى {{end}}؛ أعلى قيمة يومية {{max}}',
  empty: 'لا توجد سجلات نجاح خلال هذه الفترة', emptyHint: 'جرّب فترة أطول أو راجع الحملات. هذا لا يصف حالة التسليم لدى العميل.',
  loading: 'جارٍ تحميل بيانات الحملات…', loadFailed: 'تعذّر تحميل بيانات الحملات',
  loadHint: 'لا يمكن تأكيد الأرقام الآن. أعد المحاولة لتحميلها.', retry: 'إعادة المحاولة', refresh: 'تحديث البيانات',
};

export type CampaignPerformanceCopy = { [K in keyof typeof campaignPerformanceAr]: string };
export const campaignPerformanceEn: CampaignPerformanceCopy = {
  list: 'Campaign list', performance: 'Campaign performance', title: 'What do your campaign numbers show?',
  scope: 'Figures come from your campaign records. Recorded acceptance does not confirm delivery, reading, or sales.',
  records: 'Success records', checkedAt: 'Last checked: {{date}} (UTC)',
  allTime: 'Completed campaigns · all time', completed: '{{count}} completed campaigns',
  accepted: 'Recorded acceptance', unconfirmed: 'Without recorded acceptance', rate: 'Recorded acceptance rate',
  sample: 'Out of {{count}} recipients in completed campaigns', noSample: 'No sample to calculate a rate',
  unconfirmedHint: 'May include sending failures or excluded recipients. Check the campaign report for the reason.',
  timeline: 'Daily success records', timelineScope: 'Send-success logs for all campaigns in the selected UTC period, up to this snapshot. They may differ from the completed-campaign counters above.',
  period: 'Daily trend period', days7: '7 days', days30: '30 days', days90: '90 days',
  periodTotal: '{{count}} success records in this period', dailyTable: 'View daily numbers',
  date: 'Date (UTC)', chart: 'Daily acceptance from {{start}} to {{end}}; highest daily count {{max}}',
  empty: 'No success records in this period', emptyHint: 'Try a longer period or review your campaigns. This does not describe delivery to the customer.',
  loading: 'Loading campaign data…', loadFailed: 'Could not load campaign data',
  loadHint: 'The numbers cannot be confirmed right now. Retry to load them.', retry: 'Retry', refresh: 'Refresh data',
};
