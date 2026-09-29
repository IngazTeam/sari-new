import { readLegacyMessageWorkspace } from "./message-workspace";
const bounds = (startDate?: Date, endDate?: Date) => ({
  startDate: startDate?.toISOString(),
  endDate: endDate?.toISOString(),
});
/** Compatibility reads are bounded to 30 days by default; use the workspace for a complete snapshot. */
export async function getMessageStats(
  merchantId: number,
  startDate?: Date,
  endDate?: Date
) {
  const snapshot = await readLegacyMessageWorkspace(
    merchantId,
    bounds(startDate, endDate)
  );
  return {
    text: snapshot.messages.byType.find(r => r.kind === "text")!.count,
    voice: snapshot.messages.byType.find(r => r.kind === "voice")!.count,
    image: snapshot.messages.byType.find(r => r.kind === "image")!.count,
    document: snapshot.messages.byType.find(r => r.kind === "document")!.count,
    total: snapshot.messages.total,
  };
}
export async function getPeakHours(
  merchantId: number,
  startDate?: Date,
  endDate?: Date
) {
  return (
    await readLegacyMessageWorkspace(merchantId, bounds(startDate, endDate))
  ).hourly;
}
export async function getTopProducts(merchantId: number, limit = 10) {
  return (await readLegacyMessageWorkspace(merchantId, {}, { limit })).products
    .rows;
}
export async function getConversionRate(
  merchantId: number,
  startDate?: Date,
  endDate?: Date
) {
  const snapshot = await readLegacyMessageWorkspace(
      merchantId,
      bounds(startDate, endDate)
    ),
    sample = snapshot.orderAssociation;
  return {
    merchantId: snapshot.merchantId,
    rate: null,
    associationShare: sample.ratio,
    totalConversations: sample.total,
    convertedConversations: sample.positive,
    conversationsWithOrders: sample.positive,
    evidenceKind: sample.evidenceKind,
    includesAllOrderStatuses: true,
    salesProficiency: null,
    from: snapshot.from,
    through: snapshot.through,
    timeZone: snapshot.timeZone,
  };
}
export async function getDailyMessageCount(merchantId: number, days = 30) {
  return (await readLegacyMessageWorkspace(merchantId, {}, { days })).daily;
}
