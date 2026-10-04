import {
  paymentHistoryInput,
  paymentHistoryDetailInput,
  paymentHistoryWorkspace,
  paymentHistoryDetail,
  paymentHistoryStatuses,
  type PaymentHistoryDetail,
} from "../../../shared/payment-history-workspace";
type Payment = NonNullable<PaymentHistoryDetail["payment"]>;
export class PaymentHistoryPreviewStore {
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    readonly mode: () => string
  ) {}
  private records(): Payment[] {
    if (this.mode() === "empty") return [];
    return Array.from({ length: 52 }, (_, index) => {
      const id = index + 1,
        legacy = this.mode() === "legacy" && id === 1;
      return {
        id,
        amountMinor: legacy ? null : 12550 + index * 100,
        currency: legacy ? null : id % 3 === 0 ? "USD" : "SAR",
        status: legacy ? "unknown" : paymentHistoryStatuses[index % 6],
        customerName: `${this.merchantId === 269 ? "نواة · Nawa" : "مدار · Madar"} · ${id}`,
        customerPhone: "synthetic-" + id,
        customerEmail: `customer${id}@example.test`,
        chargeId: `chg_local_${this.merchantId}_${id}`,
        paymentMethod: id % 2 ? "card" : null,
        createdAt: `2026-10-${id % 2 === 0 ? "03" : "04"}T12:00:00.000Z`,
        updatedAt: null,
        authorizedAt: null,
        capturedAt: null,
        failedAt: null,
        refundedAt: null,
        expiresAt: null,
        description: "عينة محلية · Local sample",
        hasRecordedError: id % 6 === 3,
        warnings: legacy
          ? ["amount", "currency", "status"]
          : this.mode() === "unavailable-reference"
            ? ["target"]
            : [],
        related:
          this.mode() === "unavailable-reference"
            ? { kind: "unavailable" }
            : id === 1
              ? { kind: "order", id: 1 }
              : id === 2
                ? { kind: "booking", id: 1 }
                : { kind: "none" },
      } as Payment;
    });
  }
  read(name: string, input: unknown) {
    const canView = this.mode() !== "readonly",
      base = {
        actorId: this.actorId,
        merchantId: this.merchantId,
        canView,
        checkedAt: "2026-10-04T12:30:00.000Z",
        source: "local_payment_records" as const,
      };
    if (name === "payments.workspace.detail") {
      const { id } = paymentHistoryDetailInput.parse(input),
        payment = canView
          ? (this.records().find(x => x.id === id) ?? null)
          : null;
      return paymentHistoryDetail.parse({
        ...base,
        state: !canView ? "restricted" : payment ? "found" : "missing",
        payment,
      });
    }
    const filters = paymentHistoryInput.parse(input);
    if (!canView)
      return paymentHistoryWorkspace.parse({
        ...base,
        state: "restricted",
        filters,
        items: [],
        totals: null,
        hasNext: false,
      });
    const found = this.records()
      .filter(
        x =>
          (filters.status === "all" || x.status === filters.status) &&
          (!filters.from || x.createdAt!.slice(0, 10) >= filters.from) &&
          (!filters.to || x.createdAt!.slice(0, 10) <= filters.to) &&
          (!filters.search ||
            [x.id, x.customerName, x.customerPhone, x.chargeId].some(v =>
              String(v ?? "")
                .toLowerCase()
                .includes(filters.search.toLowerCase())
            ))
      )
      .sort((a, b) => b.createdAt!.localeCompare(a.createdAt!) || b.id - a.id);
    const states = {
      pending: 0,
      authorized: 0,
      captured: 0,
      failed: 0,
      cancelled: 0,
      refunded: 0,
      unknown: 0,
    };
    let excludedAmounts = 0;
    const currencies: Array<{
      currency: "SAR" | "USD";
      records: number;
      totalMinor: number;
      capturedMinor: number;
      authorizedMinor: number;
      refundedMinor: number;
    }> = [];
    for (const record of found) {
      states[record.status]++;
      if (record.amountMinor === null || record.currency === null) {
        excludedAmounts++;
        continue;
      }
      let c = currencies.find(x => x.currency === record.currency);
      if (!c) {
        c = {
          currency: record.currency,
          records: 0,
          totalMinor: 0,
          capturedMinor: 0,
          authorizedMinor: 0,
          refundedMinor: 0,
        };
        currencies.push(c);
      }
      c.records++;
      c.totalMinor += record.amountMinor;
      if (record.status === "captured") c.capturedMinor += record.amountMinor;
      if (record.status === "authorized")
        c.authorizedMinor += record.amountMinor;
      if (record.status === "refunded") c.refundedMinor += record.amountMinor;
    }
    return paymentHistoryWorkspace.parse({
      ...base,
      state: "ready",
      filters,
      items: found
        .slice(
          (filters.page - 1) * filters.pageSize,
          filters.page * filters.pageSize
        )
        .map(
          ({
            customerEmail,
            description,
            related,
            authorizedAt,
            capturedAt,
            failedAt,
            refundedAt,
            expiresAt,
            updatedAt,
            hasRecordedError,
            ...item
          }) => item
        ),
      totals: {
        total: found.length,
        states,
        excludedAmounts,
        currencies: currencies.sort((a, b) =>
          a.currency.localeCompare(b.currency)
        ),
      },
      hasNext: filters.page * filters.pageSize < found.length,
    });
  }
}
