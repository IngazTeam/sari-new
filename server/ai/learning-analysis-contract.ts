import { createHash } from 'node:crypto';
import { z } from 'zod';

export const learningDimensions = ['greeting_style', 'objection_handling', 'closing_technique', 'tone_preference',
  'product_emphasis', 'upsell_timing', 'knowledge_gaps', 'pain_points', 'winning_patterns', 'losing_patterns'] as const;
const id = z.number().int().positive().safe();
const references = z.array(id).max(200);
const update = z.object({ dimension: z.enum(learningDimensions), insight: z.string().trim().min(1).max(500),
  confidence: z.number().min(0.5).max(0.99), evidence: z.string().max(1000).optional(),
  supporting_signal_ids: references, contrary_signal_ids: references }).strict();
export const learningAnalysisSchema = z.object({
  updates: z.array(update).max(10), knowledge_gaps: z.array(z.string().trim().min(1).max(200)).max(10),
  merchant_alerts: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
  no_pattern_reason: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((value, context) => {
  if (!value.updates.length && !value.knowledge_gaps.length && !value.no_pattern_reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'An empty analysis needs an explicit no-pattern reason' });
  }
});
export type LearningAnalysis = z.infer<typeof learningAnalysisSchema>;

/** References are descriptive evidence, never permission to activate a policy. */
export function learningEvidenceIds(observed: number[], supportingValue: unknown = [], contraryValue: unknown = []) {
  const observedIds = references.min(1).parse(observed);
  if (new Set(observedIds).size !== observedIds.length) throw Error('Duplicate learning evidence');
  const supporting = references.parse(supportingValue), contrary = references.parse(contraryValue);
  if ([...supporting, ...contrary].some(value => !observedIds.includes(value))) throw Error('Learning evidence outside analysis batch');
  if (supporting.some(value => contrary.includes(value))) throw Error('Conflicting evidence classification');
  return { observed: observedIds, supporting: Array.from(new Set(supporting)), contrary: Array.from(new Set(contrary)) };
}

export function parseLearningAnalysis(response: string, observedIds: number[]): LearningAnalysis {
  if (typeof response !== 'string' || response.length > 32_000) throw Error('Learning analysis response too large');
  // Permit one conventional JSON fence; never extract an object from surrounding instructions or prose.
  const text = response.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  const result = learningAnalysisSchema.parse(JSON.parse(text));
  learningEvidenceIds(observedIds);
  for (const item of result.updates) learningEvidenceIds(observedIds, item.supporting_signal_ids, item.contrary_signal_ids);
  const identities = result.updates.map(item => `${item.dimension}:${sanitizeLearningText(item.insight).trim()}`);
  if (result.knowledge_gaps.length) identities.push(`knowledge_gaps:${result.knowledge_gaps.map(text=>sanitizeLearningText(text).trim()).join('\n• ')}`);
  if (new Set(identities).size !== identities.length) throw Error('Duplicate learning proposal');
  return result;
}

const signal = z.object({ id, merchantId: id, conversationId: id, signalType: z.string().min(1).max(30),
  signalWeight: z.number().finite().nullable(), botMessage: z.string().nullable(), customerMessage: z.string().nullable(),
  merchantCorrection: z.string().nullable(), contextSummary: z.string().nullable(), sourceKey: z.string().nullable(),
  createdAt: z.string().datetime() }).strict();
export type LearningAnalysisSignal = z.infer<typeof signal>;
export type LearningAnalysisSnapshot = { merchantId: number; signals: LearningAnalysisSignal[]; digest: string };

/** Capture the source before the model await, including fields omitted from the prompt preview. */
export function snapshotLearningSignals(merchantId: number, rows: readonly unknown[]): LearningAnalysisSnapshot {
  id.parse(merchantId);
  const signals = rows.map(row => {
    if (!row || typeof row !== 'object') throw Error('Invalid learning source');
    const value = row as Record<string, unknown>;
    const result = signal.parse({ id: value.id, merchantId: value.merchantId ?? value.merchant_id,
      conversationId: value.conversationId ?? value.conversation_id, signalType: value.signalType ?? value.signal_type,
      signalWeight: (value.signalWeight ?? value.signal_weight) == null ? null : Number(value.signalWeight ?? value.signal_weight),
      botMessage: value.botMessage ?? value.bot_message ?? null, customerMessage: value.customerMessage ?? value.customer_message ?? null,
      merchantCorrection: value.merchantCorrection ?? value.merchant_correction ?? null,
      contextSummary: value.contextSummary ?? value.context_summary ?? null, sourceKey: value.sourceKey ?? value.source_key ?? null,
      createdAt: new Date((value.createdAt ?? value.created_at) as string | Date).toISOString() });
    if (result.merchantId !== merchantId) throw Error('Learning source tenant mismatch');
    return result;
  }).sort((a, b) => a.id - b.id);
  learningEvidenceIds(signals.map(row => row.id));
  return { merchantId, signals, digest: createHash('sha256').update(JSON.stringify(signals)).digest('hex') };
}

/** Defense in depth for review text; policy activation is separately forbidden. */
export function sanitizeLearningText(text: string): string {
  if (!text) return '';
  return text
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .substring(0, 500);
}
