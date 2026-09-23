import { z } from 'zod';

/** Declarative sales guidance, never catalogue facts or tool permissions. Add a
 * sector here without changing either generation path or the checkout engine. */
export const salesSectorPlaybookSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/), version: z.number().int().positive(),
  qualification: z.array(z.object({ field: z.string().min(1).max(80), question: z.string().min(1).max(240) }).strict()).min(1).max(12),
  recommendation: z.array(z.string().min(1).max(360)).min(1).max(8),
  offerChecklist: z.array(z.enum(['item', 'quantity', 'variant', 'price', 'tax', 'shipping', 'availability', 'expiry', 'terms',
    'prerequisites', 'schedule', 'mode', 'service_scope', 'stages', 'fees', 'estimated_timing', 'contract_terms'])).min(1).max(12),
  objections: z.array(z.object({ kind: z.enum(['price', 'value', 'fit', 'trust', 'timing', 'authority']), response: z.string().min(1).max(360) }).strict()).min(1).max(8),
  nextSteps: z.array(z.enum(['explain', 'compare', 'prepare_offer', 'request_handoff'])).min(1).max(4),
  boundaries: z.array(z.string().min(1).max(360)).min(1).max(8),
}).strict();
export type SalesSectorPlaybook = z.infer<typeof salesSectorPlaybookSchema>;
const sharedBoundaries = ['هذه إرشادات حوار، وليست حقائق عن النشاط أو تفويضاً لتنفيذ طلب أو خصم أو حجز.',
  'لا تعِد بنتيجة أو سعر أو توفر أو مهلة إلا بمصدر حالي معتمد. قرار العميل ورفضه يسبقان أهداف البيع.'];

