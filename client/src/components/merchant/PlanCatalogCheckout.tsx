import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CreditCard, ShieldCheck, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { openSubscriptionCheckout } from "@/lib/subscription-checkout-navigation";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import {
  scopedCheckoutReview,
  safeTapCheckoutUrl,
  type PlanCycle,
} from "@/lib/plan-catalog-view";
import {
  readCheckoutCheckpoint,
  checkoutCheckpointKey,
  scopedCheckoutAttempt,
  prepareCheckoutCheckpoint,
  clearResolvedCheckout,
  withCheckoutLock,
} from "@/lib/subscription-checkout-recovery";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";

type Props = {
  actorId: number;
  merchantId: number;
  planId: number;
  cycle: PlanCycle;
  canManage: boolean;
  canReview: boolean;
  c: Record<string, string>;
  ar: boolean;
  money: (value: number | null, currency: string | null) => string;
};
export function PlanCatalogCheckout(props: Props) {
  const { actorId, merchantId, planId, cycle, canManage, c, ar, money } = props;
  const [, navigate] = useLocation();
  const [local, setLocal] = useState(() =>
    readCheckoutCheckpoint(actorId, merchantId)
  );
  const [storageBlocked, setStorageBlocked] = useState(false),
    [working, setWorking] = useState(false),
    [now, setNow] = useState(Date.now());
  const live = useRef(true);
  const checkpoint = local.kind === "saved" ? local.checkpoint : null;
  const source = trpc.merchantSubscription.checkoutAttempt.useQuery(
    {
      checkoutAttemptId:
        checkpoint?.checkoutAttemptId ?? "00000000-0000-4000-8000-000000000000",
    },
    { ...usageQueryOptions, enabled: canManage && !!checkpoint }
  );
  const attempt = checkpoint
    ? scopedCheckoutAttempt(source.data, checkpoint)
    : null;
  const readLocal = () => setLocal(readCheckoutCheckpoint(actorId, merchantId));
  useEffect(() => {
    live.current = true;
    const changed = (event: StorageEvent) => {
      if (
        event.key === checkoutCheckpointKey(actorId, merchantId) ||
        event.key === null
      )
        readLocal();
    };
    window.addEventListener("storage", changed);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      window.removeEventListener("storage", changed);
      window.clearInterval(timer);
    };
  }, [actorId, merchantId]);
  const refresh = () => {
    setStorageBlocked(false);
    readLocal();
    if (checkpoint) void source.refetch();
  };
  const onRecorded = () => {
    readLocal();
    if (checkpoint) void source.refetch();
  };
  const chooseAgain = async () => {
    if (!checkpoint || !attempt || working || source.isFetching || source.error)
      return;
    setWorking(true);
    try {
      await withCheckoutLock(actorId, merchantId, async () => {
        if (live.current) clearResolvedCheckout(checkpoint, attempt);
      });
      if (live.current) {
        readLocal();
        navigate("/merchant/subscription/plans?cycle=" + cycle);
      }
    } catch {
      if (live.current) setStorageBlocked(true);
    } finally {
      if (live.current) setWorking(false);
    }
  };
  if (!canManage)
    return (
      <section className="pc-notice">
        <p>{c.readonly}</p>
      </section>
    );
  if (local.kind === "blocked" || storageBlocked)
    return (
      <section className="pc-recovery" role="alert">
        <h2>{c.recoveryTitle}</h2>
        <p>{c.storageBlocked}</p>
        <div className="pc-recovery-actions">
          <button type="button" onClick={refresh}>
            {c.refresh}
          </button>
          <Link href="/merchant/subscription?tab=payments">{c.subscriptionHistory}</Link>
        </div>
      </section>
    );
  if (!checkpoint && !props.canReview)
    return (
      <section className="pc-notice" role="alert">
        <p>{c.currentUnknown}</p>
      </section>
    );
  if (!checkpoint)
    return (
      <CheckoutReview
        {...props}
        expectedAttempt={null}
        onRecorded={onRecorded}
      />
    );
  if (source.isLoading || source.isFetching)
    return <WorkspaceState inline kind="loading" />;
  if (source.error || !attempt)
    return (
      <section className="pc-recovery" role="alert">
        <h2>{c.recoveryTitle}</h2>
        <p>{c.recoveryUnavailable}</p>
        <div className="pc-recovery-actions">
          <button type="button" onClick={refresh}>
            {c.checkAttempt}
          </button>
          <Link href="/merchant/subscription?tab=payments">{c.subscriptionHistory}</Link>
        </div>
      </section>
    );
  const sameSelection =
    checkpoint.planId === planId && checkpoint.cycle === cycle;
  const sameTarget =
    attempt.planId === checkpoint.planId &&
    attempt.billingCycle === checkpoint.cycle;
  const final = ["completed", "failed", "refunded"].includes(attempt.state);
  const link =
    sameTarget &&
    attempt.recordedCheckoutUrl &&
    attempt.linkExpiresAt &&
    now < Date.parse(attempt.linkExpiresAt)
      ? safeTapCheckoutUrl(attempt.recordedCheckoutUrl)
      : null;
  return (
    <>
      <section
        className="pc-recovery"
        aria-labelledby="checkout-recovery-title"
      >
        <span className="pc-eyebrow">
          <ShieldCheck size={20} aria-hidden="true" />
          {c.recoveryEyebrow}
        </span>
        <h2 id="checkout-recovery-title">{c.recoveryTitle}</h2>
        <p className="pc-recovery-state" role="status">
          {c["attempt_" + attempt.state]}
        </p>
        <p>{attempt.found ? c.recordedOnly : c.attemptMissingNote}</p>
        {attempt.state === "requires_review" && (
          <p className="pc-warning" role="alert">{c.captureReviewBody}</p>
        )}
        {attempt.found && (
          <dl>
            <div>
              <dt>{c.recordedAmount}</dt>
              <dd>
                <bdi>{money(attempt.amountMinor, attempt.currency)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{c.checkedAt}</dt>
              <dd>
                <bdi>
                  {new Date(attempt.checkedAt).toLocaleString(
                    ar ? "ar-SA" : "en-US"
                  )}
                </bdi>
              </dd>
            </div>
          </dl>
        )}
        {attempt.found && !sameTarget && (
          <p className="pc-warning">{c.attemptTargetUnknown}</p>
        )}
        {attempt.state === "pending" && !link && (
          <p className="pc-note">{c.noRecordedLink}</p>
        )}
        <div className="pc-recovery-actions">
          {attempt.state === "requires_review" && (
            <Link href="/support">{c.support}</Link>
          )}
          {link && (
            <button
              type="button"
              className="pc-primary"
              onClick={() => {
                if (
                  attempt.linkExpiresAt &&
                  Date.now() < Date.parse(attempt.linkExpiresAt)
                )
                  openSubscriptionCheckout(link);
              }}
            >
              {c.openAttempt}
            </button>
          )}
          <button type="button" onClick={refresh} disabled={working}>
            <RefreshCw size={18} aria-hidden="true" />
            {c.checkAttempt}
          </button>
          <Link href="/merchant/subscription?tab=payments">{c.subscriptionHistory}</Link>
          {final && (
            <button
              type="button"
              onClick={() => void chooseAgain()}
              disabled={working}
            >
              {c.chooseAgain}
            </button>
          )}
          {!sameSelection && !final && (
            <Link
              href={
                "/merchant/checkout?planId=" +
                checkpoint.planId +
                "&cycle=" +
                checkpoint.cycle
              }
            >
              {c.returnAttempt}
            </Link>
          )}
        </div>
      </section>
      {attempt.state === "not_found" && sameSelection && props.canReview && (
        <CheckoutReview
          {...props}
          expectedAttempt={checkpoint.checkoutAttemptId}
          onRecorded={onRecorded}
        />
      )}
    </>
  );
}

