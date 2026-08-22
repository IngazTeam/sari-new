export const SUPPORT_LEAD_SOURCES = [
  'general',
  'training_centers_byaan',
] as const;

export type SupportLeadSource = (typeof SUPPORT_LEAD_SOURCES)[number];

export type SupportLeadContext = {
  source: SupportLeadSource;
  subject: string;
  message: string;
};

const EMPTY_SUPPORT_CONTEXT: SupportLeadContext = {
  source: 'general',
  subject: '',
  message: '',
};

/**
 * Public query strings are untrusted. Resolve only named campaign topics and
 * return owned copy; never reflect a subject or message supplied by the URL.
 */
export function resolveSupportLeadContext(
  search: string,
  language: 'ar' | 'en',
): SupportLeadContext {
  const topic = new URLSearchParams(search).get('topic');
  if (topic !== 'byaan-training') return { ...EMPTY_SUPPORT_CONTEXT };

  return language === 'ar'
    ? {
        source: 'training_centers_byaan',
        subject: 'تقييم تكامل بيان لمركز تدريب',
        message: 'أرغب في تقييم تكامل ساري مع بيان لمركز تدريبي.\n\nنطاق بيان (إن وجد):\nالبيانات أو العمليات المطلوب ربطها:',
      }
    : {
        source: 'training_centers_byaan',
        subject: 'Byaan integration assessment for a training center',
        message: 'I would like to assess the Sari and Byaan integration for a training center.\n\nByaan domain (if available):\nData or workflows to connect:',
      };
}
