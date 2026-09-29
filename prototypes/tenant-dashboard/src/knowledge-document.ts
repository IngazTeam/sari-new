// Explicit synthetic scenarios. No file parsing, network, provider or tenant writes.
export function createKnowledgeDocument(host: { esc: (value: unknown) => string; refresh: () => void; owner: () => boolean; blocked: () => boolean;
  review: (id: number) => void; linked: (id: number) => boolean }) {
  let kind = 'pdf', scenario = 'ready', state = 'idle', sequence = 1, checked = false, copies = 0;
  const labels = { ready: 'نص كامل محفوظ', empty: 'ملف مصور أو فارغ', large: 'نص أكبر من الحد', unreadable: 'ملف غير قابل للقراءة', noOriginal: 'نص محفوظ دون الأصل', unknown: 'انقطع الاتصال', processing: 'قيد الاستخراج' };
  const locked = () => !host.owner() || host.blocked(), waiting = () => ['processing', 'unknown'].includes(state);
  const button = (label: string, action: string, disabled = false) => `<button type="button" class="button" data-kd-action="${action}" ${disabled || locked() ? 'disabled' : ''}>${host.esc(label)}</button>`;
  const request = () => `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  function render() {
    const ready = ['ready','noOriginal'].includes(state), linked = host.linked(sequence);
    const message = { idle: 'ابدأ بمثال ملف، ثم راجع النص قبل أي إضافة.', ready: 'النص محفوظ وجاهز للفحص', noOriginal: 'حُفظ النص، لكن تعذر الاحتفاظ بأصل الملف. إعادة الاستخراج غير متاحة لهذه النسخة.',
      empty: 'لم نجد نصًا قابلًا للقراءة. لا تُقرأ الكلمات داخل الصور.', large: 'النص أكبر من حد الفحص أو التخزين. قسّم الأصل؛ لم نحفظ نصًا مختصرًا.', unreadable: 'تعذرت قراءة الملف كاملًا. احفظ قيم معادلات Excel المحسوبة قبل الرفع.',
      unknown: 'النتيجة غير مؤكدة. تحقق من سجل الطلب أو أعد المحاولة بالرقم نفسه.', processing: 'جارٍ استخراج الملف. راجع السجل لاحقًا ولا تبدأ طلبًا بديلًا.' };
    return `<section class="panel panel-pad" data-kd-document><h2>رفع ملف معرفة</h2><p>ارفع الملف ← استخرج النص ← راجع الخطة ← اعتمد المعرفة.</p><p class="bw-note">محاكاة بملف وهمي فقط. لا يقرأ هذا الموك أب PDF أو Word أو Excel فعليًا؛ الرفع الحقيقي متاح في التطبيق المحلي.</p><div class="bw-cards"><label class="field">نوع ملف المثال<select data-kd-kind ${state !== 'idle' || locked() ? 'disabled' : ''}>${['pdf','docx','xlsx'].map(value => `<option value="${value}" ${kind === value ? 'selected' : ''}>${value.toUpperCase()}</option>`).join('')}</select></label><label class="field">نتيجة الاستخراج التوضيحية<select data-kd-scenario ${state !== 'idle' || locked() ? 'disabled' : ''}>${Object.entries(labels).map(([key,label]) => `<option value="${key}" ${scenario === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><p>حتى 5 ميجابايت و30000 حرف ضمن سعة التخزين. لا اختصار صامت، ولا استيراد تلقائي لمنتجات الكتالوج.</p><p role="${['empty','large','unreadable','unknown'].includes(state) ? 'alert' : 'status'}">${message[state]}</p>${state !== 'idle' ? `<p style="overflow-wrap:anywhere">رقم الطلب: <bdi data-kd-reference>${request()}</bdi></p><p>حفظ النص وحده لا يفعّل معرفة ولا يرفع نسبة احتراف المبيعات.</p>` : button('محاكاة حفظ الملف واستخراج النص', 'extract')}${waiting() ? button('التحقق من الطلب المحفوظ', 'check') : ''}${state === 'unknown' ? button('إعادة المحاولة بالطلب نفسه', 'retry') : ''}${checked ? '<p role="status">قُرئت نتيجة المثال بالرقم نفسه دون إنشاء ملف آخر.</p>' : ''}${ready ? `<details><summary>قراءة نص المثال المحفوظ</summary><p>سياسة متجر نواة التجريبي: يمكن استرجاع المنتج غير المفتوح خلال 7 أيام من الاستلام. مدة تجهيز الطلب يوم عمل واحد. يجب مراجعة حالة المنتج قبل قبول الاسترجاع.</p></details><div class="bw-actions">${button('فحص هذا النص المحفوظ', 'review')}${button('استخراج نسخة جديدة من الأصل', 'reextract', state === 'noOriginal')}</div><p>المراجعة نسخة مرتبطة بالمصدر؛ لا تستبدل النص الأصلي.</p><p data-kd-linked>${linked ? 'توجد نتيجة مراجعة مرتبطة بهذا المثال؛ افتح الفحص لقراءة خطته المحفوظة.' : 'لا توجد مراجعة معتمدة مرتبطة بهذا المثال بعد.'}</p>` : ''}${copies ? `<p>نسخ استخراج سابقة محفوظة في هذه المحاكاة: ${copies}. لم نستبدل أصل المثال.</p>` : ''}${state !== 'idle' && !waiting() ? button('بدء مثال آخر', 'new') : ''}</section>`;
  }
  document.addEventListener('change', event => { const el = event.target as HTMLSelectElement; if (state !== 'idle' || locked()) return; if (el.hasAttribute('data-kd-kind')) kind = el.value; if (el.hasAttribute('data-kd-scenario')) scenario = el.value; });
  document.addEventListener('click', event => {
    const el = (event.target as Element).closest<HTMLButtonElement>('[data-kd-action]'); if (!el || el.disabled || locked()) return;
    const action = el.dataset.kdAction;
    if (action === 'extract' && state === 'idle') state = scenario;
    if ((action === 'check' || action === 'retry') && waiting()) { state = 'ready'; checked = true; }
    if (action === 'review' && ['ready','noOriginal'].includes(state)) { host.review(sequence); return; }
    if (action === 'reextract' && state === 'ready') { sequence++; copies++; checked = false; }
    if (action === 'new' && !waiting()) { state = 'idle'; sequence++; checked = false; }
    host.refresh();
  });
  return { render, reset() { kind = 'pdf'; scenario = 'ready'; state = 'idle'; sequence = 1; checked = false; copies = 0; } };
}
