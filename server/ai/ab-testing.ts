/** Legacy quick-response observations. These are not a sales experiment. */
import { createHash } from 'node:crypto';
import { getConversationById, getQuickResponses } from '../db';
import { getABTestById, getActiveABTestForKeyword, trackABTestUsage } from '../db/ab-tests';
import { abIdentity, abCreateInput } from './legacy-ab-contract';

/** Stable per merchant/test/customer, including when a customer starts a new chat.
 * A conversation owned by the merchant is required; callers cannot supply an arm
 * or another customer's arbitrary allocation key. This does not log exposure.
 */
export async function selectABTestVariant(merchantId: number, keyword: string, conversationId?: number) {
  const merchant = abIdentity.parse(merchantId), key = abCreateInput.shape.keyword.parse(keyword);
  if (conversationId === undefined) return null;
  const conversation = await getConversationById(abIdentity.parse(conversationId));
  if (!conversation || conversation.merchantId !== merchant) return null;
  const phone = conversation.customerPhone.replace(/^\+/, '');
  if (!/^[1-9]\d{7,14}$/.test(phone)) return null;
  const test = await getActiveABTestForKeyword(merchant, key);
  if (!test || test.merchantId !== merchant || test.status !== 'running') return null;
  const bucket = createHash('sha256').update(JSON.stringify(['legacy-ab-customer.v1', merchant, test.id, phone])).digest()[0];
  const variant = bucket < 128 ? 'A' as const : 'B' as const;
  return { variant, text: variant === 'A' ? test.variantAText : test.variantBText, testId: test.id };
}

/** Raw observations only. Repeated calls are not unique customer conversions. */
export async function recordABTestResult(testId: number, variant: 'A' | 'B', wasSuccessful: boolean, merchantId: number) {
  await trackABTestUsage(testId, variant, wasSuccessful, merchantId);
}

export async function analyzeABTest(testId: number, merchantId: number) {
  const test = await getABTestById(abIdentity.parse(testId), abIdentity.parse(merchantId));
  if (!test) throw new Error('Legacy A/B test state is unavailable');
  const arm = (total: number, success: number) => {
    const valid = Number.isSafeInteger(total) && Number.isSafeInteger(success) && total >= 0 && success >= 0 && success <= total;
    return { total, success, successRate: valid && total > 0 ? success / total * 100 : null, valid };
  };
  return { winner: 'no_winner' as const, confidence: 0, statisticalConfidence: null,
    evidenceKind: 'legacy_unverified_observations' as const, activationAllowed: false as const,
    stats: { variantA: arm(test.variantAUsageCount, test.variantASuccessCount),
      variantB: arm(test.variantBUsageCount, test.variantBSuccessCount) } };
}

/** Historical/manual selections cannot bypass the reviewed policy release gate.
 * In particular, `no_winner` used to fall through to variant B and create an
 * active response on every invocation. Keep the compatibility entry point inert.
 */
export async function applyWinningVariant(_testId: number): Promise<number | null> { return null; }

/** Sentiment, thanks, silence and message count cannot verify a purchase. */
export function isConversationSuccessful(_messages: Array<{ sender: string; text: string }>, _sentiment?: string): boolean { return false; }

export async function suggestABTests(merchantId: number) {
  const responses = await getQuickResponses(abIdentity.parse(merchantId));
  return responses.filter(r => r.useCount > 10).sort((a, b) => b.useCount - a.useCount).slice(0, 5).map(response => ({
    keyword: response.trigger || response.keywords || '', currentResponse: response.response,
    suggestedVariant: `${response.response} 😊`, reason: 'إضافة emoji قد يزيد من ودية الرد',
  }));
}
