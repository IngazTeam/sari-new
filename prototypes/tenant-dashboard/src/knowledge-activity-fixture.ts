import type { KnowledgeActivityPage } from "../../../shared/knowledge-activity";
const types = [
  "file_uploaded",
  "knowledge_ingested",
  "products_deleted",
  "website_page_created",
  "custom_review",
];
export function activityFixture(
  filter = "all",
  page = 1,
  english = false
): KnowledgeActivityPage {
  const all = Array.from({ length: 23 }, (_, i) => ({
    id: 23 - i,
    actionType: types[i % types.length],
    description: english
      ? `Saved example ${i + 1}. ${i === 0 ? "A full recorded description with a line break.\n<script>This stays plain text.</script>" : ""}`
      : `نشاط توضيحي محفوظ ${i + 1}. ${i === 0 ? "وصف كامل مع سطر ثانٍ للمراجعة.\n<script>يبقى هذا نصًا عاديًا</script>" : ""}`,
    createdAt:
      i === 1
        ? null
        : `2026-10-01T${String(20 - Math.floor(i / 3)).padStart(2, "0")}:${String(i % 3).padStart(2, "0")}:00.000Z`,
    details: null,
  }));
  const items =
      filter === "all" ? all : all.filter(item => item.actionType === filter),
    totalPages = Math.ceil(items.length / 10),
    effective = Math.min(page, Math.max(1, totalPages));
  return {
    merchantId: 970160,
    filter: filter === "all" ? null : filter,
    items: items.slice((effective - 1) * 10, effective * 10),
    total: items.length,
    page: effective,
    pageSize: 10,
    totalPages,
    actionTypes: types,
    actionTypesTruncated: false,
  };
}
