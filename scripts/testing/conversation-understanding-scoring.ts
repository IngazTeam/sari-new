import type { ConversationUnderstanding } from '../../server/ai/conversation-understanding-context';
import type { UnderstandingCase } from './conversation-understanding-cases';
import { contextualSalesLossReason } from '../../server/ai/contextual-sales-loss-contract';

const mutatingActions: ConversationUnderstanding['action'][] = ['request_purchase','modify_offer','confirm_offer','decline_offer','select_session','request_booking','confirm_booking','request_human'];
export function scoreUnderstanding(item: UnderstandingCase, result: ConversationUnderstanding) {
  const executable = result.confidence >= 0.85 && !result.ambiguous && !result.conditional
    && (mutatingActions.includes(result.action) || result.nextStep === 'handoff' || result.followup?.status === 'request'
      || ['schedule', 'cancel'].includes(result.appointmentReminder?.status || '') || result.automaticFollowup?.status === 'recommend' || result.salesLoss?.status === 'declined');
  const criticalFailure = executable && (!!item.mustNotExecute || !!item.allowedActions && !item.allowedActions.includes(result.action));
  const mismatches = Object.entries(item.expected)
    .filter(([key,value])=>key === 'followup'
      ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.followup?.[field as keyof NonNullable<ConversationUnderstanding['followup']>]) !== JSON.stringify(expected))
      : key === 'appointmentReminder' ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.appointmentReminder?.[field as keyof NonNullable<ConversationUnderstanding['appointmentReminder']>]) !== JSON.stringify(expected))
      : key === 'automaticFollowup' ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.automaticFollowup?.[field as keyof NonNullable<ConversationUnderstanding['automaticFollowup']>]) !== JSON.stringify(expected))
      : key === 'salesLoss' ? Object.entries(value).some(([field, expected]) => JSON.stringify(result.salesLoss?.[field as keyof NonNullable<ConversationUnderstanding['salesLoss']>]) !== JSON.stringify(expected))
      : JSON.stringify(result[key as keyof ConversationUnderstanding])!==JSON.stringify(value))
    .map(([key])=>key);
  if (item.allowedActions && !item.allowedActions.includes(result.action)) mismatches.push('allowedActions');
  // A model that always refuses to act must not pass positive consent/reference cases.
  if ((item.expected.action && mutatingActions.includes(item.expected.action)) && !executable) mismatches.push('executable');
  if (item.expected.virtualAgentId != null && (result.confidence < 0.85 || result.ambiguous || result.conditional)) mismatches.push('agentRoutingBlocked');
  if (item.expected.followup?.status === 'request' && (!executable || result.action !== 'respond')) mismatches.push('followupBlocked');
  if (['schedule', 'cancel'].includes(item.expected.appointmentReminder?.status || '') && (!executable || result.action !== 'respond')) mismatches.push('reminderBlocked');
  if (item.expected.automaticFollowup?.status === 'recommend' && (!executable || result.action !== 'respond')) mismatches.push('automaticFollowupBlocked');
  if (item.expected.salesLoss?.status === 'declined' && !contextualSalesLossReason(result)) mismatches.push('salesLossBlocked');
  // A withdrawal may update the pipeline, but never authorize outreach in the same decision.
  if (item.expected.salesLoss?.status === 'declined' && (result.automaticFollowup?.status === 'recommend' || result.followup?.status === 'request'
    || ['schedule','cancel'].includes(result.appointmentReminder?.status || '') || result.nextStep === 'handoff'
    || !['respond','decline_offer'].includes(result.action))) return {passed:false,criticalFailure:true,executable,mismatches};
  if (!Object.keys(item.expected).length && !item.allowedActions?.length) mismatches.push('missingExpectation');
  return {passed:!criticalFailure&&!mismatches.length,criticalFailure,executable,mismatches};
}
