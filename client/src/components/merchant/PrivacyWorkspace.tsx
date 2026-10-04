import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Download, MessageSquare, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { usageQueryOptions } from '@/lib/usage-workspace-view';
import { privacyWorkspace } from '@shared/privacy-workspace';
import { privacyLabels } from '@/lib/privacy-workspace-labels';
import {
  downloadPrivacyExport,
  type PrivacyActions,
  browserPrivacyActions,
} from '@/lib/privacy-export';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import '@/styles/sheets-data-workspace.css';
import '@/styles/privacy-workspace.css';
const DELETION_CONFIRMATION = 'DELETE_MY_ACCOUNT';
type Panel = 'consent' | 'request' | 'export' | 'delete';
export function PrivacyPage({
  actions = browserPrivacyActions,
}: {
  actions?: PrivacyActions;
}) {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  if (user.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(user.error)}
        onRetry={() => void user.refetch()}
      />
    );
  if (user.isLoading || user.isFetching)
    return <WorkspaceState kind="loading" />;
  if (!user.data?.id)
    return (
      <WorkspaceState kind="session" onRetry={() => void user.refetch()} />
    );
  return (
    <PrivacyAccountWorkspace
      key={user.data.id}
      actorId={user.data.id}
      actions={actions}
    />
  );
}
function PrivacyAccountWorkspace({
  actorId,
  actions,
}: {
  actorId: number;
  actions: PrivacyActions;
}) {
  const { t, i18n } = useTranslation(),
    c = privacyLabels(t),
    english = i18n.language.startsWith('en');
  const query = trpc.accountData.getState.useQuery(
    undefined,
    usageQueryOptions
  );
  const consent = trpc.accountData.setMarketingConsent.useMutation(),
    request = trpc.accountData.submitRequest.useMutation(),
    exportData = trpc.accountData.exportPersonalData.useMutation(),
    deletion = trpc.accountData.requestDeletion.useMutation();
  const [review, setReview] = useState<Panel | null>(null),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [granted, setGranted] = useState(false),
    [requestType, setRequestType] = useState<
      'access' | 'correction' | 'objection'
    >('access'),
    [details, setDetails] = useState(''),
    [notice, setNotice] = useState(''),
    [fieldError, setFieldError] = useState(''),
    [running, setRunning] = useState(false),
    [deletionLocked, setDeletionLocked] = useState(false),
    [ended, setEnded] = useState(false);
  const busy = useRef(false),
    alive = useRef(true),
    trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const parsed = privacyWorkspace.safeParse(query.data),
    data =
      parsed.success && parsed.data.actorId === actorId ? parsed.data : null;
  const close = () => {
    if (!busy.current) {
      setReview(null);
      setPassword('');
      setConfirmation('');
      setFieldError('');
    }
  };
  const open = (panel: Panel, button: HTMLButtonElement) => {
    trigger.current = button;
    setNotice('');
    setFieldError('');
    setPassword('');
    setConfirmation('');
    setGranted(data?.marketingConsent === true);
    setReview(panel);
  };
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(english ? 'en' : 'ar', {
          dateStyle: 'medium',
        }).format(new Date(value))
      : c.unknown;
  const deletionBlocked =
    !data ||
    data.isAdmin ||
    data.hasMoreStores ||
    data.ownedStores.some(s => s.shared) ||
    !data.canVerifyPassword ||
    deletionLocked;
  async function submit() {
    if (busy.current || !review || !data || query.error || query.isFetching)
      return;
    const op = review;
    if (
      (op === 'delete' || op === 'export') &&
      (password.length < 8 || password.length > 128)
    ) {
      setFieldError('passwordInvalid');
      return;
    }
    if (
      op === 'delete' &&
      (confirmation !== DELETION_CONFIRMATION || deletionBlocked)
    ) {
      setFieldError('confirmationInvalid');
      return;
    }
    if (
      op === 'request' &&
      (details.trim().length < 3 || details.length > 1000)
    ) {
      setFieldError('detailsInvalid');
      return;
    }
    busy.current = true;
    setRunning(true);
    setNotice('');
    setFieldError('');
    const secret = password;
    setPassword('');
    if (op === 'delete') setDeletionLocked(true);
    try {
      if (op === 'consent') {
        const r = await consent.mutateAsync({ granted });
        if (
          r.actorId !== actorId ||
          r.success !== true ||
          r.granted !== granted
        )
          throw Error('receipt');
        if (alive.current) setNotice('consentSaved');
      } else if (op === 'request') {
        const r = await request.mutateAsync({
          requestType,
          details: details.trim(),
        });
        if (
          r.actorId !== actorId ||
          typeof r.id !== 'number' ||
          !Number.isSafeInteger(r.id) ||
          r.id < 1 ||
          r.requestType !== requestType ||
          typeof r.created !== 'boolean'
        )
          throw Error('receipt');
        if (alive.current) {
          setNotice(r.created ? 'requestSaved' : 'requestExists');
          if (r.created) setDetails('');
        }
      } else if (op === 'export') {
        const payload = await exportData.mutateAsync({ password: secret });
        if (!alive.current) return;
        downloadPrivacyExport(payload, actorId, actions);
        setNotice('exportStarted');
      } else {
        const r = await deletion.mutateAsync({
          password: secret,
          confirmation: DELETION_CONFIRMATION,
        });
        if (
          r.actorId !== actorId ||
          r.success !== true ||
          !Number.isSafeInteger(r.request?.id) ||
          r.request.id < 1 ||
          r.request.status !== 'pending'
        )
          throw Error('receipt');
        if (alive.current) {
          setEnded(true);
          actions.deleted();
        }
      }
      if (alive.current) {
        setReview(null);
        setConfirmation('');
        if (op !== 'delete') void query.refetch();
      }
    } catch (error: any) {
      if (alive.current) {
        if (error?.message === 'privacy:password_invalid') {
          setFieldError('passwordInvalid');
          if (op === 'delete') setDeletionLocked(false);
        } else if (error?.message === 'privacy:export_too_large')
          setFieldError('exportTooLarge');
        else if (error?.data?.code === 'TOO_MANY_REQUESTS') {
          setFieldError('rateLimit');
          if (op === 'delete') setDeletionLocked(false);
        } else {
          setNotice(op === 'delete' ? 'deleteUnknown' : 'operationUnknown');
          setReview(null);
          if (op !== 'delete') void query.refetch();
        }
      }
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  }
  if (ended)
    return (
      <section className="sd-workspace privacy-workspace">
        <div className="sd-card" role="status">
          <h1>{c.deletionSaved}</h1>
          <p>{c.deletionNext}</p>
        </div>
      </section>
    );
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  if (query.isLoading || query.isFetching)
    return <WorkspaceState kind="loading" />;
  if (!data)
    return <WorkspaceState kind="error" onRetry={() => void query.refetch()} />;
  const tiles: [Panel, any, string, string][] = [
    ['consent', ShieldCheck, c.consent, c.consentHelp],
    ['request', MessageSquare, c.request, c.requestHelp],
    ['export', Download, c.export, c.exportHelp],
    ['delete', Trash2, c.delete, c.deleteHelp],
  ];
  return (
    <section
      className="sd-workspace privacy-workspace"
      dir={english ? 'ltr' : 'rtl'}
      data-privacy-workspace
    >
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        <button
          className="sd-button"
          disabled={running}
          onClick={() => void query.refetch()}
        >
          {c.refresh}
        </button>
      </header>
      <div className="privacy-scope">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>{c.accountScope}</strong>
          <p>{c.scopeHelp}</p>
        </div>
      </div>
      {notice && (
        <p className="sd-notice" role="status">
          {c[notice]}
        </p>
      )}
      <div className="privacy-grid">
        {tiles.map(([panel, Icon, title, help]) => (
          <section
            className={
              'sd-card privacy-tile ' +
              (panel === 'delete' ? 'privacy-danger' : '')
            }
            key={panel}
          >
            <Icon aria-hidden="true" />
            <h2>{title}</h2>
            <p>{help}</p>
            {panel === 'consent' && (
              <p className="privacy-state">
                {data.marketingConsent === null
                  ? c.unknown
                  : data.marketingConsent
                    ? c.consentOn
                    : c.consentOff}
              </p>
            )}
            {panel === 'export' && !data.canVerifyPassword && (
              <p>{c.passwordUnavailable}</p>
            )}
            {panel === 'delete' && deletionBlocked && (
              <p>
                {deletionLocked
                  ? c.deleteUnknown
                  : !data.canVerifyPassword
                    ? c.passwordUnavailable
                    : c.deleteBlocked}
              </p>
            )}
            <button
              className={
                'sd-button ' +
                (panel === 'delete' ? 'privacy-danger-button' : 'sd-primary')
              }
              disabled={
                running ||
                (panel === 'delete' && deletionBlocked) ||
                (panel === 'export' && !data.canVerifyPassword) ||
                (panel === 'consent' && data.marketingConsent === null)
              }
              onClick={e => open(panel, e.currentTarget)}
            >
              {c[panel + 'Action']}
            </button>
          </section>
        ))}
      </div>
      <section className="sd-card">
        <div className="sd-heading">
          <h2>{c.history}</h2>
          <span>{c.latest20}</span>
        </div>
        <p className="sd-muted">
          {c.responseTarget.replace('{days}', String(data.responseDays))}
        </p>
        {!data.requests.length ? (
          <p>{c.noRequests}</p>
        ) : (
          <ol className="privacy-history">
            {data.requests.map(r => (
              <li key={r.id}>
                <div>
                  <strong>{c[r.requestType || 'unknown']}</strong>
                  <span className="privacy-badge">
                    {c[r.status || 'unknown']}
                  </span>
                </div>
                <div className="sd-muted">
                  <span>
                    {c.reference} #{r.id}
                  </span>
                  <span>
                    {c.requestedAt}: {date(r.requestedAt)}
                  </span>
                  <span>
                    {c.dueAt}: {date(r.dueAt)}
                  </span>
                  {r.completedAt && (
                    <span>
                      {c.completedAt}: {date(r.completedAt)}
                    </span>
                  )}
                </div>
                {r.rejectionReason && (
                  <p className="sd-id">{r.rejectionReason}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <a className="sd-button" href="/company/privacy">
        {c.policy}
      </a>
      <Dialog
        open={!!review}
        onOpenChange={value => {
          if (!value) close();
        }}
      >
        <DialogContent
          className="privacy-dialog"
          dir={english ? 'ltr' : 'rtl'}
          closeLabel={c.cancel}
          showCloseButton={!running}
          onCloseAutoFocus={e => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{review ? c[review] : ''}</DialogTitle>
            <DialogDescription>
              {c.accountScope} — {review ? c[review + 'Review'] : ''}
            </DialogDescription>
          </DialogHeader>
          <form
            id="privacy-review-form"
            onSubmit={e => {
              e.preventDefault();
              void submit();
            }}
          >
            {review === 'consent' && (
              <label className="privacy-checkbox">
                <input
                  type="checkbox"
                  checked={granted}
                  disabled={running}
                  onChange={e => setGranted(e.target.checked)}
                />
                <span>{c.consentOptIn}</span>
              </label>
            )}
            {review === 'request' && (
              <>
                <label htmlFor="privacy-request-type">{c.requestType}</label>
                <select
                  id="privacy-request-type"
                  value={requestType}
                  disabled={running}
                  onChange={e =>
                    setRequestType(e.target.value as typeof requestType)
                  }
                >
                  <option value="access">{c.access}</option>
                  <option value="correction">{c.correction}</option>
                  <option value="objection">{c.objection}</option>
                </select>
                <label htmlFor="privacy-details">{c.details}</label>
                <textarea
                  id="privacy-details"
                  value={details}
                  disabled={running}
                  onChange={e => setDetails(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  aria-invalid={fieldError === 'detailsInvalid'}
                  aria-describedby={
                    fieldError ? 'privacy-field-error' : 'privacy-details-help'
                  }
                />
                <p id="privacy-details-help">
                  {c.detailsHelp} · {details.length}/1000
                </p>
              </>
            )}
            {review === 'delete' && (
              <div className="privacy-danger">
                <p>
                  {c.deleteImpact.replace('{hours}', String(data.graceHours))}
                </p>
                <h3>{c.affectedStores}</h3>
                <ul>
                  {data.ownedStores.map(s => (
                    <li key={s.id} className="sd-id">
                      {s.name}
                    </li>
                  ))}
                </ul>
                {!data.ownedStores.length && <p>{c.noOwnedStores}</p>}
                <p>{c.retention}</p>
              </div>
            )}
            {(review === 'export' || review === 'delete') && (
              <>
                <label htmlFor="privacy-password">{c.password}</label>
                <input
                  id="privacy-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={running}
                  maxLength={128}
                  aria-invalid={fieldError === 'passwordInvalid'}
                  aria-describedby={
                    fieldError ? 'privacy-field-error' : undefined
                  }
                />
              </>
            )}
            {review === 'delete' && (
              <>
                <label htmlFor="privacy-confirmation">
                  {c.confirmation}{' '}
                  <code dir="ltr">{DELETION_CONFIRMATION}</code>
                </label>
                <input
                  id="privacy-confirmation"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
                  value={confirmation}
                  disabled={running}
                  onChange={e => setConfirmation(e.target.value)}
                  aria-invalid={fieldError === 'confirmationInvalid'}
                  aria-describedby={
                    fieldError ? 'privacy-field-error' : undefined
                  }
                />
              </>
            )}
            {fieldError && (
              <p
                role="alert"
                id="privacy-field-error"
                className="privacy-error"
              >
                {c[fieldError]}
              </p>
            )}
          </form>
          <DialogFooter>
            <button
              type="button"
              className="sd-button"
              disabled={running}
              onClick={close}
            >
              {c.cancel}
            </button>
            <button
              type="submit"
              form="privacy-review-form"
              className={
                'sd-button ' +
                (review === 'delete' ? 'privacy-danger-button' : 'sd-primary')
              }
              disabled={running || (review === 'delete' && deletionLocked)}
            >
              {running
                ? c.working
                : review === 'delete'
                  ? c.deleteConfirm
                  : c.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
