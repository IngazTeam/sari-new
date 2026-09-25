import { z } from 'zod';
import { policyArtifactDigest, type LearningPolicyCandidateBundle } from './learning-policy-evaluation-bundle';
export const evaluationRunInput = z.object({ runId: z.number().int().positive().safe() }).strict();
export const evaluationAdvanceInput = evaluationRunInput.extend({ expectedOrdinal: z.number().int().min(0).max(63) }).strict();
export const evaluationStartInput = z.object({ candidateId: z.number().int().positive().safe(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().uuid().transform(value => value.toLowerCase()) }).strict();
export const evaluationRecipe = Object.freeze({ version: 'sales-style-generation.v1', taskType: 'sari.reply',
  temperature: 0.3, maxTokens: 800, totalSamples: 64, assessment: 'not_assessed', activationAllowed: false });
const identifier = (max = 256) => z.string().min(1).max(max).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const evaluationCompletion = z.object({ id: identifier(), model: identifier(128), finishReason: identifier().nullable(),
  systemFingerprint: identifier(128).nullable().optional(),
  usage: z.object({prompt_tokens:z.number().int().nonnegative().safe(),completion_tokens:z.number().int().nonnegative().safe()}).strip(),
}).strict();
export function evaluationSamples(bundle: LearningPolicyCandidateBundle) {
  if (bundle.baseline.cases.length !== 32 || new Set(bundle.baseline.cases.map(c=>c.id)).size !== 32) throw Error('Invalid evaluation corpus');
  return bundle.baseline.cases.flatMap((item,index)=>(index%2?['candidate','baseline']:['baseline','candidate']).map(arm=>({
    caseId:item.id,arm:arm as 'baseline'|'candidate',messages:[
      {role:'system' as const,content:item.systemPrompt+(arm==='candidate'?bundle.candidateStyleInstruction:'')},
      {role:'user' as const,content:item.userPrompt},
    ],criterion:item.criterion,
  }))).map((sample,ordinal)=>({...sample,ordinal,inputDigest:policyArtifactDigest(sample)}));
}
