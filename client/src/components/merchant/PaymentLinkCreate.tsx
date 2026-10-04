import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  readPaymentLinksSearch,
  paymentLinksHref,
  emptyLinkDraft,
  linkDraftInput,
  pendingPaymentLinkRequest,
  rememberPaymentLinkRequest,
  clearPaymentLinkRequest,
  type LinkDraft,
} from "@/lib/payment-links-view";
import {
  paymentLinksWorkspace,
  paymentLinkCreateResult,
  paymentLinkRequestResult,
} from "@shared/payment-links-workspace";
import {
  PaymentLinksFrame as Frame,
  useLinkCopy,
  useLinkLive,
  linkScoped as scoped,
  type LinkScope as Scope,
  type LinkCopy,
} from "./PaymentLinksPrimitives";
export function PaymentLinkCreate(scope: Scope) {
  const { c } = useLinkCopy(),
    live = useLinkLive(),
    filter = readPaymentLinksSearch(useSearch()),
    lock = useRef(false),
    form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(emptyLinkDraft),
    [errors, setErrors] = useState<string[]>([]),
    [notice, setNotice] = useState<keyof LinkCopy | null>(null),
    [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(() => {
    try {
      return {
        id: pendingPaymentLinkRequest(
          sessionStorage,
          scope.actorId,
          scope.merchantId
        ),
        failed: false,
      };
    } catch {
      return { id: null, failed: true };
    }
  });
  const [result, setResult] = useState<{
    id: number;
    outcome: "created" | "recovered";
  } | null>(null);
  const authority = trpc.payments.linksWorkspace.list.useQuery(
    {},
    {
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const authorityDto = paymentLinksWorkspace.safeParse(authority.data),
    current =
      !authority.error &&
      authorityDto.success &&
      scoped(authorityDto.data, scope)
        ? authorityDto.data
        : null;
  const mutation = trpc.payments.linksWorkspace.createReviewed.useMutation({
    retry: false,
  });
  const recovery = trpc.payments.linksWorkspace.creationRequest.useQuery(
    { requestId: storage.id ?? "00000000-0000-4000-8000-000000000000" },
    {
      enabled:
        !!storage.id &&
        !storage.failed &&
        !busy &&
        !result &&
        !!current?.canManage &&
        !authority.isFetching,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    }
  );
  const recoveryDto = paymentLinkRequestResult.safeParse(recovery.data),
    receipt =
      !recovery.error &&
      recoveryDto.success &&
      scoped(recoveryDto.data.workspace, scope) &&
      recoveryDto.data.requestId === storage.id
        ? recoveryDto.data
        : null;
  const accept = (
    requestId: string,
    id: number,
    outcome: "created" | "recovered"
  ) => {
    setResult({ id, outcome });
    setNotice(outcome);
    try {
      clearPaymentLinkRequest(
        sessionStorage,
        scope.actorId,
        scope.merchantId,
        requestId
      );
      setStorage({ id: null, failed: false });
    } catch {
      setStorage({ id: requestId, failed: true });
      setNotice("storageCleanup");
    }
  };
  useEffect(() => {
    if (
      !busy &&
      !result &&
      receipt?.outcome === "found" &&
      receipt.workspace.link &&
      live()
    )
      accept(receipt.requestId, receipt.workspace.link.id, "recovered");
  }, [receipt, busy, result]);
  useEffect(() => {
    if (!errors.length) return;
    const el = form.current;
    if (
      errors.some(e =>
        ["description", "maxUsageCount", "expiresAt"].includes(e)
      )
    ) {
      const advanced = el?.querySelector("details");
      if (advanced) advanced.open = true;
    }
    el?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  const change = (key: keyof LinkDraft, value: string | boolean) => {
    setDraft(d => ({
      ...d,
      [key]: value,
      ...(key !== "reviewed" ? { reviewed: false } : {}),
    }));
    setErrors([]);
    setNotice(null);
  };
  const disabled =
    busy ||
    !!result ||
    storage.failed ||
    !current?.canManage ||
    authority.isFetching ||
    (!!storage.id && (recovery.isFetching || receipt?.outcome !== "not_found"));
  const submit = async () => {
    if (lock.current || disabled) return;
    let requestId: string;
    try {
      requestId = storage.id ?? crypto.randomUUID();
    } catch {
      setNotice("storageError");
      return;
    }
    const input = linkDraftInput(draft, requestId);
    if (!input.success) {
      setErrors(input.error.issues.map(i => String(i.path[0])));
      return;
    }
    if (
      input.data.expiresAt &&
      Date.parse(input.data.expiresAt) <= Date.now()
    ) {
      setErrors(["expiresAt"]);
      return;
    }
    try {
      rememberPaymentLinkRequest(
        sessionStorage,
        scope.actorId,
        scope.merchantId,
        requestId
      );
    } catch {
      setStorage(s => ({ ...s, failed: true }));
      setNotice("storageError");
      return;
    }
    lock.current = true;
    setBusy(true);
    setStorage({ id: requestId, failed: false });
    setNotice(null);
    setErrors([]);
    try {
      const saved = paymentLinkCreateResult.parse(
        await mutation.mutateAsync(input.data)
      );
      if (!live()) return;
      if (
        saved.requestId !== requestId ||
        !scoped(saved.workspace, scope) ||
        !saved.workspace.link
      )
        throw Error("receipt");
      accept(requestId, saved.workspace.link.id, saved.outcome);
    } catch {
      if (live()) setNotice("actionUnknown");
    } finally {
      lock.current = false;
      if (live()) setBusy(false);
    }
  };
  const fields: Record<string, keyof LinkCopy> = {
    title: "titleError",
    description: "descriptionError",
    amountMinor: "amountError",
    maxUsageCount: "usesError",
    expiresAt: "expiryError",
    reviewed: "reviewError",
  };
  const attrs = (key: string) => ({
    "aria-invalid": errors.includes(key) || undefined,
    "aria-describedby": errors.includes(key) ? `pl-error-${key}` : undefined,
  });
  const error = (key: string) =>
    errors.includes(key) ? (
      <span className="pl-field-error" id={`pl-error-${key}`} role="alert">
        {c[fields[key] ?? "fieldError"]}
      </span>
    ) : null;
  return (
    <Frame title="createTitle" back>
      {authority.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(authority.error)}
          onRetry={() => void authority.refetch()}
        />
      ) : authority.isLoading || authority.isFetching ? (
        <WorkspaceState kind="loading" />
      ) : !current ? (
        <WorkspaceState kind="error" onRetry={() => void authority.refetch()} />
      ) : !current.canManage ? (
        <p className="ph-warning">{c.ownerOnly}</p>
      ) : (
        <>
          {notice && (
            <p
              role="status"
              className={result && !storage.failed ? "ph-notice" : "ph-warning"}
            >
              {c[notice]}
            </p>
          )}
          {storage.failed && (
            <div className="ph-warning">
              <p>{result ? c.storageCleanup : c.storageError}</p>
              {!result && (
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      setStorage({
                        id: pendingPaymentLinkRequest(
                          sessionStorage,
                          scope.actorId,
                          scope.merchantId
                        ),
                        failed: false,
                      });
                      setNotice(null);
                    } catch {
                      setNotice("storageError");
                    }
                  }}
                >
                  {c.refresh}
                </Button>
              )}
            </div>
          )}
          {result ? (
            <section className="sw-panel">
              <h2>{c[result.outcome]}</h2>
              <Link
                className="pl-primary"
                href={paymentLinksHref(filter.success ? filter.data : {}, {
                  link: result.id,
                })}
              >
                {c.reviewCurrent}
              </Link>
            </section>
          ) : (
            <>
              {storage.id && (
                <section className="ph-warning" aria-label={c.pending}>
                  <h2>{c.pending}</h2>
                  <p>
                    {c.requestReference}: <bdi>{storage.id}</bdi>
                  </p>
                  {busy ? (
                    <p role="status">{c.creating}</p>
                  ) : (
                    <>
                      <p role="status">
                        {recovery.isLoading || recovery.isFetching
                          ? c.creating
                          : recovery.error || !receipt
                            ? c.readFailed
                            : receipt.outcome === "not_found"
                              ? c.notFound
                              : receipt.outcome === "restricted"
                                ? c.ownerOnly
                                : c.unverified}
                      </p>
                      <Button
                        variant="outline"
                        disabled={recovery.isFetching || storage.failed}
                        onClick={() => void recovery.refetch()}
                      >
                        {c.checkRequest}
                      </Button>
                    </>
                  )}
                </section>
              )}
              <form
                className="sw-panel pl-create"
                ref={form}
                noValidate
                onSubmit={e => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="pl-fields">
                  <label htmlFor="pl-title">
                    {c.name}
                    <input
                      id="pl-title"
                      autoComplete="off"
                      maxLength={255}
                      value={draft.title}
                      disabled={busy}
                      {...attrs("title")}
                      onChange={e => change("title", e.target.value)}
                      placeholder={c.titleHint}
                    />
                    {error("title")}
                  </label>
                  <label htmlFor="pl-amount">
                    {c.amount} (SAR)
                    <input
                      id="pl-amount"
                      dir="ltr"
                      inputMode="decimal"
                      value={draft.amount}
                      disabled={busy}
                      {...attrs("amountMinor")}
                      onChange={e => change("amount", e.target.value)}
                      placeholder="125.50"
                    />
                    <small>{c.amountHint}</small>
                    {error("amountMinor")}
                  </label>
                </div>
                <details className="ph-filter-details">
                  <summary>{c.optional}</summary>
                  <div className="pl-fields">
                    <label htmlFor="pl-description">
                      {c.description}
                      <textarea
                        id="pl-description"
                        rows={3}
                        maxLength={1000}
                        disabled={busy}
                        value={draft.description}
                        {...attrs("description")}
                        onChange={e => change("description", e.target.value)}
                      />
                      {error("description")}
                    </label>
                    <label htmlFor="pl-max-uses">
                      {c.maxUses}
                      <input
                        id="pl-max-uses"
                        dir="ltr"
                        inputMode="numeric"
                        disabled={busy}
                        value={draft.maxUses}
                        {...attrs("maxUsageCount")}
                        onChange={e => change("maxUses", e.target.value)}
                      />
                      <small>{c.maxUsesHint}</small>
                      {error("maxUsageCount")}
                    </label>
                    <label htmlFor="pl-expiry">
                      {c.expires}
                      <input
                        id="pl-expiry"
                        type="date"
                        max="2037-12-31"
                        disabled={busy}
                        value={draft.expiry}
                        {...attrs("expiresAt")}
                        onChange={e => change("expiry", e.target.value)}
                      />
                      <small>{c.expiryHint}</small>
                      {error("expiresAt")}
                    </label>
                  </div>
                </details>
                <label className="pl-check">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={draft.reviewed}
                    {...attrs("reviewed")}
                    onChange={e => change("reviewed", e.target.checked)}
                  />
                  {c.createReview}
                </label>
                {error("reviewed")}
                <p className="ph-muted">{c.sourceHint}</p>
                <Button type="submit" disabled={disabled}>
                  {busy
                    ? c.creating
                    : storage.id
                      ? c.retrySame
                      : c.createConfirm}
                </Button>
              </form>
            </>
          )}
        </>
      )}
    </Frame>
  );
}
