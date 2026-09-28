import type { UnderstandingInput } from '../../ai/conversation-understanding';
import type { ConversationUnderstanding } from '../../ai/conversation-understanding-context';
import { followupUnderstandingFixture } from './followup-understanding-fixture';
/** Explicit synthetic provider output, not a language classifier. */
export function automaticFollowupFixture(input: UnderstandingInput, changes: Partial<ConversationUnderstanding> = {}) {
  const result = followupUnderstandingFixture(input);
  delete result.followup;
  return { ...result, intent: 'hesitating' as const, objection: 'price' as const,
    summary: 'العميل يقارن الخيارات حسب ميزانيته، ويمكن متابعة النقاط التي لم يحسمها.',
    automaticFollowup: { status: 'recommend' as const, purpose: 'price' as const, delayHours: 1, evidence: result.evidence }, ...changes };
}
