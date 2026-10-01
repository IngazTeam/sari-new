import { messageWorkspaceFixture } from "../../../server/tests/helpers/message-workspace-fixture";
import {
  messageWindow,
  type MessageWorkspaceInput,
} from "../../../shared/message-workspace";
export const messagesModes = [
  "normal",
  "empty",
  "loading",
  "failure",
  "offline",
  "store-failure",
  "forbidden",
  "session",
  "foreign",
  "stale",
  "export-delay",
  "export-failure",
] as const;
export type MessagesMode = (typeof messagesModes)[number];
export class MessagesPreviewModel {
  private version = 0;
  private listeners = new Set<() => void>();
  private cache = new Map<string, ReturnType<typeof messageWorkspaceFixture>>();
  private recovered = new Set<string>();
  private pending = new Set<() => void>();
  retries = 0;
  constructor(
    readonly merchantId = 208,
    readonly mode: MessagesMode = "normal"
  ) {}
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.version;
  private notify() {
    this.version++;
    this.listeners.forEach(f => f());
  }
  get pendingExports() {
    return this.pending.size;
  }
  complete() {
    this.recovered.add("merchant");
    this.recovered.add("messages");
    this.notify();
  }
  finishExports() {
    for (const finish of Array.from(this.pending)) finish();
  }
  async prepareExport() {
    if (this.mode === "export-failure") throw Error("Simulated export failure");
    if (this.mode === "export-delay")
      await new Promise<void>(resolve => {
        const finish = () => {
          this.pending.delete(finish);
          this.notify();
          resolve();
        };
        this.pending.add(finish);
        this.notify();
      });
  }
  read(name: "merchant" | "messages", input?: MessageWorkspaceInput) {
    if (name !== "merchant" && name !== "messages")
      throw Error("Unsupported local read");
    if (
      name === "messages" &&
      !["7d", "30d", "90d"].includes(input?.period ?? "")
    )
      throw Error("Invalid period");
    const recovered = this.recovered.has(name),
      loading = this.mode === "loading" && !recovered;
    const failed =
      !recovered &&
      (name === "merchant"
        ? this.mode === "store-failure"
        : ["failure", "offline", "forbidden", "session", "stale"].includes(
            this.mode
          ));
    return {
      data:
        name === "merchant"
          ? { id: this.merchantId }
          : this.fixture(input!.period),
      isFetching: loading,
      isLoading: loading,
      error: failed
        ? {
            data: {
              code:
                this.mode === "forbidden"
                  ? "FORBIDDEN"
                  : this.mode === "session"
                    ? "UNAUTHORIZED"
                    : "INTERNAL_SERVER_ERROR",
            },
          }
        : null,
    };
  }
  async refetch(name: "merchant" | "messages", input?: MessageWorkspaceInput) {
    this.read(name, input);
    this.retries++;
    this.recovered.add(name);
    if (name === "messages") this.cache.clear();
    this.notify();
    return this.read(name, input);
  }
  fixture(period: MessageWorkspaceInput["period"]) {
    const cached = this.cache.get(period);
    if (cached) return cached;
    const d = messageWorkspaceFixture(),
      window = messageWindow(period),
      empty = this.mode === "empty";
    d.merchantId =
      this.mode === "foreign" && !this.recovered.has("messages")
        ? 999
        : this.merchantId;
    d.period = period;
    d.from = window.from;
    d.through = window.through;
    const factor = period === "7d" ? 1 : period === "30d" ? 2 : 3;
    for (const key of [
      "total",
      "incoming",
      "outgoing",
      "activeConversations",
    ] as const)
      d.messages[key] = empty ? 0 : d.messages[key] * factor;
    d.messages.byType.forEach(r => {
      r.count = empty ? 0 : r.count * factor;
      r.share = empty ? null : r.share;
    });
    d.daily = window.dates.map((date, i) => ({
      date,
      count: i === 0 ? d.messages.total : 0,
    }));
    d.hourly = d.hourly.map(r => ({
      ...r,
      count: r.hour === 0 ? d.messages.total : 0,
    }));
    d.sentiment.incoming = d.messages.incoming;
    d.sentiment.classified = empty ? 0 : 4 * factor;
    d.sentiment.unclassified = empty ? 0 : 2 * factor;
    d.sentiment.classificationCoverage = empty ? null : (100 * 4) / 6;
    d.sentiment.distribution.forEach(r => {
      r.count = empty ? 0 : r.count * factor;
      r.share = empty ? null : r.share;
    });
    d.sentiment.confidence.validCount = empty ? 0 : 4 * factor;
    d.sentiment.confidence.average = empty ? null : 80;
    if (empty) d.products.rows = [];
    d.products.rows.forEach(r => {
      r.productId += this.merchantId;
      r.productName =
        (this.merchantId === 209 ? "B · " : "A · ") + r.productName;
      r.mentionCount *= factor;
    });
    d.orderAssociation.total = empty ? 0 : 3 * factor;
    d.orderAssociation.positive = empty ? 0 : factor;
    d.orderAssociation.ratio = empty ? null : 100 / 3;
    if (this.mode === "stale" && !this.recovered.has("messages"))
      d.messages.total = 99999;
    this.cache.set(period, d);
    return d;
  }
}
