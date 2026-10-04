import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Clock3, Mail, Smartphone, RefreshCw, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { notificationPreferenceLabels } from "@/lib/notification-preference-labels";
import {
  preferenceDraft,
  preferencesMatch,
  scopedNotificationPreferences,
  scopedPreferenceSave,
  type PreferenceDraft,
} from "@/lib/notification-preference-workspace";
import {
  notificationPreferenceSave,
  type NotificationPreferenceWorkspace as Snapshot,
} from "@shared/notification-preferences-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import "@/styles/service-catalog-workspace.css";
import "@/styles/notification-preference-workspace.css";
const eventKeys = [
  "newOrdersEnabled",
  "newMessagesEnabled",
  "appointmentsEnabled",
  "orderStatusEnabled",
  "missedMessagesEnabled",
  "whatsappDisconnectEnabled",
] as const;
function BooleanField({
  id,
  label,
  value,
  disabled,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: boolean | null;
  disabled: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = value === null;
  }, [value]);
  return (
    <div className="np-switch-row">
      <label htmlFor={id}>
        {label}
        {error && (
          <small id={id + "-error"} className="np-field-error">
            {error}
          </small>
        )}
      </label>
      <input
        ref={input}
        id={id}
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
        onChange={e => onChange(e.target.checked)}
      />
    </div>
  );
}
export function NotificationPreferenceWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = notificationPreferenceLabels(t);
  const query = trpc.notificationPreferences.workspace.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();
  const mutation = trpc.notificationPreferences.saveReviewed.useMutation({
    retry: false,
  });
  const data = query.error
    ? null
    : scopedNotificationPreferences(query.data, actorId, merchantId);
  const [base, setBase] = useState<Snapshot | null>(null),
    [draft, setDraft] = useState<PreferenceDraft | null>(null),
    [issues, setIssues] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    lock = useRef(false),
    epoch = useRef(knowledgeCacheEpoch()),
    form = useRef<HTMLFormElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    submitted = useRef<PreferenceDraft | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const alive = () =>
    mounted.current && epoch.current === knowledgeCacheEpoch();
  const adopt = (value: Snapshot) => {
    setBase(value);
    setDraft(preferenceDraft(value));
    setIssues([]);
    setBlocked(false);
    submitted.current = null;
  };
  useEffect(() => {
    if (data && !base) adopt(data);
  }, [data, base]);
  const dirty =
    !!draft &&
    !!base &&
    JSON.stringify(draft) !== JSON.stringify(preferenceDraft(base));
  useEffect(() => {
    if (!dirty && !blocked) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, blocked]);
  useEffect(() => {
    if (notice) feedback.current?.focus();
  }, [notice]);
  const reload = async (checkOnly = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await query.refetch();
      if (!alive()) return;
      const value = result.error
        ? null
        : scopedNotificationPreferences(result.data, actorId, merchantId);
      if (!value) throw Error("unavailable");
      if (
        checkOnly &&
        (!submitted.current || !preferencesMatch(value, submitted.current))
      ) {
        setNotice(c.different);
        setBlocked(true);
        return;
      }
      adopt(value);
      setNotice(checkOnly ? c.saved : "");
    } catch {
      if (alive()) {
        setNotice(c.failedRead);
        setBlocked(true);
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  const save = async () => {
    if (
      lock.current ||
      blocked ||
      !data?.canManage ||
      !base ||
      !draft ||
      query.isFetching
    )
      return;
    const input = notificationPreferenceSave.safeParse({
      ...draft,
      expectedRevision: base.revision,
    });
    if (!input.success) {
      const keys = input.error.issues.map(issue => String(issue.path[0]));
      setIssues(keys);
      form.current?.querySelector<HTMLElement>(`[id="np-${keys[0]}"]`)?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice("");
    setIssues([]);
    submitted.current = { ...draft };
    try {
      const result = await mutation.mutateAsync(input.data);
      if (!alive()) return;
      const verified = scopedPreferenceSave(result, actorId, merchantId, draft);
      if (!verified) throw Error("unverified");
      utils.notificationPreferences.workspace.setData(
        undefined,
        verified.workspace
      );
      adopt(verified.workspace);
      setNotice(verified.changed ? c.saved : c.noChanges);
    } catch (error) {
      if (alive()) {
        setBlocked(true);
        setNotice(
          ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(
            (error as any)?.data?.code
          )
            ? c.conflict
            : c.uncertain
        );
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void reload()}
      />
    );
  if (query.isLoading || (!base && data))
    return <WorkspaceState kind="loading" />;
  if (!data || !base || !draft)
    return <WorkspaceState kind="error" onRetry={() => void reload()} />;
  if (data.status === "duplicate")
    return (
      <WorkspaceState
        kind="error"
        description={c.duplicate}
        onRetry={() => void reload()}
      />
    );
  const remoteChanged = data.revision !== base.revision,
    disabled =
      busy || blocked || remoteChanged || !data.canManage || query.isFetching;
  const change = <K extends keyof PreferenceDraft>(
    key: K,
    value: PreferenceDraft[K]
  ) => {
    setDraft({ ...draft, [key]: value });
    setNotice("");
    setIssues(issues.filter(k => k !== key));
  };
  const error = (key: keyof PreferenceDraft) =>
    draft[key] === null
      ? c.unknown
      : issues.includes(key)
        ? c.fieldError
        : undefined;
  const booleanValue = (v: boolean | null | undefined) =>
    v === true ? c.on : v === false ? c.off : c.unknownShort;
  return (
    <section
      className="sc-workspace np-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="np-header">
        <span className="np-mark">
          <Bell aria-hidden="true" />
        </span>
        <div>
          <h1>{c.title}</h1>
          <p>{c.help}</p>
        </div>
      </header>
      {!data.canManage && (
        <p className="np-note" role="status">
          {c.readonly}
        </p>
      )}
      {base.status === "default" && <p className="np-note">{c.defaults}</p>}
      {base.status === "invalid" && (
        <p className="np-note" role="status">
          {c.invalid}
        </p>
      )}
      {remoteChanged && !blocked && (
        <p className="np-note" role="status">
          {c.conflict}
        </p>
      )}
      {notice && (
        <p className="np-feedback" role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      <form
        ref={form}
        noValidate
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
        aria-busy={busy}
      >
        <div className="np-grid">
          <section className="np-card np-types">
            <h2>{c.types}</h2>
            {eventKeys.map(key => (
              <BooleanField
                key={key}
                id={"np-" + key}
                label={c[key]}
                value={draft[key]}
                disabled={disabled}
                onChange={value => change(key, value)}
                error={error(key)}
              />
            ))}
          </section>
          <section className="np-card">
            <h2>{c.method}</h2>
            <p>{c.methodHelp}</p>
            <fieldset
              disabled={disabled}
              className="np-methods"
              aria-describedby={
                error("preferredMethod") ? "np-method-error" : undefined
              }
            >
              <legend className="sr-only">{c.method}</legend>
              {(["both", "push", "email"] as const).map((method, index) => {
                const Icon = [Bell, Smartphone, Mail][index];
                return (
                  <label
                    key={method}
                    className={
                      draft.preferredMethod === method ? "np-selected" : ""
                    }
                  >
                    <input
                      id={method === "both" ? "np-preferredMethod" : undefined}
                      type="radio"
                      name="method"
                      value={method}
                      checked={draft.preferredMethod === method}
                      onChange={() => change("preferredMethod", method)}
                    />
                    <Icon aria-hidden="true" />
                    <span>{c[method]}</span>
                  </label>
                );
              })}
            </fieldset>
            {error("preferredMethod") && (
              <small id="np-method-error" className="np-field-error">
                {error("preferredMethod")}
              </small>
            )}
          </section>
          <section className="np-card np-quiet">
            <h2>
              <Clock3 aria-hidden="true" />
              {c.quiet}
            </h2>
            <BooleanField
              id="np-quietHoursEnabled"
              label={c.quietHoursEnabled}
              value={draft.quietHoursEnabled}
              disabled={disabled}
              onChange={value => change("quietHoursEnabled", value)}
              error={error("quietHoursEnabled")}
            />
            <div className="np-times">
              {(["quietHoursStart", "quietHoursEnd"] as const).map(key => (
                <div key={key}>
                  <label htmlFor={"np-" + key}>{c[key]}</label>
                  <input
                    id={"np-" + key}
                    type="time"
                    dir="ltr"
                    value={draft[key] ?? ""}
                    disabled={disabled}
                    aria-invalid={!!error(key)}
                    aria-describedby={
                      error(key) ? "np-error-" + key : undefined
                    }
                    onChange={e => change(key, e.target.value)}
                  />
                  {error(key) && (
                    <small id={"np-error-" + key} className="np-field-error">
                      {error(key)}
                    </small>
                  )}
                </div>
              ))}
            </div>
            <p>
              {c.zone}: <bdi>{base.quietHoursTimeZone}</bdi>
            </p>
            <p>{c.overnight}</p>
            <p className="np-quiet-hint">{c.quietHelp}</p>
          </section>
        </div>
        <div className="np-savebar">
          <p>
            <Check aria-hidden="true" />
            {dirty
              ? c.dirty
              : base.status === "default"
                ? c.unsavedDefaults
                : c.current}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              <RefreshCw aria-hidden="true" />
              {dirty || blocked ? c.discard : c.refresh}
            </Button>
            {blocked ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void reload(true)}
              >
                {busy ? c.checking : c.check}
              </Button>
            ) : (
              data.canManage && (
                <Button
                  type="submit"
                  disabled={disabled || (!dirty && base.status !== "default")}
                >
                  {busy ? c.saving : c.save}
                </Button>
              )
            )}
          </div>
        </div>
      </form>
      <details className="np-legacy">
        <summary>{c.legacy}</summary>
        <p>{c.legacyHelp}</p>
        <dl>
          <div>
            <dt>{c.instantNotifications}</dt>
            <dd>{booleanValue(base.values?.instantNotifications)}</dd>
          </div>
          <div>
            <dt>{c.batchNotifications}</dt>
            <dd>{booleanValue(base.values?.batchNotifications)}</dd>
          </div>
          <div>
            <dt>{c.batchInterval}</dt>
            <dd>{base.values?.batchInterval ?? c.unknownShort}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
