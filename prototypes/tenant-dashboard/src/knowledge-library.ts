// Independent, read-only file-library scenario. No requests or changes to tenant data.
export function createKnowledgeLibrary(host: { esc: (s: unknown) => string; refresh: () => void; owner: () => boolean }) {
  const esc = host.esc;
  const fixtures = Array.from({ length: 14 }, (_, i) => ({ id: i + 1,
    name: i === 13 ? 'ملف تعذر استخراجه.pdf' : `سياسة تجريبية ${i + 1}.txt`,
    status: i === 13 ? 'failed' : 'completed',
    text: i === 13 ? '' : 'نص تجريبي للفحص: الشحن خلال ثلاثة أيام عمل. '.repeat(110) + 'نهاية النص المحفوظ.',
  }));
  let search = '', draft = '', status = 'all', page = 1, state = 'success', selected = 0, textPage = 1;
  let receiptState = 'partial', receiptChecked = false, recoveryAcknowledged = false;
  const receiptLabels = { partial: 'حُفظت المعرفة ولم تكتمل الفهرسة', completed: 'حُفظت نتيجة المعالجة', processing: 'الإضافة قيد المعالجة', interrupted: 'إضافة منقطعة قابلة للإغلاق', legacy: 'سجل قديم يحتاج مراجعة تشغيلية', recovered: 'أُغلقت الإضافة للمراجعة', uncertain: 'النتيجة غير محسومة', empty: 'لم تُستخرج أقسام' };
  function recovery() {
    if (receiptState === 'processing') return '<p>المعالجة ما زالت فعّالة. تحقق من النتيجة لاحقًا؛ لا يمكن إغلاقها الآن.</p>';
    if (receiptState === 'legacy') return '<p>هذا سجل قديم. يلزم التحقق من توقف العملية بواسطة الدعم قبل إغلاقه بأمان.</p>';
    if (receiptState === 'recovered') return '<p role="status">أُغلقت الإضافة للمراجعة ولن تواصل تغيير المعرفة. لم يُحذف المحتوى ولم يُعد التحليل. راجع الأقسام والتعارضات.</p>';
    if (receiptState !== 'interrupted') return '';
    return `<p>توقفت تحديثات المعالجة. يمكنك إغلاق الإضافة للمراجعة مع الاحتفاظ بما حُفظ.</p><label class="field"><span><input type="checkbox" data-kl-recovery-check ${recoveryAcknowledged ? 'checked' : ''}> أفهم أن الإغلاق لا يحذف المعرفة ولا يعيد التحليل، وسأراجع الأقسام والتعارضات قبل إضافة المحتوى مجددًا.</span></label>${button('إغلاق الإضافة المنقطعة للمراجعة', 'recover', !recoveryAcknowledged)}`;
  }
  function receipt() {
    return `<section class="bw-note" data-kl-receipt><h3>نتيجة الإضافة المحفوظة · مثال</h3><label class="field">محاكاة حالة الإضافة<select data-kl-receipt-state>${Object.entries(receiptLabels).map(([k,v]) => `<option value="${k}" ${k === receiptState ? 'selected' : ''}>${v}</option>`).join('')}</select></label><p role="status">${receiptLabels[receiptState]}</p><p style="overflow-wrap:anywhere">رقم الإضافة: 00000000-0000-4000-8000-000000000001</p><p>سجل الإضافة لا يثبت اعتماد النص كاملًا في الردود أو تحسن المبيعات.</p>${['partial', 'completed'].includes(receiptState) ? '<dl class="bw-cards"><div><dt>أقسام جديدة</dt><dd>3</dd></div><div><dt>أقسام محدثة</dt><dd>1</dd></div><div><dt>تعارضات</dt><dd>2</dd></div><div><dt>دون تغيير</dt><dd>0</dd></div></dl>' : '<p>راجع السجل والأقسام قبل إضافة المحتوى مجددًا. لا نكرر التحليل تلقائيًا.</p>'}${recovery()}${button('التحقق من النتيجة المحفوظة', 'receipt-refresh')}${receiptChecked ? '<p role="status">قُرئت نتيجة المثال فقط؛ لم يُشغّل تحليل جديد.</p>' : ''}</section>`;
  }
  const labels = { all: 'كل الحالات', completed: 'تم استخراج النص', failed: 'تعذر استخراج النص', pending: 'بانتظار الاستخراج', processing: 'جارٍ استخراج النص' };
  const button = (label: string, action: string, disabled = false, attrs = '') => `<button type="button" class="button" data-kl-action="${action}" ${disabled ? 'disabled' : ''} ${attrs}>${esc(label)}</button>`;
  function render() {
    const rows = state === 'empty' ? [] : fixtures.filter(row => row.name.includes(search) && (status === 'all' || row.status === status));
    const pages = Math.max(1, Math.ceil(rows.length / 12)); page = Math.min(page, pages);
    return `<section class="panel panel-pad" data-kl-library><h2>مكتبة ملفات المعرفة</h2><p>راجع السجلات والنص المستخرج. استخراج النص لا يثبت استخدامه في الردود أو دقة الإجابات.</p><p class="bw-note">محاكاة مستقلة من 14 ملفًا وهميًا لتجربة المكتبة؛ ليست قائمة ملفات التيننت أو سجل الإضافات أعلاه.</p><div class="bw-cards"><label class="field">اسم الملف<input data-kl-search maxlength="100" value="${esc(draft)}"></label><label class="field">حالة استخراج النص<select data-kl-status>${Object.entries(labels).map(([k,v]) => `<option value="${k}" ${k === status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${button('بحث', 'search')}</div><details><summary>حالات قراءة المكتبة</summary><label class="field">حالة المكتبة<select data-kl-state>${Object.entries({ success: 'بيانات', loading: 'تحميل', failure: 'تعذر القراءة', empty: 'لا توجد ملفات' }).map(([k,v]) => `<option value="${k}" ${k === state ? 'selected' : ''}>${v}</option>`).join('')}</select></label></details>${state === 'failure' ? `<p role="alert">تعذر تحميل مكتبة الملفات.</p>${button('إعادة المحاولة', 'retry')}` : state === 'loading' ? '<p role="status">جارٍ تحميل الملفات المحفوظة…</p>' : `<p role="status">${rows.length} ملفات مطابقة · صفحة ${page} من ${pages}</p>${!host.owner() ? '<p>فحص نص المصدر يتطلب صلاحية إدارة المساعد.</p>' : ''}<div class="bw-cards">${rows.slice((page - 1) * 12, page * 12).map(row => `<article class="bw-card"><h3>${esc(row.name)}</h3><p>${labels[row.status]}</p><p>${Array.from(row.text).length} حرف · سجل مثال</p>${host.owner() ? button('فحص النص المستخرج', 'read', false, `data-kl-id="${row.id}"`) : ''}</article>`).join('') || '<p>لا توجد ملفات مطابقة. جرّب اسمًا أو حالة أخرى.</p>'}</div><div class="bw-actions">${button('السابق', 'previous', page === 1)}${button('التالي', 'next', page === pages)}</div>`}</section>`;
  }
  function detail() {
    const row = fixtures.find(item => item.id === selected); if (!row || !host.owner()) return '';
    const characters = Array.from(row.text), pages = Math.max(1, Math.ceil(characters.length / 4000));
    return `<section class="panel panel-pad" data-kl-text tabindex="-1" aria-label="${esc(row.name)}"><div class="panel-head"><h3>${esc(row.name)}</h3>${button('العودة للملفات', 'close')}</div>${row.status === 'completed' ? receipt() : ''}<p>نص مثال محفوظ على صفحات من 4,000 حرف. لا يحدد أقسام المعرفة التي تستخدمه.</p><p role="status">صفحة ${textPage} من ${pages}</p><pre dir="auto" style="max-height:55vh;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:2">${esc(characters.slice((textPage - 1) * 4000, textPage * 4000).join('')) || 'لا يوجد نص مستخرج محفوظ لهذا الملف.'}</pre><div class="bw-actions">${button('السابق', 'text-previous', textPage === 1)}${button('التالي', 'text-next', textPage === pages)}</div></section>`;
  }
  document.addEventListener('input', event => { const el = event.target as HTMLInputElement; if (el.hasAttribute('data-kl-search')) draft = el.value; });
  document.addEventListener('keydown', event => { if ((event.target as Element).hasAttribute('data-kl-search') && event.key === 'Enter') { event.preventDefault(); search = draft.trim(); page = 1; selected = 0; host.refresh(); } });
  document.addEventListener('change', event => { const el = event.target as HTMLSelectElement;
    if (el.hasAttribute('data-kl-receipt-state')) { receiptState = el.value; receiptChecked = false; recoveryAcknowledged = false; host.refresh(); }
    if (el.hasAttribute('data-kl-recovery-check')) { recoveryAcknowledged = (event.target as HTMLInputElement).checked; host.refresh(); }
    if (el.hasAttribute('data-kl-status')) { status = el.value; page = 1; selected = 0; host.refresh(); }
    if (el.hasAttribute('data-kl-state')) { state = el.value; page = 1; selected = 0; host.refresh(); }
  });
  document.addEventListener('click', event => {
    const el = (event.target as Element).closest<HTMLButtonElement>('[data-kl-action]'); if (!el || el.disabled) return;
    const action = el.dataset.klAction;
    if (action === 'recover') { if (receiptState === 'interrupted' && recoveryAcknowledged && host.owner()) { receiptState = 'recovered'; recoveryAcknowledged = false; host.refresh(); } return; }
    if (action === 'receipt-refresh') { receiptChecked = true; host.refresh(); return; }
    if (action === 'close') { const id = selected; selected = 0; host.refresh(); document.querySelector<HTMLButtonElement>(`[data-kl-id="${id}"]`)?.focus(); return; }
    if (action === 'read') { selected = Number(el.dataset.klId); textPage = 1; host.refresh(); document.querySelector<HTMLElement>('[data-kl-text]')?.focus(); return; }
    if (action === 'text-next' || action === 'text-previous') { textPage += action === 'text-next' ? 1 : -1; host.refresh(); return; }
    selected = 0;
    if (action === 'search') { search = (document.querySelector<HTMLInputElement>('[data-kl-search]')?.value ?? draft).trim(); draft = search; page = 1; }
    if (action === 'retry') state = 'success';
    if (action === 'next') page++; if (action === 'previous') page--;
    host.refresh();
  });
  return { render: () => render() + (state === 'success' ? detail() : '') };
}
