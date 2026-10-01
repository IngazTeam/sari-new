import type { KnowledgeSourceGroups } from "../../../shared/knowledge-source-groups";
export function sourceGroupsFixture(empty = false): KnowledgeSourceGroups {
  const date = "2026-09-27T08:30:00.000Z";
  return {
    merchantId: 970163, businessName: "متجر النموذج · Knowledge preview",
    documents: { total: empty?0:5, textReady: empty?0:1, empty: empty?0:1, pending: empty?0:1, processing: empty?0:1, failed: empty?0:1, latestUploadedAt: empty?null:date, removalAnchorId: empty?null:5 },
    products: { total: empty?0:12, visible: empty?0:10, activeVisible: empty?0:8, latestModifiedAt: empty?null:date },
    website: { analyses: empty?0:3, pages: empty?0:6, enabledPages: empty?0:3, pagesWithText: empty?0:5, latestAnalysisAt: empty?null:date, latestPageUpdateAt: empty?null:date, removalAnchorId: empty?null:3 },
    faqs: { total: empty?0:8, enabled: empty?0:4, archived: empty?0:2, latestModifiedAt: empty?null:date },
    sections: { total: empty?0:10, switchedOn: empty?0:7, latestModifiedAt: empty?null:date },
    settings: { createdAt: "2024-01-01T00:00:00.000Z", modifiedAt: date },
  };
}
