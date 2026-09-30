import type {
  SectionListItem,
  SectionReview,
  SectionState,
} from "../../../shared/knowledge-sections";
const states: SectionState[] = [
  "eligible",
  "pending",
  "paused",
  "expired",
  "unverified",
  "excluded",
];
export function salesKnowledgeFixture(
  kind: "sales_intel" | "opportunities",
  english = false
) {
  const base = kind === "sales_intel" ? 1 : 101;
  return Array.from({ length: 10 }, (_, i): SectionReview => {
    const state = states[i % 6];
    const row: SectionListItem = {
      id: base + i,
      parentId: null,
      sectionType: kind,
      title: english ? `Saved suggestion ${i + 1}` : `اقتراح محفوظ ${i + 1}`,
      source: i % 2 ? "document" : "website",
      status: state === "pending" ? "pending_review" : "approved",
      useInBot: state !== "paused",
      injectAs: state === "excluded" ? "none" : "behavior",
      expired: state === "expired",
      state,
    };
    return {
      section: {
        ...row,
        content: english
          ? "A full example section.\n• First suggestion with supporting explanation.\nThis paragraph is retained alongside the bullet, even without the old Arabic headings."
          : "نص توضيحي كامل لقسم المعرفة.\n• اقتراح أول مع شرح سبب اقتراحه.\nهذه فقرة مهمة بعد التعداد، لا تختفي حتى عندما يختلف تنسيق العناوين.",
        summary: english
          ? "A stored example summary, separate from the full text."
          : "ملخص توضيحي محفوظ، مستقل عن النص الكامل.",
        sourceUrl: "https://example.com/catalog",
        validUntil: row.expired ? "2026-09-01T00:00:00.000Z" : null,
        replacesTeachingSource: false,
      },
      revision: "a".repeat(64),
      deleteRevision: "b".repeat(64),
      parent: null,
      descendants: [],
    };
  });
}
