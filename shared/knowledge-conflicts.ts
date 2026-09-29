import { z } from "zod";
export const conflictListInput = z
  .object({ page: z.number().int().min(1).max(100000).default(1) })
  .default({ page: 1 });
export const conflictReviewInput = z.object({
  sectionId: z.number().int().positive(),
});
export const teachingPolicyReviewInput = conflictReviewInput
  .extend({
    expectedBasisHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const conflictDecisionInput = conflictReviewInput.extend({
  action: z.enum(["approve", "reject"]),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export type ConflictText = {
  id: number;
  title: string;
  content: string;
  summary: string | null;
  status: string | null;
  useInBot: boolean;
  injectAs: string | null;
  source: string;
  sourceUrl: string | null;
};
export type ConflictReview = {
  section: ConflictText;
  current: ConflictText | null;
  parent: ConflictText | null;
  previousText: string | null;
  reason: string | null;
  link: "verified" | "unlinked" | "unavailable";
  canApprove: boolean;
  revision: string;
  teaching?: {
    available: boolean;
    basisHash: string | null;
    canApprove: boolean;
    replaceIds: number[];
    reason: string | null;
    analyzed: boolean;
    candidates: Array<{
      key: string;
      title: string;
      content: string;
      replaceable: boolean;
      relation: "compatible" | "replace" | "review" | null;
      reason: string | null;
    }>;
  };
};
