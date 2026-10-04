import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Store,
  UserRound,
  SlidersHorizontal,
  ArrowUpRight,
  Check,
  RefreshCw,
} from "lucide-react";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import SetupWizardReset from "@/components/SetupWizardReset";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { useReviewedSettingsDraft } from "@/lib/use-reviewed-settings-draft";
import {
  scopedStoreProfile,
  scopedSelfProfile,
  verifiedStoreProfile,
  verifiedSelfProfile,
} from "@/lib/settings-workspace";
import { settingsWorkspaceLabels } from "@/lib/settings-workspace-labels";
import { merchantProfileSave } from "@shared/merchant-profile-workspace";
import { selfProfileRename } from "@shared/self-profile-workspace";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import "@/styles/service-catalog-workspace.css";
import "@/styles/settings-workspace.css";
type Scope = { actorId: number; merchantId: number };
type Draft = ReturnType<typeof useReviewedSettingsDraft>;
type Copy = ReturnType<typeof settingsWorkspaceLabels>;
const options = {
  retry: false,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: false,
};
const zoneLabels = (c: Copy): Record<string, string> => ({
  UTC: c.zoneUtc,
  "Asia/Riyadh": c.zoneRiyadh,
  "Asia/Dubai": c.zoneDubai,
  "Asia/Kuwait": c.zoneKuwait,
  "Asia/Qatar": c.zoneQatar,
  "Asia/Bahrain": c.zoneBahrain,
  "Asia/Muscat": c.zoneMuscat,
  "Asia/Amman": c.zoneAmman,
  "Asia/Baghdad": c.zoneBaghdad,
  "Asia/Beirut": c.zoneBeirut,
  "Africa/Cairo": c.zoneCairo,
  "Africa/Casablanca": c.zoneCasablanca,
  "Africa/Lagos": c.zoneLagos,
  "Africa/Nairobi": c.zoneNairobi,
  "Africa/Johannesburg": c.zoneJohannesburg,
  "Europe/London": c.zoneLondon,
  "Europe/Paris": c.zoneParis,
  "Europe/Berlin": c.zoneBerlin,
  "Europe/Istanbul": c.zoneIstanbul,
  "Europe/Moscow": c.zoneMoscow,
  "America/New_York": c.zoneNewYork,
  "America/Chicago": c.zoneChicago,
  "America/Los_Angeles": c.zoneLosAngeles,
  "America/Sao_Paulo": c.zoneSaoPaulo,
  "America/Argentina/Buenos_Aires": c.zoneBuenosAires,
  "America/Bogota": c.zoneBogota,
  "Asia/Karachi": c.zoneKarachi,
  "Asia/Kolkata": c.zoneKolkata,
  "Asia/Jakarta": c.zoneJakarta,
  "Asia/Kuala_Lumpur": c.zoneKualaLumpur,
  "Asia/Tokyo": c.zoneTokyo,
  "Australia/Sydney": c.zoneSydney,
});
const fallbackZones = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Beirut",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function draftMessage(c: Copy, key: string) {
  return c[key as keyof Copy] || c.failedRead;
}
function Feedback({ draft, c }: { draft: Draft; c: Copy }) {
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (draft.notice) feedback.current?.focus();
  }, [draft.notice]);
  return (
    <>
      {draft.remoteChanged && (
        <p className="sw-notice" role="alert">
          {c.conflict}
        </p>
      )}
      {draft.notice && (
        <p className="sw-notice" role="status" ref={feedback} tabIndex={-1}>
          {draftMessage(c, draft.notice)}
        </p>
      )}
    </>
  );
}
function Actions({ draft, c }: { draft: Draft; c: Copy }) {
  return (
    <footer className="sw-actions">
      <p>{draft.blocked ? c.needsCheck : draft.dirty ? c.dirty : c.inSync}</p>
      <div>
        {draft.blocked && (
          <Button
            type="button"
            variant="outline"
            disabled={draft.busy}
            onClick={() => void draft.reload(true)}
          >
            <Check aria-hidden="true" />
            {c.check}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={draft.busy}
          onClick={() => void draft.reload()}
        >
          <RefreshCw aria-hidden="true" />
          {draft.dirty || draft.blocked ? c.discard : c.refresh}
        </Button>
        {draft.data?.canManage && (
          <Button type="submit" disabled={draft.disabled || !draft.dirty}>
            {draft.busy ? c.saving : c.save}
          </Button>
        )}
      </div>
    </footer>
  );
}
function StoreForm({
  actorId,
  merchantId,
  query,
  onView,
}: Scope & { query: any; onView: (allowed: boolean) => void }) {
  const { t } = useTranslation(),
    c = settingsWorkspaceLabels(t),
    utils = trpc.useUtils(),
    mutation = trpc.merchants.profileSaveReviewed.useMutation({ retry: false });
  const draft = useReviewedSettingsDraft<
    NonNullable<ReturnType<typeof scopedStoreProfile>>
  >({
    query,
    parse: value => scopedStoreProfile(value, actorId, merchantId),
    validate: value => merchantProfileSave.safeParse(value),
    write: input => mutation.mutateAsync(input),
    verify: (value, desired) =>
      verifiedStoreProfile(value, actorId, merchantId, desired),
    cache: workspace => {
      utils.merchants.profileWorkspace.setData(undefined, workspace);
      const values = workspace.values;
      if (values) {
        utils.merchants.getCurrent.setData(undefined, previous =>
          previous?.id === merchantId
            ? {
                ...previous,
                businessName: values.businessName!,
                phone: values.phone,
                autoReplyEnabled: values.autoReplyEnabled ? 1 : 0,
                timezone: values.timezone!,
                logoUrl: values.logoUrl,
              }
            : previous
        );
        utils.merchantSelection.list.setData(undefined, previous =>
          previous?.map(store =>
            store.merchantId === merchantId
              ? { ...store, businessName: values.businessName! }
              : store
          )
        );
      }
    },
  });
  useEffect(() => onView(!!draft.data?.canView), [draft.data?.canView, onView]);
  const [logoFailure, setLogoFailure] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null),
    toggle = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (toggle.current)
      toggle.current.indeterminate = draft.draft?.autoReplyEnabled === null;
  }, [draft.draft?.autoReplyEnabled]);
  useEffect(() => {
    if (draft.issues.length)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [draft.issues]);
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void draft.reload()}
      />
    );
  if (draft.loading) return <WorkspaceState kind="loading" />;
  if (draft.data && !draft.data.canView)
    return (
      <div className="sw-panel">
        <h2>{c.storeTitle}</h2>
        <p className="sw-notice" role="status">
          {c.restricted}
        </p>
      </div>
    );
  if (!draft.data || !draft.base || !draft.draft)
    return <WorkspaceState kind="error" onRetry={() => void draft.reload()} />;
  const value = (key: string) =>
    typeof draft.draft![key] === "string" ? String(draft.draft![key]) : "";
  const invalid = (key: string) =>
    draft.issues.includes(key) ||
    (draft.data!.invalidFields.includes(key as any) &&
      draft.draft![key] === null);
  const zones = Array.from(
    new Set([...fallbackZones, value("timezone")].filter(Boolean))
  );
  const field = (key: string, label: string, hint: string, type = "text") => (
    <div className="sw-field">
      <label htmlFor={"sw-" + key}>{label}</label>
      <input
        id={"sw-" + key}
        type={type}
        value={value(key)}
        disabled={draft.disabled}
        onChange={e =>
          draft.change(
            key,
            key === "logoUrl" && !e.target.value ? null : e.target.value
          )
        }
        aria-invalid={invalid(key)}
        aria-describedby={"sw-" + key + "-hint"}
        maxLength={key === "businessName" ? 255 : key === "phone" ? 20 : 500}
        dir={key === "phone" || key === "logoUrl" ? "ltr" : undefined}
      />
      <small
        id={"sw-" + key + "-hint"}
        className={invalid(key) ? "sw-error" : ""}
      >
        {hint}
      </small>
    </div>
  );
  return (
    <form
      ref={form}
      className="sw-panel"
      onSubmit={e => {
        e.preventDefault();
        void draft.save();
      }}
      noValidate
    >
      <div className="sw-section-head">
        <Store aria-hidden="true" />
        <div>
          <h2>{c.storeTitle}</h2>
          <p>{c.storeDescription}</p>
        </div>
      </div>
      {!draft.data.canManage && (
        <p className="sw-notice" role="status">
          {c.readonly}
        </p>
      )}
      {!!draft.data.invalidFields.length && (
        <p className="sw-notice">{c.oldValues}</p>
      )}
      <div className="sw-fields">
        {field("businessName", c.businessName, c.businessNameHint)}
        {field("phone", c.phone, c.phoneHint, "tel")}
        <div className="sw-field">
          <label htmlFor="sw-timezone">{c.timezone}</label>
          <select
            id="sw-timezone"
            value={value("timezone")}
            onChange={e => draft.change("timezone", e.target.value)}
            disabled={draft.disabled}
            aria-invalid={invalid("timezone")}
            aria-describedby="sw-timezone-hint"
          >
            <option value="" disabled>
              {c.chooseTimezone}
            </option>
            {zones.map(zone => (
              <option key={zone} value={zone}>
                {zoneLabels(c)[zone] || zone}
              </option>
            ))}
          </select>
          <small
            id="sw-timezone-hint"
            className={invalid("timezone") ? "sw-error" : ""}
          >
            {c.timezoneHint}
          </small>
        </div>
        {field("logoUrl", c.logo, c.logoHint, "url")}
      </div>
      <div className="sw-logo-tools">
        <Link href="/merchant/media-library">{c.mediaLink}</Link>
        {value("logoUrl") && (
          <Button
            type="button"
            variant="outline"
            disabled={draft.disabled}
            onClick={() => draft.change("logoUrl", null)}
          >
            {c.clearLogo}
          </Button>
        )}
      </div>
      {draft.base.values?.logoUrl && (
        <img
          className="sw-logo"
          src={draft.base.values.logoUrl}
          alt={c.savedLogo}
          onLoad={() => setLogoFailure(null)}
          onError={() => setLogoFailure(String(draft.base?.values?.logoUrl))}
        />
      )}
      {logoFailure && logoFailure === draft.base.values?.logoUrl && (
        <p className="sw-notice" role="status">
          {c.logoUnavailable}
        </p>
      )}
      <div className="sw-switch">
        <label htmlFor="sw-autoReplyEnabled">
          <strong>{c.autoReply}</strong>
          <small id="sw-autoReplyEnabled-hint">
            {invalid("autoReplyEnabled") ? c.chooseReply : c.autoReplyHint}
          </small>
        </label>
        <input
          ref={toggle}
          id="sw-autoReplyEnabled"
          type="checkbox"
          checked={draft.draft.autoReplyEnabled === true}
          disabled={draft.disabled}
          onChange={e => draft.change("autoReplyEnabled", e.target.checked)}
          aria-invalid={invalid("autoReplyEnabled")}
          aria-describedby="sw-autoReplyEnabled-hint"
        />
      </div>
      <div className="sw-context-link">
        <div>
          <strong>{c.currencyTitle}</strong>
          <p>{c.currencyHint}</p>
        </div>
        <Link href="/merchant/currency-settings">
          {c.currencyLink}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <Feedback draft={draft} c={c} />
      <Actions draft={draft} c={c} />
    </form>
  );
}
function AccountForm({ actorId }: { actorId: number }) {
  const { t } = useTranslation(),
    c = settingsWorkspaceLabels(t),
    utils = trpc.useUtils(),
    query = trpc.auth.selfProfileWorkspace.useQuery(undefined, options),
    mutation = trpc.auth.renameReviewed.useMutation({ retry: false }),
    emailMutation =
      trpc.auth.emailVerification.sendVerificationEmail.useMutation({
        retry: false,
      });
  const draft = useReviewedSettingsDraft<
    NonNullable<ReturnType<typeof scopedSelfProfile>>
  >({
    query,
    parse: value => scopedSelfProfile(value, actorId),
    validate: value => selfProfileRename.safeParse(value),
    write: input => mutation.mutateAsync(input),
    verify: (value, desired) => verifiedSelfProfile(value, actorId, desired),
    cache: workspace => {
      const { canManage, values, ...saved } = workspace;
      utils.auth.selfProfileWorkspace.setData(undefined, saved);
      utils.auth.me.setData(
        undefined,
        (previous: ReturnType<typeof utils.auth.me.getData>) =>
          previous?.id === actorId
            ? { ...previous, name: saved.name }
            : previous
      );
    },
  });
  const [emailNotice, setEmailNotice] = useState(""),
    [sending, setSending] = useState(false),
    emailLock = useRef(false),
    mounted = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.issues.includes("name")) name.current?.focus();
  }, [draft.issues]);
  const sendEmail = async () => {
    if (
      emailLock.current ||
      !draft.data?.email ||
      draft.data.emailVerified === true
    )
      return;
    emailLock.current = true;
    setSending(true);
    setEmailNotice("");
    try {
      const result = await emailMutation.mutateAsync();
      if (!mounted.current || epoch.current !== knowledgeCacheEpoch()) return;
      const verified = z
        .object({
          success: z.literal(true),
          alreadyVerified: z.boolean(),
          message: z.string(),
        })
        .strict()
        .safeParse(result);
      if (!verified.success) throw Error("unverified");
      setEmailNotice(
        verified.data.alreadyVerified ? "emailAlready" : "emailSent"
      );
      if (verified.data.alreadyVerified) void query.refetch();
    } catch (error) {
      if (mounted.current && epoch.current === knowledgeCacheEpoch())
        setEmailNotice(
          (error as any)?.data?.code === "TOO_MANY_REQUESTS"
            ? "emailRateLimited"
            : "emailUncertain"
        );
    } finally {
      emailLock.current = false;
      if (mounted.current && epoch.current === knowledgeCacheEpoch())
        setSending(false);
    }
  };
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void draft.reload()}
      />
    );
  if (draft.loading) return <WorkspaceState kind="loading" />;
  if (!draft.data || !draft.base || !draft.draft)
    return <WorkspaceState kind="error" onRetry={() => void draft.reload()} />;
  return (
    <form
      className="sw-panel"
      onSubmit={e => {
        e.preventDefault();
        void draft.save();
      }}
      noValidate
    >
      <div className="sw-section-head">
        <UserRound aria-hidden="true" />
        <div>
          <h2>{c.accountTitle}</h2>
          <p>{c.accountDescription}</p>
        </div>
      </div>
      <div className="sw-fields">
        <div className="sw-field">
          <label htmlFor="sw-name">{c.name}</label>
          <input
            ref={name}
            id="sw-name"
            autoComplete="name"
            value={typeof draft.draft.name === "string" ? draft.draft.name : ""}
            disabled={draft.disabled}
            maxLength={120}
            aria-invalid={
              draft.issues.includes("name") || draft.draft.name === null
            }
            aria-describedby="sw-name-hint"
            onChange={e => draft.change("name", e.target.value)}
          />
          <small
            id="sw-name-hint"
            className={draft.issues.includes("name") ? "sw-error" : ""}
          >
            {c.nameHint}
          </small>
        </div>
        <div className="sw-field">
          <span>{c.email}</span>
          <p className="sw-email" dir="ltr">
            {draft.data.email || c.unknown}
          </p>
          <small>{c.emailHint}</small>
        </div>
      </div>
      <div className="sw-email-status">
        <p>
          {draft.data.emailVerified === true
            ? c.emailVerified
            : draft.data.emailVerified === false
              ? c.emailUnverified
              : c.emailUnknown}
        </p>
        {draft.data.email && draft.data.emailVerified !== true && (
          <Button
            type="button"
            variant="outline"
            disabled={sending || query.isFetching}
            onClick={() => void sendEmail()}
          >
            {sending ? c.emailSending : c.emailSend}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={sending || draft.busy}
          onClick={() => void query.refetch()}
        >
          {c.emailCheck}
        </Button>
      </div>
      {emailNotice && (
        <p className="sw-notice" role="status">
          {draftMessage(c, emailNotice)}
        </p>
      )}
      <Feedback draft={draft} c={c} />
      <Actions draft={draft} c={c} />
    </form>
  );
}
export function SettingsWorkspace({ actorId, merchantId }: Scope) {
  const { t, i18n } = useTranslation(),
    c = settingsWorkspaceLabels(t),
    [tab, setTab] = useState("store"),
    [canView, setCanView] = useState(false),
    query = trpc.merchants.profileWorkspace.useQuery(undefined, options);
  const links = [
    ["/merchant/sari-brain?view=sources", c.knowledgeTitle, c.knowledgeHint],
    ["/merchant/payment-settings", c.paymentTitle, c.paymentHint],
    ["/merchant/team", c.teamTitle, c.teamHint],
    ["/merchant/privacy-center", c.privacyTitle, c.privacyHint],
  ];
  return (
    <section
      className="sw-workspace sc-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sw-heading">
        <span>
          <SlidersHorizontal aria-hidden="true" />
        </span>
        <div>
          <p>{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
      </header>
      <div className="sw-tabs" role="tablist" aria-label={c.tabs}>
        {[
          ["store", c.storeTab],
          ["account", c.accountTab],
          ["tools", c.toolsTab],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={"sw-tab-" + id}
            aria-selected={tab === id}
            aria-controls={"sw-panel-" + id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={event => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const keys = ["store", "account", "tools"],
                index = keys.indexOf(tab),
                delta =
                  (event.key === "ArrowRight" ? 1 : -1) *
                  (i18n.language.startsWith("ar") ? -1 : 1),
                next =
                  event.key === "Home"
                    ? "store"
                    : event.key === "End"
                      ? "tools"
                      : keys[(index + delta + 3) % 3];
              setTab(next);
              document.getElementById("sw-tab-" + next)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="sw-panel-store"
        aria-labelledby="sw-tab-store"
        hidden={tab !== "store"}
      >
        <StoreForm
          actorId={actorId}
          merchantId={merchantId}
          query={query}
          onView={setCanView}
        />
      </div>
      <div
        role="tabpanel"
        id="sw-panel-account"
        aria-labelledby="sw-tab-account"
        hidden={tab !== "account"}
      >
        <AccountForm actorId={actorId} />
      </div>
      <div
        role="tabpanel"
        id="sw-panel-tools"
        aria-labelledby="sw-tab-tools"
        hidden={tab !== "tools"}
      >
        <div className="sw-links">
          {links.map(([href, title, hint]) => (
            <Link href={href} key={href} className="sw-panel sw-tool">
              <strong>
                {title}
                <ArrowUpRight aria-hidden="true" />
              </strong>
              <p>{hint}</p>
            </Link>
          ))}
        </div>
        {tab === "tools" && canView && (
          <div className="sw-reset">
            <SetupWizardReset />
          </div>
        )}
      </div>
    </section>
  );
}
