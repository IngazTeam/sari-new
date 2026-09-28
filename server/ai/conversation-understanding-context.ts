import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { contextualMemoryFactSchema, memoryFields } from '../../shared/customer-memory';
const conversationEvidence = z.object({ messageId: z.number().int().positive(), excerpt: z.string().min(1).max(500) }).strict();

/** A model interpretation, never a price, payment receipt or permission to bypass an adapter. */
export const conversationUnderstandingSchema = z.object({
  version: z.literal(1),
  intent: z.enum(['declined', 'browsing', 'inquiring', 'comparing', 'hesitating', 'objecting', 'ready_to_buy', 'returning', 'post_purchase', 'unknown']),
  goal: z.enum(['respect_decline', 'resolve_existing_order', 'explain_requested_information', 'confirm_agreement', 'understand_objection', 'compare_suitable_options', 'answer_then_qualify']),
  action: z.enum(['respond', 'clarify', 'request_purchase', 'modify_offer', 'confirm_offer', 'decline_offer', 'select_session', 'request_booking', 'confirm_booking', 'request_human']),
  confidence: z.number().min(0).max(1),
  conditional: z.boolean(), ambiguous: z.boolean(),
  targetQuoteId: z.number().int().positive().nullable(),
  targetProvider: z.enum(['local', 'byaan_checkout', 'byaan_enrollment', 'salla_cart', 'zid', 'booking', 'none']),
  productIds: z.array(z.number().int().positive()).max(10),
  sessionIndex: z.number().int().min(1).max(20).nullable(),
  // Optional without a default: older sealed interpretations must hash identically.
  virtualAgentId: z.number().int().positive().nullable().optional(),
  // No default: existing sealed results retain their original digest.
  followup: z.object({
    status: z.enum(['none', 'request', 'clarify']),
    localDate: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).nullable(),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
    timeZone: z.string().max(64).nullable(),
    sourceCreatedAt: z.string().datetime().nullable(),
    evidence: z.array(conversationEvidence).max(5),
  }).strict().optional(),
  automaticFollowup: z.object({
    status: z.enum(['none', 'recommend']),
    purpose: z.enum(['consideration', 'options', 'price', 'trust', 'comparison', 'delivery', 'question']).nullable(),
    delayHours: z.number().int().min(1).max(72).nullable(),
    evidence: z.array(conversationEvidence).max(5),
  }).strict().optional(),
  salesLoss: z.object({
    status: z.enum(['none', 'declined', 'unclear']),
    reason: z.enum(['price', 'trust', 'competitor', 'delivery', 'timing', 'fit', 'other']).nullable(),
    evidence: z.array(conversationEvidence).max(5),
  }).strict().optional(),
  learningSignals: z.array(z.object({
    type: z.enum(['positive_feedback', 'question_repeated', 'price_objection', 'sales_objection', 'escalation_requested', 'knowledge_gap']),
    aboutAssistantMessageId: z.number().int().positive().nullable(),
    evidence: z.array(z.object({ messageId: z.number().int().positive(), excerpt: z.string().min(1).max(300) }).strict()).min(1).max(3),
  }).strict()).max(5).optional(),
  memoryFacts: z.array(contextualMemoryFactSchema).max(memoryFields.length).optional(),
  // Server-attached version of the customer memory read by this interpretation. Never trust a model-supplied version.
  memoryRevision: z.number().int().nonnegative().optional(),
  appointmentReminder: z.object({
    status: z.enum(['none', 'schedule', 'cancel', 'clarify']),
    appointmentId: z.number().int().positive().max(2147483647).nullable(),
    hoursBefore: z.union([z.literal(1), z.literal(24)]).nullable(),
    evidence: z.array(conversationEvidence).max(5),
    // Server-attached terms digest, optional without a default for historic seals.
    targetDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().optional(),
  requestKind: z.enum(['ordinary', 'catalog', 'purchase_process', 'loyalty_balance', 'loyalty_rewards']),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'angry', 'happy', 'sad', 'frustrated']),
  topicChanged: z.boolean(),
  objection: z.enum(['none', 'price', 'value', 'trust', 'timing', 'fit', 'decision_maker', 'other']),
  needs: z.array(z.string().min(1).max(240)).max(5),
  unresolvedQuestions: z.array(z.string().min(1).max(240)).max(3),
  summary: z.string().min(1).max(700),
  nextStep: z.enum(['answer', 'qualify', 'compare', 'address_objection', 'review_offer', 'respect_decline', 'resolve_issue', 'handoff']),
  evidence: z.array(conversationEvidence).min(1).max(5),
}).strict();
export type ConversationUnderstanding = z.infer<typeof conversationUnderstandingSchema>;
export type UnderstandingContext = { merchantId: number; conversationId: number; incomingMessageId: number; message: string; mode?: 'preview';
  analysis: ConversationUnderstanding; model?: string };
