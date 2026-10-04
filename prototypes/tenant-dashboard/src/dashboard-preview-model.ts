import { SubscriptionBillingPreviewStore } from "./subscription-billing-preview-model";
import {
  dashboardWorkspaceSchema,
  type DashboardWorkspace,
} from "../../../shared/dashboard-workspace";
import { dashboardSourcesSchema } from "../../../shared/dashboard-sources";
import { dashboardSourcesFixture } from "../../../server/tests/fixtures/dashboard-sources";

export const dashboardModes = [
  "normal",
  "empty",
  "loading",
  "failure",
  "store-failure",
  "partial",
  "foreign",
  "stale",
  "trial",
  "trial-expired",
  "trial-unknown",
  "subscription-failed",
  "assistant-disabled",
  "outside-hours",
  "schedule-failed",
  "syncing",
  "sync-error",
  "sync-paused",
  "insights-failed",
] as const;
export type DashboardMode = (typeof dashboardModes)[number];
export const dashboardQueries = [
  "merchants.getCurrent",
  "merchants.getOnboardingStatus",
  "dashboard.workspace",
  "dashboard.sources",
  "dashboard.getAiInsights",
  "conversations.listRecent",
  "conversations.count",
  "campaigns.getStats",
  "reviews.getStats",
  "botSettings.shouldRespond",
  "auth.me",
  "merchants.workspaceIdentity",
  "merchantSubscription.workspace",
  "sariBrain.getLearningDashboard",
] as const;
type Query = (typeof dashboardQueries)[number];
const metrics = () => ({
  totalOrders: 0,
  validValueOrders: 0,
  excludedValueOrders: 0,
  totalValueMinor: 0,
  deliveredOrders: 0,
  deliveredValueMinor: 0,
  excludedDeliveredValues: 0,
  averageValueMinor: null as number | null,
});
export function dashboardSample(
  merchantId: number,
  days: 7 | 30 | 90,
  empty = false,
  partial = false
): DashboardWorkspace {
  const through = Date.UTC(2026, 9, 1, 12),
    from = through - days * 86400000;
  const current = metrics(),
    previous = metrics();
  if (!empty)
    Object.assign(current, {
      totalOrders: 12,
      validValueOrders: partial ? 10 : 12,
      excludedValueOrders: partial ? 2 : 0,
      totalValueMinor: 84000,
      deliveredOrders: 8,
      deliveredValueMinor: 56000,
      averageValueMinor: partial ? 8400 : 7000,
    });
  if (!empty)
    Object.assign(previous, {
      totalOrders: 10,
      validValueOrders: 10,
      totalValueMinor: 60000,
      deliveredOrders: 6,
      deliveredValueMinor: 36000,
      averageValueMinor: 6000,
    });
  return dashboardWorkspaceSchema.parse({
    version: 1,
    merchantId,
    days,
    currency: merchantId === 198 ? "SAR" : "USD",
    timeZone: "UTC",
    from: new Date(from).toISOString(),
    through: new Date(through).toISOString(),
    previousFrom: new Date(from - days * 86400000).toISOString(),
    current,
    previous,
    growth: { orders: empty ? null : 20, value: empty ? null : 40 },
    trend: empty
      ? []
      : [
          {
            date: "2026-10-01",
            orders: 12,
            deliveredOrders: 8,
            valueMinor: 84000,
            deliveredValueMinor: 56000,
            excludedValues: partial ? 2 : 0,
          },
        ],
    products: empty
      ? []
      : [
          {
            name: "Sample A · " + merchantId,
            quantity: 8,
            valueMinor: 56000,
            averageUnitMinor: 7000,
          },
        ],
    productSample: {
      eligibleOrders: empty ? 0 : 8,
      inspectedOrders: empty ? 0 : 8,
      omittedOrders: 0,
      excludedOrders: partial ? 2 : 0,
      excludedItems: partial ? 2 : 0,
      includedItems: empty ? 0 : 8,
      orderLimit: 250,
    },
  });
}

