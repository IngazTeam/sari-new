import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { defaultDiscountPolicy, discountPolicySchema, type DiscountPolicy } from '../../../shared/discount-policy';

const toDraft = (p: DiscountPolicy) => ({ enabled: p.enabled, maxPercent: String(p.maxPercent), expireHours: String(p.expireHours) });
const numeric = (value: string) => value.trim() === '' ? Number.NaN : Number(value);
export function DiscountPolicySettings() {
  const { t, i18n } = useTranslation();
  const query = trpc.botSettings.getDiscountPolicy.useQuery(undefined, { refetchOnWindowFocus: false });
  const [base, setBase] = useState<{ policy: DiscountPolicy; revision: number; evidence: string } | null>(null);
  const [draft, setDraft] = useState(() => toDraft(defaultDiscountPolicy)), [reviewed, setReviewed] = useState(false);
  const accept = (data: NonNullable<typeof base>) => { setBase(data); setDraft(toDraft(data.policy)); setReviewed(false); };
  useEffect(() => { if (query.data && !base) accept(query.data); }, [query.data, base]);
  useEffect(() => { setReviewed(false); }, [query.data?.evidence]);
  const mutation = trpc.botSettings.updateDiscountPolicy.useMutation({ onSuccess: data => { accept(data); void query.refetch(); } });
  const policy = { enabled: draft.enabled, maxPercent: numeric(draft.maxPercent), expireHours: numeric(draft.expireHours) };
  const valid = discountPolicySchema.safeParse(policy).success;
  const changed = base && JSON.stringify(policy) !== JSON.stringify(base.policy);
  const stale = base && query.data && base.evidence !== query.data.evidence;
  const disabled = !query.data?.canManage || mutation.isPending || query.isFetching;
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => {
    setDraft(old => ({ ...old, [key]: value })); setReviewed(false);
  };
  const refresh = async () => { setReviewed(false); const result = await query.refetch(); if (result.data && !result.isError) { accept(result.data); mutation.reset(); } };
  const terms = (p: DiscountPolicy) => t('merchantUx.discountPolicy.terms', { state: p.enabled ? t('merchantUx.discountPolicy.on') : t('merchantUx.discountPolicy.off'), percent: p.maxPercent, hours: p.expireHours });
  return <section aria-labelledby="discount-policy-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
    <div><h2 id="discount-policy-title" className="text-lg font-semibold">{t('merchantUx.discountPolicy.title')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('merchantUx.discountPolicy.description')}</p></div>
    {query.isLoading ? <p role="status">{t('merchantUx.discountPolicy.loading')}</p> : query.isError ? <div role="alert">
      <p>{t('merchantUx.discountPolicy.loadFailed')}</p><Button type="button" className="mt-2 min-h-11" onClick={refresh}>{t('merchantUx.discountPolicy.refresh')}</Button>
    </div> : query.data && base && <>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input id="discount-policy-enabled" type="checkbox" className="h-5 w-5" checked={draft.enabled}
        disabled={disabled} onChange={e => set('enabled', e.target.checked)} />{t('merchantUx.discountPolicy.enabled')}</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.discountPolicy.maxPercent')}</span>
          <input id="discount-policy-percent" type="number" min={1} max={50} step={1} inputMode="numeric" dir="ltr" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
            value={draft.maxPercent} disabled={disabled} onChange={e => set('maxPercent', e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.discountPolicy.expireHours')}</span>
          <input id="discount-policy-hours" type="number" min={1} max={168} step={1} inputMode="numeric" dir="ltr" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3"
            value={draft.expireHours} disabled={disabled} onChange={e => set('expireHours', e.target.value)} /></label>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.discountPolicy.scope')}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.discountPolicy.margin')}</p>
      <p className="text-sm">{t('merchantUx.discountPolicy.current', { revision: query.data.revision })} {terms(query.data.policy)}</p>
      {!valid && <p role="alert" className="text-sm text-destructive">{t('merchantUx.discountPolicy.invalid')}</p>}
      {query.data.canManage ? <>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><input id="discount-policy-reviewed" type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed}
          disabled={disabled || !valid || !changed || !!stale || mutation.isError} onChange={e => setReviewed(e.target.checked)} />{t('merchantUx.discountPolicy.reviewed')}</label>
        <Button id="discount-policy-save" type="button" className="h-auto min-h-11 whitespace-normal" disabled={disabled || !valid || !changed || !reviewed || !!stale || mutation.isError}
          onClick={() => mutation.mutate({ policy, expectedRevision: base.revision, evidence: base.evidence, reviewed: true })}>
          {mutation.isPending ? t('merchantUx.discountPolicy.saving') : t('merchantUx.discountPolicy.save')}</Button>
      </> : <p className="text-sm">{t('merchantUx.discountPolicy.readOnly')}</p>}
      {(mutation.isError || stale) && <div role="alert"><p className="text-sm text-destructive">{t('merchantUx.discountPolicy.failed')}</p>
        <Button type="button" variant="outline" className="mt-2 h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={refresh}>{t('merchantUx.discountPolicy.refresh')}</Button></div>}
      {mutation.isSuccess && !changed && !stale && <p role="status">{t('merchantUx.discountPolicy.saved')}</p>}
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t('merchantUx.discountPolicy.history')}</summary>
        <p className="mb-3 text-sm text-muted-foreground">{t('merchantUx.discountPolicy.historyScope')}</p>
        {!query.data.history.length ? <p className="text-sm">{t('merchantUx.discountPolicy.empty')}</p> : <ol className="space-y-3">
          {query.data.history.map(item => <li key={item.revision} className="space-y-1 rounded-lg border p-3 text-sm">
            <p>{t('merchantUx.discountPolicy.change', { revision: item.revision, actor: item.actorUserId })}</p>
            <time className="block break-words" dateTime={String(item.createdAt)}>{new Date(item.createdAt).toLocaleString(i18n.language)}</time>
            <p>{t('merchantUx.discountPolicy.before')} {terms(item.beforePolicy)}</p><p>{t('merchantUx.discountPolicy.after')} {terms(item.afterPolicy)}</p>
          </li>)}</ol>}
      </details>
    </>}
  </section>;
}
