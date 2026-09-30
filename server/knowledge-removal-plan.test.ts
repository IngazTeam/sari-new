import { it, expect } from "vitest";
import {
  knowledgeRemovalTarget,
  knowledgeRemovalWrite,
  planKnowledgeSourceRemoval,
  type KnowledgeRemovalSnapshot,
} from "../shared/knowledge-source-removal";
const snapshot = (): KnowledgeRemovalSnapshot => ({
  merchantId: 20,
  businessName: "Test store",
  integrationSource: "none",
  runningIntake: false,
  documents: [
    { id: 1, merchantId: 20 },
    { id: 2, merchantId: 20 },
  ],
  products: [{ id: 3, merchantId: 20, external: false }],
  analyses: [
    { id: 4, merchantId: 20 },
    { id: 5, merchantId: 20 },
  ],
  pages: [{ id: 6, merchantId: 20 }],
  faqs: [{ id: 7, merchantId: 20 }],
  sections: [
    { id: 10, merchantId: 20, parentId: null, source: "document" },
    { id: 11, merchantId: 20, parentId: 10, source: "manual" },
    { id: 12, merchantId: 20, parentId: 11, source: "ai_evolved" },
    { id: 13, merchantId: 20, parentId: null, source: "website" },
    { id: 14, merchantId: 20, parentId: null, source: "manual" },
  ],
});
it("reviews the entire document group and all descendants without claiming website or catalog deletion", () => {
  const p = planKnowledgeSourceRemoval(snapshot(), {
    kind: "document",
    sourceId: 2,
  });
  expect(p.counts).toEqual({
    documents: 2,
    products: 0,
    analyses: 0,
    pages: 0,
    faqs: 0,
    sections: 3,
  });
  expect(p.sectionIds).toEqual([10, 11, 12]);
  expect(p.effects).toEqual({
    documentReviews: true,
    websitePreviews: false,
    allSectionHistory: false,
    catalogRelations: false,
    replyCaches: true,
  });
  expect(p.blockers).toEqual([]);
});
it("covers every analysis and page for website removal", () => {
  const p = planKnowledgeSourceRemoval(snapshot(), {
    kind: "website",
    sourceId: 4,
  });
  expect(p.counts).toEqual({
    documents: 0,
    products: 0,
    analyses: 2,
    pages: 1,
    faqs: 0,
    sections: 1,
  });
  expect(p.effects.websitePreviews).toBe(true);
});
it("full reset includes manual knowledge even when documents and website have no records", () => {
  const s = snapshot();
  s.documents = [];
  s.analyses = [];
  const p = planKnowledgeSourceRemoval(s, { kind: "all" });
  expect(p.sectionIds).toEqual([10, 11, 12, 13, 14]);
  expect(p.effects.allSectionHistory).toBe(true);
  expect(p.blockers).not.toContain("missing_source");
});
it.each(["products", "faqs"] as const)(
  "preserves unrelated knowledge when removing %s",
  kind => {
    const p = planKnowledgeSourceRemoval(snapshot(), { kind });
    expect(p.sectionIds).toEqual([]);
    expect(p.counts[kind]).toBe(1);
    expect(p.effects.catalogRelations).toBe(kind === "products");
  }
);
it("handles cyclic section relationships without omission or nontermination", () => {
  const s = snapshot();
  s.sections[0].parentId = 12;
  expect(
    planKnowledgeSourceRemoval(s, { kind: "document", sourceId: 1 }).sectionIds
  ).toEqual([10, 11, 12]);
});
it.each([
  "documents",
  "products",
  "analyses",
  "pages",
  "faqs",
  "sections",
] as const)(
  "rejects a foreign row in %s rather than counting or deleting it",
  key => {
    const s = snapshot();
    s[key][0].merchantId = 99;
    expect(() => planKnowledgeSourceRemoval(s, { kind: "all" })).toThrow(
      "Foreign source row"
    );
  }
);
it("rejects duplicate identities rather than overstating impact", () => {
  const s = snapshot();
  s.documents.push(s.documents[0]);
  expect(() => planKnowledgeSourceRemoval(s, { kind: "all" })).toThrow(
    "Duplicate"
  );
});
it("blocks source-managed products including after a connection setting was cleared", () => {
  const s = snapshot();
  s.products[0].external = true;
  expect(
    planKnowledgeSourceRemoval(s, { kind: "products" }).blockers
  ).toContain("external_catalog");
  expect(planKnowledgeSourceRemoval(s, { kind: "all" }).blockers).toContain(
    "external_catalog"
  );
  expect(
    planKnowledgeSourceRemoval(s, { kind: "faqs" }).blockers
  ).not.toContain("external_catalog");
  s.products[0].external = false;
  s.integrationSource = "salla";
  expect(planKnowledgeSourceRemoval(s, { kind: "all" }).blockers).toContain(
    "external_catalog"
  );
});
it("blocks all source removal while an intake is processing", () => {
  const s = snapshot();
  s.runningIntake = true;
  expect(planKnowledgeSourceRemoval(s, { kind: "faqs" }).blockers).toContain(
    "running_intake"
  );
});
it("requires the selected document or website identity still to exist", () => {
  for (const kind of ["document", "website"])
    expect(
      planKnowledgeSourceRemoval(snapshot(), { kind, sourceId: 999 }).blockers
    ).toContain("missing_source");
});
it("distinguishes empty groups from a full reset of cache and unattached history", () => {
  const s = snapshot();
  s.documents = [];
  s.products = [];
  s.analyses = [];
  s.pages = [];
  s.faqs = [];
  s.sections = [];
  expect(planKnowledgeSourceRemoval(s, { kind: "faqs" }).blockers).toContain(
    "empty"
  );
  expect(planKnowledgeSourceRemoval(s, { kind: "all" }).blockers).not.toContain(
    "empty"
  );
});
it.each([
  { kind: "all", merchantId: 99 },
  { kind: "document", sourceId: 0 },
  { kind: "website", sourceId: 1.2 },
  { kind: "products", sourceId: 1 },
  { kind: "unknown" },
])("rejects malformed target %#", target =>
  expect(() => knowledgeRemovalTarget.parse(target)).toThrow()
);
it("requires a fixed request identity, review digest and affirmative acknowledgement", () => {
  const input = {
    target: { kind: "all" },
    requestId: "00000000-0000-4000-8000-000000000001",
    expectedRevision: "a".repeat(64),
    confirmation: " Test store ",
    acknowledged: true,
  };
  expect(knowledgeRemovalWrite.parse(input).confirmation).toBe("Test store");
  for (const patch of [
    { requestId: "bad" },
    { expectedRevision: "old" },
    { acknowledged: false },
    { confirmation: " " },
    { merchantId: 99 },
  ])
    expect(() => knowledgeRemovalWrite.parse({ ...input, ...patch })).toThrow();
});
