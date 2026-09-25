import { z } from 'zod';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { salesExperimentReviewBasis, salesExperimentReviewSnapshot, recordSalesExperimentReviewInput, type RecordSalesExperimentReviewInput } from '../../../shared/sales-experiment-review';
import { compatibleProtocolRecord, type ProtocolRecord } from './sales-experiment-form';
import { compatibleCohortReceipt } from './sales-cohort-form';
import { outputCaseIds, supportedOutputRubricDigest } from './learning-policy-evaluation-state';

export type ReviewWorkspace = inferRouterOutputs<AppRouter>['sariBrain']['getSalesExperimentReviewWorkspace'];
export const reviewFields = ['baselineAndSample', 'recruitmentFeasibility', 'qualificationMapping', 'safetyAndMeasurement'] as const;
export type ReviewAssessment = Record<typeof reviewFields[number], string>;
export const emptyReviewAssessment = (): ReviewAssessment => ({ baselineAndSample: '', recruitmentFeasibility: '', qualificationMapping: '', safetyAndMeasurement: '' });
export const validReviewAssessment = (value: ReviewAssessment) => recordSalesExperimentReviewInput.shape.assessment.safeParse(value).success;
const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const reviewReceiptSchema = z.object({ reviewId: id, reviewDigest: digest, snapshot: salesExperimentReviewSnapshot,
  reviewerPresent: z.boolean(), eligibility: z.literal('not_checked'), activationAllowed: z.literal(false), experimentStarted: z.literal(false), reused: z.boolean().optional() }).strict();
export type PlanningReviewReceipt = z.infer<typeof reviewReceiptSchema>;
export const sameReviewValue = (a: unknown, b: unknown): boolean => {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
};
export function compatiblePlanningReceipt(value: unknown, record: ProtocolRecord): value is PlanningReviewReceipt {
  const result = reviewReceiptSchema.safeParse(value); if (!result.success) return false;
  const r = result.data.snapshot;
  return sameReviewValue(result.data, value) && r.protocolId === record.protocolId && r.merchantId === record.protocol.merchantId
    && r.basis.protocolDigest === record.protocolDigest && r.basis.candidateId === record.protocol.candidate.id
    && r.basis.artifactDigest === record.protocol.candidate.artifactDigest && r.basis.sourceDigest === record.protocol.candidate.sourceDigest
    && r.basis.sectorDigest === record.protocol.sector.digest && Date.parse(r.reviewedAt) >= Date.parse(record.protocol.registeredAt)
    && Date.parse(r.reviewedAt) < Date.parse(record.protocol.design.window.enrollmentStartsAt);
}
export function matchingPlanningReceipt(value: unknown, workspace: ReviewWorkspace, input: RecordSalesExperimentReviewInput): value is PlanningReviewReceipt {
  return compatiblePlanningReceipt(value, workspace.evidence.protocol) && value.snapshot.reviewerUserId === workspace.reviewerUserId
    && value.snapshot.revision === input.expectedRevision + 1 && value.snapshot.runId === input.runId
    && value.snapshot.basisDigest === input.basisDigest && sameReviewValue(value.snapshot.basis, workspace.basis)
    && value.snapshot.verdict === input.verdict && sameReviewValue(value.snapshot.assessment, recordSalesExperimentReviewInput.shape.assessment.parse(input.assessment));
}
const workspaceEnvelope = z.object({ basis: salesExperimentReviewBasis, basisDigest: digest, checkedAt: z.string().datetime({ precision: 3 }),
  reviewerUserId: id, expectedRevision: z.number().int().nonnegative().safe(), canReview: z.boolean(), stage: z.enum(['not_reviewed', 'review_stale', 'approved', 'rejected']),
  latestReview: reviewReceiptSchema.nullable(), planningReviewCurrent: z.boolean(), activationAllowed: z.literal(false), experimentStarted: z.literal(false),
  evidence: z.object({ protocol: z.unknown(), cohort: z.unknown(), pairs: z.array(z.unknown()).length(32), outputReview: z.unknown() }).strict() }).strict();
