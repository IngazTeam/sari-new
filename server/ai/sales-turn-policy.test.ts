import { expect, it } from 'vitest';
import { decideSalesTurnGoal } from './sales-turn-policy';
it('refusal overrides stale readiness and enthusiastic sales hints', () => {
  expect(decideSalesTurnGoal({ intent: 'ready_to_buy', customerMessage: 'لا أريد الشراء' })).toBe('respect_decline');
});
it('does not turn yes to a request for details into purchase consent', () => {
  expect(decideSalesTurnGoal({ intent: 'ready_to_buy', customerMessage: 'نعم', lastAssistantMessage: 'هل تريد معرفة التفاصيل؟' })).toBe('explain_requested_information');
  expect(decideSalesTurnGoal({ intent: 'ready_to_buy', customerMessage: 'نعم' })).toBe('explain_requested_information');
});
it('serves the existing order before attempting another close', () => {
  expect(decideSalesTurnGoal({ intent: 'post_purchase', customerMessage: 'دفعت أين طلبي؟' })).toBe('resolve_existing_order');
});
it.each([
  ['hesitating', 'understand_objection'], ['comparing', 'compare_suitable_options'],
  ['ready_to_buy', 'confirm_agreement'], ['inquiring', 'answer_then_qualify'], ['browsing', 'answer_then_qualify'],
] as const)('selects %s objective without granting an operational permission', (intent, goal) => {
  expect(decideSalesTurnGoal({ intent, customerMessage: 'أريد تفاصيل أكثر عن العرض' })).toBe(goal);
});
