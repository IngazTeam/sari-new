import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const knowledgeRemovalTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }).strict(),
  z.object({ kind: z.literal("document"), sourceId: id }).strict(),
  z.object({ kind: z.literal("website"), sourceId: id }).strict(),
  z.object({ kind: z.literal("products") }).strict(),
  z.object({ kind: z.literal("faqs") }).strict(),
]);
export type KnowledgeRemovalTarget = z.infer<typeof knowledgeRemovalTarget>;
export const knowledgeRemovalWrite = z
  .object({
    target: knowledgeRemovalTarget,
    requestId: z.string().uuid(),
    expectedRevision: revision,
    confirmation: z.string().trim().min(1).max(255),
    acknowledged: z.literal(true),
  })
  .strict();
export const knowledgeRemovalReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();

const count = z.number().int().nonnegative();
export const knowledgeRemovalCounts = z
  .object({
    documents: count,
    products: count,
    analyses: count,
    pages: count,
    faqs: count,
    sections: count,
  })
  .strict();
export const knowledgeRemovalRelatedCounts = z
  .object({
    documentReviews: count,
    documentReceipts: count,
    websitePreviews: count,
    websiteImportReviews: count,
    sectionHistory: count,
    productOptions: count,
    productVariants: count,
    loyaltyLinks: count,
    competitorLinks: count,
    websiteInsights: count,
    extractedProducts: count,
    faqPageLinks: count,
  })
  .strict();
export const knowledgeRemovalReview = z
  .object({
    merchantId: id,
    actorId: id,
    target: knowledgeRemovalTarget,
    businessName: z.string().trim().min(1).max(255),
    revision,
    counts: knowledgeRemovalCounts,
    related: knowledgeRemovalRelatedCounts,
    blockers: z.array(
      z.enum([
        "running_intake",
        "external_catalog",
        "missing_source",
        "empty",
        "foreign_relationship",
      ])
    ),
  })
  .strict();
export type KnowledgeRemovalReview = z.infer<typeof knowledgeRemovalReview>;
export const knowledgeRemovalReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    target: knowledgeRemovalTarget,
    revision,
    counts: knowledgeRemovalCounts,
    related: knowledgeRemovalRelatedCounts,
    completedAt: z.string().datetime(),
  })
  .strict();
export type KnowledgeRemovalReceipt = z.infer<typeof knowledgeRemovalReceipt>;

const row = z.object({ id, merchantId: id }).strict();
const rows = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .array(schema)
    .max(20000)
    .refine(
      list => new Set(list.map((r: any) => r.id)).size === list.length,
      "Duplicate source rows"
    );
export const knowledgeRemovalSnapshot = z
  .object({
    merchantId: id,
    businessName: z.string().trim().min(1).max(255),
    integrationSource: z.string().min(1),
    runningIntake: z.boolean(),
    documents: rows(row),
    products: rows(row.extend({ external: z.boolean() })),
    analyses: rows(row),
    pages: rows(row),
    faqs: rows(row),
    sections: rows(row.extend({ parentId: id.nullable(), source: z.string() })),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    for (const key of [
      "documents",
      "products",
      "analyses",
      "pages",
      "faqs",
      "sections",
    ] as const)
      if (snapshot[key].some(r => r.merchantId !== snapshot.merchantId))
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Foreign source row",
        });
  });
export type KnowledgeRemovalSnapshot = z.infer<typeof knowledgeRemovalSnapshot>;
export type KnowledgeRemovalPlan = {
  target: KnowledgeRemovalTarget;
  businessName: string;
  counts: {
    documents: number;
    products: number;
    analyses: number;
    pages: number;
    faqs: number;
    sections: number;
  };
  sectionIds: number[];
  blockers: Array<
    "running_intake" | "external_catalog" | "missing_source" | "empty"
  >;
  effects: {
    documentReviews: boolean;
    websitePreviews: boolean;
    allSectionHistory: boolean;
    catalogRelations: boolean;
    replyCaches: true;
  };
};

/** Pure scope plan. The server must read and fingerprint the actual rows in one
 * snapshot, and repeat this plan under the merchant lock before any deletion. */
export function planKnowledgeSourceRemoval(
  raw: unknown,
  rawTarget: unknown
): KnowledgeRemovalPlan {
  const s = knowledgeRemovalSnapshot.parse(raw),
    target = knowledgeRemovalTarget.parse(rawTarget);
  const all = target.kind === "all",
    documents = all || target.kind === "document",
    website = all || target.kind === "website",
    products = all || target.kind === "products",
    faqs = all || target.kind === "faqs";
  const roots = s.sections
    .filter(
      r =>
        all ||
        (documents && r.source === "document") ||
        (website && r.source === "website")
    )
    .map(r => r.id);
  const children = new Map<number, number[]>();
  for (const r of s.sections)
    if (r.parentId !== null)
      children.set(r.parentId, [...(children.get(r.parentId) || []), r.id]);
  const ids = new Set<number>();
  for (let index = 0; index < roots.length; index++) {
    const n = roots[index];
    if (ids.has(n)) continue;
    ids.add(n);
    roots.push(...(children.get(n) || []));
  }
  const counts = {
    documents: documents ? s.documents.length : 0,
    products: products ? s.products.length : 0,
    analyses: website ? s.analyses.length : 0,
    pages: website ? s.pages.length : 0,
    faqs: faqs ? s.faqs.length : 0,
    sections: ids.size,
  };
  const blockers: KnowledgeRemovalPlan["blockers"] = [];
  if (s.runningIntake) blockers.push("running_intake");
  if (
    products &&
    s.products.length &&
    (s.integrationSource !== "none" || s.products.some(p => p.external))
  )
    blockers.push("external_catalog");
  if (
    (target.kind === "document" &&
      !s.documents.some(d => d.id === target.sourceId)) ||
    (target.kind === "website" &&
      !s.analyses.some(a => a.id === target.sourceId))
  )
    blockers.push("missing_source");
  // An all reset also clears unattached history and cached answers, even if no
  // source rows remain. Its impact must remain explicit in the review screen.
  if (!all && Object.values(counts).every(n => n === 0)) blockers.push("empty");
  return {
    target,
    businessName: s.businessName,
    counts,
    sectionIds: Array.from(ids).sort((a, b) => a - b),
    blockers,
    effects: {
      documentReviews: documents,
      websitePreviews: website,
      allSectionHistory: all,
      catalogRelations: products && s.products.length > 0,
      replyCaches: true,
    },
  };
}
