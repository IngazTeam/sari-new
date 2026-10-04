import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import { sheetsReportsLabels } from "@/lib/sheets-reports-labels";
import { sheetsSettingsView } from "@shared/sheets-settings";
import {
  sheetsReportContext,
  sheetsReportReceipt,
} from "@shared/sheets-report-review";
import type { SheetsReportData } from "@shared/sheets-report-data";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/sheets-data-workspace.css";
type Kind = "daily" | "weekly" | "monthly" | "custom";
type Review = {
  kind: Kind;
  channel: "sheet" | "whatsapp";
  sheetId: string;
  recipient: string | null;
  instanceId: number | null;
  sender: string | null;
  start: string;
  end: string;
};
const reportTypes = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
} as const;
export function SheetsReportsPage() {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions),
    identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
      ...usageQueryOptions,
      enabled: !!user.data?.id && !user.error && !user.isFetching,
    });
  const error = user.error || identity.error,
    refresh = () => {
      void user.refetch();
      void identity.refetch();
    };
  if (error)
    return (
      <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh} />
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
    return (
      <WorkspaceState
        kind={!user.data?.id ? "session" : "missing"}
        onRetry={refresh}
      />
    );
  return (
    <ReportsWorkspace
      key={user.data.id + ":" + identity.data.id}
      actorId={user.data.id}
      merchantId={identity.data.id}
    />
  );
}
function ReportsWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = sheetsReportsLabels(t),
    ar = i18n.language.startsWith("ar");
  const connection = trpc.sheets.getStatus.useQuery(
      undefined,
      usageQueryOptions
    ),
    context = trpc.sheets.reportContext.useQuery(undefined, usageQueryOptions);
  const parsed = sheetsSettingsView.safeParse(connection.data),
    view = sheetsReportContext.safeParse(context.data);
  const status =
    parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
      ? parsed.data
      : null;
  const target =
    view.success &&
    view.data.actorId === actorId &&
    view.data.merchantId === merchantId
      ? view.data
      : null;
  const error = connection.error || context.error,
    loading =
      connection.isLoading ||
      connection.isFetching ||
      context.isLoading ||
      context.isFetching;
  const ready =
    !error &&
    !loading &&
    !!status &&
    !!target &&
    (!status.spreadsheetId || status.spreadsheetId === target.spreadsheetId);
  const linked = ready && status?.state === "ready" && !!target?.spreadsheetId;
  const [kind, setKind] = useState<Kind>("daily"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [fieldError, setFieldError] = useState(false);
  const [review, setReview] = useState<Review | null>(null),
    [running, setRunning] = useState(false),
    [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<
      "acceptedSheet" | "acceptedSend" | "uncertain" | "rejected" | null
    >(null),
    [result, setResult] = useState<SheetsReportData | null>(null);
  const busy = useRef(false),
    alive = useRef(true),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const daily = trpc.sheets.generateDailyReport.useMutation(),
    weekly = trpc.sheets.generateWeeklyReport.useMutation(),
    monthly = trpc.sheets.generateMonthlyReport.useMutation(),
    custom = trpc.sheets.generateCustomReport.useMutation(),
    send = trpc.sheets.sendReportViaWhatsApp.useMutation();
  const disabled = running || locked || !!review;
  const current = useRef({ ready, linked, target });
  current.current = { ready, linked, target };
  const validDates = () => {
    const a = new Date(start + "T00:00:00.000Z"),
      b = new Date(end + "T00:00:00.000Z");
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(end) &&
      Number.isFinite(a.getTime()) &&
      Number.isFinite(b.getTime()) &&
      a.toISOString().slice(0, 10) === start &&
      b.toISOString().slice(0, 10) === end &&
      b > a &&
      b.getTime() - a.getTime() <= 366 * 86400000
    );
  };
  const open = (channel: Review["channel"], element: HTMLElement) => {
    if (
      disabled ||
      !linked ||
      !target ||
      (channel === "whatsapp" && (!target.canSend || kind === "custom"))
    )
      return;
    if (kind === "custom" && !validDates()) {
      setFieldError(true);
      document.getElementById("sr-start")?.focus();
      return;
    }
    trigger.current = element;
    setFieldError(false);
    setReview({
      kind,
      channel,
      sheetId: target.spreadsheetId!,
      recipient: target.recipientPhone,
      instanceId: target.instanceId,
      sender: target.senderPhone,
      start,
      end,
    });
  };
  const sameReview =
    !!review &&
    linked &&
    review.sheetId === target?.spreadsheetId &&
    (review.channel === "sheet" ||
      (target?.canSend &&
        review.recipient === target.recipientPhone &&
        review.instanceId === target.instanceId));
  const confirm = async () => {
    if (
      !review ||
      busy.current ||
      locked ||
      !sameReview ||
      !current.current.ready
    )
      return;
    const snapshot = review,
      base = {
        reviewed: true as const,
        expectedSpreadsheetId: snapshot.sheetId,
      };
    busy.current = true;
    setRunning(true);
    setNotice(null);
    setResult(null);
    try {
      const response =
        snapshot.channel === "whatsapp"
          ? await send.mutateAsync({
              ...base,
              reportType: reportTypes[snapshot.kind as Exclude<Kind, "custom">],
              expectedRecipientPhone: snapshot.recipient!,
              expectedInstanceId: snapshot.instanceId!,
            })
          : snapshot.kind === "daily"
            ? await daily.mutateAsync(base)
            : snapshot.kind === "weekly"
              ? await weekly.mutateAsync(base)
              : snapshot.kind === "monthly"
                ? await monthly.mutateAsync(base)
                : await custom.mutateAsync({
                    ...base,
                    startDate: new Date(snapshot.start + "T00:00:00.000Z"),
                    endDate: new Date(snapshot.end + "T00:00:00.000Z"),
                  });
      if (!alive.current) return;
      const receipt = sheetsReportReceipt.parse(response);
      if (
        receipt.actorId !== actorId ||
        receipt.merchantId !== merchantId ||
        receipt.data.merchantId !== merchantId ||
        receipt.spreadsheetId !== snapshot.sheetId ||
        receipt.reportKind !== snapshot.kind ||
        receipt.channel !== snapshot.channel ||
        (snapshot.channel === "whatsapp" &&
          (!receipt.messageId || receipt.recipientPhone !== snapshot.recipient))
      )
        throw Error("Unconfirmed report");
      if (
        snapshot.kind === "custom" &&
        (receipt.data.startAt !== snapshot.start + "T00:00:00.000Z" ||
          receipt.data.endAt !== snapshot.end + "T00:00:00.000Z")
      )
        throw Error("Changed report period");
      setResult(receipt.data);
      setNotice(
        snapshot.channel === "sheet" ? "acceptedSheet" : "acceptedSend"
      );
      setLocked(true);
      setReview(null);
    } catch (failure) {
      if (!alive.current) return;
      const code = (failure as { data?: { code?: string } })?.data?.code;
      const rejected =
        !!code &&
        [
          "BAD_REQUEST",
          "FORBIDDEN",
          "UNAUTHORIZED",
          "TOO_MANY_REQUESTS",
        ].includes(code);
      setNotice(rejected ? "rejected" : "uncertain");
      setLocked(!rejected);
      setReview(null);
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  };
  const fmt = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
      calendar: "gregory",
    }).format(new Date(value));
  return (
    <section className="sd-workspace" dir={ar ? "rtl" : "ltr"}>
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
        <Link className="sd-button" href="/merchant/sheets/export">
          {c.conversationExport}
        </Link>
      </header>
      {error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(error)}
          onRetry={() => {
            void connection.refetch();
            void context.refetch();
          }}
        />
      ) : loading ? (
        <WorkspaceState inline kind="loading" />
      ) : !ready ? (
        <WorkspaceState
          inline
          kind="error"
          onRetry={() => {
            void connection.refetch();
            void context.refetch();
          }}
        />
      ) : (
        <>
          <section className="sd-card">
            <div className="sd-heading">
              <h2>{c.destination}</h2>
              <Link className="sd-button" href="/merchant/sheets/settings">
                {c.settings}
              </Link>
            </div>
            <p>{linked ? c.linked : c.unlinked}</p>
            {target?.spreadsheetId && (
              <p className="sd-id">
                <bdi>{target.spreadsheetId}</bdi>
              </p>
            )}
            <p>
              {c.recipient}:{" "}
              <bdi>{target?.recipientPhone || c.unavailable}</bdi>
            </p>
            <p>
              {c.sender}: <bdi>{target?.senderPhone || c.unavailable}</bdi>
            </p>
            {!target?.canSend && (
              <p>
                {c.sendUnavailable}{" "}
                <Link href="/merchant/whatsapp" className="sd-button">
                  {c.channels}
                </Link>
              </p>
            )}
          </section>
          <section className="sd-card">
            <h2>{c.period}</h2>
            <div className="sr-periods" role="group" aria-label={c.period}>
              {(["daily", "weekly", "monthly", "custom"] as const).map(
                value => (
                  <button
                    type="button"
                    className="sd-button"
                    key={value}
                    aria-pressed={kind === value}
                    disabled={disabled}
                    onClick={() => {
                      setKind(value);
                      setFieldError(false);
                    }}
                  >
                    {c[value]}
                  </button>
                )
              )}
            </div>
            <p>{c[(kind + "Hint") as "dailyHint"]}</p>
            {kind === "custom" && (
              <div className="sr-dates">
                <label htmlFor="sr-start">
                  {c.start}
                  <input
                    type="date"
                    id="sr-start"
                    value={start}
                    disabled={disabled}
                    aria-invalid={fieldError}
                    aria-describedby={fieldError ? "sr-date-error" : undefined}
                    onChange={e => {
                      setStart(e.target.value);
                      setFieldError(false);
                    }}
                  />
                </label>
                <label htmlFor="sr-end">
                  {c.end}
                  <input
                    type="date"
                    id="sr-end"
                    value={end}
                    disabled={disabled}
                    aria-invalid={fieldError}
                    aria-describedby={fieldError ? "sr-date-error" : undefined}
                    onChange={e => {
                      setEnd(e.target.value);
                      setFieldError(false);
                    }}
                  />
                </label>
                {fieldError && (
                  <p id="sr-date-error" role="alert">
                    {c.invalidDates}
                  </p>
                )}
              </div>
            )}
            <p className="sd-muted">{c.utc}</p>
            <div className="sr-actions">
              <button
                type="button"
                className="sd-button sd-primary"
                disabled={disabled || !linked}
                onClick={e => open("sheet", e.currentTarget)}
              >
                {c.reviewSheet}
              </button>
              <button
                type="button"
                className="sd-button"
                disabled={
                  disabled || !linked || !target?.canSend || kind === "custom"
                }
                onClick={e => open("whatsapp", e.currentTarget)}
              >
                {c.reviewSend}
              </button>
            </div>
            <p className="sd-muted">{c.limits}</p>
            <details>
              <summary>{c.autoSettings}</summary>
              <p>{c.autoHint}</p>
              <ul>
                {(["daily", "weekly", "monthly"] as const).map(value => (
                  <li key={value}>
                    {c[value]}:{" "}
                    {status!.reports[
                      value === "daily"
                        ? "sendDailyReports"
                        : value === "weekly"
                          ? "sendWeeklyReports"
                          : "sendMonthlyReports"
                    ]
                      ? c.enabled
                      : c.disabled}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          {notice && (
            <section className="sd-card sd-result" role="status">
              <h2>{c.result}</h2>
              <p>{c[notice]}</p>
              {locked && (
                <>
                  <p>{c.noRetry}</p>
                  <button
                    type="button"
                    className="sd-button"
                    onClick={() => {
                      setLocked(false);
                      setNotice(null);
                      setResult(null);
                    }}
                  >
                    {c.newReport}
                  </button>
                </>
              )}
            </section>
          )}
          {result && (
            <section className="sd-card">
              <h2>{c.recorded}</h2>
              <p>
                {fmt(result.startAt)} — {fmt(result.endAt)} UTC
              </p>
              <div className="sr-stats">
                {[
                  [c.orders, result.totalOrders],
                  [c.conversations, result.totalConversations],
                  [c.messages, result.totalMessages],
                  [c.profiles, result.newCustomers],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <h3>{c.values}</h3>
              <p>{c.valuesHint}</p>
              {result.orderValues.length ? (
                result.orderValues.map(row => (
                  <p key={row.currency}>
                    <bdi>
                      {(row.totalMinor / 100).toFixed(2)} {row.currency}
                    </bdi>{" "}
                    · {c.markedPaid}:{" "}
                    <bdi>
                      {(row.markedPaidMinor / 100).toFixed(2)} {row.currency}
                    </bdi>
                  </p>
                ))
              ) : (
                <p>{c.noValues}</p>
              )}
              <p>
                {c.excludedAmounts}: {result.excludedAmounts} ·{" "}
                {c.excludedItems}: {result.excludedItemOrders}
              </p>
              <h3>{c.topProducts}</h3>
              {result.topProducts.length ? (
                <ul className="sd-review-list">
                  {result.topProducts.map((row, i) => (
                    <li key={i}>
                      {row.name} · {row.count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{c.noProducts}</p>
              )}
              <details>
                <summary>{c.orderStatuses}</summary>
                <ul>
                  {Object.entries(result.ordersByStatus).map(([key, value]) => (
                    <li key={key}>
                      {(
                        {
                          pending: c.status_pending,
                          confirmed: c.status_confirmed,
                          processing: c.status_processing,
                          shipped: c.status_shipped,
                          delivered: c.status_delivered,
                          cancelled: c.status_cancelled,
                          refunded: c.status_refunded,
                        } as Record<string, string>
                      )[key] || c.unknownStatus}
                      : {value}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </>
      )}
      <Dialog
        open={!!review && ready}
        onOpenChange={open => {
          if (!open && !running) setReview(null);
        }}
      >
        <DialogContent
          className="sd-dialog"
          dir={ar ? "rtl" : "ltr"}
          closeLabel={c.close}
          showCloseButton={!running}
          onEscapeKeyDown={e => {
            if (running) e.preventDefault();
          }}
          onPointerDownOutside={e => {
            if (running) e.preventDefault();
          }}
          onCloseAutoFocus={e => {
            if (trigger.current?.isConnected) {
              e.preventDefault();
              trigger.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {review?.channel === "whatsapp" ? c.reviewSend : c.reviewSheet}
            </DialogTitle>
            <DialogDescription>
              {review?.channel === "whatsapp" ? c.sendHint : c.sheetHint}
            </DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <p>
                {c.period}: {c[review.kind]}
                {review.kind === "custom" && (
                  <>
                    {" "}
                    <bdi>
                      {review.start} — {review.end}
                    </bdi>
                  </>
                )}
              </p>
              <p>{c[(review.kind + "Hint") as "dailyHint"]}</p>
              <p>
                {c.destination}: <bdi>{review.sheetId}</bdi>
              </p>
              {review.channel === "whatsapp" && (
                <>
                  <p>
                    {c.recipient}: <bdi>{review.recipient}</bdi>
                  </p>
                  <p>
                    {c.sender}: <bdi>{review.sender}</bdi>
                  </p>
                </>
              )}
              <p className="sd-warning">{c.privacy}</p>
            </>
          )}
          <DialogFooter>
            <button
              type="button"
              className="sd-button"
              disabled={running}
              onClick={() => setReview(null)}
            >
              {c.cancel}
            </button>
            <button
              type="button"
              className="sd-button sd-primary"
              disabled={running || !sameReview}
              onClick={() => void confirm()}
            >
              {running ? c.working : c.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
