import { z } from 'zod';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
export const salesTurnIntent = z.enum(['declined', 'browsing', 'inquiring', 'comparing', 'hesitating', 'objecting', 'ready_to_buy', 'returning', 'post_purchase', 'unknown']);
// Internal prompt fragment BEFORE the shared sales policy. Never accepted by a public route.
const basePrompt = z.string().min(1).max(128000).refine(value => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 256000);
export const prepareSalesExperimentTurnInput = z.object({ assignmentId: id, assignmentDigest: digest, conversationId: id, incomingMessageId: id,
  requestId: z.string().uuid().transform(value => value.toLowerCase()), intent: salesTurnIntent, baseSystemPrompt: basePrompt,
  expectedMessageDigest: digest.optional() }).strict();
export const readSalesExperimentTurnInput = z.object({ turnId: id, turnDigest: digest }).strict();
export const resolveSalesExperimentTurnInput = readSalesExperimentTurnInput.extend({ baseSystemPrompt: basePrompt }).strict();
export const salesExperimentTurnSnapshot = z.object({
  version: z.literal('sales-experiment-turn.v1'), merchantId: id, protocolId: id, assignmentId: id, assignmentDigest: digest,
  launchId: id, launchDigest: digest, arm: z.enum(['baseline', 'candidate']), artifactDigest: digest, baselineDigest: digest, sectorDigest: digest, routeDigest: digest,
  conversationId: id, incomingMessageId: id, messageDigest: digest, sourceDigest: digest, handoffVersion: z.number().int().nonnegative().safe(),
  requestedIntent: salesTurnIntent, effectiveIntent: salesTurnIntent,
  goal: z.enum(['respect_decline', 'resolve_existing_order', 'explain_requested_information', 'confirm_agreement', 'understand_objection', 'compare_suitable_options', 'answer_then_qualify']),
  styleApplied: z.boolean(), styleReason: z.enum(['candidate_style', 'baseline_arm', 'customer_declined', 'existing_order']),
  basePromptDigest: digest, policyText: z.string().min(1).max(20000), policyDigest: digest, promptDigest: digest,
  preparedAt: utc, assignmentAt: utc, observationEndsAt: utc,
  scope: z.literal('policy_preparation_only'), generationAllowed: z.literal(false), dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false),
}).strict().superRefine((s, ctx) => {
  const expectedReason = s.goal === 'respect_decline' ? 'customer_declined' : s.goal === 'resolve_existing_order' ? 'existing_order'
    : s.arm === 'baseline' ? 'baseline_arm' : 'candidate_style';
  if (Date.parse(s.preparedAt) < Date.parse(s.assignmentAt) || Date.parse(s.preparedAt) >= Date.parse(s.observationEndsAt)
    || s.styleReason !== expectedReason
    || s.styleApplied !== (s.styleReason === 'candidate_style')
    || s.styleApplied && (s.arm !== 'candidate' || ['respect_decline', 'resolve_existing_order'].includes(s.goal))
    || s.styleReason === 'customer_declined' && s.goal !== 'respect_decline'
    || s.styleReason === 'existing_order' && s.goal !== 'resolve_existing_order'
    || s.styleReason === 'baseline_arm' && s.arm !== 'baseline') ctx.addIssue({ code: 'custom', message: 'Invalid policy selection or observation window' });
});
export type PrepareSalesExperimentTurnInput = z.infer<typeof prepareSalesExperimentTurnInput>;
