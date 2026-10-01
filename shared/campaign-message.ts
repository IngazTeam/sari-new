export const CAMPAIGN_OPT_OUT_NOTICE_AR = 'لإيقاف الرسائل التسويقية أرسل «إلغاء الاشتراك».';

/** Shared by the preview and dispatcher so the reviewed text includes the notice. */
export function withCampaignOptOutNotice(message: string): string {
  const trimmed = message.trim(), normalized = trimmed.normalize('NFKC').toLowerCase();
  if (normalized.includes('إلغاء الاشتراك') || normalized.includes('الغاء الاشتراك') || /\b(?:unsubscribe|opt[ -]?out)\b/i.test(normalized)) return trimmed;
  return `${trimmed}\n\n${CAMPAIGN_OPT_OUT_NOTICE_AR}`;
}