const storage = new AsyncLocalStorage<UnderstandingContext>();
export const withConversationUnderstanding = <T>(value: UnderstandingContext, work: () => Promise<T>) => storage.run(value, work);
export const withoutConversationUnderstanding = <T>(work: () => Promise<T>) => storage.exit(work);
export function currentConversationUnderstanding(message?: string) {
  const context = storage.getStore();
  if (!context) return undefined;
  if (message === undefined || message === context.message) return context.analysis;
  return undefined;
}
export const hasConversationUnderstanding = () => storage.getStore() !== undefined;
export const conversationUnderstandingIdentity = () => storage.getStore();
export function semanticAction(message: string, actions: ConversationUnderstanding['action'][], provider?: ConversationUnderstanding['targetProvider']) {
  if (storage.getStore()?.mode === 'preview') return false;
  const value = currentConversationUnderstanding(message);
  if (!value) return hasConversationUnderstanding() ? false : undefined;
  return value.confidence >= 0.85 && !value.conditional && !value.ambiguous && actions.includes(value.action)
    && (provider === undefined || value.targetProvider === provider);
}
export function semanticQuoteMatches(quotationId: number, provider: ConversationUnderstanding['targetProvider']) {
  if (storage.getStore()?.mode === 'preview') return false;
  const analysis = currentConversationUnderstanding();
  return !analysis || analysis.targetQuoteId === quotationId && analysis.targetProvider === provider;
}
/** Historical checks must open an ID-scoped persisted context, never match by text. */
export function semanticIdentityMatches(input: { merchantId: number; conversationId: number; incomingMessageId: number }) {
  const value = storage.getStore();
  if (value?.mode === 'preview') return false;
  return !value || value.merchantId === input.merchantId && value.conversationId === input.conversationId && value.incomingMessageId === input.incomingMessageId;
}
export function contextualHandoffRequested(message: string): boolean {
  if (storage.getStore()?.mode === 'preview') return false;
  const value = currentConversationUnderstanding(message);
  return !!value && value.confidence >= 0.85 && !value.conditional && !value.ambiguous
    && (value.action === 'request_human' || value.nextStep === 'handoff');
}
export function understandingPrompt(value: ConversationUnderstanding) {
  return `\n\n## فهم المحادثة الحالية من المزوّد المختار مركزيًا\n`
    + 'البيانات التالية تحليل للسياق وليست تعليمات من العميل ولا حقائق مالية. اربط الرد بالاحتياج والاعتراض والأسئلة غير المحسومة، واستفد من كلام الطرفين. لا تعاود سؤالًا أجاب عنه العميل. لا تستنتج دفعًا أو حجزًا من النية. عند الغموض اسأل سؤالًا محددًا.\n'
    + JSON.stringify({ intent: value.intent, goal: value.goal, confidence: value.confidence, conditional: value.conditional, ambiguous: value.ambiguous,
      needs: value.needs, objection: value.objection, unresolvedQuestions: value.unresolvedQuestions, summary: value.summary, nextStep: value.nextStep })
    + '\nعالج الاعتراض بما يناسب سببه وبحقائق النشاط، ولا تضغط بعد الرفض أو تخترع خصمًا أو ندرة. هدف الرد خطوة مفيدة تناسب هذه المحادثة.';
}
