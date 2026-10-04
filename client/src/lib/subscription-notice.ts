import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "./usage-workspace-view";
import { scopedBilling } from "./subscription-billing-view";
import type { SubscriptionBillingWorkspace } from "@shared/subscription-billing-workspace";
// React Query shares these immutable snapshots across the shell and dashboard.
// Keep their elapsed display time stable through remounts and identity refetches.
const observed = new WeakMap<object, { updatedAt: number; origin: number }>();
function snapshotOrigin(value: object | undefined, updatedAt: number) {
  if (!value) return performance.now();
  const cached = observed.get(value);
  if (cached?.updatedAt === updatedAt) return cached.origin;
  const age =
    Number.isFinite(updatedAt) && updatedAt > 0
      ? Math.max(0, Date.now() - updatedAt)
      : 0;
  const origin = performance.now() - age;
  observed.set(value, { updatedAt, origin });
  return origin;
}
export function subscriptionNotice(
  snapshot: SubscriptionBillingWorkspace,
  elapsedMs: number
) {
  const live = snapshot.state === "active" || snapshot.state === "trial";
  const end = snapshot.subscription?.endDate ?? null;
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
  const remainingMs =
    live && end
      ? Math.max(0, Date.parse(end) - Date.parse(snapshot.checkedAt) - elapsed)
      : null;
  return {
    state: live && remainingMs === 0 ? "expired" : snapshot.state,
    remainingMs,
    isTrial: snapshot.subscription?.recordedStatus === "trial",
    end,
    daysRemaining:
      remainingMs === null ? null : Math.ceil(remainingMs / 86400000),
  };
}
/** A presentation snapshot only. Server-side entitlement checks remain authoritative. */
export function useSubscriptionNotice() {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const ready =
    !!user.data?.id &&
    !!identity.data?.id &&
    identity.data.actorId === user.data.id &&
    !user.error &&
    !identity.error &&
    !user.isFetching &&
    !identity.isFetching;
  const query = trpc.merchantSubscription.workspace.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: ready,
  });
  const data = ready
    ? scopedBilling(query.data, user.data!.id, identity.data!.id)
    : null;
  const loading =
    user.isLoading ||
    user.isFetching ||
    identity.isLoading ||
    identity.isFetching ||
    query.isLoading ||
    query.isFetching;
  const error =
    user.error ||
    identity.error ||
    query.error ||
    (!loading && !data ? new Error("Subscription unavailable") : null);
  const origin = useMemo(
    () => snapshotOrigin(query.data, query.dataUpdatedAt),
    [query.data, query.dataUpdatedAt]
  );
  const [tick, setTick] = useState(() => performance.now());
  const live =
    !error && !loading && (data?.state === "active" || data?.state === "trial");
  useEffect(() => {
    setTick(performance.now());
    if (!live) return;
    const timer = setInterval(() => setTick(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [origin, live]);
  const notice =
    data && !error && !loading
      ? subscriptionNotice(data, Math.max(0, tick - origin))
      : null;
  const refresh = () => {
    void user.refetch();
    void identity.refetch();
    void query.refetch();
  };
  return { data, notice, loading, error, refresh };
}
