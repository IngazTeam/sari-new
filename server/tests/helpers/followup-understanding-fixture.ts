import type { ConversationUnderstanding } from '../../ai/conversation-understanding-context';
import type { UnderstandingInput } from '../../ai/conversation-understanding';

/** Synthetic provider response for plumbing tests; never a language-classification oracle. */
export function followupUnderstandingFixture(input: UnderstandingInput,
  followup: Partial<NonNullable<ConversationUnderstanding['followup']>> = {},
  changes: Partial<ConversationUnderstanding> = {}): ConversationUnderstanding {
  const current = input.messages.find(m => m.id === input.currentMessageId)!;
  const evidence = [{ messageId: current.id, excerpt: current.content.slice(0, 500) }];
  return { version: 1, intent: 'inquiring', goal: 'explain_requested_information', action: 'respond', confidence: 0.97,
    conditional: false, ambiguous: false, targetQuoteId: null, targetProvider: 'none', productIds: [], sessionIndex: null,
    requestKind: 'ordinary', sentiment: 'neutral', topicChanged: false, objection: 'timing', needs: ['وقت مناسب للمتابعة'],
    unresolvedQuestions: [], summary: 'موافقة حالية على متابعة واحدة بالموعد المشار إليه في الحوار.', nextStep: 'answer', evidence,
    followup: { status: 'request', localDate: '2026-09-24', localTime: '17:00', timeZone: input.followupClock?.timeZone || null,
      sourceCreatedAt: input.followupClock?.sourceCreatedAt || null, evidence, ...followup }, ...changes };
}
