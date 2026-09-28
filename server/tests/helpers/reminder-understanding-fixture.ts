import type { UnderstandingInput } from '../../ai/conversation-understanding';
import type { ConversationUnderstanding } from '../../ai/conversation-understanding-context';
import { followupUnderstandingFixture } from './followup-understanding-fixture';

/** Synthetic structured provider result: deliberately does not classify words. */
export function reminderUnderstandingFixture(input: UnderstandingInput, appointmentId: number | null,
  status: NonNullable<ConversationUnderstanding['appointmentReminder']>['status'] = 'schedule', hours: 1 | 24 | null = 1) {
  const result = followupUnderstandingFixture(input, {}, { intent: 'post_purchase' });
  delete result.followup;
  result.appointmentReminder = { status, appointmentId, hoursBefore: hours,
    evidence: input.messages.slice(-5).map(m => ({ messageId: m.id, excerpt: m.content.slice(0, 500) })) };
  return result;
}
