import { z } from "zod";
export const qualityReadoutInput = z
  .object({ days: z.number().int().min(1).max(90).default(30) })
  .strict();
export interface QualityFlag {
  yes: number;
  no: number;
  unknown: number;
  rate: number | null;
}
export function qualityFlag(
  total: number,
  yes: number,
  no: number
): QualityFlag {
  if (
    ![total, yes, no].every(n => Number.isSafeInteger(n) && n >= 0) ||
    yes + no > total
  )
    throw Error("Invalid quality aggregate");
  return {
    yes,
    no,
    unknown: total - yes - no,
    rate: yes + no > 0 ? Math.round((yes / (yes + no)) * 1000) / 10 : null,
  };
}
export function qualityTrend(current: QualityFlag, previous: QualityFlag) {
  if (current.yes + current.no < 5 || previous.yes + previous.no < 5)
    return "insufficient" as const;
  const currentN = BigInt(current.yes + current.no),
    previousN = BigInt(previous.yes + previous.no);
  const difference =
    BigInt(100) * (BigInt(current.yes) * previousN - BigInt(previous.yes) * currentN);
  const threshold = BigInt(5) * currentN * previousN;
  return difference < -threshold
    ? ("improving" as const)
    : difference > threshold
      ? ("declining" as const)
      : ("stable" as const);
}
export interface QualityReadout {
  days: number;
  from: string;
  through: string;
  totalResponses: number;
  avgResponseTimeMs: number | null;
  responseTimeSamples: number;
  cache: QualityFlag;
  shortResponses: QualityFlag;
  escalation: QualityFlag;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    unknown: number;
  };
  questions: Array<{ text: string; count: number }>;
  recent: Array<{
    id: number;
    question: string;
    response: string;
    createdAt: string;
  }>;
  trend: {
    state: ReturnType<typeof qualityTrend>;
    current: QualityFlag;
    previous: QualityFlag;
  };
}
