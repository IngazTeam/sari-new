import {
  paymentLinksInput,
  paymentLinkDetailInput,
  paymentLinkRecord,
  paymentLinksWorkspace,
  paymentLinkDetail,
  paymentLinkDisableInput,
  paymentLinkDisableResult,
  paymentLinkCreateInput,
  paymentLinkCreateResult,
  paymentLinkRequestInput,
  paymentLinkRequestResult,
  type PaymentLinkRecord,
} from "../../../shared/payment-links-workspace";
import type { ServiceMode } from "./service-preview-model";
export const paymentLinksPreviewQueries = [
  "payments.linksWorkspace.list",
  "payments.linksWorkspace.detail",
  "payments.linksWorkspace.creationRequest",
] as const;
export const paymentLinksPreviewMutations = [
  "payments.linksWorkspace.createReviewed",
  "payments.linksWorkspace.disableReviewed",
] as const;
export class PaymentLinksPreviewStore {
  writes = 0;
  private nextId = 53;
  private rows = new Map<number, PaymentLinkRecord>();
  private requests = new Map<string, { id: number; fingerprint: string }>();
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    private mode: () => ServiceMode
  ) {
    if (mode() === "empty") return;
    for (let id = 1; id <= 52; id++) {
      const state = (
        ["invalid", "available", "disabled", "expired", "exhausted"] as const
      )[id % 5];
      this.rows.set(
        id,
        this.record(id, {
          title: `${merchantId === 269 ? "نواة · Nawa" : "مدار · Madar"} · ${id}`,
          description: "رابط توضيحي في الذاكرة · In-memory sample link",
          amountMinor: 12550 + id - 1,
          currency: id % 7 === 0 ? "USD" : "SAR",
          availability: state,
          enabled: state === "invalid" ? null : state !== "disabled",
          storedStatus:
            state === "disabled"
              ? "disabled"
              : state === "expired"
                ? "expired"
                : state === "exhausted"
                  ? "completed"
                  : "active",
          usageCount: state === "exhausted" ? 5 : 0,
          maxUsageCount: state === "exhausted" ? 5 : null,
          warnings: state === "invalid" ? ["configuration"] : [],
          ...(mode() === "legacy"
            ? {
                amountMinor: null,
                currency: null,
                enabled: null,
                availability: "invalid",
                warnings: ["amount", "currency", "configuration"],
              }
            : {}),
          ...(mode() === "unavailable-reference"
            ? {
                related: { kind: "unavailable" },
                publicUrl: null,
                warnings: [
                  ...(mode() === "legacy"
                    ? ["amount", "currency", "configuration"]
                    : state === "invalid"
                      ? ["configuration"]
                      : []),
                  "target",
                ] as PaymentLinkRecord["warnings"],
              }
            : {}),
        })
      );
    }
  }
  private revision(id: number) {
    return [this.actorId, this.merchantId, id, this.writes, 473, 0, 0, 0]
      .map(v => v.toString(16).padStart(8, "0"))
      .join("");
  }
  private record(id: number, patch: Partial<PaymentLinkRecord> = {}) {
    const linkId =
      "link_" +
      this.merchantId.toString(16).padStart(8, "0") +
      id.toString(16).padStart(24, "0");
    return paymentLinkRecord.parse({
      id,
      revision: this.revision(id),
      linkId,
      title: "Sample link",
      description: null,
      amountMinor: 12550,
      currency: "SAR",
      fixedAmount: true,
      minAmountMinor: null,
      maxAmountMinor: null,
      storedStatus: "active",
      enabled: true,
      availability: "available",
      usageCount: 0,
      maxUsageCount: null,
      expiresAt: null,
      createdAt: "2026-10-04T10:00:00.000Z",
      updatedAt: "2026-10-04T10:00:00.000Z",
      publicUrl: `https://preview.example.test/pay/${linkId}`,
      related: { kind: "none" },
      totalCollectedMinor: 0,
      successfulPayments: 0,
      failedPayments: 0,
      warnings: [],
      ...patch,
    });
  }
  private scope() {
    const allowed = this.mode() !== "readonly";
    return {
      actorId: this.actorId,
      merchantId: this.merchantId,
      canView: allowed,
      canManage: allowed,
      checkedAt: new Date().toISOString(),
      source: "local_payment_links" as const,
    };
  }
  private detail(id: number) {
    const scope = this.scope(),
      row = scope.canView ? this.rows.get(id) : null;
    return paymentLinkDetail.parse({
      ...scope,
      state: !scope.canView ? "restricted" : row ? "found" : "missing",
      link: row ?? null,
    });
  }
  read(name: string, input: unknown) {
    if (name.endsWith(".detail"))
      return this.detail(paymentLinkDetailInput.parse(input).id);
    if (name.endsWith(".creationRequest")) {
      const { requestId } = paymentLinkRequestInput.parse(input),
        receipt = this.requests.get(requestId),
        workspace = this.detail(receipt?.id ?? 0);
      return paymentLinkRequestResult.parse({
        requestId,
        outcome: !workspace.canView
          ? "restricted"
          : workspace.link
            ? "found"
            : "not_found",
        workspace,
      });
    }
    const filters = paymentLinksInput.parse(input),
      scope = this.scope(),
      states = {
        available: 0,
        disabled: 0,
        expired: 0,
        exhausted: 0,
        invalid: 0,
      };
    const rows = scope.canView
      ? Array.from(this.rows.values())
          .filter(
            r =>
              (filters.availability === "all" ||
                r.availability === filters.availability) &&
              `${r.title ?? ""} ${r.description ?? ""}`
                .toLocaleLowerCase()
                .includes(filters.search.toLocaleLowerCase())
          )
          .sort((a, b) => b.id - a.id)
      : [];
    for (const row of rows) states[row.availability]++;
    return paymentLinksWorkspace.parse({
      ...scope,
      state: scope.canView ? "ready" : "restricted",
      filters,
      totals: scope.canView ? { total: rows.length, states } : null,
      items: rows.slice(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize
      ),
      hasNext: filters.page * filters.pageSize < rows.length,
    });
  }
  mutate(name: string, input: unknown) {
    if (!this.scope().canManage) throw { data: { code: "FORBIDDEN" } };
    if (name.endsWith(".disableReviewed")) {
      const p = paymentLinkDisableInput.parse(input),
        row = this.rows.get(p.id);
      if (!row) throw { data: { code: "NOT_FOUND" } };
      if (row.revision !== p.expectedRevision)
        throw { data: { code: "CONFLICT" } };
      const changed = row.enabled !== false || row.storedStatus !== "disabled";
      if (changed) {
        this.writes++;
        this.rows.set(p.id, {
          ...row,
          enabled: false,
          storedStatus: "disabled",
          availability: "disabled",
          revision: this.revision(p.id),
        });
      }
      return paymentLinkDisableResult.parse({
        outcome: changed ? "disabled" : "already_disabled",
        workspace: this.detail(p.id),
      });
    }
    const p = paymentLinkCreateInput.parse(input),
      { requestId, reviewed, ...values } = p,
      fingerprint = JSON.stringify(values),
      existing = this.requests.get(requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw { data: { code: "CONFLICT" } };
      return paymentLinkCreateResult.parse({
        outcome: "recovered",
        requestId,
        workspace: this.detail(existing.id),
      });
    }
    if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now())
      throw { data: { code: "BAD_REQUEST" } };
    const id = this.nextId++,
      linkId = "link_" + requestId.replaceAll("-", "");
    this.writes++;
    this.rows.set(
      id,
      this.record(id, {
        ...values,
        linkId,
        publicUrl: `https://preview.example.test/pay/${linkId}`,
      })
    );
    this.requests.set(requestId, { id, fingerprint });
    return paymentLinkCreateResult.parse({
      outcome: "created",
      requestId,
      workspace: this.detail(id),
    });
  }
}
