import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'wouter';
import {
  Gift,
  Users,
  Trophy,
  Settings2,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { usageQueryOptions } from '@/lib/usage-workspace-view';
import {
  loyaltyWorkspaceSchema,
  loyaltyWorkspaceSelection,
  loyaltyReceiptSchema,
  loyaltyRequestOutcome,
  type LoyaltyAction,
  type LoyaltyWorkspace,
  type LoyaltySelection,
} from '@shared/loyalty-workspace';
import { loyaltyPhone } from '@shared/loyalty-input';
import {
  loyaltyLabels,
  type LoyaltyCopy,
} from '@/lib/loyalty-workspace-labels';
import {
  editorFields,
  initialLoyaltyDraft,
  reviewedLoyaltyAction,
  settingsFields,
  type LoyaltyEditor,
  type LoyaltyField,
} from '@/lib/loyalty-editor';
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
import '@/styles/loyalty-workspace.css';

type View = LoyaltySelection['view'];
type Bookmark = { requestId: string };
const bookmark = (key: string): Bookmark | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed.requestId === 'string' &&
      /^[a-f0-9-]{36}$/i.test(parsed.requestId)
      ? { requestId: parsed.requestId }
      : { requestId: '' };
  } catch {
    return { requestId: '' };
  }
};
export function LoyaltyCustomersPage() {
  return <LoyaltyPage view="customers" />;
}
export function LoyaltySettingsPage() {
  return <LoyaltyPage view="settings" />;
}
export function LoyaltyTiersPage() {
  return <LoyaltyPage view="tiers" />;
}
export function LoyaltyRewardsPage() {
  return <LoyaltyPage view="rewards" />;
}
export function LoyaltyCustomerPage() {
  const { customerPhone } = useParams<{ customerPhone: string }>();
  return <LoyaltyPage view="customers" initialPhone={customerPhone} />;
}
export function LoyaltyPage({
  view,
  initialPhone,
}: {
  view: View;
  initialPhone?: string;
}) {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions),
    identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
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
    <LoyaltyStore
      key={
        user.data.id +
        ':' +
        identity.data.id +
        ':' +
        view +
        ':' +
        (initialPhone || '')
      }
      actorId={user.data.id}
      merchantId={identity.data.id}
      view={view}
      initialPhone={initialPhone}
    />
  );
}
function LoyaltyStore({
  actorId,
  merchantId,
  view,
  initialPhone,
}: {
  actorId: number;
  merchantId: number;
  view: View;
  initialPhone?: string;
}) {
  const { t, i18n } = useTranslation(),
    c = loyaltyLabels(t),
    en = i18n.language.startsWith('en');
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [offset, setOffset] = useState(0),
    [phone, setPhone] = useState(
      initialPhone && loyaltyPhone.safeParse(initialPhone).success
        ? initialPhone
        : undefined
    ),
    [lookup, setLookup] = useState(''),
    [lookupError, setLookupError] = useState(false),
    [historyOffset, setHistoryOffset] = useState(0),
    [historyTab, setHistoryTab] = useState<
      'transactions' | 'redemptions' | 'rewards'
    >('transactions'),
    [productSearch, setProductSearch] = useState(''),
    [productTerm, setProductTerm] = useState('');
  const [editor, setEditor] = useState<LoyaltyEditor | null>(null),
    [draft, setDraft] = useState<Record<string, any>>({}),
    [action, setAction] = useState<LoyaltyAction | null>(null),
    [fields, setFields] = useState<Record<string, boolean>>({}),
    [notice, setNotice] = useState<keyof LoyaltyCopy | null>(null),
    [running, setRunning] = useState(false),
    [advanced, setAdvanced] = useState(false);
  const storageKey = 'sary:loyalty:pending:v1:' + actorId + ':' + merchantId,
    [pending, setPending] = useState(() => bookmark(storageKey)),
    [missingReceipt, setMissingReceipt] = useState(false);
  const busy = useRef(false),
    alive = useRef(true),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const selection = loyaltyWorkspaceSelection.parse({
    view,
    search: term,
    offset,
    customerPhone: phone,
    historyOffset,
    productSearch: productTerm,
    productId:
      editor &&
      (editor.kind === 'reward' || editor.kind === 'createReward') &&
      Number(draft.productId) > 0
        ? Number(draft.productId)
        : undefined,
  });
  const query = trpc.loyalty.workspace.useQuery(selection, usageQueryOptions),
    write = trpc.loyalty.reviewedAction.useMutation(),
    resolve = trpc.loyalty.closeRequest.useMutation();
  const receipt = trpc.loyalty.receipt.useQuery(
    { requestId: pending?.requestId || '00000000-0000-4000-8000-000000000000' },
    { ...usageQueryOptions, enabled: false }
  );
  const parsed = loyaltyWorkspaceSchema.safeParse(query.data),
    data =
      parsed.success &&
      parsed.data.actorId === actorId &&
      parsed.data.merchantId === merchantId &&
      JSON.stringify(parsed.data.selection) === JSON.stringify(selection)
        ? parsed.data
        : null;
  const disabled = running || !!pending;
  const format = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(en ? 'en' : 'ar', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(new Date(v)) + ' UTC'
      : c.unknown;
  const display = (key: string, v: any) =>
    v === null || v === undefined || v === ''
      ? c.unknown
      : key === 'maxRedemptions' && v === 0
        ? c.unlimited
        : key === 'productId' && data
          ? (() => {
              const product =
                data.selectedProduct?.id === v
                  ? data.selectedProduct
                  : data.products.find(p => p.id === v);
              return product
                ? (en ? product.name : product.nameAr || product.name) +
                    ' · #' +
                    v
                : '#' + v;
            })()
          : [
                'isEnabled',
                'isActive',
                'enableReferralBonus',
                'enableReviewBonus',
                'enableBirthdayBonus',
                'freeShipping',
              ].includes(key)
            ? v === 1
              ? c.yes
              : c.no
            : typeof v === 'string' &&
                (key === 'type' || key === 'discountType' || key === 'status')
              ? c[v as keyof LoyaltyCopy] || v
              : String(v);
  const title = (e: LoyaltyEditor) =>
    e.kind === 'points'
      ? e.mode === 'credit'
        ? c.addPoints
        : c.deductPoints
      : e.kind === 'createReward'
        ? c.addReward
        : e.kind === 'redeem'
          ? c.redeem
          : e.kind === 'deleteReward'
            ? c.deleteReward
            : e.kind === 'redemption'
              ? c.redemption
              : c.edit +
                ' · ' +
                c[
                  e.kind === 'tier'
                    ? 'tiers'
                    : e.kind === 'reward'
                      ? 'rewards'
                      : 'settings'
                ];
  const impact = (e: LoyaltyEditor) =>
    e.kind === 'settings'
      ? c.automationNote
      : e.kind === 'tier'
        ? c.tierImpact
        : e.kind === 'points'
          ? c.pointsImpact
          : e.kind === 'redeem'
            ? c.redeemImpact
            : e.kind === 'deleteReward'
              ? c.deleteImpact
              : e.kind === 'redemption'
                ? c.redemptionImpact
                : c.rewardImpact;
  const open = (e: LoyaltyEditor, target: HTMLElement) => {
    if (!data || disabled) return;
    trigger.current = target;
    const nextDraft = initialLoyaltyDraft(e, data);
    setEditor(e);
    setDraft(nextDraft);
    setFields({});
    setNotice(null);
    setAdvanced(false);
    setProductSearch('');
    setProductTerm('');
    setAction(
      ['redeem', 'deleteReward'].includes(e.kind)
        ? reviewedLoyaltyAction(e, nextDraft, data, crypto.randomUUID())
        : null
    );
  };
  const close = () => {
    if (!busy.current) {
      setEditor(null);
      setAction(null);
      setFields({});
    }
  };
  const review = (event?: FormEvent) => {
    event?.preventDefault();
    if (!data || !editor) return;
    try {
      const next = reviewedLoyaltyAction(
        editor,
        draft,
        data,
        crypto.randomUUID()
      );
      if (
        next.kind === 'points' &&
        next.mode === 'debit' &&
        next.points > (editor.balance ?? 0)
      ) {
        setFields({ points: true });
        return;
      }
      if (
        (next.kind === 'createReward' || next.kind === 'reward') &&
        next.values.type === 'free_product' &&
        !data.products.some(p => p.id === next.values.productId) &&
        data.selectedProduct?.id !== next.values.productId
      ) {
        setFields({ productId: true });
        return;
      }
      setFields({});
      setAction(next);
    } catch (error: any) {
      const errors = Object.fromEntries(
        (error?.issues || []).map((i: any) => [
          String(i.path?.at(-1) || 'form'),
          true,
        ])
      );
      setFields(Object.keys(errors).length ? errors : { form: true });
      if (editorFields(editor, draft).some(f => f.advanced && errors[f.key]))
        setAdvanced(true);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('.loyalty-dialog [aria-invalid="true"]')
          ?.focus()
      );
    }
  };
  function clearBookmark() {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setPending(null);
    setMissingReceipt(false);
  }
  function validOutcome(raw: unknown, requestId: string) {
    const outcome = loyaltyRequestOutcome.parse(raw);
    if (
      outcome.actorId !== actorId ||
      outcome.merchantId !== merchantId ||
      outcome.requestId !== requestId
    )
      throw Error('Invalid scope');
    return outcome;
  }
  async function submit() {
    if (
      !action ||
      !data ||
      !editor ||
      busy.current ||
      pending ||
      query.error ||
      query.isFetching
    )
      return;
    const frozen = action;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ requestId: frozen.requestId })
      );
    } catch {
      setNotice('storageFailed');
      return;
    }
    setPending({ requestId: frozen.requestId });
    busy.current = true;
    setRunning(true);
    setNotice(null);
    try {
      const result = loyaltyReceiptSchema.parse(
        validOutcome(await write.mutateAsync(frozen), frozen.requestId)
      );
      if (
        result.kind !== frozen.kind ||
        ('customerPhone' in frozen &&
          result.customerPhone !== frozen.customerPhone) ||
        (['tier', 'reward', 'deleteReward', 'redemption'].includes(
          frozen.kind
        ) &&
          'id' in frozen &&
          result.targetId !== frozen.id)
      )
        throw Error('Receipt mismatch');
      if (
        frozen.kind === 'points' &&
        result.newBalance !==
          (editor.balance ?? 0) +
            (frozen.mode === 'credit' ? frozen.points : -frozen.points)
      )
        throw Error('Balance mismatch');
      if (alive.current) {
        clearBookmark();
        setNotice('saved');
        setEditor(null);
        setAction(null);
        void query.refetch();
      }
    } catch (error: any) {
      if (alive.current) {
        const code = error?.data?.code;
        if (
          [
            'BAD_REQUEST',
            'CONFLICT',
            'PRECONDITION_FAILED',
            'NOT_FOUND',
            'FORBIDDEN',
            'UNAUTHORIZED',
            'TOO_MANY_REQUESTS',
          ].includes(code)
        ) {
          clearBookmark();
          setNotice(
            code === 'CONFLICT'
              ? 'conflict'
              : ['FORBIDDEN', 'UNAUTHORIZED'].includes(code)
                ? 'denied'
                : error.message?.includes('reward_has_history')
                  ? 'historyProtected'
                  : 'rejected'
          );
        } else setNotice('uncertain');
        setEditor(null);
        setAction(null);
        void query.refetch();
      }
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  }
  async function checkPending(closeAttempt = false) {
    if (!pending?.requestId || busy.current) return;
    busy.current = true;
    setRunning(true);
    setNotice(null);
    try {
      const result = closeAttempt
        ? await resolve.mutateAsync({
            requestId: pending.requestId,
            reviewed: true,
          })
        : await receipt.refetch().then(r => {
            if (r.error) throw r.error;
            return r.data;
          });
      if (!alive.current) return;
      if (!result) {
        setMissingReceipt(true);
        setNotice('receiptMissing');
        return;
      }
      const outcome = validOutcome(result, pending.requestId);
      clearBookmark();
      setNotice('closed' in outcome ? 'requestClosed' : 'saved');
      void query.refetch();
    } catch {
      if (alive.current) setNotice('uncertain');
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
  const targetName =
      editor?.phone ||
      editor?.row?.[en ? 'title' : 'titleAr'] ||
      editor?.row?.[en ? 'name' : 'nameAr'] ||
      '',
    list = editor ? editorFields(editor, draft) : [];
  const pageControls = (
    more: boolean,
    value: number,
    change: (n: number) => void
  ) => (
    <div className="loyalty-pager">
      <button
        className="sd-button"
        disabled={running || value === 0}
        onClick={() => change(Math.max(0, value - 25))}
      >
        {c.previous}
      </button>
      <span>
        {c.page} {Math.floor(value / 25) + 1}
      </span>
      <button
        className="sd-button"
        disabled={running || !more}
        onClick={() => change(value + 25)}
      >
        {c.next}
      </button>
    </div>
  );
  const readFields = (
    source: Record<string, any>,
    keys: Array<keyof LoyaltyCopy>
  ) => (
    <dl className="loyalty-values">
      {keys.map(k => (
        <div key={k}>
          <dt>{c[k]}</dt>
          <dd>{display(k, source[k])}</dd>
        </div>
      ))}
    </dl>
  );
  const customerActions = (
    row: LoyaltyWorkspace['customer'],
    targetVersion: string,
    phoneValue: string
  ) => (
    <div className="loyalty-actions">
      <button
        className="sd-button"
        disabled={disabled}
        onClick={e =>
          open(
            {
              kind: 'points',
              mode: 'credit',
              phone: phoneValue,
              version: targetVersion,
              balance: row?.totalPoints ?? 0,
            },
            e.currentTarget
          )
        }
      >
        <ArrowUpRight aria-hidden="true" />
        {c.addPoints}
      </button>
      <button
        className="sd-button"
        disabled={disabled || !row?.totalPoints}
        onClick={e =>
          open(
            {
              kind: 'points',
              mode: 'debit',
              phone: phoneValue,
              version: targetVersion,
              balance: row?.totalPoints ?? 0,
            },
            e.currentTarget
          )
        }
      >
        <ArrowDownLeft aria-hidden="true" />
        {c.deductPoints}
      </button>
    </div>
  );
  const rewardCard = (
    row: LoyaltyWorkspace['rewards'][number],
    forCustomer = false
  ) => (
    <article className="sd-card loyalty-item" key={row.id}>
      <div className="loyalty-item-heading">
        <span className="loyalty-icon">
          <Gift aria-hidden="true" />
        </span>
        <div>
          <h2>{en ? row.title : row.titleAr}</h2>
          <p>{en ? row.titleAr : row.title}</p>
        </div>
        <span className="loyalty-badge">{c[row.type]}</span>
      </div>
      <p className="loyalty-balance">
        {row.pointsCost} <small>{c.pointsUnit}</small>
      </p>
      <p>
        {row.isActive === 1 ? c.active : c.inactive} ·{' '}
        {row.available ? c.available : c.unavailable}
      </p>
      <p>{en ? row.description : row.descriptionAr}</p>
      {readFields(row, ['currentRedemptions', 'maxRedemptions'])}
      <details>
        <summary>{c.details}</summary>
        {readFields(
          row,
          row.type === 'discount'
            ? ['discountAmount', 'discountType']
            : row.type === 'free_product'
              ? ['productId']
              : []
        )}
        <p>
          {c.validFrom}: {format(row.validFrom ?? null)}
        </p>
        <p>
          {c.validUntil}: {format(row.validUntil ?? null)}
        </p>
        {readFields(row, [
          'descriptionAr',
          'description',
          'termsAndConditionsAr',
          'termsAndConditions',
          'imageUrl',
        ])}
      </details>
      <div className="loyalty-actions">
        {forCustomer ? (
          <button
            className="sd-button sd-primary"
            disabled={
              disabled ||
              !row.available ||
              !data.customer ||
              data.customer.totalPoints < row.pointsCost ||
              !row.redemptionRevision
            }
            onClick={e =>
              open(
                {
                  kind: 'redeem',
                  row,
                  phone,
                  balance: data.customer?.totalPoints,
                },
                e.currentTarget
              )
            }
          >
            {c.redeem}
          </button>
        ) : (
          <>
            <button
              className="sd-button"
              disabled={disabled}
              onClick={e => open({ kind: 'reward', row }, e.currentTarget)}
            >
              {c.edit}
            </button>
            <button
              className="sd-button"
              disabled={disabled}
              onClick={e =>
                open({ kind: 'deleteReward', row }, e.currentTarget)
              }
            >
              {c.deleteReward}
            </button>
          </>
        )}
      </div>
    </article>
  );
  const fieldNode = (field: LoyaltyField) => {
    const id = 'loyalty-' + field.key,
      invalid = !!fields[field.key],
      update = (value: any) => {
        setDraft(d => ({ ...d, [field.key]: value }));
        setFields(f => ({ ...f, [field.key]: false }));
      };
    const common = {
      id,
      'aria-invalid': invalid,
      'aria-describedby': invalid ? id + '-error' : undefined,
      disabled: running,
    };
    return (
      <div
        key={field.key}
        className={
          'loyalty-field ' + (field.type === 'flag' ? 'loyalty-check' : '')
        }
      >
        <label htmlFor={id}>
          {c[field.key]}
          {field.optional ? ' · ' + c.optional : ''}
        </label>
        {field.type === 'flag' ? (
          <input
            {...common}
            type="checkbox"
            checked={Number(draft[field.key]) === 1}
            onChange={e => update(e.target.checked ? 1 : 0)}
          />
        ) : field.type === 'textarea' ? (
          <textarea
            {...common}
            value={draft[field.key] ?? ''}
            onChange={e => update(e.target.value)}
            rows={3}
          />
        ) : field.type === 'select' ? (
          <select
            {...common}
            value={draft[field.key] ?? ''}
            onChange={e => update(e.target.value)}
          >
            {field.options?.map(k => (
              <option key={k} value={k}>
                {c[k]}
              </option>
            ))}
          </select>
        ) : field.type === 'product' ? (
          <>
            <div className="loyalty-product-search">
              <input
                aria-label={c.productSearch}
                placeholder={c.productSearch}
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              <button
                type="button"
                className="sd-button"
                onClick={() => setProductTerm(productSearch.trim())}
              >
                {c.searchAction}
              </button>
            </div>
            <select
              {...common}
              value={draft.productId ?? ''}
              onChange={e => update(e.target.value)}
            >
              <option value="">{c.chooseProduct}</option>
              {data.selectedProduct &&
                !data.products.some(p => p.id === data.selectedProduct!.id) && (
                  <option value={data.selectedProduct.id}>
                    {en
                      ? data.selectedProduct.name
                      : data.selectedProduct.nameAr ||
                        data.selectedProduct.name}
                  </option>
                )}
              {data.products.map(p => (
                <option key={p.id} value={p.id}>
                  {en ? p.name : p.nameAr || p.name}
                  {p.sku ? ' · ' + p.sku : ''}
                  {p.isActive !== 1 ? ' · ' + c.inactive : ''}
                </option>
              ))}
            </select>
            {data.hasMoreProducts && <p>{c.moreProducts}</p>}
          </>
        ) : (
          <input
            {...common}
            type={field.type}
            step={field.type === 'number' ? 1 : undefined}
            min={field.type === 'number' ? 0 : undefined}
            inputMode={field.type === 'number' ? 'numeric' : undefined}
            value={draft[field.key] ?? ''}
            onChange={e => update(e.target.value)}
          />
        )}
        {invalid && (
          <p className="loyalty-field-error" role="alert" id={id + '-error'}>
            {c.fieldInvalid}
          </p>
        )}
      </div>
    );
  };
  return (
    <section
      className="sd-workspace loyalty-workspace"
      dir={en ? 'ltr' : 'rtl'}
      data-loyalty-workspace={view}
    >
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">{c.eyebrow}</p>
          <h1>{c[view]}</h1>
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
      <nav className="loyalty-nav" aria-label={c.eyebrow}>
        {(['customers', 'rewards', 'tiers', 'settings'] as const).map(k => (
          <Link
            key={k}
            href={
              {
                customers: '/merchant/loyalty/customers',
                rewards: '/merchant/loyalty/rewards',
                tiers: '/merchant/loyalty/tiers',
                settings: '/merchant/loyalty/settings',
              }[k]
            }
            aria-current={view === k ? 'page' : undefined}
          >
            {k === 'customers' ? (
              <Users aria-hidden="true" />
            ) : k === 'rewards' ? (
              <Gift aria-hidden="true" />
            ) : k === 'tiers' ? (
              <Trophy aria-hidden="true" />
            ) : (
              <Settings2 aria-hidden="true" />
            )}
            {c[k]}
          </Link>
        ))}
      </nav>
      <p className="loyalty-scope">
        <ShieldCheck aria-hidden="true" />
        {c.scope} #{merchantId} ·{' '}
        {data.settings?.isEnabled === 1 ? c.active : c.inactive}
      </p>
      {notice && (
        <p className="sd-notice" role="status">
          {c[notice]}
        </p>
      )}
      {pending && !running && (
        <aside className="sd-card loyalty-pending" role="status">
          <h2>{pending.requestId ? c.uncertain : c.storageFailed}</h2>
          {pending.requestId && (
            <>
              <p>
                {c.requestId}: <bdi>{pending.requestId}</bdi>
              </p>
              <div className="loyalty-actions">
                <button
                  className="sd-button"
                  disabled={running}
                  onClick={() => void checkPending()}
                >
                  {c.checkReceipt}
                </button>
                {missingReceipt && (
                  <button
                    className="sd-button"
                    disabled={running}
                    onClick={() => void checkPending(true)}
                  >
                    {c.closeRequest}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      )}
      <div className="loyalty-stats">
        {(
          [
            'totalCustomers',
            'totalPointsDistributed',
            'totalPointsRedeemed',
            'totalRedemptions',
          ] as const
        ).map(k => (
          <div className="sd-card" key={k}>
            <span>{c[k]}</span>
            <strong>{data.stats[k].toLocaleString(en ? 'en' : 'ar')}</strong>
          </div>
        ))}
      </div>
      {view === 'settings' && (
        <>
          <article className="sd-card">
            <div className="loyalty-item-heading">
              <div>
                <h2>{data.settings ? c.earning : c.noSettings}</h2>
                <p>{c.setupHint}</p>
              </div>
              <button
                className="sd-button sd-primary"
                disabled={disabled}
                onClick={e =>
                  open(
                    { kind: 'settings', version: data.settingsRevision },
                    e.currentTarget
                  )
                }
              >
                {c.edit}
              </button>
            </div>
            {data.settings &&
              readFields(
                data.settings,
                settingsFields.filter(f => !f.advanced).map(f => f.key)
              )}
          </article>
          {data.settings && (
            <article className="sd-card">
              <h2>{c.bonuses}</h2>
              {readFields(
                data.settings,
                settingsFields.filter(f => f.advanced).map(f => f.key)
              )}
            </article>
          )}
        </>
      )}
      {view === 'tiers' && (
        <div className="loyalty-grid">
          {data.tiers.map(row => (
            <article className="sd-card loyalty-item" key={row.id}>
              <div className="loyalty-item-heading">
                <span
                  className="loyalty-tier-symbol"
                  style={{ borderColor: row.color }}
                  aria-hidden="true"
                >
                  {row.icon}
                </span>
                <div>
                  <h2>{en ? row.name : row.nameAr}</h2>
                  <p>{en ? row.nameAr : row.name}</p>
                </div>
              </div>
              {readFields(row, [
                'minPoints',
                'discountPercentage',
                'freeShipping',
                'priority',
                'benefits',
              ])}
              <button
                className="sd-button"
                disabled={disabled}
                onClick={e => open({ kind: 'tier', row }, e.currentTarget)}
              >
                {c.edit}
              </button>
            </article>
          ))}
          {!data.tiers.length && (
            <div className="sd-card">
              <h2>{c.noSettings}</h2>
              <p>{c.setupHint}</p>
              <Link className="sd-button" href="/merchant/loyalty/settings">
                {c.settings}
              </Link>
            </div>
          )}
        </div>
      )}
      {(view === 'customers' || view === 'rewards') && !phone && (
        <form
          className="sd-card loyalty-toolbar"
          onSubmit={e => {
            e.preventDefault();
            setTerm(search.trim());
            setOffset(0);
          }}
        >
          <label>
            {view === 'customers' ? c.search : c.searchRewards}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              maxLength={100}
            />
          </label>
          <button className="sd-button" type="submit">
            {c.searchAction}
          </button>
          {view === 'rewards' && (
            <button
              type="button"
              className="sd-button sd-primary"
              disabled={disabled}
              onClick={e => open({ kind: 'createReward' }, e.currentTarget)}
            >
              {c.addReward}
            </button>
          )}
        </form>
      )}
      {view === 'customers' && !phone && (
        <>
          <form
            className="sd-card loyalty-toolbar"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              const p = loyaltyPhone.safeParse(lookup);
              setLookupError(!p.success);
              if (p.success) {
                setPhone(p.data);
                setHistoryOffset(0);
                setOffset(0);
                setTerm('');
              }
            }}
          >
            <label>
              {c.customerPhone}
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={lookup}
                onChange={e => {
                  setLookup(e.target.value);
                  setLookupError(false);
                }}
                aria-invalid={lookupError}
                aria-describedby={
                  lookupError ? 'loyalty-lookup-error' : undefined
                }
              />
              {lookupError && (
                <span
                  id="loyalty-lookup-error"
                  role="alert"
                  className="loyalty-field-error"
                >
                  {c.fieldInvalid}
                </span>
              )}
            </label>
            <button className="sd-button" type="submit">
              {c.lookup}
            </button>
            <p>{c.newCustomerHint}</p>
          </form>
          <div className="sd-card loyalty-list">
            {data.customers.map(row => (
              <article className="loyalty-customer" key={row.id}>
                <div>
                  <h2>{row.customerName || c.unknown}</h2>
                  <bdi>{row.customerPhone}</bdi>
                  <p>
                    {data.tiers.find(t => t.id === row.tierId)?.[
                      en ? 'name' : 'nameAr'
                    ] || c.noTier}
                  </p>
                </div>
                <div>
                  <span>{c.totalPoints}</span>
                  <strong>
                    {row.totalPoints} <small>{c.pointsUnit}</small>
                  </strong>
                  <p>
                    {c.lifetimePoints}: {row.lifetimePoints}
                  </p>
                  <p>
                    {c.lastPointsEarnedAt}: {format(row.lastPointsEarnedAt)}
                  </p>
                </div>
                <div className="loyalty-actions">
                  <button
                    className="sd-button"
                    onClick={() => {
                      setPhone(row.customerPhone);
                      setOffset(0);
                      setHistoryOffset(0);
                      setTerm('');
                    }}
                  >
                    {c.details}
                  </button>
                  {customerActions(row, row.revision, row.customerPhone)}
                </div>
              </article>
            ))}
            {!data.customers.length && <p>{c.empty}</p>}
          </div>
        </>
      )}
      {view === 'rewards' && !phone && (
        <div className="loyalty-grid">
          {data.rewards.map(row => rewardCard(row))}
          {!data.rewards.length && (
            <div className="sd-card">
              <h2>{c.empty}</h2>
              <p>{c.emptyHint}</p>
            </div>
          )}
        </div>
      )}
      {(view === 'customers' || view === 'rewards') && !phone && (
        <>
          <p>
            {c.results}: {data.total}
          </p>
          {pageControls(data.hasMore, offset, setOffset)}
        </>
      )}
      {phone && (
        <>
          <div className="sd-card">
            <button
              className="sd-button"
              onClick={() => {
                setPhone(undefined);
                setOffset(0);
                setHistoryOffset(0);
              }}
            >
              {c.backCustomers}
            </button>
            <h2>
              {data.customer?.customerName || c.unknown} · <bdi>{phone}</bdi>
            </h2>
            <p>{c.detailsHint}</p>
            <p className="loyalty-balance">
              {data.customer?.totalPoints ?? 0} <small>{c.pointsUnit}</small>
            </p>
            {data.customer ? (
              readFields(data.customer, ['lifetimePoints'])
            ) : (
              <p>{c.newCustomerHint}</p>
            )}
            {data.customer && (
              <p>
                {c.lastPointsEarnedAt}:{' '}
                {format(data.customer.lastPointsEarnedAt)} ·{' '}
                {c.lastPointsRedeemedAt}:{' '}
                {format(data.customer.lastPointsRedeemedAt)}
              </p>
            )}
            {customerActions(data.customer, data.customerRevision, phone)}
          </div>
          <div className="loyalty-actions">
            {(['transactions', 'redemptions', 'rewards'] as const).map(k => (
              <button
                className="sd-button"
                key={k}
                aria-pressed={historyTab === k}
                onClick={() => {
                  setHistoryTab(k);
                  setHistoryOffset(0);
                  setOffset(0);
                }}
              >
                {c[k]}
              </button>
            ))}
          </div>
          {historyTab === 'rewards' ? (
            <>
              <div className="loyalty-grid">
                {data.rewards.map(row => rewardCard(row, true))}
              </div>
              {pageControls(data.hasMoreRewards, offset, setOffset)}
            </>
          ) : (
            <>
              <div className="sd-card loyalty-list">
                {historyTab === 'transactions'
                  ? data.transactions.map(row => (
                      <article className="loyalty-history" key={row.id}>
                        <div>
                          <h3>{en ? row.reason : row.reasonAr}</h3>
                          <p>{en ? row.reasonAr : row.reason}</p>
                          <p>
                            {c[row.type]} · {format(row.createdAt)}
                          </p>
                        </div>
                        <strong>
                          {row.points > 0 ? '+' : ''}
                          {row.points} {c.pointsUnit}
                        </strong>
                        {readFields(row, [
                          'balanceBefore',
                          'balanceAfter',
                          'orderId',
                        ])}
                        <p>
                          {c.expiresAt}: {format(row.expiresAt)}
                        </p>
                      </article>
                    ))
                  : data.redemptions.map(row => (
                      <article className="loyalty-history" key={row.id}>
                        <div>
                          <h3>
                            {c.redemptions} #{row.id}
                          </h3>
                          <p>
                            {c.rewards} #{row.rewardId} · {row.pointsSpent}{' '}
                            {c.pointsUnit}
                          </p>
                          <p>{c[row.status]}</p>
                          <p>
                            {c.expiresAt}: {format(row.expiresAt)}
                          </p>
                          <p>
                            {c.usedAt}: {format(row.usedAt)}
                          </p>
                          <p>{row.notes}</p>
                        </div>
                        <button
                          className="sd-button"
                          disabled={disabled}
                          onClick={e =>
                            open({ kind: 'redemption', row }, e.currentTarget)
                          }
                        >
                          {c.edit}
                        </button>
                      </article>
                    ))}
                {(historyTab === 'transactions'
                  ? data.transactions
                  : data.redemptions
                ).length === 0 && <p>{c.noHistory}</p>}
              </div>
              {pageControls(
                historyTab === 'transactions'
                  ? data.hasMoreTransactions
                  : data.hasMoreRedemptions,
                historyOffset,
                setHistoryOffset
              )}
            </>
          )}
        </>
      )}
      <details className="sd-card loyalty-explainer">
        <summary>{c.detailsHint}</summary>
        <p>{c.automationNote}</p>
      </details>
      <Dialog
        open={!!editor}
        onOpenChange={value => {
          if (!value) close();
        }}
      >
        <DialogContent
          className="loyalty-dialog"
          dir={en ? 'ltr' : 'rtl'}
          closeLabel={c.close}
          showCloseButton={!running}
          onEscapeKeyDown={e => {
            if (running) e.preventDefault();
          }}
          onInteractOutside={e => {
            if (running) e.preventDefault();
          }}
          onCloseAutoFocus={e => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editor ? title(editor) : ''}</DialogTitle>
            <DialogDescription>{targetName || c.detailsHint}</DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              noValidate
              onSubmit={e => {
                e.preventDefault();
                if (action) void submit();
                else review(e);
              }}
            >
              <p className="sd-notice">{impact(editor)}</p>
              {action ? (
                <div className="loyalty-review">
                  <h3>{c.review}</h3>
                  {'values' in action ? (
                    readFields(
                      action.values,
                      editorFields(editor, action.values)
                        .filter(
                          field =>
                            !field.optional ||
                            (action.values as Record<string, unknown>)[
                              field.key
                            ]
                        )
                        .map(field => field.key)
                    )
                  ) : action.kind === 'points' ? (
                    <>
                      <p>
                        <bdi>{action.customerPhone}</bdi>
                      </p>
                      {readFields(action, ['points', 'reasonAr', 'reason'])}
                      <p>
                        {c.balanceBefore}: {editor.balance ?? 0} ·{' '}
                        {c.balanceAfter}:{' '}
                        {(editor.balance ?? 0) +
                          (action.mode === 'credit'
                            ? action.points
                            : -action.points)}
                      </p>
                    </>
                  ) : action.kind === 'redemption' ? (
                    readFields(action, ['status', 'notes', 'orderId'])
                  ) : action.kind === 'redeem' ? (
                    <>
                      <h3>{en ? editor.row.title : editor.row.titleAr}</h3>
                      <p>
                        {c.balanceBefore}: {editor.balance ?? 0} ·{' '}
                        {c.balanceAfter}:{' '}
                        {(editor.balance ?? 0) - editor.row.pointsCost}
                      </p>
                    </>
                  ) : (
                    <h3>{en ? editor.row.title : editor.row.titleAr}</h3>
                  )}
                </div>
              ) : (
                <>
                  <div className="loyalty-fields">
                    {list.filter(f => !f.advanced).map(fieldNode)}
                  </div>
                  {list.some(f => f.advanced) && (
                    <details
                      open={advanced}
                      onToggle={e => setAdvanced(e.currentTarget.open)}
                    >
                      <summary>{c.advanced}</summary>
                      <div className="loyalty-fields">
                        {list.filter(f => f.advanced).map(fieldNode)}
                      </div>
                    </details>
                  )}
                </>
              )}
              {Object.keys(fields).some(k => fields[k]) && (
                <p role="alert" className="loyalty-field-error">
                  {c.fieldInvalid}
                </p>
              )}
              <DialogFooter className="loyalty-actions">
                {action &&
                  editor.kind !== 'deleteReward' &&
                  editor.kind !== 'redeem' && (
                    <button
                      className="sd-button"
                      type="button"
                      disabled={running}
                      onClick={() => setAction(null)}
                    >
                      {c.backEdit}
                    </button>
                  )}
                <button
                  className="sd-button"
                  type="button"
                  disabled={running}
                  onClick={close}
                >
                  {c.cancel}
                </button>
                <button
                  className="sd-button sd-primary"
                  type="submit"
                  disabled={running || !!pending}
                >
                  {running ? c.saving : action ? c.confirm : c.review}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
