import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarDays, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  calendarAuthorizationUrl,
  calendarCallbackResult,
  navigateCalendarAuthorization,
  scopedCalendarSettings,
} from "@/lib/calendar-connection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import "@/styles/service-catalog-workspace.css";
import "@/styles/calendar-connection.css";

export function CalendarConnectionWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    search = useSearch();
  const query = trpc.calendar.settings.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const connect = trpc.calendar.beginOAuth.useMutation(),
    disconnect = trpc.calendar.disconnect.useMutation();
  const data = query.error
    ? null
    : scopedCalendarSettings(query.data, actorId, merchantId);
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null),
    [notice, setNotice] = useState<
      "saved" | "uncertain" | "connect" | "rate" | "disabled" | null
    >(null),
    [blocked, setBlocked] = useState(false),
    [review, setReview] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null),
    refreshButton = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    scope = useRef({ actorId, merchantId });
  scope.current = { actorId, merchantId };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () =>
    alive.current &&
    scope.current.actorId === actorId &&
    scope.current.merchantId === merchantId;
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    try {
      const result = await query.refetch();
      if (
        current() &&
        !result.error &&
        scopedCalendarSettings(result.data, actorId, merchantId)
      ) {
        setBlocked(false);
        setNotice(null);
      }
    } finally {
      if (current()) lock.current = false;
    }
  }
  async function start() {
    if (lock.current || !data?.oauthReady || blocked || query.isFetching)
      return;
    lock.current = true;
    setBusy("connect");
    setNotice(null);
    try {
      const result = await connect.mutateAsync();
      if (!current()) return;
      const url = calendarAuthorizationUrl(result.authorizationUrl);
      if (!url) throw Error("invalid_redirect");
      navigateCalendarAuthorization(url);
    } catch (error) {
      if (current()) {
        const message = error instanceof Error ? error.message : "";
        setNotice(
          message === "calendar_oauth:rate_limit"
            ? "rate"
            : message === "calendar_oauth:configuration"
              ? "disabled"
              : "connect"
        );
        setBlocked(true);
        setBusy(null);
        lock.current = false;
      }
    }
  }
  async function remove() {
    if (
      lock.current ||
      !data?.active ||
      !reviewed ||
      review !== data.digest ||
      blocked ||
      query.isFetching
    )
      return;
    lock.current = true;
    setBusy("disconnect");
    setNotice(null);
    try {
      const result = await disconnect.mutateAsync({
        expectedDigest: review,
        reviewed: true,
      });
      if (!current()) return;
      const { success, ...snapshot } = result;
      if (
        success !== true ||
        !scopedCalendarSettings(snapshot, actorId, merchantId) ||
        snapshot.active
      )
        throw Error("uncertain");
      const checked = await query.refetch();
      if (!current()) return;
      const verified =
        !checked.error &&
        scopedCalendarSettings(checked.data, actorId, merchantId);
      if (!verified || verified.active) throw Error("uncertain");
      setNotice("saved");
      setReview(null);
      setReviewed(false);
    } catch {
      if (current()) {
        setNotice("uncertain");
        setBlocked(true);
        setReview(null);
        setReviewed(false);
      }
    } finally {
      if (current()) {
        lock.current = false;
        setBusy(null);
      }
    }
  }
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={() => void refresh()}
      />
    );
  if (!data)
    return (
      <WorkspaceState
        kind={query.isLoading || query.isFetching ? "loading" : "error"}
        onRetry={() => void refresh()}
      />
    );
  const labels = {
    configured: t("merchantUx.calendarConnection.configured"),
    unlinked: t("merchantUx.calendarConnection.unlinked"),
    credentials_invalid: t("merchantUx.calendarConnection.credentials_invalid"),
    oauth_disabled: t("merchantUx.calendarConnection.oauth_disabled"),
    needs_destination: t("merchantUx.calendarConnection.needs_destination"),
  };
  const hints = {
    configured: t("merchantUx.calendarConnection.configuredHint"),
    unlinked: t("merchantUx.calendarConnection.unlinkedHint"),
    credentials_invalid: t("merchantUx.calendarConnection.credentialsHint"),
    oauth_disabled: t("merchantUx.calendarConnection.disabledHint"),
    needs_destination: t("merchantUx.calendarConnection.destinationHint"),
  };
  const callbacks = {
    connected: t("merchantUx.calendarConnection.callbackConnected"),
    cancelled: t("merchantUx.calendarConnection.callbackCancelled"),
    session: t("merchantUx.calendarConnection.callbackSession"),
    failed: t("merchantUx.calendarConnection.callbackFailed"),
  };
  const notices = {
    saved: t("merchantUx.calendarConnection.disconnected"),
    uncertain: t("merchantUx.calendarConnection.uncertain"),
    connect: t("merchantUx.calendarConnection.connectFailed"),
    rate: t("merchantUx.calendarConnection.rateLimit"),
    disabled: t("merchantUx.calendarConnection.providerDisabled"),
  };
  const callback = calendarCallbackResult(search),
    disabled = !!busy || blocked || !!query.isFetching;
  return (
    <div
      className="service-catalog calendar-connection"
      data-calendar-connection
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sc-header">
        <div>
          <p className="sc-eyebrow">
            {t("merchantUx.calendarConnection.eyebrow")}
          </p>
          <h1>{t("merchantUx.calendarConnection.title")}</h1>
          <p>{t("merchantUx.calendarConnection.description")}</p>
        </div>
        <div className="sc-actions">
          <Button asChild variant="outline">
            <Link href="/merchant/calendar">
              <CalendarDays />
              {t("merchantUx.calendarConnection.back")}
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={!!busy || query.isFetching}
            ref={refreshButton}
            onClick={() => void refresh()}
          >
            <RefreshCw />
            {t("merchantUx.calendarConnection.refresh")}
          </Button>
        </div>
      </header>
      {callback && !notice && (
        <div className="sc-feedback" role="status">
          {callbacks[callback]}
        </div>
      )}
      {notice && (
        <div
          className="sc-feedback"
          role={notice === "saved" ? "status" : "alert"}
        >
          {notices[notice]}
        </div>
      )}
      <section
        className="cc-panel"
        aria-labelledby="calendar-connection-status"
      >
        <div className="cc-heading">
          <h2 id="calendar-connection-status">
            {t("merchantUx.calendarConnection.status")}
          </h2>
          <Badge variant="secondary">{labels[data.state]}</Badge>
        </div>
        <p className="sc-muted">{hints[data.state]}</p>
        <dl className="cc-facts">
          <div>
            <dt>{t("merchantUx.calendarConnection.destination")}</dt>
            <dd>
              {data.calendarId === "primary"
                ? t("merchantUx.calendarConnection.primary")
                : (data.calendarId ??
                  t("merchantUx.calendarConnection.unavailable"))}
            </dd>
          </div>
          <div>
            <dt>{t("merchantUx.calendarConnection.lastSync")}</dt>
            <dd>
              {data.lastSync
                ? new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Riyadh",
                    calendar: "gregory",
                  }).format(new Date(data.lastSync))
                : t("merchantUx.calendarConnection.unavailable")}
            </dd>
          </div>
          <div>
            <dt>{t("merchantUx.calendarConnection.appointments")}</dt>
            <dd>
              {new Intl.NumberFormat(i18n.language).format(
                data.retainedAppointments
              )}
            </dd>
          </div>
        </dl>
        <p className="sc-muted">
          {t("merchantUx.calendarConnection.connectHint")}
        </p>
        {!data.oauthReady && (
          <p className="sc-feedback">
            {t("merchantUx.calendarConnection.providerDisabled")}
          </p>
        )}
        <div className="sc-actions">
          <Button
            disabled={disabled || !data.oauthReady}
            onClick={() => void start()}
          >
            <ExternalLink />
            {busy === "connect"
              ? t("merchantUx.calendarConnection.connecting")
              : data.active
                ? t("merchantUx.calendarConnection.reconnect")
                : t("merchantUx.calendarConnection.connect")}
          </Button>
          {data.active && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={event => {
                opener.current = event.currentTarget;
                setReview(data.digest);
                setReviewed(false);
              }}
            >
              <Unplug />
              {t("merchantUx.calendarConnection.disconnect")}
            </Button>
          )}
        </div>
      </section>
      <section className="cc-panel">
        <h2>{t("merchantUx.calendarConnection.reminders")}</h2>
        <p className="sc-muted">
          {t("merchantUx.calendarConnection.remindersHint")}
        </p>
        <div className="sc-actions">
          <Button asChild variant="outline">
            <Link href="/merchant/calendar">
              {t("merchantUx.calendarConnection.back")}
            </Link>
          </Button>
        </div>
      </section>
      <details className="cc-panel cc-privacy">
        <summary>{t("merchantUx.calendarConnection.privacy")}</summary>
        <p className="sc-muted">
          {t("merchantUx.calendarConnection.privacyHint")}
        </p>
        <a
          href="https://myaccount.google.com/connections"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("merchantUx.calendarConnection.privacy")}
          <ExternalLink />
        </a>
      </details>
      <Dialog
        open={review !== null}
        onOpenChange={open => {
          if (!open && !busy) {
            setReview(null);
            setReviewed(false);
          }
        }}
      >
        <DialogContent
          className="sc-dialog cc-dialog"
          closeLabel={t("merchantUx.calendarConnection.cancel")}
          showCloseButton={!busy}
          onCloseAutoFocus={event => {
            event.preventDefault();
            (opener.current?.isConnected
              ? opener.current
              : refreshButton.current
            )?.focus();
          }}
          dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle>
              {t("merchantUx.calendarConnection.disconnectTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("merchantUx.calendarConnection.disconnectHint")}
            </DialogDescription>
          </DialogHeader>
          <p>
            {t("merchantUx.calendarConnection.retained", {
              count: data.retainedAppointments,
            })}
          </p>
          {review !== data.digest && (
            <p role="alert">{t("merchantUx.calendarConnection.changed")}</p>
          )}
          <label className="cc-review">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!!busy}
              onChange={e => setReviewed(e.target.checked)}
            />
            <span>{t("merchantUx.calendarConnection.reviewed")}</span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                setReview(null);
                setReviewed(false);
              }}
            >
              {t("merchantUx.calendarConnection.cancel")}
            </Button>
            <Button
              disabled={disabled || !reviewed || review !== data.digest}
              onClick={() => void remove()}
            >
              {busy === "disconnect"
                ? t("merchantUx.calendarConnection.disconnecting")
                : t("merchantUx.calendarConnection.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
