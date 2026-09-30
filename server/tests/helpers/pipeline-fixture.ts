import {
  pipelineStages,
  pipelineWindows,
  type PipelineInput,
  type PipelineSnapshot,
  type PipelineItem,
} from "../../../shared/pipeline-workspace";
export function pipelineFixture(
  selection: PipelineInput = { queue: "ready", page: 1, pageSize: 20 }
): PipelineSnapshot {
  const base: PipelineItem[] = Array.from({ length: 28 }, (_, i) => ({
    id: 100 + i,
    customerName: `عميل تجريبي ${i + 1}`,
    customerPhone: `+966500000${String(i).padStart(3, "0")}`,
    stage:
      i < 2
        ? "ready"
        : i < 25
          ? "payment_link_sent"
          : i === 25
            ? "paid"
            : i === 26
              ? "lost"
              : "new",
    preview:
      i === 0
        ? "أحتاج تفاصيل المنتج قبل تأكيد الطلب."
        : "رسالة محفوظة لتجربة قائمة المتابعة.",
    previewTruncated: false,
    lastMessageAt: "2026-09-29T12:00:00.000Z",
    paymentLinkSentAt: i >= 2 && i < 25 ? "2026-09-28T12:00:00.000Z" : null,
    stalledSince: null,
    lossReason: i === 26 ? "price" : null,
  }));
  const selected = base.filter(r =>
    selection.queue === "all"
      ? true
      : selection.queue === "stage"
        ? r.stage === selection.stage
        : selection.queue === "needs-human"
          ? r.id === 100
          : selection.queue === "pending"
            ? r.stage === "payment_link_sent"
            : selection.queue === "stalled"
              ? false
              : r.stage === selection.queue
  );
  return {
    merchantId: 20,
    selection,
    timeZone: "UTC",
    windows: pipelineWindows(new Date("2026-09-30T10:00:00Z")),
    total: 28,
    stages: pipelineStages.map(stage => ({
      stage,
      count: base.filter(r => r.stage === stage).length,
    })),
    queues: {
      ready: 2,
      "needs-human": 1,
      pending: 23,
      stalled: 0,
      paid: 1,
      lost: 1,
      all: 28,
    },
    outcomes: {
      paid: 1,
      lost: 1,
      paidStageShare: 50,
      currentWeekPaid: 1,
      previousWeekPaid: 0,
    },
    losses: [{ reason: "price", count: 1, share: 100 }],
    values: [
      { currency: "SAR", count: 1, totalMinor: 12500, excludedAmounts: 0 },
      { currency: "USD", count: 1, totalMinor: 2200, excludedAmounts: 0 },
    ],
    list: {
      items: selected.slice(
        (selection.page - 1) * selection.pageSize,
        selection.page * selection.pageSize
      ),
      total: selected.length,
      page: selection.page,
      pageSize: selection.pageSize,
      totalPages: Math.ceil(selected.length / selection.pageSize),
    },
    unmeasured: {
      salesConversion: null,
      settledRevenue: null,
      timeToClose: null,
      salesProficiency: null,
    },
  };
}
