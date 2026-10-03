import type { OverviewSnapshot } from "@shared/overview-workspace";
import { insightCsv } from "@shared/insight-csv";
import { overviewLabels } from "./overview-labels";
export function overviewReportRows(
  d: OverviewSnapshot,
  t: (key: string) => string
): (string | number)[][] {
  const l = overviewLabels(t),
    missing = l.unavailable,
    ratio = (v: number | null) =>
      v === null ? missing : `${Number(v.toFixed(1))}%`,
    money = (v: number | null) => (v === null ? missing : (v / 100).toFixed(2));
  return [
    [l.title],
    [l.tenant, d.merchantId],
    [l.from, d.from],
    [l.through, d.through],
    [l.zone, d.timeZone],
    [l.periodNote],
    [],
    [l.orders],
    [l.totalOrders, d.orders.total],
    ...d.orders.statuses.map(r => [l.statuses, l[r.status], r.count]),
    ...d.orders.payments.map(r => [l.payments, l[r.status], r.count]),
    [],
    [l.values],
    [l.valueNote],
    [l.paidNote],
    ...d.orders.values.flatMap(r => [
      [l[r.currency], l.totalValue, money(r.totalMinor)],
      [l[r.currency], l.amountSample, r.count],
      [l[r.currency], l.averageValue, money(r.averageMinor)],
      [l[r.currency], l.markedPaid, money(r.markedPaidMinor)],
      [l[r.currency], l.paidSample, r.markedPaidCount],
      [l[r.currency], l.invalidAmounts, r.excludedAmounts],
    ]),
    [],
    [l.reviews],
    [l.ratingNote],
    [l.averageRating, d.reviews.average ?? missing],
    [l.ratingSample, d.reviews.valid, d.reviews.total],
    [l.invalidRatings, d.reviews.invalid],
    [l.unlinkedReviews, d.reviews.unlinked],
    [l.stars, l.count, l.share],
    ...d.reviews.distribution.map(r => [r.stars, r.count, ratio(r.share)]),
    [],
    [l.carts],
    [l.cartNote],
    [l.cartTotal, d.carts.total],
    [l.recovered, d.carts.markedRecovered],
    [l.notRecovered, d.carts.other],
    [l.invalidFlags, d.carts.invalidFlags],
    [l.recoveryShare, ratio(d.carts.share)],
    [],
    [l.referrals],
    [l.referralNote],
    [l.referralTotal, d.referrals.total],
    [l.completed, d.referrals.markedCompleted],
    [l.notCompleted, d.referrals.pending],
    [l.invalidFlags, d.referrals.invalidFlags],
    [l.completionShare, ratio(d.referrals.share)],
    [],
    [l.association],
    [l.associationNote],
    [l.associationShare, ratio(d.association.ratio)],
    [l.associationSample, d.association.positive, d.association.total],
    [],
    [l.salesSkill, l.unmeasured],
    [l.evidenceNote],
  ];
}
export function overviewCsv(d: OverviewSnapshot, t: (key: string) => string) {
  return insightCsv(overviewReportRows(d, t));
}
