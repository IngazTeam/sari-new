import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Clock3,
  CircleHelp,
  RefreshCw,
  ShieldCheck,
  ArrowRightLeft,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import {
  paymentReturnSelection,
  paymentReturnStatus,
  paymentReturnInterval,
  paymentReturnLabels,
  MAX_STATUS_POLLS,
  STATUS_POLL_WINDOW_MS,
  type ReturnKind,
} from "@/lib/payment-return-view";
import "@/styles/payment-return-workspace.css";

type Props = {
  kind: ReturnKind;
  headingLevel?: 1 | 2;
  fullPageNavigation?: boolean;
};
export function PaymentReturnWorkspace(props: Props) {
  const search = useSearch();
  return (
    <PaymentReturn key={props.kind + ":" + search} {...props} search={search} />
  );
}
function PaymentReturn({
  kind,
  search,
  headingLevel = 1,
  fullPageNavigation = false,
}: Props & { search: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const NavigationLink = fullPageNavigation ? "a" : Link;
  const { t, i18n } = useTranslation(),
    c = paymentReturnLabels(t);
  const selection = paymentReturnSelection(search, kind);
  const [polls, setPolls] = useState(0),
    [now, setNow] = useState(Date.now());
  const started = useRef(Date.now()),
    lastRead = useRef("");
  const options = {
    ...usageQueryOptions,
    refetchIntervalInBackground: false as const,
    refetchInterval: (query: any) =>
      paymentReturnInterval(
        query.state.data,
        !!query.state.error,
        polls,
        Date.now() - started.current
      ),
  };
  const tap = trpc.payment.getPaymentCallbackStatus.useQuery(
    { tap_id: selection.kind === "tap" ? selection.reference : "" },
    { ...options, enabled: selection.kind === "tap" }
  );
  const legacy = trpc.subscriptionPayments.verifyPayment.useQuery(
    {
      subscriptionId:
        selection.kind === "legacy" ? selection.subscriptionId : 1,
      transactionId: selection.kind === "legacy" ? selection.reference : "",
    },
    { ...options, enabled: selection.kind === "legacy" }
  );
  const source = selection.kind === "legacy" ? legacy : tap;
  const valid = selection.kind === "tap" || selection.kind === "legacy";
  useEffect(() => {
    if (!valid) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [valid]);
  useEffect(() => {
    const stamp = source.dataUpdatedAt + ":" + source.errorUpdatedAt;
    if (
      valid &&
      (source.dataUpdatedAt || source.errorUpdatedAt) &&
      stamp !== lastRead.current
    ) {
      lastRead.current = stamp;
      setPolls(n => Math.min(n + 1, MAX_STATUS_POLLS));
    }
  }, [source.dataUpdatedAt, source.errorUpdatedAt, valid]);
  const value = paymentReturnStatus(source.data),
    paused =
      polls >= MAX_STATUS_POLLS ||
      now - started.current >= STATUS_POLL_WINDOW_MS;
  const state = !valid
    ? kind === "cancel" && selection.kind === "missing"
      ? "interrupted"
      : "invalid"
    : source.error
      ? "unavailable"
      : source.isLoading || source.isFetching
        ? "checking"
        : value === "completed"
          ? "completed"
          : value === "failed"
            ? "failed"
            : value === "processing"
              ? "pending"
              : "unavailable";
  const refresh = () => {
    started.current = Date.now();
    setNow(Date.now());
    setPolls(0);
    void source.refetch();
  };
  const Icon =
    state === "completed"
      ? CheckCircle2
      : state === "pending" || state === "checking"
        ? Clock3
        : CircleHelp;
  return (
    <section
      className={"pr-workspace pr-" + state}
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
      aria-labelledby="payment-return-title"
    >
      <span className="pr-eyebrow">
        <ShieldCheck size={18} aria-hidden="true" />
        {c.eyebrow}
      </span>
      <div className="pr-icon">
        <Icon size={36} aria-hidden="true" />
      </div>
      <Heading id="payment-return-title">{c[state]}</Heading>
      <p
        className="pr-description"
        role={
          state === "unavailable" || state === "invalid" ? "alert" : "status"
        }
      >
        {c[`${state}Body`]}
      </p>
      {valid && ["pending", "checking"].includes(state) && (
        <p className="pr-check-note">{paused ? c.noRepeat : c.autoCheck}</p>
      )}
      <div className="pr-actions">
        <NavigationLink
          className="pr-primary"
          href="/merchant/usage?tab=subscription"
        >
          <ArrowRightLeft size={18} aria-hidden="true" />
          {c.subscription}
        </NavigationLink>
        {valid && (
          <button type="button" onClick={refresh} disabled={source.isFetching}>
            <RefreshCw size={18} aria-hidden="true" />
            {c.refresh}
          </button>
        )}
        {source.error?.data?.code === "UNAUTHORIZED" && valid && (
          <NavigationLink href="/login">{c.signIn}</NavigationLink>
        )}
        <NavigationLink href="/merchant/subscription?tab=payments">
          {c.history}
        </NavigationLink>
        <NavigationLink href="/merchant/dashboard">
          {c.dashboard}
        </NavigationLink>
      </div>
      <p className="pr-source">{c.source}</p>
    </section>
  );
}