function CheckoutReview({
  actorId,
  merchantId,
  planId,
  cycle,
  canManage,
  c,
  ar,
  money,
  expectedAttempt,
  onRecorded,
}: {
  expectedAttempt: string | null;
  onRecorded: () => void;
  actorId: number;
  merchantId: number;
  planId: number;
  cycle: PlanCycle;
  canManage: boolean;
  c: Record<string, string>;
  ar: boolean;
  money: (value: number | null, currency: string | null) => string;
}) {
  const quote = trpc.merchantSubscription.reviewCheckout.useQuery(
    { planId, billingCycle: cycle },
    { ...usageQueryOptions, enabled: canManage }
  );
  const subscribe = trpc.merchantSubscription.subscribe.useMutation(),
    upgrade = trpc.merchantSubscription.upgradePlan.useMutation();
  const review = scopedCheckoutReview(
    quote.data,
    actorId,
    merchantId,
    planId,
    cycle
  );
  const [accepted, setAccepted] = useState(false),
    [failure, setFailure] = useState<
      "conflict" | "failed" | "storageBlocked" | null
    >(null),
    [done, setDone] = useState(false),
    [dispatching, setDispatching] = useState(false),
    [now, setNow] = useState(Date.now());
  const busy = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setAccepted(false);
  }, [review?.token]);
  const pending = dispatching || subscribe.isPending || upgrade.isPending,
    expired = !review || now >= Date.parse(review.expiresAt);
  const refresh = () => {
    setAccepted(false);
    setFailure(null);
    void quote.refetch();
  };
  const confirm = async () => {
    if (
      busy.current ||
      pending ||
      !review ||
      !accepted ||
      Date.now() >= Date.parse(review.expiresAt) ||
      failure
    )
      return;
    busy.current = true;
    setDispatching(true);
    try {
      const proof = { reviewedAt: review.reviewedAt, token: review.token };
      const result = await withCheckoutLock(actorId, merchantId, async () => {
        if (!live.current || Date.now() >= Date.parse(review.expiresAt))
          return null;
        const prepared = prepareCheckoutCheckpoint(
          { actorId, merchantId, planId, cycle },
          expectedAttempt
        );
        if (!prepared.canSend) return null;
        const checkoutAttemptId = prepared.checkpoint.checkoutAttemptId;
        return review.mode === "subscribe"
          ? subscribe.mutateAsync({
              planId,
              billingCycle: cycle,
              checkoutAttemptId,
              review: proof,
            })
          : upgrade.mutateAsync({
              newPlanId: planId,
              newBillingCycle: cycle,
              checkoutAttemptId,
              review: proof,
            });
      });
      if (!live.current) return;
      if (!result || result.success !== true) {
        setFailure("failed");
        return;
      }
      if ("immediate" in result && result.immediate === true) {
        setDone(true);
        return;
      }
      const url =
        "paymentUrl" in result ? safeTapCheckoutUrl(result.paymentUrl) : null;
      if (!url) {
        setFailure("failed");
        return;
      }
      openSubscriptionCheckout(url);
    } catch (error: any) {
      if (live.current)
        setFailure(
          error?.message?.startsWith("checkout_storage:")
            ? "storageBlocked"
            : error?.data?.code === "CONFLICT"
              ? "conflict"
              : "failed"
        );
    } finally {
      busy.current = false;
      if (live.current) {
        setDispatching(false);
        onRecorded();
      }
    }
  };
  if (!canManage)
    return (
      <section className="pc-notice">
        <p>{c.readonly}</p>
      </section>
    );
  if (quote.error)
    return (
      <WorkspaceState
        inline
        kind={workspaceFailureKind(quote.error)}
        onRetry={refresh}
      />
    );
  if (quote.isLoading || quote.isFetching)
    return <WorkspaceState inline kind="loading" />;
  if (!review)
    return <WorkspaceState inline kind="missing" onRetry={refresh} />;
  if (done)
    return (
      <section className="pc-empty" role="status">
        <h2>{c.completed}</h2>
        <Link className="pc-primary" href="/merchant/usage?tab=subscription">
          {c.usage}
        </Link>
      </section>
    );
  return (
    <section className="pc-checkout">
      <div className="pc-review">
        <span className="pc-eyebrow">
          <CreditCard size={20} aria-hidden="true" />
          {c.plan}
        </span>
        <h2>{ar ? review.nameAr : review.nameEn}</h2>
        <p>{c[cycle]}</p>
        <dl>
          <div>
            <dt>{c.price}</dt>
            <dd>
              <bdi>{money(review.priceMinor, review.currency)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{c.credit}</dt>
            <dd>
              <bdi>{money(review.creditMinor, review.currency)}</bdi>
            </dd>
          </div>
          <div className="pc-total">
            <dt>{c.due}</dt>
            <dd>
              <bdi>{money(review.chargeMinor, review.currency)}</bdi>
            </dd>
          </div>
        </dl>
        {review.creditMinor > 0 && <p className="pc-note">{c.creditNote}</p>}
        <p className="pc-note">{c.priceNote}</p>
        <Link href={`/merchant/subscription/plans?cycle=${cycle}`}>
          {c.changePlan}
        </Link>
      </div>
      <div className="pc-confirm">
        <h2>{c.reviewTitle}</h2>
        <p>{c.gatewayNote}</p>
        <p className="pc-note">
          {c.expires}:{" "}
          <bdi>
            {new Date(review.expiresAt).toLocaleTimeString(
              ar ? "ar-SA" : "en-US"
            )}
          </bdi>
        </p>
        {expired && (
          <div className="pc-warning" role="alert">
            <p>{c.expired}</p>
            <button type="button" onClick={refresh} disabled={pending}>
              {c.refresh}
            </button>
          </div>
        )}
        {failure && (
          <div className="pc-warning" role="alert">
            <p>{c[failure]}</p>
            {failure === "conflict" && (
              <button type="button" onClick={refresh}>
                {c.refresh}
              </button>
            )}
            <Link href="/merchant/subscription?tab=payments">{c.subscriptionHistory}</Link>
          </div>
        )}
        <label className="pc-ack">
          <input
            type="checkbox"
            checked={accepted}
            disabled={expired || pending || !!failure}
            onChange={e => setAccepted(e.target.checked)}
          />
          <span>{c.acknowledge}</span>
        </label>
        <button
          type="button"
          className="pc-primary"
          onClick={() => {
            void confirm();
          }}
          disabled={!accepted || expired || pending || !!failure}
        >
          {pending
            ? c.pending
            : expectedAttempt
              ? c.retryAttempt
              : review.chargeMinor === 0
                ? c.apply
                : c.pay}
        </button>
      </div>
    </section>
  );
}
