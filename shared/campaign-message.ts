export const CAMPAIGN_OPT_OUT_NOTICE_AR = 'لإيقاف الرسائل التسويقية أرسل «إلغاء الاشتراك».';

/** Shared by the preview and dispatcher so the reviewed text includes the notice. */
export function withCampaignOptOutNotice(message: string): string {
  const trimmed = message.trim(), normalized = trimmed.normalize('NFKC').toLowerCase();
  if (normalized.includes('إلغاء الاشتراك') || normalized.includes('الغاء الاشتراك') || /\b(?:unsubscribe|opt[ -]?out)\b/i.test(normalized)) return trimmed;
  return `${trimmed}\n\n${CAMPAIGN_OPT_OUT_NOTICE_AR}`;
}

export type CampaignMessageIssue = 'empty_message' | 'invalid_image' | 'text_too_long' | 'caption_too_long';

/** Match the transport's UTF-16 limits, including the appended opt-out notice. */
export function campaignMessageIssue(message: unknown, imageUrl: unknown): CampaignMessageIssue | null {
  if (typeof message !== 'string' || !message.trim()) return 'empty_message';
  if (imageUrl != null) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) return 'invalid_image';
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:' || url.username || url.password) return 'invalid_image';
    } catch { return 'invalid_image'; }
  }
  const outgoing = withCampaignOptOutNotice(message);
  return outgoing.length > (imageUrl == null ? 4096 : 1024)
    ? (imageUrl == null ? 'text_too_long' : 'caption_too_long') : null;
}
