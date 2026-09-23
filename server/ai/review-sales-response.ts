import { critiqueResponse, fixResponse, recordCritique } from './response-critic';
import { validateResponse, recordValidation, fastPreCheck, refusalAcknowledgement, unverifiedDetailsFallback } from './response-validator';
import { isSalesRefusal } from './customer-decision';
import { containsUnverifiedActionClaim, UNVERIFIED_ACTION_FALLBACK } from './transactional-truth';
import type { CustomerIntent } from './session-context';

/** Both generation paths pass through the same gate before transport planning. */
export async function reviewSalesResponse(input: {
  merchantId: number; response: string; customerMessage: string; intent: CustomerIntent;
  conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  productNames: string[]; rejectCorrection?: (correction: string, original: string) => boolean;
}): Promise<string> {
  if (input.intent === 'declined' || isSalesRefusal(input.customerMessage)) return refusalAcknowledgement(input.customerMessage);
  let response = input.response;
  try {
    const critique = await critiqueResponse({ ...input, response });
    let corrected = false;
    if (critique.assessed !== false && !critique.passed && critique.score < 3) {
      const candidate = await fixResponse({ merchantId: input.merchantId, originalResponse: response, critique, customerMessage: input.customerMessage,
        conversationHistory: input.conversationHistory, productNames: input.productNames });
      if (candidate.trim() && candidate !== response && !input.rejectCorrection?.(candidate, response)) { response = candidate; corrected = true; }
    }
    recordCritique(critique, corrected);
  } catch { /* The independent validator still runs, with a closed failure path. */ }
  try {
    const validation = await validateResponse({ response, customerMessage: input.customerMessage, intent: input.intent,
      productNames: input.productNames,
      lastBotMessage: input.conversationHistory.filter(m => m.role === 'assistant').at(-1)?.content });
    recordValidation(validation);
    const critical = validation.violations.some(v => v.severity === 'critical');
    if (!validation.passed && validation.correctedResponse) {
      if (!input.rejectCorrection?.(validation.correctedResponse, response)) response = validation.correctedResponse;
      else if (critical) response = unverifiedDetailsFallback(input.customerMessage);
    } else if (critical) response = unverifiedDetailsFallback(input.customerMessage);
  } catch { response = unverifiedDetailsFallback(input.customerMessage); }
  if (containsUnverifiedActionClaim(response)) return UNVERIFIED_ACTION_FALLBACK;
  if (!response.trim() || fastPreCheck(response, input.customerMessage).some(v => v.severity === 'critical')) {
    return unverifiedDetailsFallback(input.customerMessage);
  }
  return response;
}
