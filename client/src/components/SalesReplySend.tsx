import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { ReplySendPreview, ReplySendReceipt, ReplySendSubmission } from '../../../shared/sales-reply-send';
import { buildReplySendSubmission, matchingReplySendReceipt, replySendPreviewKey, sendWorkspace } from '@/lib/sales-reply-send-state';

const control = 'min-h-11 h-auto whitespace-normal';
type Pending = { input: ReplySendSubmission; preview: ReplySendPreview };
export function SalesReplySend({ generationId, active, reviewKey, onLockedChange }: {
  generationId: number; active: boolean; reviewKey: string; onLockedChange: (locked: boolean) => void;
}) {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [account, setAccount] = useState<number>();
  const read = trpc.sariBrain.getSalesReplySendWorkspace.useQuery({ generationId, instanceRecordId: account },
    { enabled: open && active, retry: false, refetchOnWindowFocus: false, staleTime: 0 });
  const write = trpc.sariBrain.submitSalesReplySend.useMutation({ retry: false });
  const [reason, setReason] = useState(''), [verifiedAt, setVerifiedAt] = useState(''), [authorizedAt, setAuthorizedAt] = useState('');
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [refreshFailed, setRefreshFailed] = useState(false);
  const [saved, setSaved] = useState<ReplySendReceipt | null>(null), [now, setNow] = useState(Date.now());
  const pending = useRef<Pending | null>(null), inFlight = useRef(false);
  const w = !read.isError && !read.isLoading ? sendWorkspace(read.data, generationId, account) : null, p = w?.preview;
  const key = replySendPreviewKey(p), expired = !!p && now >= Date.parse(p.expiresAt);
  const binding = `${key}|${reviewKey}`, verified = !!key && verifiedAt === binding, authorized = !!key && authorizedAt === binding;
  const setVerified = (checked: boolean) => setVerifiedAt(checked ? binding : '');
  const setAuthorized = (checked: boolean) => setAuthorizedAt(checked ? binding : '');
  const editable = open && active && !!p && !read.isFetching && !busy && !unknown && !saved && !expired;
  const receipt = saved ?? (!pending.current ? w?.receipt : null);
  const valid = p && buildReplySendSubmission(p, reason, '00000000-0000-4000-8000-000000000001');
  useEffect(() => { setVerified(false); setAuthorized(false); }, [key, reviewKey, expired, active]);
  useEffect(() => { onLockedChange(busy || unknown); return () => onLockedChange(false); }, [busy, unknown, onLockedChange]);
  useEffect(() => { if (!open || !active) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [open, active]);
  useEffect(() => {
    if (!busy && !unknown) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy, unknown]);
  async function refresh() {
    if (!active || inFlight.current) return;
    inFlight.current = true; setBusy(true); setVerified(false); setAuthorized(false); setRefreshFailed(false);
    try {
      const result = await read.refetch(), current = !result.error && sendWorkspace(result.data, generationId, account);
      if (!current) throw Error('Unavailable status');
      const request = pending.current;
      if (current.receipt) {
        const r = request ? matchingReplySendReceipt(current.receipt, request.input, request.preview) : current.receipt;
        if (!r) throw Error('Unconfirmed receipt');
        setSaved(r); pending.current = null; setUnknown(false);
      }
      // No receipt cannot disprove a slow request that is still in flight on the server.
    } catch { setRefreshFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function send() {
    if (!editable || !p || !verified || !authorized || inFlight.current || pending.current) return;
    const input = buildReplySendSubmission(p, reason, crypto.randomUUID()); if (!input) return;
    pending.current = { input, preview: p }; inFlight.current = true; setBusy(true); setRefreshFailed(false);
    try {
      const result = await write.mutateAsync(input), r = matchingReplySendReceipt(result, input, p);
      if (!r) throw Error('Unconfirmed receipt');
      setSaved(r); pending.current = null; setUnknown(false);
    } catch { setUnknown(true); }
    finally { setVerified(false); setAuthorized(false); setBusy(false); inFlight.current = false; }
  }
  const statuses = {
    not_attempted: t('merchantUx.replySend.pending'), unknown: t('merchantUx.replySend.transportUnknown'),
    suppressed: t('merchantUx.replySend.suppressed'), rejected: t('merchantUx.replySend.rejected'), accepted: t('merchantUx.replySend.accepted'),
    delivered: t('merchantUx.replySend.delivered'), read: t('merchantUx.replySend.read'), failed: t('merchantUx.replySend.failed'),
  };
  return <section className="min-w-0 space-y-3 border-t pt-4" data-reply-send>
    <Button type="button" variant="outline" className={control} data-send-open aria-expanded={open} aria-controls={id} disabled={!active || busy}
      onClick={() => { setOpen(v => !v); setVerified(false); setAuthorized(false); }}>{open ? t('merchantUx.replySend.close') : t('merchantUx.replySend.open')}</Button>
    <div id={id} hidden={!open} className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-5" data-send-panel>
      <h3 className="text-lg font-semibold">{t('merchantUx.replySend.title')}</h3><p className="text-sm leading-relaxed">{t('merchantUx.replySend.scope')}</p>
      <Button type="button" variant="outline" className={control} data-send-refresh disabled={!active || busy || read.isFetching} onClick={() => void refresh()}>{t('merchantUx.replySend.refresh')}</Button>
      {unknown && <p role="alert" data-send-unknown>{t('merchantUx.replySend.unknown')}</p>}
      {refreshFailed && <p role="alert">{t('merchantUx.replySend.loadFailed')}</p>}
      {unknown && pending.current && <div className="space-y-2 rounded-lg border p-3" data-send-pending>
        <p>{t('merchantUx.replySend.recipient')}: <bdi dir="ltr">+{pending.current.preview.recipient}</bdi></p>
        <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">{pending.current.preview.responseText}</p>
      </div>}
      {receipt ? <div className="min-w-0 space-y-3 rounded-lg bg-muted p-3" data-send-receipt role="status">
        <h4 className="font-semibold">{t('merchantUx.replySend.receipt', { id: receipt.deliveryId })}</h4>
        <p data-send-status>{statuses[receipt.transport]}</p><p>{t('merchantUx.replySend.recipient')}: <bdi dir="ltr">+{receipt.recipient}</bdi></p>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">{receipt.responseText}</p>
        <p className="text-sm text-muted-foreground">{t('merchantUx.replySend.receiptScope')}</p>
      </div> : unknown ? null : read.isLoading ? <p role="status">{t('merchantUx.replySend.loading')}</p> : !w ? <p role="alert">{t('merchantUx.replySend.loadFailed')}</p> : <>
        {!w.accounts.length ? <p>{t('merchantUx.replySend.noAccount')}</p> : <label className="block space-y-2">
          <span className="font-medium">{t('merchantUx.replySend.account')}</span>
          <select data-send-account className="min-h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base" value={account ?? ''}
            disabled={!active || busy || unknown || read.isFetching} onChange={e => { setAccount(e.target.value ? Number(e.target.value) : undefined); setVerified(false); setAuthorized(false); }}>
            <option value="">{t('merchantUx.replySend.choose')}</option>
            {w.accounts.map(a => <option key={a.id} value={a.id}>{t('merchantUx.replySend.accountId', { id: a.id })}{a.phoneNumber ? ` · \u2066${a.phoneNumber}\u2069` : ''}{a.primary ? ` · ${t('merchantUx.replySend.primary')}` : ''}</option>)}
          </select></label>}
        {account && w.accounts.find(a => a.id === account)?.phoneNumber && <p className="text-sm">{t('merchantUx.replySend.account')}: <bdi dir="ltr">{w.accounts.find(a => a.id === account)!.phoneNumber}</bdi></p>}
        {w.accountsTruncated && <p>{t('merchantUx.replySend.truncated')}</p>}
        {w.stage === 'unavailable' && <p role="alert">{t('merchantUx.replySend.unavailable')}</p>}
        {w.stage === 'capacity_unavailable' && <p role="alert">{t('merchantUx.replySend.capacity')}</p>}
        {p && <div className="min-w-0 space-y-4" data-send-preview>
          <div className="rounded-lg border p-3"><h4 className="font-semibold">{t('merchantUx.replySend.recipient')}</h4><p className="text-lg" data-send-recipient><bdi dir="ltr">+{p.recipient}</bdi></p></div>
          <div className="rounded-lg border p-3"><h4 className="mb-2 font-semibold">{t('merchantUx.replySend.response')}</h4><p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]" data-send-original dir="auto">{p.responseText}</p></div>
          <p className="text-sm text-muted-foreground">{t('merchantUx.replySend.quota')}</p>
          {expired && <p role="alert">{t('merchantUx.replySend.expired')}</p>}
          <label className="block space-y-2"><span className="font-medium">{t('merchantUx.replySend.reason')}</span><span id={`${id}-reason`} className="block text-sm text-muted-foreground">{t('merchantUx.replySend.reasonHint')}</span>
            <textarea className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3 text-base" dir="auto" data-send-reason maxLength={1200} value={reason} disabled={!editable} aria-describedby={`${id}-reason`}
              onChange={e => { setReason(e.target.value); setVerified(false); setAuthorized(false); }} /></label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" data-send-verify checked={verified} disabled={!editable} onChange={e => setVerified(e.target.checked)} /><span>{t('merchantUx.replySend.verify')}</span></label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" data-send-authorize checked={authorized} disabled={!editable} onChange={e => setAuthorized(e.target.checked)} /><span>{t('merchantUx.replySend.authorize')}</span></label>
          <Button type="button" className={`${control} w-full bg-emerald-800 text-white hover:bg-emerald-900 sm:w-auto`} data-send-submit disabled={!editable || !valid || !verified || !authorized} onClick={() => void send()}>{busy ? t('merchantUx.replySend.sending') : t('merchantUx.replySend.send')}</Button>
        </div>}
      </>}
    </div>
  </section>;
}
