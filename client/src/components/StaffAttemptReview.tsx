import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { StaffAttemptGuidance } from './StaffAttemptGuidance';
import { staffAttemptPage, staffAttemptItem, staffAttemptCheckResult } from '@shared/staff-attempt-review';

function Attempt({ item, conversationId, kind, refreshing, revision, onChecked }: {
  item: z.infer<typeof staffAttemptItem>; conversationId: number; kind: 'text' | 'voice'; refreshing: boolean; revision: number; onChecked: () => void;
}) {
  const { t, i18n } = useTranslation();
  const mutation = trpc.conversations.checkStaffAttempt.useMutation({ retry: false });
  const busy = useRef(false);
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(false);
  useEffect(() => setBlocked(false), [revision]);
  const states = { pending: t('merchantUx.staffAttempts.pending'), accepted: t('merchantUx.staffAttempts.accepted'), unavailable: t('merchantUx.staffAttempts.unavailable'), failed:t('merchantUx.staffAttempts.failed'), suppressed:t('merchantUx.staffAttempts.suppressed') };
  const check = async () => {
    if (busy.current || blocked || refreshing || !['pending','failed','suppressed'].includes(item.state)) return;
    busy.current = true; setNotice('');
    try {
      const result = staffAttemptCheckResult.parse(await mutation.mutateAsync({ conversationId, kind, sourceId: item.id }));
      setNotice(result.success ? result.persisted ? t('merchantUx.staffAttempts.checked') : t('merchantUx.staffAttempts.unprojected')
        : result.status === 'pending' ? t('merchantUx.staffAttempts.unresolved') : result.status==='suppressed'?t('merchantUx.staffAttempts.dispatchSuppressed'):t('merchantUx.staffAttempts.providerFailed'));
      onChecked();
    } catch { setBlocked(true); setNotice(t('merchantUx.staffAttempts.checkFailed')); }
    finally { busy.current = false; }
  };
  return <article data-staff-attempt={item.id} data-attempt-state={item.state} className="min-w-0 space-y-2 rounded-lg border bg-background p-3 text-sm [overflow-wrap:anywhere]">
    <h4 className="font-semibold">{t('merchantUx.staffAttempts.attempt', { id: item.id })}</h4>
    <time dateTime={item.createdAt} className="text-muted-foreground">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
    <p>{states[item.state]}</p>
    <StaffAttemptGuidance diagnostic={item.diagnostic}/>
    {item.state === 'accepted' && !item.persisted && <p>{t('merchantUx.staffAttempts.unprojected')}</p>}
    {['pending','failed','suppressed'].includes(item.state) && <Button data-attempt-check className="h-auto min-h-11 w-full whitespace-normal" disabled={blocked || refreshing || mutation.isPending} onClick={() => void check()}>
      {mutation.isPending ? t('merchantUx.staffAttempts.checking') : t('merchantUx.staffAttempts.check')}</Button>}
    {notice && <p role="status" data-attempt-notice>{notice}</p>}
  </article>;
}

/** The parent keys this panel by conversation, so late results cannot retarget another conversation. */
export function StaffAttemptReview({ conversationId }: { conversationId: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [kind, setKind] = useState<'text' | 'voice'>('text');
  const [beforeId, setBeforeId] = useState<number>();
  const utils = trpc.useUtils();
  const query = trpc.conversations.listStaffAttempts.useQuery({ conversationId, kind, beforeId }, { enabled: open, retry: false, staleTime: 0 });
  const parsed = query.data === undefined ? null : staffAttemptPage.safeParse(query.data);
  const page = parsed?.success ? parsed.data : null;
  const refresh = () => { if (beforeId !== undefined) setBeforeId(undefined); else void query.refetch(); };
  const checked = () => {
    void utils.conversations.listStaffAttempts.invalidate({ conversationId, kind });
    void utils.conversations.getMessages.invalidate({ conversationId });
    void utils.conversations.messageHistory.invalidate({ conversationId });
  };
  return <details data-staff-attempt-review className="mw-chat-actions" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary style={{ minHeight: 44 }} className="cursor-pointer">{t('merchantUx.staffAttempts.title')}</summary>
    {open && <section aria-label={t('merchantUx.staffAttempts.title')} className="min-w-0 space-y-3 p-3 text-sm">
      <p className="leading-relaxed text-muted-foreground">{t('merchantUx.staffAttempts.scope')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('merchantUx.staffAttempts.title')}>
        <Button data-attempt-kind="text" aria-pressed={kind === 'text'} variant={kind === 'text' ? 'default' : 'outline'} className="h-auto min-h-11 whitespace-normal" onClick={() => { setKind('text'); setBeforeId(undefined); }}>{t('merchantUx.staffAttempts.text')}</Button>
        <Button data-attempt-kind="voice" aria-pressed={kind === 'voice'} variant={kind === 'voice' ? 'default' : 'outline'} className="h-auto min-h-11 whitespace-normal" onClick={() => { setKind('voice'); setBeforeId(undefined); }}>{t('merchantUx.staffAttempts.voice')}</Button>
      </div>
      {query.isLoading ? <p role="status">{t('merchantUx.staffAttempts.loading')}</p>
        : query.isError ? <p role="alert">{t('merchantUx.staffAttempts.loadFailed')}</p>
        : parsed && !parsed.success ? <p role="alert">{t('merchantUx.staffAttempts.invalid')}</p>
        : page && <div data-attempt-list key={`${kind}:${beforeId ?? 'latest'}`} className="max-h-72 space-y-3 overflow-y-auto overscroll-contain" tabIndex={0}>
          {page.items.length === 0 ? <p>{t('merchantUx.staffAttempts.empty')}</p> : page.items.map(item => <Attempt key={item.id} item={item} conversationId={conversationId} kind={kind} refreshing={query.isFetching} revision={query.dataUpdatedAt} onChecked={checked} />)}
        </div>}
      <div className="flex flex-wrap gap-2">
        <Button data-attempt-refresh variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={refresh}>{beforeId ? t('merchantUx.staffAttempts.latest') : t('merchantUx.staffAttempts.refresh')}</Button>
        {!query.isError && page?.nextCursor && <Button data-attempt-older variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={() => setBeforeId(page.nextCursor!)}>{t('merchantUx.staffAttempts.older')}</Button>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('merchantUx.staffAttempts.acceptanceScope')}</p>
    </section>}
  </details>;
}
