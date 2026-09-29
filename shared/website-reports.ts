import { z } from "zod";

export const reportListInput = z
  .object({
    search: z.string().trim().max(200).default(""),
    state: z
      .enum(["all", "pending", "analyzing", "completed", "failed"])
      .default("all"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .default({ search: "", state: "all", page: 1 });
export const reportReadInput = z.object({
  id: z.number().int().positive().max(2147483647),
});
export const reportDeleteInput = reportReadInput.extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export function estimatedScore(value: unknown, status: string) {
  return status === "completed" &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}
export const REPORT_LIMITATIONS =
  "Heuristic website estimates; not measured sales proficiency, conversion, browser compatibility or a security audit. Completion does not prove every extraction or knowledge update succeeded.";