export const salesSectorPlaybooks = [
  { id: 'general', version: 1,
    offerChecklist: ['item', 'quantity', 'price', 'terms', 'expiry'],
    qualification: [{ field: 'goal', question: 'ما النتيجة التي تريد الوصول إليها؟' }, { field: 'constraints', question: 'ما أهم شرط يجب أن يحققه الخيار المناسب لك؟' }],
    recommendation: ['اربط الخيار بالحاجة المذكورة وبميزتين موثقتين فقط. اذكر سبب ملاءمته وقيده، وقدّم بديلاً إذا لم يلائم العميل.'],
    objections: [{ kind: 'price', response: 'افهم إن كانت المشكلة سقف الميزانية أم عدم وضوح القيمة؛ وضح المشمول أو اقترح خياراً أقل تكلفة إن كان مناسباً وموجوداً.' },
      { kind: 'trust', response: 'استند إلى سياسة أو مستند معتمد، أو اطلب التحقق من الموظف عند غياب الدليل.' }],
    nextSteps: ['explain', 'compare', 'prepare_offer', 'request_handoff'], boundaries: sharedBoundaries },
  { id: 'training', version: 1,
    offerChecklist: ['item', 'prerequisites', 'schedule', 'mode', 'price', 'availability', 'terms'],
    qualification: [{ field: 'learning_goal', question: 'ما المهارة أو الهدف الذي تريد تحقيقه من التدريب؟' },
      { field: 'current_level', question: 'ما خبرتك الحالية في هذا المجال؟' }, { field: 'availability', question: 'ما الأوقات أو نمط الحضور المناسب لك؟' }],
    recommendation: ['قارن مخرجات التعلم والمتطلبات السابقة والمدة وطريقة الحضور من بيانات الدورة الحالية.',
      'استبعد الدورة التي لا تناسب مستوى العميل أو وقته؛ وضح سبب اقتراح بديل موجود قبل طلب التسجيل.'],
    objections: [{ kind: 'value', response: 'اربط محتوى الدورة بهدف التعلم المحدد، ووضح ما تشمله وما يحتاج جهداً مستقلاً من المتدرب.' },
      { kind: 'trust', response: 'اذكر جهة الاعتماد أو مؤهلات المدرب فقط إن كانت موثقة. لا تَعِد بوظيفة أو دخل أو اجتياز مضمون.' },
      { kind: 'timing', response: 'قارن المواعيد والساعات المسجلة فعلياً ولا تعد بدفعة أو مقعد لم يُتحقق منه.' }],
    nextSteps: ['explain', 'compare', 'prepare_offer', 'request_handoff'], boundaries: [...sharedBoundaries, 'الموافقة على تفاصيل الدورة ليست تسجيلًا أو دفعًا. الحجز يحتاج أداة مؤكدة وسعة متاحة.'] },
  { id: 'recruitment', version: 1,
    offerChecklist: ['service_scope', 'stages', 'fees', 'estimated_timing', 'contract_terms'],
    qualification: [{ field: 'service_need', question: 'ما نوع الخدمة والمهام المطلوبة؟' },
      { field: 'requirements', question: 'ما المتطلبات المهنية الأساسية المناسبة للعمل؟' }, { field: 'timing', question: 'متى تحتاج بدء الخدمة؟' }],
    recommendation: ['اعرض الخيارات المتاحة بحسب المهام والمؤهلات والشروط الموثقة، مع تفصيل مراحل الخدمة وما يشمله العقد.',
      'وضح الرسوم والاستثناءات ومدة الإجراء بحسب المصدر المعتمد، وميّز التقدير عن التعهد التعاقدي.'],
    objections: [{ kind: 'trust', response: 'اشرح حقوق الطرفين وسياسة الاستبدال والإلغاء كما هي بالعقد المعتمد، وصعّد الاستفسار القانوني غير المحسوم.' },
      { kind: 'timing', response: 'لا تضمن وصولاً أو موافقة تأشيرة. اعرض آخر حالة موثقة وما يحتاج تحققاً من الفريق.' },
      { kind: 'price', response: 'فصّل الرسوم المعتمدة والخدمات المشمولة؛ لا تخترع إعفاءات أو رسومًا حكومية.' }],
    nextSteps: ['explain', 'compare', 'prepare_offer', 'request_handoff'], boundaries: [...sharedBoundaries,
      'لا تجمع وثائق حساسة عبر نص محادثة مفتوح؛ أحل إلى مسار الرفع المعتمد إن توفر. لا تفترض أهلية قانونية أو تَعِد بضمانات غير موثقة.'] },
  { id: 'store', version: 1,
    offerChecklist: ['item', 'variant', 'quantity', 'price', 'tax', 'shipping', 'availability', 'expiry', 'terms'],
    qualification: [{ field: 'use_case', question: 'ما الاستخدام الأساسي الذي تبحث عنه؟' },
      { field: 'compatibility', question: 'هل لديك مقاس أو مواصفة توافق محددة؟' }, { field: 'delivery', question: 'إلى أي مدينة تحتاج التوصيل؟' }],
    recommendation: ['رشّح بناءً على الاستخدام والمقاس والتوافق، وقارن فروقاً موثقة بين خيارين أو ثلاثة متاحين.',
      'لا تعرض إضافة مدفوعة إلا إذا خدمت الاحتياج؛ بيّن سعرها واختياريتها منفصلة عن المنتج الأساسي.'],
    objections: [{ kind: 'fit', response: 'تحقق من المقاسات والتوافق من الكتالوج؛ لا تجزم بملاءمة لم تُثبتها المواصفات.' },
      { kind: 'price', response: 'وضح الفرق العملي بين الخيارات وقدّم بديلاً أقل تكلفة مناسباً إن كان متاحاً.' },
      { kind: 'trust', response: 'استشهد بسياسة الضمان والاسترجاع الحالية، واذكر الاستثناءات المؤثرة قبل التأكيد.' }],
    nextSteps: ['explain', 'compare', 'prepare_offer', 'request_handoff'], boundaries: [...sharedBoundaries,
      'المخزون والسعر من الكتالوج الحالي. الضريبة والتوصيل من فاتورة معتمدة، ولا تحوّل الطلب المسجل إلى مدفوع.'] },
] .map(value => salesSectorPlaybookSchema.parse(value));

export function getSalesSectorPlaybook(id: string): SalesSectorPlaybook {
  const found = salesSectorPlaybooks.find(playbook => playbook.id === id);
  if (!found) throw new Error('Unknown sales sector playbook');
  // Callers cannot mutate the registry and change other merchants' guidance.
  return salesSectorPlaybookSchema.parse(found);
}

export function buildSalesSectorGuidance(playbook: SalesSectorPlaybook): string {
  const p = salesSectorPlaybookSchema.parse(playbook);
  return `\n## دليل القطاع ${p.id} v${p.version}\n`
    + 'اسأل فقط عن المعلومة المؤثرة غير المحسومة في الرسائل. لا تعرض هذه القائمة كاملة على العميل ولا تعاود سؤالًا أجاب عنه.\n'
    + p.qualification.map(q => `- احتياج ${q.field}: ${q.question}`).join('\n')
    + '\nالترشيح:\n' + p.recommendation.map(s => `- ${s}`).join('\n')
    + '\nحقول العرض التي يجب التحقق منها في المصادر الحالية أو توضيح نقصها قبل التأكيد: ' + p.offerChecklist.join(', ')
    + '\nمعالجة الاعتراض بحسب سببه:\n' + p.objections.map(o => `- ${o.kind}: ${o.response}`).join('\n')
    + '\nالخطوات الحوارية المتاحة (ليست صلاحيات تنفيذ): ' + p.nextSteps.join(', ')
    + '\n' + p.boundaries.map(b => `- ${b}`).join('\n');
}
