import { z } from "zod";
import { knowledgeSectionType } from "./knowledge-plan";

export const sectionStates = [
  "eligible",
  "pending",
  "paused",
  "expired",
  "excluded",
] as const;
export type SectionState = (typeof sectionStates)[number];
export const sectionCoverageTypes = [
  "identity",
  "services",
  "contact",
  "policies",
  "faq",
  "sales_intel",
] as const;
export const sectionListInput = z
  .object({
    search: z.string().trim().max(200).default(""),
    type: z.union([z.literal("all"), knowledgeSectionType]).default("all"),
    state: z.union([z.literal("all"), z.enum(sectionStates)]).default("all"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .default({ search: "", type: "all", state: "all", page: 1 });
export const sectionReadInput = z.object({ id: z.number().int().positive() });
export const sectionCreationReadInput = z.object({
  requestId: z.string().uuid(),
});
export type SectionCreationReceipt =
  | { state: "not_found" }
  | { state: "saved" | "changed" | "deleted"; id: number };
export const sectionContentFits = (text: string) =>
  new TextEncoder().encode(text).length <= 65535;
export const sectionFields = z.object({
  title: z.string().trim().min(1).max(500),
  content: z
    .string()
    .trim()
    .min(1)
    .max(50000)
    .refine(sectionContentFits, "Section text exceeds storage capacity"),
  useInBot: z.boolean(),
});
export const sectionCreateInput = sectionFields.extend({
  sectionType: knowledgeSectionType.exclude(["sales_intel", "opportunities"]),
  parentId: z.number().int().positive().nullable().default(null),
  requestId: z.string().uuid(),
  acknowledged: z.literal(true),
});
export const sectionUpdateInput = sectionFields.merge(sectionReadInput).extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export const sectionDeleteInput = sectionReadInput.extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export function sectionState(row: {
  status: string | null;
  useInBot: boolean | number | null;
  injectAs: string | null;
  expired: boolean;
}): SectionState {
  if (row.status === "pending_review") return "pending";
  if (!row.useInBot) return "paused";
  if (row.expired) return "expired";
  if (
    !["approved", "auto_approved"].includes(row.status || "") ||
    !["fact", "behavior"].includes(row.injectAs || "")
  )
    return "excluded";
  return "eligible";
}
export type SectionListItem = {
  id: number;
  parentId: number | null;
  sectionType: string;
  title: string;
  source: string;
  status: string | null;
  useInBot: boolean;
  injectAs: string | null;
  expired: boolean;
  state: SectionState;
};
export type SectionReview = {
  section: SectionListItem & {
    content: string;
    summary: string | null;
    sourceUrl: string | null;
    validUntil: string | null;
  };
  revision: string;
  deleteRevision: string;
  parent: { id: number; title: string } | null;
  descendants: Array<{ id: number; title: string }>;
};
export function summarizeSectionReadiness(
  rows: Array<Pick<SectionListItem, "sectionType" | "state">>
) {
  const counts = Object.fromEntries(
    sectionStates.map(state => [
      state,
      rows.filter(r => r.state === state).length,
    ])
  ) as Record<SectionState, number>;
  const breakdown = sectionCoverageTypes.map(key => ({
    key,
    count: rows.filter(r => r.sectionType === key && r.state === "eligible")
      .length,
  }));
  const covered = breakdown.filter(r => r.count > 0).length;
  return {
    total: Math.round((covered / sectionCoverageTypes.length) * 100),
    covered,
    areas: sectionCoverageTypes.length,
    saved: rows.length,
    counts,
    breakdown,
  };
}
