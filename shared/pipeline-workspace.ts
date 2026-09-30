import { z } from "zod";
import { VALID_DEAL_STAGES } from "./const";

export const pipelineStages = [...VALID_DEAL_STAGES, "unknown"] as const;
export const pipelineQueues = [
  "ready",
  "needs-human",
  "pending",
  "stalled",
  "paid",
  "lost",
  "all",
  "stage",
] as const;
export const pipelineInput = z
  .object({
    queue: z.enum(pipelineQueues).default("ready"),
    stage: z.enum(pipelineStages).optional(),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(
    v => (v.queue === "stage") === (v.stage !== undefined),
    "Stage belongs to the stage queue only"
  );
export type PipelineInput = z.infer<typeof pipelineInput>;
export type PipelineStage = (typeof pipelineStages)[number];
export type PipelineQueue = (typeof pipelineQueues)[number];
export function pipelineWindows(now: Date, lookbackDays = 30) {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 365)
    throw Error("Invalid pipeline lookback");
  if (!Number.isFinite(now.getTime())) throw Error("Invalid pipeline clock");
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const iso = (value: number) => new Date(value).toISOString();
  return {
    through: iso(end),
    monthFrom: iso(end - lookbackDays * 86400000 + 1000),
    lookbackDays,
    weekFrom: iso(end - 7 * 86400000 + 1000),
    previousFrom: iso(end - 14 * 86400000 + 1000),
    previousThrough: iso(end - 7 * 86400000),
    readyAfter: iso(end - 48 * 3600000),
  };
}
export interface PipelineItem {
  id: number;
  customerName: string | null;
  customerPhone: string;
  stage: PipelineStage;
  lossReason: string | null;
  preview: string | null;
  previewTruncated: boolean;
  lastMessageAt: string | null;
  paymentLinkSentAt: string | null;
  stalledSince: string | null;
}
export interface PipelineSnapshot {
  merchantId: number;
  selection: PipelineInput;
  timeZone: "UTC";
  windows: ReturnType<typeof pipelineWindows>;
  total: number;
  stages: Array<{ stage: PipelineStage; count: number }>;
  queues: Record<Exclude<PipelineQueue, "stage">, number>;
  outcomes: {
    paid: number;
    lost: number;
    paidStageShare: number | null;
    previousWeekPaid: number;
    currentWeekPaid: number;
  };
  losses: Array<{ reason: string; count: number; share: number }>;
  values: Array<{
    currency: "SAR" | "USD";
    count: number;
    totalMinor: number;
    excludedAmounts: number;
  }>;
  list: {
    items: PipelineItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  unmeasured: {
    salesConversion: null;
    settledRevenue: null;
    timeToClose: null;
    salesProficiency: null;
  };
}
