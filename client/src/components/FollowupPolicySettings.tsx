import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { defaultFollowupPolicy, followupPolicySchema, suggestedFollowupTimezones, type FollowupPolicy } from '../../../shared/followup-policy';

const toDraft = (policy: FollowupPolicy) => ({ ...policy, startHour: String(policy.startHour), endHour: String(policy.endHour), weeklyLimit: String(policy.weeklyLimit) });
const numeric = (value: string) => value.trim() === '' ? Number.NaN : Number(value);

export function FollowupPolicySettings() {
  const { t } = useTranslation();
  const query = trpc.sariBrain.getFollowupPolicy.useQuery(undefined, { refetchOnWindowFocus: false });
  // Preserve empty input while editing; coercing it to zero moves the cursor and changes the next typed value.
  const [draft, setDraft] = useState(() => toDraft(defaultFollowupPolicy));
  useEffect(() => { if (query.data) setDraft(toDraft(query.data.policy)); }, [query.data]);
  const mutation = trpc.sariBrain.updateFollowupPolicy.useMutation({ onSuccess: () => { void query.refetch(); } });
  const policy = { ...draft, startHour: numeric(draft.startHour), endHour: numeric(draft.endHour), weeklyLimit: numeric(draft.weeklyLimit) };
  const valid = followupPolicySchema.safeParse(policy).success;
  const disabled = !query.data?.canManage || mutation.isPending;
  const changed = query.data && JSON.stringify(policy) !== JSON.stringify(query.data.policy);
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => { setDraft(old => ({ ...old, [key]: value })); mutation.reset(); };
  return <section aria-labelledby="followup-policy-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
    <div><h2 id="followup-policy-title" className="text-lg font-semibold">{t('merchantUx.followupPolicy.title')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('merchantUx.followupPolicy.description')}</p></div>
    {query.isLoading ? <p role="status">{t('merchantUx.followupPolicy.loading')}</p> : query.isError ? <div role="alert">
      <p>{t('merchantUx.followupPolicy.loadFailed')}</p><Button className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.followupPolicy.refresh')}</Button>
    </div> : query.data && <>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input id="followup-enabled" type="checkbox" checked={draft.enabled} disabled={disabled}
        onChange={e => set('enabled', e.target.checked)} className="h-5 w-5" />{t('merchantUx.followupPolicy.enabled')}</label>
      <p className="text-sm text-muted-foreground">{t('merchantUx.followupPolicy.disableHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.followupPolicy.timezone')}</span>
          <input id="followup-timezone" list="followup-timezones" dir="ltr" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" maxLength={64}
            value={draft.timeZone} disabled={disabled} onChange={e => set('timeZone', e.target.value)} />
          <datalist id="followup-timezones">{suggestedFollowupTimezones.map(zone => <option value={zone} key={zone} />)}</datalist>
          <span className="block text-muted-foreground">{t('merchantUx.followupPolicy.timezoneHint')}</span>
        </label>
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.followupPolicy.weeklyLimit')}</span>
          <input id="followup-weekly-limit" type="number" min={1} max={3} step={1} inputMode="numeric" className="min-h-11 w-full rounded-md border bg-background px-3"
            value={draft.weeklyLimit} disabled={disabled} onChange={e => set('weeklyLimit', e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.followupPolicy.startHour')}</span>
          <input id="followup-start-hour" type="number" min={0} max={23} step={1} inputMode="numeric" className="min-h-11 w-full rounded-md border bg-background px-3"
            value={draft.startHour} disabled={disabled} onChange={e => set('startHour', e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>{t('merchantUx.followupPolicy.endHour')}</span>
          <input id="followup-end-hour" type="number" min={1} max={24} step={1} inputMode="numeric" className="min-h-11 w-full rounded-md border bg-background px-3"
            value={draft.endHour} disabled={disabled} onChange={e => set('endHour', e.target.value)} /></label>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.followupPolicy.scope')}</p>
      {!valid && <p role="alert" className="text-sm text-destructive">{t('merchantUx.followupPolicy.invalid')}</p>}
      {query.data.canManage ? <Button className="h-auto min-h-11 whitespace-normal" disabled={!valid || !changed || mutation.isPending}
        onClick={() => mutation.mutate({ policy, expectedRevision: query.data.revision })}>
        {mutation.isPending ? t('merchantUx.followupPolicy.saving') : t('merchantUx.followupPolicy.save')}
      </Button> : <p className="text-sm">{t('merchantUx.followupPolicy.readOnly')}</p>}
      {mutation.isError && <div role="alert"><p className="text-sm text-destructive">{t('merchantUx.followupPolicy.failed')}</p>
        <Button variant="outline" className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.followupPolicy.refresh')}</Button></div>}
      {mutation.isSuccess && <p role="status" className="text-sm">{t('merchantUx.followupPolicy.saved')}</p>}
    </>}
  </section>;
}