const armVerdict = z.object({ verdict: z.enum(['pass', 'fail']), quote: z.string().trim().min(1).max(500), reason: z.string().trim().min(20).max(1500) }).strict();
const outputJudgment = z.object({ caseId: z.string(), baseline: armVerdict, candidate: armVerdict, preference: z.enum(['baseline', 'candidate', 'tie']) }).strict();
export function compatibleReviewWorkspace(value: unknown, record: ProtocolRecord): value is ReviewWorkspace {
  const checked = workspaceEnvelope.safeParse(value); if (!checked.success || !sameReviewValue(checked.data, value)) return false;
  const w = value as ReviewWorkspace, b = w.basis, e = w.evidence, p = record.protocol;
  if (!compatibleProtocolRecord(e.protocol, record.protocolId) || !sameReviewValue(e.protocol.protocol, p) || e.protocol.protocolDigest !== record.protocolDigest
    || e.protocol.state !== 'registered' || record.state !== 'registered' || !compatibleCohortReceipt(e.cohort, record)
    || b.protocolId !== record.protocolId || b.protocolDigest !== record.protocolDigest || b.merchantId !== p.merchantId
    || b.candidateId !== p.candidate.id || b.artifactDigest !== p.candidate.artifactDigest || b.sourceDigest !== p.candidate.sourceDigest || b.sectorDigest !== p.sector.digest
    || b.cohortId !== e.cohort.cohortId || b.cohortDigest !== e.cohort.cohortDigest || b.rubricDigest !== supportedOutputRubricDigest
    || w.canReview !== !b.participantUserIds.includes(w.reviewerUserId) || p.sampleCalculation?.status !== 'meets_calculated_floor'
    || Date.parse(w.checkedAt) < Date.parse(e.cohort.snapshot.frozenAt) || Date.parse(w.checkedAt) >= Date.parse(p.design.window.enrollmentStartsAt)) return false;
  const r = e.outputReview, cases = z.array(outputJudgment).length(32).safeParse(r?.cases);
  if (!cases.success || !sameReviewValue(cases.data, r.cases) || r.kind !== 'human_paired_output_review' || r.activationAllowed !== false
    || r.runId !== b.runId || r.runDigest !== b.runDigest || r.revision !== b.outputReviewRevision || r.reviewedAllOutputs !== true
    || r.rubric?.version !== 'sales-style-output-human-review.v1' || r.score?.outcome !== 'passed'
    || new Set(cases.data.map(item => item.caseId)).size !== 32 || new Set(e.pairs.map(pair => pair?.caseId)).size !== 32) return false;
  for (const row of cases.data) {
    const pair = e.pairs.find(pair => pair?.caseId === row.caseId);
    if (!outputCaseIds.includes(row.caseId) || !pair || row.candidate.verdict !== 'pass' || row.preference === 'baseline' || row.baseline.verdict === 'fail' && row.preference !== 'candidate'
      || pair.sector !== row.caseId.split(':')[0] || [pair.criterion, pair.systemPrompt, pair.userPrompt, pair.candidateStyleInstruction].some(text => typeof text !== 'string')
      || (['baseline', 'candidate'] as const).some(arm => pair[arm]?.caseId !== row.caseId || pair[arm]?.arm !== arm || typeof pair[arm]?.response !== 'string'
        || !pair[arm].response.trim() || pair[arm].response.length > 16000 || !pair[arm].response.includes(row[arm].quote)
        || pair[arm].metadata?.finishReason !== 'stop' || pair[arm].metadata?.model !== b.observedModel)) return false;
  }
  if (!cases.data.some(row => row.preference === 'candidate')) return false;
  const candidateWins = cases.data.filter(row => row.preference === 'candidate').length;
  if (!sameReviewValue(r.score, { outcome: 'passed', totalCases: 32, baselinePassed: cases.data.filter(row => row.baseline.verdict === 'pass').length,
    candidatePassed: 32, regressions: 0, candidateWins, baselineWins: 0, ties: 32 - candidateWins })) return false;
  if (w.latestReview && (!compatiblePlanningReceipt(w.latestReview, record) || w.expectedRevision !== w.latestReview.snapshot.revision)) return false;
  const current = !!w.latestReview && w.latestReview.reviewerPresent && w.latestReview.snapshot.basisDigest === w.basisDigest;
  if (current && !sameReviewValue(w.latestReview!.snapshot.basis, b)) return false;
  return (w.latestReview !== null || w.expectedRevision === 0) && w.planningReviewCurrent === (current && w.latestReview!.snapshot.verdict === 'approved')
    && w.stage === (!w.latestReview ? 'not_reviewed' : !current ? 'review_stale' : w.latestReview.snapshot.verdict);
}
const historySchema = z.object({ items: z.array(reviewReceiptSchema).max(20), nextBeforeId: id.nullable(), activationAllowed: z.literal(false) }).strict();
export type PlanningReviewHistory = z.infer<typeof historySchema>;
export function compatiblePlanningHistory(value: unknown, record: ProtocolRecord, beforeId?: number): value is PlanningReviewHistory {
  const result = historySchema.safeParse(value); if (!result.success || !sameReviewValue(result.data, value)) return false;
  const { items, nextBeforeId } = result.data;
  return items.every((row, index) => compatiblePlanningReceipt(row, record) && (!beforeId || row.reviewId < beforeId)
    && (!index || row.reviewId < items[index - 1].reviewId && row.snapshot.revision < items[index - 1].snapshot.revision))
    && (nextBeforeId === null || items.length === 20 && nextBeforeId === items.at(-1)!.reviewId);
}
