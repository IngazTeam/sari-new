import { expect, it } from 'vitest';
import { decideSalesTurnGoal, buildSalesTurnPolicy } from './sales-turn-policy';
import { getSalesSectorPlaybook, salesSectorPlaybooks, buildSalesSectorGuidance, salesSectorPlaybookSchema } from '../../shared/sales-sector-playbooks';
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
it.each(salesSectorPlaybooks.map(p => [p.id]))('validates and activates %s guidance only for sales turns', sector => {
  const sectorPlaybook = getSalesSectorPlaybook(sector);
  expect(salesSectorPlaybookSchema.safeParse(sectorPlaybook).success).toBe(true);
  expect(buildSalesTurnPolicy({ intent: 'comparing', customerMessage: 'ما الأنسب لي؟', sectorPlaybook })).toContain(`دليل القطاع ${sector}`);
  for (const intent of ['declined', 'post_purchase'] as const) {
    expect(buildSalesTurnPolicy({ intent, customerMessage: 'راجع طلبي', sectorPlaybook })).not.toContain('دليل القطاع');
  }
});
it('accepts a new validated sector without adding an orchestrator branch', () => {
  const p = { ...getSalesSectorPlaybook('general'), id: 'maintenance', qualification: [{ field: 'device', question: 'ما نوع الجهاز والعطل؟' }] };
  expect(buildSalesSectorGuidance(p)).toContain('ما نوع الجهاز والعطل؟');
});
it('cannot grant payment/discount tools through a sector next-step', () => {
  expect(() => buildSalesSectorGuidance({ ...getSalesSectorPlaybook('general'), nextSteps: ['charge_card'] } as any)).toThrow();
});
it('does not leak mutation of one returned playbook into other merchants', () => {
  getSalesSectorPlaybook('training').qualification[0].question = 'forged';
  expect(getSalesSectorPlaybook('training').qualification[0].question).not.toBe('forged');
});
