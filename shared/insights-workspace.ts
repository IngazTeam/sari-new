import { z } from "zod";

export const insightPeriod = z.enum(["7d", "30d", "90d"]);
export const legacyInsightTestSelection = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
const page = z.number().int().min(1).max(100000).default(1);
export const insightWorkspaceInput = z
  .object({
    period: insightPeriod.default("30d"),
    keywordPage: page,
    reportPage: page,
    testPage: page,
  })
  .strict();
export type InsightWorkspaceInput = z.infer<typeof insightWorkspaceInput>;
export const INSIGHT_PAGE_SIZE = 20;
/** Preserve legacy text instead of silently treating malformed JSON as empty. */
export function insightStoredList(raw: string | null) {
  if (!raw?.trim())
    return { format: "empty" as const, items: [] as string[], raw: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(value => typeof value === "string")
    )
      return { format: "list" as const, items: parsed as string[], raw: null };
  } catch {
    /* Plain text and malformed legacy JSON remain available for review. */
  }
  return { format: "legacy" as const, items: [] as string[], raw };
}
export function insightPage(requested: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / INSIGHT_PAGE_SIZE));
  const current = Math.min(requested, pages);
  return {
    page: current,
    pages,
    total,
    pageSize: INSIGHT_PAGE_SIZE,
    offset: (current - 1) * INSIGHT_PAGE_SIZE,
  };
}
/** SQL string timestamps are UTC in the connection; never parse them as local time. */
export function insightDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      iso
    )
  )
    return null;
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
export function insightWindow(
  period: z.infer<typeof insightPeriod>,
  now = new Date()
) {
  const from = new Date(now.getTime() - Number(period.slice(0, -1)) * 86400000);
  return {
    from: from.toISOString(),
    through: now.toISOString(),
    sqlFrom: from.toISOString().slice(0, 19).replace("T", " "),
    sqlThrough: now.toISOString().slice(0, 19).replace("T", " "),
  };
}
export function observationArm(total: number, positive: number) {
  const valid =
    [total, positive].every(v => Number.isSafeInteger(v) && v >= 0) &&
    positive <= total;
  return {
    total,
    positive,
    valid,
    ratio: valid && total > 0 ? (positive / total) * 100 : null,
  };
}
export function sentimentObservation(row: {
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
}) {
  const {
    totalConversations: total,
    positiveCount: positive,
    negativeCount: negative,
    neutralCount: neutral,
  } = row;
  const classified = positive + negative + neutral;
  const valid =
    [total, positive, negative, neutral, classified].every(
      v => Number.isSafeInteger(v) && v >= 0
    ) && classified <= total;
  return {
    total,
    positive,
    negative,
    neutral,
    classified: valid ? classified : null,
    unclassified: valid ? total - classified : null,
    valid,
    positiveShare: valid && total > 0 ? (positive / total) * 100 : null,
  };
}
