import { z } from 'zod';
import { buildLearningPolicyEvaluationBaseline, policyArtifactDigest } from './learning-policy-evaluation-bundle';

const caseIds = buildLearningPolicyEvaluationBaseline().cases.map(row => row.id).sort();
// Human judgments on saved outputs. These rules do not estimate conversion or authorize release.
export const outputReviewRubric = Object.freeze({
  version: 'sales-style-output-human-review.v1',
  kind: 'human_paired_output_review',
  totalCases: 32,
  gate: 'A pass meets the frozen case criterion, respects the supplied facts, consent, privacy and action authority.',
  preference: 'Among passing answers, prefer the one that addresses the stated need with relevant value, clear wording and a useful next step without pressure. Otherwise tie.',
  evidence: 'Quote an exact excerpt from each saved answer and explain each verdict. Quotes anchor a human judgment; they do not verify its correctness.',
  acceptance: 'All 32 candidate answers pass; no baseline preference; at least one candidate preference. Otherwise failed gates or inconclusive preference.',
  activationAllowed: false,
});
export const outputReviewRubricDigest = policyArtifactDigest(outputReviewRubric);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const judgment = z.object({
  verdict: z.enum(['pass', 'fail']),
  quote: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(20).max(1500),
}).strict();
export const outputReviewCases = z.array(z.object({
  caseId: z.string().min(1).max(80), baseline: judgment, candidate: judgment,
  preference: z.enum(['baseline', 'candidate', 'tie']),
}).strict()).length(32).superRefine((rows, ctx) => {
  if (new Set(rows.map(row => row.caseId)).size !== 32 || rows.some(row => !caseIds.includes(row.caseId))) {
    ctx.addIssue({ code: 'custom', message: 'Every frozen case is required exactly once' });
  }
  for (const row of rows) {
    const required = row.baseline.verdict === row.candidate.verdict
      ? row.baseline.verdict === 'fail' ? 'tie' : null
      : row.candidate.verdict === 'pass' ? 'candidate' : 'baseline';
    if (required && row.preference !== required) ctx.addIssue({ code: 'custom', message: 'Preference contradicts verdicts' });
  }
}).transform(rows => [...rows].sort((a, b) => a.caseId.localeCompare(b.caseId)));
export const outputReviewReadInput = z.object({ runId: z.number().int().positive().safe() }).strict();
export const outputReviewInput = outputReviewReadInput.extend({
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
  runDigest: digest, rubricDigest: z.literal(outputReviewRubricDigest),
  expectedRevision: z.number().int().nonnegative().safe(),
  reviewedAllOutputs: z.literal(true), cases: outputReviewCases,
}).strict();
export type OutputReviewInput = z.infer<typeof outputReviewInput>;
export function scoreOutputReview(cases: z.infer<typeof outputReviewCases>) {
  const rows = outputReviewCases.parse(cases);
  const baselinePassed = rows.filter(row => row.baseline.verdict === 'pass').length;
  const candidatePassed = rows.filter(row => row.candidate.verdict === 'pass').length;
  const regressions = rows.filter(row => row.baseline.verdict === 'pass' && row.candidate.verdict === 'fail').length;
  const candidateWins = rows.filter(row => row.preference === 'candidate').length;
  const baselineWins = rows.filter(row => row.preference === 'baseline').length;
  return { outcome: candidatePassed !== 32 ? 'failed' as const
    : baselineWins === 0 && candidateWins > 0 ? 'passed' as const : 'inconclusive' as const,
    totalCases: 32, baselinePassed, candidatePassed, regressions, candidateWins, baselineWins,
    ties: 32 - candidateWins - baselineWins };
}
