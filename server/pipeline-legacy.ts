import type {
  PipelineItem,
  PipelineSnapshot,
} from "../shared/pipeline-workspace";
import {
  readPipelineBundle,
  type PipelinePreviews,
} from "./pipeline-workspace";
export function legacyPipelineCounts(d: PipelineSnapshot) {
  return {
    readyToPay: d.queues.ready,
    needsHuman: d.queues["needs-human"],
    paymentPending: d.queues.pending,
    stalled: d.queues.stalled,
    evidence: d,
  };
}
export function legacyPipelineKPIs(d: PipelineSnapshot) {
  const current = d.outcomes.currentWeekPaid,
    previous = d.outcomes.previousWeekPaid;
  return {
    conversionRate: null,
    avgTimeToClose: null,
    totalRevenue: null,
    observedPaidStageShare: d.outcomes.paidStageShare,
    topLossReason: d.losses[0]?.reason ?? null,
    topLossCount: d.losses[0]?.count ?? 0,
    thisWeekWins: current,
    lastWeekWins: previous,
    weeklyTrend:
      current > previous
        ? ("up" as const)
        : current < previous
          ? ("down" as const)
          : ("stable" as const),
    evidence: d,
  };
}
const item = (r: PipelineItem) => ({
  id: r.id,
  customerPhone: r.customerPhone,
  customerName: r.customerName,
  lastMessage: r.preview,
  previewTruncated: r.previewTruncated,
  lastMessageAt: r.lastMessageAt,
  deal_stage: r.stage,
  loss_reason: r.lossReason,
  payment_link_sent_at: r.paymentLinkSentAt,
  stalled_since: r.stalledSince,
});
export function legacyPipelineSummary(
  d: PipelineSnapshot,
  previews: PipelinePreviews
) {
  return {
    stages: Object.fromEntries(d.stages.map(s => [s.stage, s.count])),
    lossReasons: Object.fromEntries(d.losses.map(s => [s.reason, s.count])),
    hotLeads: previews.ready.map(item),
    stalledDeals: previews.stalled.map(item),
    paymentPending: previews.pending.map(item),
    recentWins: previews.paid.map(item),
    recentLosses: previews.lost.map(item),
    sampleLimit: 10,
    evidence: d,
  };
}
export async function readLegacyPipelineSummary(merchantId: number) {
  const bundle = await readPipelineBundle(
    merchantId,
    { queue: "ready", page: 1, pageSize: 20 },
    new Date(),
    { previews: true }
  );
  return legacyPipelineSummary(bundle.snapshot, bundle.previews!);
}
export function legacyPipelineLosses(d: PipelineSnapshot) {
  const labels: Record<string, string> = {
    price: "السعر",
    trust: "الثقة",
    competitor: "منافس",
    delivery: "التوصيل",
    timing: "التوقيت",
    fit: "ملاءمة الاحتياج",
    other: "سبب آخر",
    payment_failed: "فشل الدفع",
    payment_abandoned: "دفع غير مكتمل",
    no_response: "لم يرد",
    human_needed: "يحتاج إنسان",
    unknown: "غير محدد",
  };
  return d.losses.map(r => ({
    reason: r.reason,
    label: Object.hasOwn(labels, r.reason) ? labels[r.reason] : r.reason,
    count: r.count,
    share: r.share,
    from: d.windows.monthFrom,
    through: d.windows.through,
    basis: "current_lost_stage_by_last_activity" as const,
  }));
}
