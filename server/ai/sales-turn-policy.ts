import { isSalesRefusal, isShortAffirmation, isPurchaseProcessQuestion, pendingDecisionFromQuestion } from './customer-decision';
import type { CustomerIntent } from './session-context';
import { buildSalesSectorGuidance, getSalesSectorPlaybook, type SalesSectorPlaybook } from '../../shared/sales-sector-playbooks';

export type SalesTurnGoal = 'respect_decline' | 'resolve_existing_order' | 'explain_requested_information'
  | 'confirm_agreement' | 'understand_objection' | 'compare_suitable_options' | 'answer_then_qualify';

/** One authority order and turn objective, shared by both generation paths.
 * This chooses a conversational objective, never permission to execute a tool. */
export function decideSalesTurnGoal(input: { intent: CustomerIntent; customerMessage: string; lastAssistantMessage?: string }): SalesTurnGoal {
  if (input.intent === 'declined' || isSalesRefusal(input.customerMessage)) return 'respect_decline';
  if (input.intent === 'post_purchase') return 'resolve_existing_order';
  if (isPurchaseProcessQuestion(input.customerMessage)) return 'explain_requested_information';
  if (isShortAffirmation(input.customerMessage) && pendingDecisionFromQuestion(input.lastAssistantMessage || '') !== 'purchase') {
    return 'explain_requested_information';
  }
  if (input.intent === 'ready_to_buy') return 'confirm_agreement';
  if (input.intent === 'hesitating' || input.intent === 'objecting') return 'understand_objection';
  if (input.intent === 'comparing') return 'compare_suitable_options';
  return 'answer_then_qualify';
}

const objectives: Record<SalesTurnGoal, string> = {
  respect_decline: 'احترم الرفض وأنهِ الضغط البيعي. لا خصم إنقاذ ولا عرض جديد ولا متابعة غير مأذونة.',
  resolve_existing_order: 'حل طلب العميل القائم أولاً من حالته الموثقة. لا تبدأ إغلاقاً جديداً أثناء معالجة مشكلته.',
  explain_requested_information: 'هذه موافقة على شرح أو استفسار سابق، أو موافقة غامضة. أكمل المطلوب أو وضّح المقصود؛ ليست إذناً بشراء.',
  confirm_agreement: 'استفد من التفاصيل المحسومة. إن اكتمل العرض المحفوظ وضّح خطوة تأكيده؛ إن نقصت معلومة مؤثرة فاطلبها وحدها. لا تدعِ التنفيذ قبل نتيجة الأداة.',
  understand_objection: 'حدد سبب التردد من الكلام السابق: سعر أو قيمة أو ملاءمة أو ثقة أو توقيت أو صاحب قرار. عالج السبب بدليل أو بديل مناسب، واسأل فقط إن ظل السبب مجهولاً.',
  compare_suitable_options: 'قارن خيارين أو ثلاثة مناسبين باحتياج العميل وبفروق موثقة. اشرح لمن يصلح كل خيار وما لا يقدمه، واسمح بأن يكون الأقل تكلفة هو الأفضل له.',
  answer_then_qualify: 'أجب عن السؤال المباشر أولاً. اربط الترشيح باحتياج ذكره العميل؛ إن لم تعرف احتياجه اسأل سؤالاً واحداً يغير الاختيار التالي، دون تكرار معلومات حُسمت.',
};

export function buildSalesTurnPolicy(input: Parameters<typeof decideSalesTurnGoal>[0] & { sectorPlaybook?: SalesSectorPlaybook }): string {
  const goal = decideSalesTurnGoal(input);
  return `\n\n## سياسة البيع المشتركة v1 — هدف التفاعل وحدود الصلاحية
ترتيب المرجعية عند تعارض تعليمات الأسلوب: حقائق النشاط وصلاحياته ونتائج أدواته، ثم قرار العميل والاتفاق الحالي، ثم هدف هذه الرسالة، ثم الشخصية، ثم اقتراحات الأسلوب المعتمدة.
هدف هذا التفاعل [${goal}]: ${objectives[goal]}
- معرفة العميل ليست نصاً تسويقياً: اربط كل فائدة مقترحة بحاجته وبخاصية موثقة. لا تفترض قدرة مالية أو ملاءمة لم يذكرها.
- لا تدفع إلى خيار غير مناسب. وضّح القيود والمتطلبات والتكلفة المعروفة، أو اقترح بديلاً أقل تكلفة إذا كان يلبي المطلوب.
- خصم أو ندرة أو ضمان أو موعد أو نتيجة عميل آخر يحتاج مصدراً وصلاحية سارية. اقتراح النموذج أو مثال في تعليمات الشخصية ليس مصدراً.
- السعر والتوفر من الكتالوج الحالي. المستند والتوجيه التعليمي لا يغيّران حالة دفع أو طلب ولا يمنحان خصماً.
- موافقة على الشرح ليست موافقة شراء. عرض محفوظ مع موافقة محددة ونتيجة أداة هما مرجع الإتمام، ولا تنفذ من نص محادثة وحده.
- عند نقص المعرفة اطلب المعلومة المؤثرة أو استخدم التصعيد المتاح. لا تعد برد لاحق أو حجز أو اتصال إذا لم تُسجل له مهمة فعلية.
- أجب بلغة العميل وطول يناسب السؤال. اختم بخطوة واحدة مفيدة إذا احتاجت المحادثة ذلك، دون إعادة الاستكشاف بعد اتفاق مكتمل.
` + (['respect_decline', 'resolve_existing_order'].includes(goal) ? '' : buildSalesSectorGuidance(input.sectorPlaybook ?? getSalesSectorPlaybook('general')));
}
