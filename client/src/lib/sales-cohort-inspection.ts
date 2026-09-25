import { cohortInspectionResult, cohortSourcePage, type CohortInspectionResult, type CohortSource, type CohortSourcePage, type ListSalesCohortSourcesInput } from '../../../shared/sales-cohort-inspection';
export function compatibleCohortSourcePage(value: unknown, input: ListSalesCohortSourcesInput): value is CohortSourcePage {
  const parsed = cohortSourcePage.safeParse(value); if (!parsed.success) return false;
  const p = parsed.data;
  return p.protocolId === input.protocolId && p.cohortDigest === input.cohortDigest && p.search === input.search && p.beforeId === (input.beforeId ?? null) && p.limit === input.limit
    && p.items.length <= input.limit && p.items.every((row, index) => (index === 0 ? !input.beforeId || row.conversationId < input.beforeId : row.conversationId < p.items[index - 1].conversationId)
      && Array.from(row.preview).length <= 320 && (row.messageType === 'text' || !row.preview && !row.previewTruncated))
    && new Set(p.items.map(row => row.incomingMessageId)).size === p.items.length
    && (p.nextBeforeId === null || p.items.length === input.limit && p.nextBeforeId === p.items.at(-1)?.conversationId);
}
export function compatibleCohortInspection(value: unknown, protocolId: number, cohortDigest: string, source: CohortSource): value is CohortInspectionResult {
  const parsed = cohortInspectionResult.safeParse(value); if (!parsed.success) return false;
  const r = parsed.data;
  return r.protocolId === protocolId && r.cohortDigest === cohortDigest && r.conversationId === source.conversationId && r.incomingMessageId === source.incomingMessageId && r.messageDigest === source.messageDigest;
}
export const cohortSourceKey = (source: CohortSource) => `${source.conversationId}:${source.incomingMessageId}:${source.messageDigest}`;