/** Isolated local read simulation. No provider, storage, HTTP or real tenant identifiers. */
export class DashboardPreviewModel {
  private listeners = new Set<() => void>();
  private revision = 0;
  private recovered = new Set<string>();
  private pending = new Map<string, Promise<unknown>>();
  private requested = new Set<string>();
  private failed = new Set<string>();
  private readonly startedAt = Date.now();
  private billingSnapshots = new Map<string, ReturnType<SubscriptionBillingPreviewStore["summary"]>>();
  requests = 0;
  constructor(
    readonly merchantId = 198,
    readonly mode: DashboardMode = "normal"
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.revision;
  private notify() {
    this.revision++;
    this.listeners.forEach(listener => listener());
  }
  private key(name: Query, input: any) {
    return (
      name +
      ":" +
      (name === "dashboard.getAiInsights"
        ? input?.language || "ar"
        : name === "dashboard.workspace"
          ? input?.days || 7
          : "")
    );
  }
  read(name: Query, input: any = {}) {
    if (!dashboardQueries.includes(name))
      throw Error("Unimplemented preview query: " + name);
    const key = this.key(name, input),
      recovered = this.recovered.has(key),
      insights = name === "dashboard.getAiInsights";
    const mode = recovered ? "normal" : this.mode,
      empty = mode === "empty",
      ar = input?.language !== "en";
    let data: any;
    switch (name) {
      case "merchants.getCurrent":
        data = {
          id: this.merchantId,
          businessName: "Demo " + (this.merchantId === 198 ? "A" : "B"),
        };
        break;
      case "merchants.getOnboardingStatus":
        data = {
          setupCompleted: !empty,
          channelState: empty ? "disconnected" : "connected",
        };
        break;
      case "dashboard.workspace":
        data = dashboardSample(
          mode === "foreign" ? 999 : this.merchantId,
          [7, 30, 90].includes(input.days) ? input.days : 7,
          empty,
          mode === "partial"
        );
        break;
      case "dashboard.sources": {
        data = dashboardSourcesFixture(
          mode === "foreign" ? 999 : this.merchantId
        );
        data.groups.businessName = "Demo " + this.merchantId;
        data.groups.documents = {
          total: 10,
          textReady: 3,
          empty: 2,
          pending: 1,
          processing: 2,
          failed: 2,
          latestUploadedAt: "2026-10-01T10:00:00Z",
          removalAnchorId: 1,
        };
        data.integration = {
          source: "zid",
          state:
            mode === "syncing"
              ? "syncing"
              : mode === "sync-error"
                ? "error"
                : mode === "sync-paused"
                  ? "paused"
                  : "configured",
          records: [
            { scope: "products", at: "2026-10-01T09:00:00Z" },
            { scope: "orders", at: null },
            { scope: "customers", at: "2026-09-29T10:00:00Z" },
          ],
        };
        if (empty) {
          data.groups.documents = {
            total: 0,
            textReady: 0,
            empty: 0,
            pending: 0,
            processing: 0,
            failed: 0,
            latestUploadedAt: null,
            removalAnchorId: null,
          };
          data.groups.products = {
            total: 0,
            visible: 0,
            activeVisible: 0,
            latestModifiedAt: null,
          };
          data.audience.count = 0;
          data.integration = {
            source: "none",
            state: "not_connected",
            records: [],
          };
        }
        data = dashboardSourcesSchema.parse(data);
        break;
      }
      case "conversations.listRecent":
        data = empty
          ? []
          : [
              {
                id: 1,
                customerName: "Demo " + this.merchantId,
                customerPhone: "ux-customer-051",
                status: "active",
              },
              {
                id: 2,
                customerName: "Sample",
                customerPhone: "ux-customer-052",
                status: "unexpected",
              },
            ];
        break;
      case "conversations.count":
        data = empty ? 0 : 24;
        break;
      case "campaigns.getStats":
        data = { totalCampaigns: empty ? 0 : 3 };
        break;
      case "reviews.getStats":
        data = {
          totalReviews: empty ? 0 : 5,
          averageRating: empty ? null : 4.6,
        };
        break;
      case "botSettings.shouldRespond":
        data = {
          merchantId: mode === "foreign" ? 999 : this.merchantId,
          shouldRespond: !["assistant-disabled", "outside-hours"].includes(
            mode
          ),
          reason:
            mode === "assistant-disabled"
              ? "Auto-reply is disabled"
              : "Outside working hours",
          checkedAt: "2026-10-01T12:00:00Z",
        };
        break;
      case "auth.me": data = { id: this.merchantId + 1000 }; break;
      case "merchants.workspaceIdentity": data = { id: this.merchantId, actorId: this.merchantId + 1000 }; break;
      case "merchantSubscription.workspace": {
        if (!this.billingSnapshots.has(mode)) {
          const snapshot = new SubscriptionBillingPreviewStore(this.merchantId + 1000, mode === 'foreign' ? 999 : this.merchantId, new Date(this.startedAt).toISOString(), () => empty ? 'empty' : 'ready').summary();
          if (snapshot.subscription) {
            snapshot.subscription.endDate = new Date(this.startedAt + 172800000).toISOString();
            snapshot.subscription.daysRemaining = 2;
            if (mode.startsWith('trial')) { snapshot.state = 'trial'; snapshot.subscription.recordedStatus = 'trial'; }
            if (mode === 'trial-expired') { snapshot.state = 'expired'; snapshot.subscription.endDate = new Date(this.startedAt - 1000).toISOString(); snapshot.subscription.daysRemaining = 0; }
            if (mode === 'trial-unknown') { snapshot.state = 'unknown'; snapshot.subscription.endDate = null; snapshot.subscription.daysRemaining = null; }
          }
          this.billingSnapshots.set(mode, snapshot);
        }
        data = this.billingSnapshots.get(mode); break;
      }
      case "sariBrain.getLearningDashboard":
        data = {
          totalConversations: empty ? 0 : 24,
          totalSignals: empty ? 0 : 8,
          dnaInsights: [],
          learningEvidence: {
            proposalCount: 0,
            verifiedPurchases: empty ? 0 : 2,
            verifiedRefunds: 0,
            proposals: [],
          },
        };
        break;
      case "dashboard.getAiInsights":
        data = this.requested.has(key)
          ? empty
            ? []
            : [
                {
                  title: ar
                    ? "مثال محلي: راجع الملفات المتعثرة"
                    : "Local sample: review failed files",
                  body: ar
                    ? "هذا اقتراح ثابت لتجربة العرض، وليس نتيجة ذكاء اصطناعي أو تقييمًا لاحتراف المبيعات."
                    : "A fixed layout sample, not an AI result or sales proficiency assessment.",
                  action: {
                    href: "/merchant/sari-brain?view=sources",
                    label: ar ? "مراجعة الملفات" : "Review files",
                  },
                },
              ]
          : undefined;
        break;
    }
    const blocked =
      (!insights && mode === "failure" && name !== "merchants.getCurrent") ||
      (mode === "store-failure" && name === "merchants.getCurrent") ||
      (mode === "subscription-failed" &&
        name === "merchantSubscription.workspace") ||
      (mode === "schedule-failed" && name === "botSettings.shouldRespond") ||
      (mode === "stale" && name !== "merchants.getCurrent" && !insights);
    return {
      data,
      isLoading: mode === "loading" && name === "merchants.getCurrent",
      isFetching:
        this.pending.has(key) ||
        (mode === "loading" && name === "merchants.getCurrent"),
      isError: blocked || this.failed.has(key),
      error: blocked || this.failed.has(key) ? Error("Local sample unavailable") : null,
      dataUpdatedAt: this.startedAt,
    };
  }
  refetch(name: Query, input: any = {}) {
    const key = this.key(name, input);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    if (name === "dashboard.getAiInsights") this.requests++;
    const attempt = this.requested.has(key);
    this.failed.delete(key);
    const work = new Promise(resolve =>
      setTimeout(() => {
        this.pending.delete(key);
        if (name === "dashboard.getAiInsights") {
          this.requested.add(key);
          if (this.mode === "insights-failed" && !attempt) this.failed.add(key);
        } else this.recovered.add(key);
        this.notify();
        resolve(this.read(name, input));
      }, 500)
    );
    this.pending.set(key, work);
    this.notify();
    return work;
  }
}
