import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Smartphone, CheckCircle2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import {
  browserPushDevice,
  type PushDeviceAdapter,
  type PushDeviceState,
} from "@/lib/push-device";
import { pushWorkspaceLabels } from "@/lib/push-workspace-labels";
import { pushWorkspace, pushTestResult } from "@shared/push-workspace";
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
import "@/styles/push-workspace.css";
export function PushNotificationsPage({
  device = browserPushDevice,
}: {
  device?: PushDeviceAdapter;
}) {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const refresh = () => {
    void user.refetch();
    void identity.refetch();
  };
  const error = user.error || identity.error;
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
    return <WorkspaceState kind="session" onRetry={refresh} />;
  return (
    <PushDeviceWorkspace
      key={user.data.id + ":" + identity.data.id}
      actorId={user.data.id}
      merchantId={identity.data.id}
      device={device}
    />
  );
}
function PushDeviceWorkspace({
  actorId,
  merchantId,
  device,
}: {
  actorId: number;
  merchantId: number;
  device: PushDeviceAdapter;
}) {
  const { t, i18n } = useTranslation(),
    { text: c } = pushWorkspaceLabels(t),
    english = i18n.language.startsWith("en");
  const [local, setLocal] = useState<PushDeviceState | null>(null),
    [localError, setLocalError] = useState(false);
  const [review, setReview] = useState<"enable" | "disable" | "test" | null>(
      null
    ),
    [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null),
    [testLocked, setTestLocked] = useState(false);
  const busy = useRef(false),
    alive = useRef(true);
  const trigger = useRef<HTMLButtonElement | null>(null),
    refreshButton = useRef<HTMLButtonElement | null>(null);
  const query = trpc.push.workspace.useQuery(
    { deviceHash: local?.deviceHash || null },
    { ...usageQueryOptions, enabled: !!local && !localError }
  );
  const subscribe = trpc.push.subscribe.useMutation(),
    unsubscribe = trpc.push.unsubscribe.useMutation(),
    send = trpc.push.sendTest.useMutation();
  const readDevice = async () => {
    try {
      const result = await device.read();
      if (alive.current) {
        setLocal(result);
        setLocalError(false);
      }
      return result;
    } catch {
      if (alive.current) setLocalError(true);
      return null;
    }
  };
  useEffect(() => {
    alive.current = true;
    void readDevice();
    return () => {
      alive.current = false;
    };
  }, [device]);
  const parsed = pushWorkspace.safeParse(query.data);
  const data =
    parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId &&
    parsed.data.deviceHash === (local?.deviceHash || null)
      ? parsed.data
      : null;
  const refresh = () => {
    void readDevice();
    void query.refetch();
  };
  const act = async () => {
    if (
      busy.current ||
      !review ||
      !data ||
      !local ||
      query.isFetching ||
      query.error
    )
      return;
    const operation = review,
      expectedHash = local.deviceHash;
    busy.current = true;
    setRunning(true);
    setNotice(null);
    try {
      if (operation === "enable") {
        if (!data.publicKey) throw Error("unconfigured");
        const input = await device.enable(data.publicKey);
        if (!alive.current) return;
        const result = await subscribe.mutateAsync(input);
        if (
          result.actorId !== actorId ||
          result.merchantId !== merchantId ||
          !result.success
        )
          throw Error("scope");
        const current = await readDevice();
        if (current?.deviceHash !== result.deviceHash) throw Error("changed");
        if (alive.current) setNotice("enabled");
      } else if (operation === "disable") {
        if (!expectedHash) throw Error("missing");
        const result = await unsubscribe.mutateAsync({
          deviceHash: expectedHash,
          reviewed: true,
        });
        if (
          result.actorId !== actorId ||
          result.merchantId !== merchantId ||
          result.deviceHash !== expectedHash ||
          !result.success
        )
          throw Error("scope");
        if (!alive.current) return;
        let removed = false;
        try {
          removed = await device.disable(expectedHash);
        } catch {}
        if (alive.current) setNotice(removed ? "disabled" : "serverDisabled");
        await readDevice();
      } else {
        if (!expectedHash || testLocked) throw Error("missing");
        setTestLocked(true);
        const requestId = crypto.randomUUID();
        const result = pushTestResult.parse(
          await send.mutateAsync({
            deviceHash: expectedHash,
            requestId,
            reviewed: true,
            language: english ? "en" : "ar",
          })
        );
        if (
          result.actorId !== actorId ||
          result.merchantId !== merchantId ||
          result.requestId !== requestId
        )
          throw Error("scope");
        if (alive.current) setNotice(result.state);
      }
      if (alive.current) {
        setReview(null);
        void query.refetch();
      }
    } catch {
      if (alive.current) {
        setNotice(operation === "test" ? "unknown" : "operationFailed");
        setReview(null);
        void readDevice();
        void query.refetch();
      }
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  };
  if (localError) return <WorkspaceState kind="error" onRetry={refresh} />;
  if (!local || query.isLoading || query.isFetching)
    return <WorkspaceState kind="loading" />;
  if (query.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(query.error)}
        onRetry={refresh}
      />
    );
  if (!data) return <WorkspaceState kind="error" onRetry={refresh} />;
  const enabled = local.permission === "granted" && data.deviceEnabled;
  const canEnable =
    data.canManage &&
    local.supported &&
    local.permission !== "denied" &&
    !!data.publicKey &&
    !running;
  return (
    <main
      className="sd-workspace push-workspace"
      dir={english ? "ltr" : "rtl"}
      data-push-workspace
    >
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">
            <Bell size={18} />
            {c("eyebrow")}
          </p>
          <h1>{c("title")}</h1>
          <p>{c("subtitle")}</p>
        </div>
        <button
          className="sd-button"
          disabled={running}
          onClick={refresh}
          ref={refreshButton}
        >
          {c("refresh")}
        </button>
      </header>
      {notice && (
        <div className="sd-warning" role="status" aria-live="polite">
          {c(notice)}
        </div>
      )}
      <div className="sd-grid">
        <section className="sd-card">
          <div className="sd-section-title">
            <Smartphone size={24} />
            <h2>{c("deviceTitle")}</h2>
          </div>
          <p className="sd-status">
            {enabled ? <CheckCircle2 size={20} /> : <Bell size={20} />}{" "}
            {c(
              enabled
                ? "deviceEnabled"
                : local.deviceHash
                  ? "needsConfirmation"
                  : "deviceDisabled"
            )}
          </p>
          <p>{c("deviceScope")}</p>
          <dl className="sd-summary">
            <div>
              <dt>{c("permission")}</dt>
              <dd>{c(local.permission)}</dd>
            </div>
            <div>
              <dt>{c("server")}</dt>
              <dd>{c(data.deviceEnabled ? "registered" : "unregistered")}</dd>
            </div>
          </dl>
          {!local.supported && (
            <div className="sd-warning">{c("unsupportedHelp")}</div>
          )}
          {local.permission === "denied" && (
            <div className="sd-warning">{c("deniedHelp")}</div>
          )}
          {!data.publicKey && (
            <div className="sd-warning">{c("unconfigured")}</div>
          )}
          <div className="sr-actions">
            {!enabled && (
              <button
                className="sd-button sd-primary"
                disabled={!canEnable}
                onClick={e => {
                  trigger.current = e.currentTarget;
                  setReview("enable");
                }}
              >
                {c("enable")}
              </button>
            )}
            {local.deviceHash && (
              <button
                className="sd-button"
                disabled={!data.canManage || running}
                onClick={e => {
                  trigger.current = e.currentTarget;
                  setReview("disable");
                }}
              >
                {c("disable")}
              </button>
            )}
            {enabled && (
              <button
                className="sd-button sd-primary"
                disabled={
                  running || testLocked || !data.publicKey || !data.canManage
                }
                onClick={e => {
                  trigger.current = e.currentTarget;
                  setReview("test");
                }}
              >
                {c("test")}
              </button>
            )}
          </div>
          {testLocked && <p>{c("noRepeat")}</p>}
        </section>
        <aside className="sd-card">
          <ShieldCheck size={26} />
          <h2>{c("helpTitle")}</h2>
          <p>{c("privacy")}</p>
          <p>{c("iphone")}</p>
          <p>{c("permissionHelp")}</p>
          <Link className="sd-button" href="/merchant/notification-settings">
            {c("preferences")}
          </Link>
        </aside>
      </div>
      <section className="sd-card">
        <h2>{c("history")}</h2>
        <p>{c("historyHelp")}</p>
        <div className="sr-stats">
          {(["total", "accepted", "rejected", "unconfirmed"] as const).map(
            key => (
              <div key={key}>
                <span>{c(key + "Count")}</span>
                <strong>
                  {data.counts[key].toLocaleString(english ? "en" : "ar")}
                </strong>
              </div>
            )
          )}
        </div>
        {!data.logs.length ? (
          <p className="sd-empty">{c("empty")}</p>
        ) : (
          <ul className="sd-rows">
            {data.logs.map(log => (
              <li className="sd-row" key={log.id}>
                <div>
                  <strong>{log.title}</strong>
                  <p>{log.body}</p>
                  <time>
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString(
                          english ? "en" : "ar"
                        )
                      : c("dateUnknown")}
                  </time>
                </div>
                <span className="sd-chip">{c("state_" + log.state)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={!!review}
        onOpenChange={open => {
          if (!open && !running) setReview(null);
        }}
      >
        <DialogContent
          className="sd-dialog"
          closeLabel={t("common.close")}
          showCloseButton={!running}
          onCloseAutoFocus={e => {
            e.preventDefault();
            (trigger.current?.isConnected && !trigger.current.disabled
              ? trigger.current
              : refreshButton.current
            )?.focus();
          }}
          dir={english ? "ltr" : "rtl"}
          onEscapeKeyDown={e => {
            if (running) e.preventDefault();
          }}
          onInteractOutside={e => {
            if (running) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {c(
                review === "enable"
                  ? "reviewEnable"
                  : review === "disable"
                    ? "reviewDisable"
                    : "reviewTest"
              )}
            </DialogTitle>
            <DialogDescription>
              {c(
                review === "enable"
                  ? "enableReviewHelp"
                  : review === "disable"
                    ? "disableReviewHelp"
                    : "testReviewHelp"
              )}
            </DialogDescription>
          </DialogHeader>
          <p>{c("deviceScope")}</p>
          <DialogFooter>
            <button
              className="sd-button"
              disabled={running}
              onClick={() => setReview(null)}
            >
              {c("cancel")}
            </button>
            <button
              className="sd-button sd-primary"
              disabled={running}
              onClick={() => void act()}
            >
              {c(running ? "working" : "confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
