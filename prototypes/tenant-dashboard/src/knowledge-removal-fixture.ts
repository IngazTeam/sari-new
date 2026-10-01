import type {
  KnowledgeRemovalReview,
  KnowledgeRemovalTarget,
  KnowledgeRemovalReceipt,
} from "../../../shared/knowledge-source-removal";
export function removalFixture(
  target: KnowledgeRemovalTarget = { kind: "all" },
  merchantId = 970156,
  actorId = 970156
): KnowledgeRemovalReview {
  const all = target.kind === "all",
    doc = all || target.kind === "document",
    web = all || target.kind === "website";
  return {
    merchantId,
    actorId,
    target,
    businessName: "متجر النموذج",
    revision: "a".repeat(64),
    blockers: [],
    counts: {
      documents: doc ? 4 : 0,
      products: all || target.kind === "products" ? 12 : 0,
      analyses: web ? 2 : 0,
      pages: web ? 6 : 0,
      faqs: all || target.kind === "faqs" ? 8 : 0,
      sections: all ? 10 : doc ? 3 : web ? 2 : 0,
    },
    related: {
      documentReviews: doc ? 2 : 0,
      documentReceipts: doc ? 4 : 0,
      websitePreviews: web ? 1 : 0,
      websiteImportReviews: web ? 1 : 0,
      sectionHistory: doc || web ? 5 : 0,
      productOptions: all || target.kind === "products" ? 4 : 0,
      productVariants: all || target.kind === "products" ? 6 : 0,
      loyaltyLinks: 0,
      competitorLinks: 0,
      websiteInsights: web ? 3 : 0,
      extractedProducts: web ? 10 : 0,
      faqPageLinks: web && !all ? 3 : 0,
    },
  };
}
export function removalFixtureReceipt(
  review: KnowledgeRemovalReview,
  requestId: string
): KnowledgeRemovalReceipt {
  return {
    merchantId: review.merchantId,
    actorId: review.actorId,
    target: review.target,
    requestId,
    revision: review.revision,
    counts: review.counts,
    related: review.related,
    completedAt: "2026-10-01T09:00:00.000Z",
  };
}
