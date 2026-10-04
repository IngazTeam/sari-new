import { acquisitionPeriods, acquisitionWorkspaceSchema, type AcquisitionPeriod } from '@shared/acquisition-workspace';
export function acquisitionSelection(search: string): AcquisitionPeriod | null {
  const p=new URLSearchParams(search),value=p.get('period')??'all';
  return p.getAll('period').length<=1&&acquisitionPeriods.includes(value as AcquisitionPeriod)?value as AcquisitionPeriod:null;
}
export function scopedAcquisition(value: unknown, actorId: number, merchantId: number, period: AcquisitionPeriod) {
  const p=acquisitionWorkspaceSchema.safeParse(value);
  return p.success&&p.data.actorId===actorId&&p.data.merchantId===merchantId&&p.data.period===period?p.data:null;
}

export const acquisitionLabels=(t:(key:string)=>string):Record<string,string>=>({
  eyebrow:t("acquisitionUx.eyebrow"),
  title:t("acquisitionUx.title"),
  intro:t("acquisitionUx.intro"),
  customers:t("acquisitionUx.customers"),
  period:t("acquisitionUx.period"),
  period_all:t("acquisitionUx.period_all"),
  period_30d:t("acquisitionUx.period_30d"),
  period_90d:t("acquisitionUx.period_90d"),
  invalidPeriod:t("acquisitionUx.invalidPeriod"),
  invalidPeriodBody:t("acquisitionUx.invalidPeriodBody"),
  reset:t("acquisitionUx.reset"),
  refresh:t("acquisitionUx.refresh"),
  evidence:t("acquisitionUx.evidence"),
  total:t("acquisitionUx.total"),
  totalHint:t("acquisitionUx.totalHint"),
  classified:t("acquisitionUx.classified"),
  classifiedHint:t("acquisitionUx.classifiedHint"),
  unclassified:t("acquisitionUx.unclassified"),
  unclassifiedHint:t("acquisitionUx.unclassifiedHint"),
  sources:t("acquisitionUx.sources"),
  shareHint:t("acquisitionUx.shareHint"),
  empty:t("acquisitionUx.empty"),
  emptyBody:t("acquisitionUx.emptyBody"),
  profiles:t("acquisitionUx.profiles"),
  otherHint:t("acquisitionUx.otherHint"),
  missingHint:t("acquisitionUx.missingHint"),
  top:t("acquisitionUx.top"),
  method:t("acquisitionUx.method"),
  methodBody:t("acquisitionUx.methodBody"),
  trackingBody:t("acquisitionUx.trackingBody"),
  duplicates:t("acquisitionUx.duplicates"),
  checkedAt:t("acquisitionUx.checkedAt"),
  source_instagram:t("acquisitionUx.source_instagram"),
  source_snapchat:t("acquisitionUx.source_snapchat"),
  source_twitter:t("acquisitionUx.source_twitter"),
  source_tiktok:t("acquisitionUx.source_tiktok"),
  source_facebook:t("acquisitionUx.source_facebook"),
  source_youtube:t("acquisitionUx.source_youtube"),
  source_google_ads:t("acquisitionUx.source_google_ads"),
  source_ad_general:t("acquisitionUx.source_ad_general"),
  source_direct:t("acquisitionUx.source_direct"),
  source_google:t("acquisitionUx.source_google"),
  source_referral:t("acquisitionUx.source_referral"),
  source_ads:t("acquisitionUx.source_ads"),
  source_whatsapp:t("acquisitionUx.source_whatsapp"),
  source_other:t("acquisitionUx.source_other"),
  source_unattributed:t("acquisitionUx.source_unattributed"),
});
