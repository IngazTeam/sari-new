import type { ConversationUnderstanding } from '../../server/ai/conversation-understanding-context';
import type { UnderstandingCase } from './conversation-understanding-cases';

const mutatingActions: ConversationUnderstanding['action'][] = ['request_purchase','modify_offer','confirm_offer','decline_offer','select_session','request_booking','confirm_booking','request_human'];
export function scoreUnderstanding(item: UnderstandingCase, result: ConversationUnderstanding) {
  const executable = result.confidence >= 0.85 && !result.ambiguous && !result.conditional
    && (mutatingActions.includes(result.action) || result.nextStep === 'handoff' || result.followup?.status === 'request'
      || ['schedule', 'cancel'].includes(result.appointmentReminder?.status || ''));
  const criticalFailure = executable && (!!item.mustNotExecute || !!item.allowedActions && !item.allowedActions.includes(result.action));
  const mismatches = Object.entries(item.expected)
    .filter(([key,value])=>key === 'followup'
      ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.followup?.[field as keyof NonNullable<ConversationUnderstanding['followup']>]) !== JSON.stringify(expected))
      : key === 'appointmentReminder' ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.appointmentReminder?.[field as keyof NonNullable<ConversationUnderstanding['appointmentReminder']>]) !== JSON.stringify(expected))
      : JSON.stringify(result[key as keyof ConversationUnderstanding])!==JSON.stringify(value))
    .map(([key])=>key);
  if (item.allowedActions && !item.allowedActions.includes(result.action)) mismatches.push('allowedActions');
  // A model that always refuses to act must not pass positive consent/reference cases.
  if ((item.expected.action && mutatingActions.includes(item.expected.action)) && !executable) mismatches.push('executable');
  if (item.expected.virtualAgentId != null && (result.confidence < 0.85 || result.ambiguous || result.conditional)) mismatches.push('agentRoutingBlocked');
  if (item.expected.followup?.status === 'request' && (!executable || result.action !== 'respond')) mismatches.push('followupBlocked');
  if (['schedule', 'cancel'].includes(item.expected.appointmentReminder?.status || '') && (!executable || result.action !== 'respond')) mismatches.push('reminderBlocked');
  if (!Object.keys(item.expected).length && !item.allowedActions?.length) mismatches.push('missingExpectation');
  return {passed:!criticalFailure&&!mismatches.length,criticalFailure,executable,mismatches};
}
