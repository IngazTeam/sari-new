import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { usageQueryOptions } from '@/lib/usage-workspace-view';
import {
  teamWorkspaceSchema,
  teamRoles,
  teamInviteEmail,
  type TeamWorkspace,
} from '@shared/team-workspace';
import { teamLabels } from '@/lib/team-workspace-labels';
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
import '@/styles/team-workspace.css';
type Role = (typeof teamRoles)[number];
type Review =
  | { kind: 'invite' }
  | { kind: 'role' | 'remove'; member: TeamWorkspace['members'][number] }
  | { kind: 'revoke'; invitation: TeamWorkspace['invitations'][number] };
export function TeamPage() {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const refresh = () => {
    void user.refetch();
    void identity.refetch();
  };
  if (user.error || identity.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(user.error || identity.error)}
        onRetry={refresh}
      />
    );
  if (
    user.isLoading ||
    user.isFetching ||
    identity.isLoading ||
    identity.isFetching
  )
    return <WorkspaceState kind="loading" />;
  if (
    !user.data?.id ||
    !identity.data?.id ||
    identity.data.actorId !== user.data.id
  )
    return <WorkspaceState kind="session" onRetry={refresh} />;
  return (
    <TeamStoreWorkspace
      key={user.data.id + ':' + identity.data.id}
      actorId={user.data.id}
      merchantId={identity.data.id}
    />
  );
}
function TeamStoreWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = teamLabels(t),
    english = i18n.language.startsWith('en');
  const query = trpc.team.workspace.useQuery(undefined, usageQueryOptions);
  const invite = trpc.team.invite.useMutation(),
    role = trpc.team.updateRole.useMutation(),
    remove = trpc.team.remove.useMutation(),
    revoke = trpc.team.revokeInvite.useMutation();
  const [tab, setTab] = useState<'members' | 'invitations'>('members'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [review, setReview] = useState<Review | null>(null),
    [step, setStep] = useState<'edit' | 'review'>('edit'),
    [email, setEmail] = useState(''),
    [selectedRole, setSelectedRole] = useState<Role>('viewer'),
    [notice, setNotice] = useState(''),
    [field, setField] = useState(''),
    [running, setRunning] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const busy = useRef(false),
    alive = useRef(true),
    trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const p = teamWorkspaceSchema.safeParse(query.data),
    data =
      p.success &&
      p.data.actorId === actorId &&
      p.data.merchantId === merchantId
        ? p.data
        : null;
  const open = (r: Review, target: HTMLButtonElement) => {
    trigger.current = target;
    setReview(r);
    setStep(r.kind === 'invite' || r.kind === 'role' ? 'edit' : 'review');
    setField('');
    setNotice('');
    setEmail('');
    setSelectedRole(r.kind === 'role' ? r.member.role || 'viewer' : 'viewer');
  };
  const close = () => {
    if (!busy.current) {
      setReview(null);
      setField('');
      setEmail('');
    }
  };
  const next = () => {
    if (
      review?.kind === 'invite' &&
      !teamInviteEmail.safeParse(email).success
    ) {
      setField('emailInvalid');
      return;
    }
    if (
      review?.kind === 'role' &&
      review.member.role === 'owner' &&
      selectedRole !== 'owner' &&
      data &&
      data.counts.owners <= 1
    ) {
      setField('lastOwner');
      return;
    }
    setField('');
    setStep('review');
  };
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(english ? 'en' : 'ar', {
          dateStyle: 'medium',
        }).format(new Date(v))
      : c.unknown;
  async function act() {
    if (
      !data ||
      !review ||
      busy.current ||
      uncertain ||
      query.error ||
      query.isFetching ||
      step !== 'review'
    )
      return;
    busy.current = true;
    setRunning(true);
    setNotice('');
    setField('');
    try {
      let result: any;
      if (review.kind === 'invite') {
        result = await invite.mutateAsync({
          email: email.trim().toLowerCase(),
          role: selectedRole as 'manager' | 'sales_supervisor' | 'viewer',
          reviewed: true,
        });
        if (
          result.email !== email.trim().toLowerCase() ||
          result.role !== selectedRole ||
          result.delivered !== true
        )
          throw Error('receipt');
      } else if (review.kind === 'revoke') {
        result = await revoke.mutateAsync({
          invitationId: review.invitation.id,
          reviewed: true,
        });
        if (result.invitationId !== review.invitation.id)
          throw Error('receipt');
      } else {
        if (!review.member.id || !review.member.role) throw Error('member');
        result =
          review.kind === 'role'
            ? await role.mutateAsync({
                memberId: review.member.id,
                role: selectedRole,
                expectedRole: review.member.role,
                reviewed: true,
              })
            : await remove.mutateAsync({
                memberId: review.member.id,
                expectedRole: review.member.role,
                reviewed: true,
              });
        if (result.memberId !== review.member.id) throw Error('receipt');
      }
      if (
        result.success !== true ||
        result.actorId !== actorId ||
        result.merchantId !== merchantId
      )
        throw Error('scope');
      if (alive.current) {
        setNotice(
          review.kind === 'invite'
            ? 'invitationAccepted'
            : review.kind === 'role'
              ? 'roleSaved'
              : review.kind === 'remove'
                ? 'memberRemoved'
                : 'invitationRevoked'
        );
        setReview(null);
        void query.refetch();
      }
    } catch (error: any) {
      if (alive.current) {
        const code = error?.data?.code;
        if (code === 'CONFLICT') {
          setNotice('conflict');
          setReview(null);
        } else if (code === 'TOO_MANY_REQUESTS') setField('rateLimit');
        else if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
          setNotice('authorityChanged');
          setReview(null);
        } else {
          setNotice('uncertain');
          setUncertain(true);
          setReview(null);
        }
        void query.refetch();
      }
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  }
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
  const term = search.trim().toLocaleLowerCase(),
    members = data.members.filter(
      m =>
        (filter === 'all' || m.role === filter) &&
        [m.userName, m.userEmail].some(v =>
          (v || '').toLocaleLowerCase().includes(term)
        )
    ),
    invitations = data.invitations.filter(
      i =>
        (filter === 'all' || i.status === filter) &&
        i.email.toLocaleLowerCase().includes(term)
    );
  const target =
    review?.kind === 'invite'
      ? email.trim().toLowerCase()
      : review?.kind === 'revoke'
        ? review.invitation.email
        : review?.member.userName || review?.member.userEmail || c.unnamed;
  const busyOrUnknown = running || uncertain;
  return (
    <section
      className="sd-workspace team-workspace"
      dir={english ? 'ltr' : 'rtl'}
      data-team-workspace
    >
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        <div className="team-actions">
          <button
            className="sd-button"
            disabled={running}
            onClick={() => void query.refetch()}
          >
            {c.refresh}
          </button>
          <button
            className="sd-button sd-primary"
            disabled={busyOrUnknown}
            onClick={e => open({ kind: 'invite' }, e.currentTarget)}
          >
            <UserPlus aria-hidden="true" />
            {c.invite}
          </button>
        </div>
      </header>
      <div className="team-stats">
        {(['members', 'owners', 'pending', 'expired'] as const).map(k => (
          <div className="sd-card" key={k}>
            <span>{c[k]}</span>
            <strong>{data.counts[k]}</strong>
          </div>
        ))}
      </div>
      <p className="team-scope">
        <ShieldCheck aria-hidden="true" />
        {c.scope} #{merchantId} · {c.yourRole}: {c[data.actorRole]}
      </p>
      {notice && (
        <p className="sd-notice" role="status">
          {c[notice]}
        </p>
      )}
      <div className="team-tabs" aria-label={c.views}>
        {(['members', 'invitations'] as const).map(k => (
          <button
            type="button"
            className="sd-button"
            aria-pressed={tab === k}
            key={k}
            onClick={() => {
              setTab(k);
              setFilter('all');
              setSearch('');
            }}
          >
            {c[k]}
          </button>
        ))}
      </div>
      <section className="sd-card">
        <div className="team-filters">
          <label>
            {c.search}
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              maxLength={320}
            />
          </label>
          <label>
            {c.filter}
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">{c.all}</option>
              {(tab === 'members' ? teamRoles : ['pending', 'expired']).map(
                k => (
                  <option value={k} key={k}>
                    {c[k]}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        {(tab === 'members'
          ? data.hasMoreMembers
          : data.hasMoreInvitations) && (
          <p role="status">
            {tab === 'members' ? c.memberLimit : c.inviteLimit}
          </p>
        )}
        {tab === 'members' ? (
          <div className="team-list">
            {!members.length && (
              <p>{data.members.length ? c.noMatches : c.noMembers}</p>
            )}
            {members.map(m => {
              const editable =
                !!m.id &&
                !!m.role &&
                !(m.role === 'owner' && !data.canManageOwners);
              return (
                <article className="team-row" key={m.userId}>
                  <div className="team-person">
                    <Users aria-hidden="true" />
                    <div>
                      <h2>
                        {m.userName || c.unnamed}
                        {m.userId === actorId ? ' · ' + c.you : ''}
                      </h2>
                      <p className="sd-id" dir="auto">
                        {m.userEmail || c.noEmail}
                      </p>
                      <p className="sd-muted">
                        {c[m.role || 'unknown']} ·{' '}
                        {m.accountActive ? c.activeAccount : c.disabledAccount}
                        {m.legacy ? ' · ' + c.legacyOwner : ''}
                      </p>
                      <p className="sd-muted">
                        {c.joined}: {date(m.acceptedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="team-actions">
                    <button
                      className="sd-button"
                      disabled={busyOrUnknown || !editable}
                      onClick={e =>
                        open({ kind: 'role', member: m }, e.currentTarget)
                      }
                    >
                      {c.changeRole}
                    </button>
                    <button
                      className="sd-button"
                      disabled={
                        busyOrUnknown ||
                        !editable ||
                        m.userId === actorId ||
                        (m.role === 'owner' && data.counts.owners <= 1)
                      }
                      onClick={e =>
                        open({ kind: 'remove', member: m }, e.currentTarget)
                      }
                    >
                      {c.remove}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="team-list">
            {!invitations.length && (
              <p>{data.invitations.length ? c.noMatches : c.noInvitations}</p>
            )}
            {invitations.map(i => (
              <article className="team-row" key={i.id}>
                <div>
                  <h2 className="sd-id" dir="auto">
                    {i.email}
                  </h2>
                  <p>
                    {c[i.role || 'unknown']} · {c[i.status]}
                  </p>
                  <p className="sd-muted">
                    {c.expires}: {date(i.expiresAt)}
                  </p>
                </div>
                <button
                  className="sd-button"
                  disabled={busyOrUnknown}
                  onClick={e =>
                    open({ kind: 'revoke', invitation: i }, e.currentTarget)
                  }
                >
                  {c.revoke}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <details className="sd-card team-role-guide">
        <summary>{c.roleGuide}</summary>
        <div className="team-role-grid">
          {teamRoles.map(r => (
            <article key={r}>
              <h2>{c[r]}</h2>
              <p>{c[r + 'Help']}</p>
            </article>
          ))}
        </div>
        <p className="sd-muted">{c.ownerHelp}</p>
      </details>
      <Dialog
        open={!!review}
        onOpenChange={v => {
          if (!v) close();
        }}
      >
        <DialogContent
          className="team-dialog"
          dir={english ? 'ltr' : 'rtl'}
          closeLabel={c.cancel}
          showCloseButton={!running}
          onCloseAutoFocus={e => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{review ? c[review.kind + 'Title'] : ''}</DialogTitle>
            <DialogDescription>
              {c.scope} #{merchantId} · {c.reviewHelp}
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            id="team-review-form"
            onSubmit={e => {
              e.preventDefault();
              if (step === 'edit') next();
              else void act();
            }}
          >
            {step === 'edit' ? (
              <>
                {review?.kind === 'invite' && (
                  <>
                    <label htmlFor="team-invite-email">{c.email}</label>
                    <input
                      id="team-invite-email"
                      type="email"
                      dir="ltr"
                      autoComplete="off"
                      value={email}
                      maxLength={320}
                      onChange={e => setEmail(e.target.value)}
                      aria-invalid={!!field}
                      aria-describedby={field ? 'team-field-error' : undefined}
                    />
                  </>
                )}
                <label htmlFor="team-role">{c.role}</label>
                <select
                  id="team-role"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as Role)}
                >
                  {teamRoles
                    .filter(
                      r =>
                        r !== 'owner' ||
                        (review?.kind === 'role' && data.canManageOwners)
                    )
                    .map(r => (
                      <option key={r} value={r}>
                        {c[r]}
                      </option>
                    ))}
                </select>
                <p>{c[selectedRole + 'Help']}</p>
              </>
            ) : (
              <>
                <p className="sd-id">
                  <strong>{target}</strong>
                </p>
                <p>
                  {review?.kind === 'role'
                    ? c.currentRole +
                      ': ' +
                      c[review.member.role || 'unknown'] +
                      ' · ' +
                      c.newRole +
                      ': ' +
                      c[selectedRole]
                    : review?.kind === 'invite'
                      ? c[selectedRole]
                      : review?.kind === 'remove'
                        ? c.removeImpact
                        : c.revokeImpact}
                </p>
                {(review?.kind === 'role' || review?.kind === 'invite') && (
                  <p>{c[selectedRole + 'Help']}</p>
                )}
                {review?.kind === 'invite' && <p>{c.inviteHelp}</p>}
              </>
            )}
            {field && (
              <p className="team-error" role="alert" id="team-field-error">
                {c[field]}
              </p>
            )}
          </form>
          <DialogFooter>
            <button className="sd-button" disabled={running} onClick={close}>
              {c.cancel}
            </button>
            {step === 'review' &&
              (review?.kind === 'invite' || review?.kind === 'role') && (
                <button
                  className="sd-button"
                  disabled={running}
                  onClick={() => setStep('edit')}
                >
                  {c.edit}
                </button>
              )}
            <button
              className="sd-button sd-primary"
              form="team-review-form"
              type="submit"
              disabled={running || uncertain}
            >
              {running ? c.working : step === 'edit' ? c.review : c.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
