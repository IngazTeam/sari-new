// Interactive design only: no model, document parsing, uploads or production writes.
window.SaryBrainPreview = (() => {
  const storageKey = 'sary-brain-preview-v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const seed = {
    version: 1,
    files: [
      { id: 'policy', name: 'سياسات المتجر — الإصدار 3.pdf', type: 'PDF', size: '240 كيلوبايت', location: 'صفحتان', date: '26 سبتمبر 2026', status: 'conflict', active: false, facts: [
        { title: 'مدة الاسترجاع', text: 'يمكن استرجاع المنتج غير المفتوح خلال 7 أيام من الاستلام.', citation: 'صفحة 2 · الاسترجاع' },
        { title: 'مدة تجهيز الطلب', text: 'يُجهّز الطلب خلال يوم عمل واحد.', citation: 'صفحة 1 · تجهيز الطلب' },
      ] },
      { id: 'catalog', name: 'كتالوج المنتجات.xlsx', type: 'XLSX', size: '86 كيلوبايت', location: 'ورقة المنتجات', date: '27 سبتمبر 2026', status: 'ready', active: true, facts: [
        { title: 'بن كولومبيا', text: 'بن كولومبيا، 250 جرامًا، بسعر 64 ريالًا. إيحاءات كراميل وحمضية متوازنة.', citation: 'ورقة المنتجات · صف 2' },
        { title: 'خيار الطحن', text: 'يتوفر طحن للإسبريسو والتقطير، أو حبوب كاملة.', citation: 'ورقة المنتجات · صف 3' },
        { title: 'باقة التذوق', text: 'ثلاث عبوات متنوعة بحجم 100 جرام لكل عبوة، بسعر 79 ريالًا.', citation: 'ورقة المنتجات · صف 4' },
      ] },
      { id: 'guide', name: 'دليل البيع وخدمة العميل.docx', type: 'DOCX', size: '112 كيلوبايت', location: '3 صفحات', date: '25 سبتمبر 2026', status: 'review', active: false, facts: [
        { title: 'فهم الاحتياج', text: 'اسأل العميل عن طريقة التحضير والمذاق المفضل قبل ترشيح المنتج.', citation: 'صفحة 1 · اكتشاف الاحتياج' },
        { title: 'اعتراض السعر', text: 'اشرح حجم العبوة وخيارات الطحن. قدّم باقة التذوق كخيار مختلف، ولا تعد بخصم غير معتمد.', citation: 'صفحة 2 · اعتراض السعر' },
      ] },
      { id: 'legacy', name: 'سياسات المتجر — الإصدار 2.pdf', type: 'PDF', size: '190 كيلوبايت', location: 'صفحتان', date: '1 أغسطس 2026', status: 'ready', active: true, facts: [
        { title: 'مدة الاسترجاع السابقة', text: 'يمكن استرجاع المنتج غير المفتوح خلال 14 يومًا من الاستلام.', citation: 'صفحة 2 · الاسترجاع' },
      ] },
      { id: 'scan', name: 'دليل التحضير المصوّر.pdf', type: 'PDF', size: '1.2 ميغابايت', location: 'لم يُستخرج النص', date: '27 سبتمبر 2026', status: 'failed', active: false, facts: [] },
    ],
    gaps: [
      { id: 'returns', title: 'حسم مدة الاسترجاع', type: 'تعارض بين مصدرين', severity: 'high', question: 'أقدر أرجع البن بعد 10 أيام؟', count: 14, impact: 'قد يحصل العميل على وعد مخالف لسياسة المتجر.', required: 'اختر السياسة السارية وأكّد المدة وشروط قبول المنتج.', source: 'policy', state: 'open' },
      { id: 'delivery', title: 'تغطية الشحن خارج المدن الرئيسية', type: 'معلومة غير موجودة', severity: 'high', question: 'تشحنون إلى العلا؟ وكم يستغرق؟', count: 9, impact: 'يتوقف قرار الشراء لعدم وضوح التغطية والمدة.', required: 'أضف المدن المشمولة والمدة المتوقعة والتكلفة من سياسة معتمدة.', source: 'policy', state: 'open' },
      { id: 'grinding', title: 'توصية الطحن للمبتدئ', type: 'إجابة تحتاج تفصيلًا', severity: 'medium', question: 'أنا مبتدئ بالتقطير، أي طحن أختار؟', count: 6, impact: 'الرد يذكر الخيارات دون مساعدة العميل على الاختيار.', required: 'أضف توصية واضحة مرتبطة بأداة التحضير، دون تعميم غير موثق.', source: 'guide', state: 'open' },
    ],
  };
  const dimensions = [
    { id: 'needs', title: 'فهم احتياج العميل', score: 80, weight: 20, passed: 32, question: 'أبغى قهوة تناسبني، وش تقترح؟', observation: 'بدأ بسؤال عن طريقة التحضير في 32 من 40 محادثة.', improve: 'اسأل عن طريقة التحضير والمذاق قبل عرض الخيارات.' },
    { id: 'accuracy', title: 'دقة المعلومة والمصدر', score: 85, weight: 20, passed: 34, question: 'كم سعر بن كولومبيا؟', observation: 'طابقت المعلومات المصدر في 34 من 40 محادثة.', improve: 'احسم تعارض الاسترجاع، ولا تستخدم معلومة غير معتمدة.' },
    { id: 'objection', title: 'التعامل مع الاعتراض', score: 65, weight: 20, passed: 26, question: 'السعر غالي مقارنة باللي أشتريه.', observation: 'عالج الاعتراض بوضوح في 26 من 40 محادثة.', improve: 'وضّح القيمة بخيار مناسب، وتجنب الوعد بخصم غير معتمد.' },
    { id: 'recommend', title: 'ملاءمة الترشيح', score: 70, weight: 15, passed: 28, question: 'أنا جديد على القهوة المختصة.', observation: 'ناسب الترشيح احتياج العميل في 28 من 40 محادثة.', improve: 'اربط الترشيح بسبب واضح من احتياج العميل.' },
    { id: 'next', title: 'وضوح الخطوة التالية', score: 75, weight: 15, passed: 30, question: 'ممتاز، كيف أكمل الطلب؟', observation: 'حدد خطوة عملية في 30 من 40 محادثة.', improve: 'قدّم إجراءً واحدًا واضحًا لاستكمال الطلب أو طلب المساعدة.' },
    { id: 'restraint', title: 'البيع دون ضغط أو وعود', score: 60, weight: 10, passed: 24, question: 'أحتاج أفكر قبل أقرر.', observation: 'احترم قرار العميل في 24 من 40 محادثة.', improve: 'اترك للعميل مساحة للقرار، واحترم رفض المتابعة.' },
  ];
  let data = JSON.parse(JSON.stringify(seed)), section = 'results', search = '', fileFilter = 'all', gapFilter = 'all', period = '30';
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.version === 1 && Array.isArray(stored.files) && Array.isArray(stored.gaps)
      && stored.files.every(f => typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.facts))
      && stored.gaps.length === 3 && stored.gaps.every(g => seed.gaps.some(s => s.id === g.id))) data = stored;
  } catch { /* Start with the sample when local storage is unavailable. */ }
  const file = id => data.files.find(f => f.id === id);
  const gap = id => data.gaps.find(g => g.id === id);
  const eligibleSources = g => data.files.filter(f => g.id === 'returns' ? ['policy', 'legacy'].includes(f.id) : f.status === 'ready' && f.active && f.facts.length);
  const remaining = () => data.gaps.filter(g => g.state !== 'resolved');
  const badge = (text, tone = 'gray') => `<span class="status ${tone}">${escape(text)}</span>`;
  const status = { ready: 'تمت المراجعة', review: 'بانتظار المراجعة', conflict: 'تعارض يحتاج قرارك', failed: 'تعذّر استخراج النص', queued: 'بانتظار المعالجة' };
  const gapStatus = { open: 'مفتوحة', draft: 'إجابة للمراجعة', retest: 'بانتظار إعادة الاختبار', resolved: 'اجتازت الاختبار التوضيحي' };
  const button = (text, action, id = '', primary = false, extra = '') => `<button type="button" class="button ${primary ? 'primary' : ''}" data-brain-action="${action}" data-id="${escape(id)}" ${extra}>${escape(text)}</button>`;
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { toast('تعذّر الحفظ في المتصفح. تبقى التغييرات خلال هذه الجلسة.'); } };
  const score = () => Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight / 100, 0));
  function refresh(focusId) {
    const root = document.querySelector('[data-brain-workspace]');
    if (!root) return;
    root.outerHTML = render();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function navigate(target) { section = target; refresh(`brain-nav-${target}`); }
  function close() { document.getElementById('dialog').close(); }
  function metric(value, title, description, target) {
    return `<button class="brain-metric panel" data-brain-action="navigate" data-id="${target}"><span>${title}</span><strong>${value}</strong><small>${description}</small></button>`;
  }
  function render() {
    const active = data.files.filter(f => f.active && f.status === 'ready').length;
    const tabs = [['results', 'النتائج'], ['files', 'ملفات المعرفة'], ['gaps', 'الفجوات'], ['sales', 'احتراف المبيعات']];
    return `<section class="brain-workspace" data-brain-workspace>
      <nav class="brain-nav" aria-label="أقسام عقل ساري">${tabs.map(([id, title]) => `<button id="brain-nav-${id}" data-brain-action="navigate" data-id="${id}" aria-pressed="${section === id}">${title}${id === 'gaps' ? `<span>${remaining().length}</span>` : ''}</button>`).join('')}</nav>
      <div class="brain-metrics">${metric(`${score()}<small>%</small>`, 'احتراف المبيعات', 'آخر تقييم توضيحي · 40 محادثة', 'sales')}${metric(data.files.length, 'ملفات المعرفة', `${active} معتمدة ومفعّلة في المعاينة`, 'files')}${metric(remaining().length, 'فجوات تحتاج متابعة', 'تعارض أو معلومة ناقصة أو غير واضحة', 'gaps')}</div>
      <div id="brain-section">${({ results, files, gaps, sales })[section]()}</div>
      <p class="brain-footnote">معاينة تصميم · كل المصادر والإجابات والدرجات المعروضة توضيحية. لم يُحلَّل تيننتك أو أي ملف حقيقي.</p>
    </section>`;
  }
  function results() {
    const first = remaining()[0];
    const approved = data.files.filter(f => f.status === 'ready' && f.active);
    return `<div class="brain-results"><div class="brain-overview"><section class="brain-hero panel">
      <span class="eyebrow">من المعلومة إلى إجابة يمكن الوثوق بها</span><h2>${first ? 'المعرفة موجودة. هذه خطوتك لتحسينها.' : 'عالجت فجوات المعاينة. راجع النتائج.'}</h2>
      <p>${first ? 'ابدأ بالفجوات التي تؤثر في قرار الشراء، ثم جرّب الإجابة قبل استخدامها مع العملاء.' : 'التحقق من أمثلة محددة بداية جيدة؛ راقب الأسئلة الجديدة ونتائج المحادثات.'}</p>
      ${first ? `<div class="brain-next"><div>${badge(first.severity === 'high' ? 'أولوية عالية' : 'للمتابعة', 'amber')}<h3>${escape(first.title)}</h3><p>${escape(first.impact)}</p></div>${button(first.state === 'retest' ? 'اختبر الإجابة' : 'عالج الفجوة', 'gap', first.id, true)}</div>` : button('راجع الاختبارات', 'navigate', 'gaps', true)}
      <div class="brain-journey"><span>1. أضف مصدرًا</span><span>2. راجع النتائج</span><span>3. جرّب الإجابة</span><span>4. تابع الأداء</span></div>
      </section><aside class="panel panel-pad brain-summary"><span class="eyebrow">ملخص النتائج</span><h2>ما الذي يستطيع ساري استخدامه؟</h2>
      <div class="brain-summary-row"><strong>${approved.reduce((sum, f) => sum + f.facts.length, 0)}</strong><span>معلومات في المصادر المفعّلة</span></div>
      <div class="brain-summary-row"><strong>${data.files.filter(f => ['review', 'conflict'].includes(f.status)).length}</strong><span>ملفات تحتاج مراجعتك</span></div>
      <div class="brain-summary-row"><strong>${data.files.filter(f => f.status === 'failed').length}</strong><span>ملفات لم يُستخرج نصها</span></div>
      <p>وجود ملف لا يعني استخدامه. راجع المعلومة ومصدرها وحالة تفعيلها.</p>${button('مراجعة الملفات', 'navigate', 'files')}</aside></div>
      <section class="panel panel-pad"><div class="panel-head"><div><h2>نتائج مرتبطة بمصادرها</h2><p>افتح أي نتيجة لمعرفة النص الذي تستند إليه.</p></div>${button('جرّب سؤالًا', 'test')}</div>
      <div class="brain-facts">${approved.flatMap(f => f.facts.slice(0, 2).map(fact => `<article><span class="eyebrow">معرفة مفعّلة</span><h3>${escape(fact.title)}</h3><p>${escape(fact.text)}</p>${button(`${f.name} · ${fact.citation}`, 'file', f.id)}</article>`)).join('') || '<p>لا توجد معلومات مفعّلة. راجع مصدرًا قبل استخدامه.</p>'}</div></section></div>`;
  }
  function files() {
    const shown = data.files.filter(f => f.name.includes(search) && (fileFilter === 'all' || fileFilter === 'active' ? fileFilter !== 'active' || f.active : f.status === fileFilter));
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>ملفات المعرفة ونتائجها</h2><p>حالة المعالجة منفصلة عن المراجعة والتفعيل في الردود.</p></div>${button('إضافة ملف', 'add', '', true)}</div>
      <div class="toolbar"><label class="search-field" for="brain-search"><span class="sr-only">ابحث في الملفات</span><input class="control" id="brain-search" data-brain-input="search" placeholder="ابحث باسم الملف…" value="${escape(search)}"></label><label class="sr-only" for="brain-file-filter">حالة الملف</label><select id="brain-file-filter" class="control" data-brain-input="file-filter">${[['all', 'كل الملفات'], ['active', 'مفعّلة'], ['review', 'بانتظار المراجعة'], ['conflict', 'تعارض'], ['failed', 'تعذّر الاستخراج'], ['queued', 'بانتظار المعالجة']].map(([id, label]) => `<option value="${id}" ${fileFilter === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="brain-files">${shown.map(f => `<article class="brain-file" data-brain-file="${escape(f.id)}"><span class="brain-file-type">${escape(f.type)}</span><div class="brain-file-info"><h3>${escape(f.name)}</h3><p>${escape(f.size)} · ${escape(f.location)} · ${escape(f.date)}</p><div class="brain-badges">${badge(status[f.status], f.status === 'ready' ? '' : 'amber')}${badge(f.active ? 'مفعّل في المعاينة' : 'غير مستخدم في الردود')}${f.facts.length ? badge(`${f.facts.length} معلومات مستخرجة`) : ''}</div></div><div class="brain-file-actions">${button('عرض النتائج', 'file', f.id)}${f.status === 'ready' ? button(f.active ? 'إيقاف الاستخدام' : 'تفعيل الاستخدام', 'toggle-file', f.id) : ''}</div></article>`).join('') || '<div class="empty"><h3>لا توجد ملفات مطابقة</h3><p>غيّر البحث أو التصفية.</p></div>'}</div><p class="hint" role="status">${shown.length} من ${data.files.length} ملفات</p></section>`;
  }
  function gaps() {
    const shown = data.gaps.filter(g => gapFilter === 'all' || gapFilter === 'open' && ['open', 'draft'].includes(g.state) || g.state === gapFilter);
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>فجوات المعرفة</h2><p>مرتبة حسب أثرها على العميل. علاج المعلومة يتبعه اختبار للإجابة.</p></div><span class="hint">تكرار الأسئلة · آخر 30 يومًا · توضيحي</span></div>
      <div class="brain-filters" aria-label="تصفية الفجوات">${[['all', 'الكل'], ['open', 'تحتاج معالجة'], ['retest', 'تحتاج اختبارًا'], ['resolved', 'تم التحقق']].map(([id, title]) => `<button class="button" aria-pressed="${gapFilter === id}" data-brain-action="filter-gaps" data-id="${id}">${title}</button>`).join('')}</div>
      <div class="brain-gaps">${shown.map(g => `<article class="brain-gap" data-gap-state="${g.state}"><div class="brain-badges">${badge(g.type)}${badge(g.severity === 'high' ? 'أولوية عالية' : 'أولوية متوسطة', 'amber')}${badge(gapStatus[g.state], g.state === 'resolved' ? '' : 'gray')}</div><h3>${escape(g.title)}</h3><blockquote>«${escape(g.question)}»</blockquote><p>${escape(g.impact)}</p><div class="brain-gap-bottom"><span>${g.count} أسئلة مشابهة · مثال توضيحي</span>${button(g.state === 'resolved' ? 'عرض التحقق' : g.state === 'retest' ? 'اختبر الإجابة' : g.state === 'draft' ? 'مراجعة الإجابة' : 'عالج الفجوة', 'gap', g.id, g.state !== 'resolved')}</div></article>`).join('') || '<p class="empty">لا توجد فجوات في هذه الحالة.</p>'}</div></section>`;
  }
  function sales() {
    const enough = period === '30';
    return `<section class="panel panel-pad"><div class="panel-head"><div><h2>نسبة احتراف المبيعات</h2><p>مدى جودة مهارات البيع في المحادثات التي روجعت.</p></div><label class="brain-period" for="brain-period">الفترة<select id="brain-period" class="control" data-brain-input="period"><option value="30" ${enough ? 'selected' : ''}>آخر 30 يومًا</option><option value="7" ${!enough ? 'selected' : ''}>آخر 7 أيام</option></select></label></div>
      <div class="brain-score-layout"><div class="brain-score ${enough ? '' : 'brain-score-empty'}"><span>تقييم مهارات البيع</span><strong data-brain-score>${enough ? `${score()}<small>%</small>` : '—'}</strong><b>${enough ? 'أساس جيد، مع فرص واضحة للتحسين' : 'العينة غير كافية لإظهار نسبة'}</b><p>${enough ? '40 محادثة مراجعة · 6 محاور' : '12 محادثة مراجعة من 30 مطلوبة للتقييم الأولي'}</p><span class="brain-score-stamp">معاينة تقييم · إصدار المعايير 1</span></div>
      <div class="brain-score-context"><h3>${enough ? 'ما الذي تعنيه هذه النسبة؟' : 'اجمع أمثلة أكثر أولًا'}</h3><p>${enough ? 'متوسط موزون لست مهارات في عينة المحادثات. لا تمثل نسبة العملاء الذين اشتروا أو ضمان زيادة المبيعات.' : 'لا تظهر النسبة قبل اكتمال العينة. اختر فترة أطول، ثم راجع تنوع الأسئلة والاعتراضات.'}</p><p>إضافة ملف أو معالجة فجوة لا ترفع الدرجة تلقائيًا؛ يلزم تقييم إجابات جديدة.</p><div class="summary-box"><strong>أعلى فرصة للتحسين</strong><p>احترام قرار العميل ومعالجة اعتراض السعر دون ضغط أو خصم غير معتمد.</p>${button('راجع مثالًا وتوصية', 'evidence', 'restraint')}</div></div></div>
      ${enough ? `<div class="brain-dimensions">${dimensions.map(d => `<article><div class="brain-dimension-title"><h3>${d.title}</h3><strong>${d.score}%</strong></div><meter min="0" max="100" value="${d.score}" aria-label="${d.title}">${d.score}%</meter><p>${d.passed} من 40 محادثة · وزن ${d.weight}%</p>${button('الدليل والتحسين', 'evidence', d.id)}</article>`).join('')}</div>` : '<div class="brain-empty-evidence" role="status">بيانات هذه الفترة غير كافية للمقارنة بين المهارات.</div>'}
      <details class="brain-method"><summary>طريقة الحساب وحدود النتيجة</summary><p>لكل مهارة: المحادثات التي اجتازت المعيار ÷ المحادثات القابلة للتقييم × 100. النتيجة الكلية هي مجموع (درجة المهارة × وزنها).</p><p dir="ltr">80×20% + 85×20% + 65×20% + 70×15% + 75×15% + 60×10% = 73.75% ≈ 74%</p><p>في هذه المعاينة فقط: 40 محادثة مؤهلة لكل محور، دون بيانات مفقودة. لا نقارن بفترة سابقة مختلفة المعايير. يلزم تنوع العينة ومراجعة بشرية قبل اعتماد أي نتيجة فعلية.</p></details></section>`;
  }
  function fileDialog(id) {
    const f = file(id); if (!f) return;
    openDialog('نتائج ملف المعرفة', `<div class="brain-dialog"><span class="eyebrow">${escape(f.type)} · ${escape(f.date)}</span><h3>${escape(f.name)}</h3><div class="brain-badges">${badge(status[f.status], f.status === 'ready' ? '' : 'amber')}${badge(f.active ? 'مفعّل في المعاينة' : 'غير مستخدم في الردود')}</div>
      ${f.status === 'failed' ? '<div class="brain-warning"><h3>لم نتمكن من قراءة هذا الملف</h3><p>ملف المثال يحتوي صورًا دون نص قابل للاستخراج. أرفق نسخة نصية أو نسخة PDF تدعم البحث.</p></div>' : ''}
      ${f.status === 'queued' ? '<div class="summary-box"><h3>الملف بانتظار المعالجة</h3><p>حُفظ اسم الملف وحجمه في هذه المعاينة فقط. لم تُقرأ محتوياته أو تُستخرج منه معلومات.</p></div>' : ''}
      ${f.status === 'conflict' ? `<div class="brain-warning"><h3>تعارض في مدة الاسترجاع</h3><p>هذا الملف يذكر 7 أيام، والإصدار السابق يذكر 14 يومًا. اختر السياسة الصحيحة قبل التفعيل.</p>${button('مراجعة التعارض', 'gap', 'returns', true)}</div>` : ''}
      ${f.facts.map(fact => `<article class="brain-extract"><h3>${escape(fact.title)}</h3><blockquote>${escape(fact.text)}</blockquote><small>المصدر: ${escape(f.name)} · ${escape(fact.citation)}</small></article>`).join('')}
      ${f.status === 'review' ? `<form data-brain-form="approve-file" data-id="${escape(f.id)}"><label class="check-label"><input type="checkbox" name="reviewed" required><span>راجعت المعلومات ومصدرها، وأوافق على استخدامها في المعاينة.</span></label><button class="button primary" type="submit">اعتماد وتفعيل المعلومات</button></form>` : ''}
      ${f.status === 'ready' ? button(f.active ? 'إيقاف الاستخدام' : 'تفعيل الاستخدام', 'toggle-file', f.id) : ''}
      <p class="hint">اعتماد الملف لا يغيّر تقييم مهارات البيع.</p></div>`);
  }
  function openAdd() {
    openDialog('إضافة ملف معرفة', `<form class="form-stack brain-dialog" data-brain-form="upload"><p>أضف سياسة أو كتالوجًا أو دليلًا، ثم راجع المعلومات المستخرجة قبل تفعيلها.</p><label class="brain-upload" for="brain-upload">${icon('file')}<strong>اختر ملفًا من جهازك</strong><span>PDF أو DOCX أو XLSX أو TXT · حتى 5 ميغابايت</span><input id="brain-upload" name="attachment" type="file" accept=".pdf,.docx,.xlsx,.txt" required></label><p id="brain-upload-error" role="alert"></p><p class="hint">هذه المعاينة تحفظ اسم الملف وحجمه فقط في متصفحك. لا ترفعه ولا تحلل محتواه.</p><button type="submit" class="button primary">إضافة إلى قائمة المعالجة</button></form>`);
  }
  function gapDialog(id) {
    const g = gap(id); if (!g) return;
    if (g.state === 'retest' || g.state === 'resolved') return testGap(id);
    if (g.state === 'draft') {
      openDialog('راجع الإجابة قبل اعتمادها', `<div class="brain-dialog"><h3>${escape(g.title)}</h3><blockquote>${escape(g.answer)}</blockquote><p>المصدر: ${escape(file(g.chosenSource)?.name)}</p>${g.id === 'returns' ? '<p class="brain-warning">يعتمد هذا الإجراء السياسة المختارة، ويوقف استخدام الإصدار السابق في المعاينة.</p>' : ''}<form data-brain-form="approve-gap" data-id="${g.id}"><label class="check-label"><input type="checkbox" name="reviewed" required><span>راجعت صحة الإجابة والمصدر، وأوافق على اعتمادها ثم اختبارها.</span></label><div class="dialog-foot">${button('تعديل الإجابة', 'edit-gap', g.id)}<button class="button primary" type="submit">اعتماد والانتقال للاختبار</button></div></form><p class="hint">تبقى الفجوة مفتوحة حتى مراجعة نتيجة الاختبار.</p></div>`); return;
    }
    editGap(id);
  }
  function editGap(id) {
    const g = gap(id); if (!g) return;
    openDialog('معالجة فجوة المعرفة', `<form class="form-stack brain-dialog" data-brain-form="gap-draft" data-id="${g.id}"><div class="brain-badges">${badge(g.type)}${badge(`${g.count} أسئلة مشابهة`, 'amber')}</div><h3>${escape(g.title)}</h3><blockquote>${escape(g.question)}</blockquote><p>${escape(g.required)}</p>
      ${g.id === 'returns' ? '<div class="brain-conflict"><div><b>الإصدار السابق</b><p>14 يومًا · الإصدار 2، صفحة 2</p></div><div><b>الإصدار الأحدث</b><p>7 أيام · الإصدار 3، صفحة 2</p></div></div>' : ''}
      <div class="field"><label for="brain-answer">الإجابة المعتمدة *</label><textarea id="brain-answer" name="answer" rows="4" required minlength="15" maxlength="1000" placeholder="اكتب الإجابة وفق سياستك المعتمدة…">${escape(g.answer || '')}</textarea><small>15 حرفًا على الأقل. أضف المدة والشروط عند الحاجة.</small></div>
      <div class="field"><label for="brain-source">مصدر الإجابة *</label><select id="brain-source" name="source" required><option value="">اختر المصدر الذي راجعته</option>${eligibleSources(g).map(f => `<option value="${escape(f.id)}" ${g.chosenSource === f.id ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select><small>راجع أي ملف جديد من قسم الملفات قبل استخدامه كمصدر للتصحيح.</small></div><p role="alert" id="brain-gap-error"></p><button type="submit" class="button primary">مراجعة قبل الاعتماد</button></form>`);
  }
  function testGap(id, run = false) {
    const g = gap(id); if (!g || !['retest', 'resolved'].includes(g.state)) return;
    if (!file(g.chosenSource)?.active) {
      openDialog('المصدر غير مفعّل', `<div class="brain-dialog"><p>أُوقف استخدام مصدر هذا التصحيح. راجع المصدر قبل إعادة الاختبار.</p>${button('مراجعة المصدر', 'file', g.chosenSource)}</div>`); return;
    }
    if (run) { g.tested = true; persist(); }
    openDialog('اختبار الإجابة بعد المعالجة', `<div class="brain-dialog"><span class="eyebrow">اختبار توضيحي · لا يستدعي نموذج ذكاء اصطناعي</span><h3>${escape(g.title)}</h3><blockquote>${escape(g.question)}</blockquote>
      ${run || g.state === 'resolved' ? `<div class="brain-answer"><h3>الإجابة بعد التصحيح</h3><p>${escape(g.answer)}</p><small>المصدر: ${escape(file(g.chosenSource)?.name)} · التصحيح الذي راجعته</small></div>${g.state === 'resolved' ? '<p class="summary-box" role="status">راجعت تطابق الإجابة مع المصدر في هذا المثال. تبقى متابعة الأسئلة الجديدة مطلوبة.</p>' : `<form data-brain-form="resolve-gap" data-id="${g.id}"><label class="check-label"><input type="checkbox" name="reviewed" required><span>راجعت الإجابة، وهي تطابق المصدر وتجيب عن هذا السؤال.</span></label><button type="submit" class="button primary">تأكيد اجتياز هذا الاختبار</button></form>`}` : `<p>اعتمدت الإجابة. شغّل المثال ثم راجع توافق الإجابة مع المصدر.</p>${button('تشغيل المثال التوضيحي', 'run-gap', g.id, true)}`}
      <p class="hint">اجتياز هذا المثال لا يرفع نسبة احتراف المبيعات ولا يضمن كل الإجابات.</p></div>`);
  }
  function evidence(id) {
    const d = dimensions.find(d => d.id === id); if (!d) return;
    openDialog('دليل التقييم وخطوة التحسين', `<div class="brain-dialog"><span class="eyebrow">عينة آخر 30 يومًا · مثال توضيحي</span><h3>${d.title}</h3><p>${d.observation}</p><blockquote>${d.question}</blockquote><div class="brain-answer"><h3>ما الذي نراجعه؟</h3><p>${d.improve}</p></div><p>درجة المحور: ${d.passed} ÷ 40 × 100 = ${d.score}% · وزنه ${d.weight}%.</p><p class="hint">هذه أمثلة تصميم وليست تقييمًا لمحادثات متجرك.</p><div class="dialog-foot">${button('جرّب إجابة', 'test')}${button('مراجعة فجوات المعرفة', 'go-gaps', '', true)}</div></div>`);
  }
  function testDialog() {
    openDialog('جرّب معرفة ساري', `<form class="form-stack brain-dialog" data-brain-form="test"><label for="brain-question">سؤال العميل</label><textarea id="brain-question" name="question" required maxlength="500" rows="3" placeholder="مثال: كم سعر بن كولومبيا؟"></textarea><p class="hint">محاكاة محلية تعرض إجابة من أمثلة المعرفة، وتطلب مساعدة الفريق عند غياب المصدر.</p><button type="submit" class="button primary">جرّب الإجابة</button><div id="brain-test-output" role="status"></div></form>`);
  }
  function testAnswer(question) {
    const match = data.gaps.find(g => ({ returns: /استرجاع|أرجع|ارجع|إرجاع/, delivery: /العلا|شحن|تشحن/, grinding: /طحن|مبتدئ/ })[g.id]?.test(question));
    const correction = match && ['retest', 'resolved'].includes(match.state) && file(match.chosenSource)?.active;
    const catalog = file('catalog');
    const result = correction ? { text: match.answer, source: file(match.chosenSource) } : !match && /كولومبيا|سعر/.test(question) && catalog.active ? { text: catalog.facts[0].text, source: catalog } : null;
    return result ? `<div class="brain-answer"><h3>إجابة بمصدر</h3><p>${escape(result.text)}</p>${button(`المصدر: ${result.source.name}`, 'file', result.source.id)}</div>` : '<div class="brain-warning"><h3>نحتاج معلومة مؤكدة</h3><p>لا توجد في أمثلة المعرفة المفعّلة إجابة مؤكدة لهذا السؤال. سأطلب مساعدة الفريق بدل تقديم معلومة غير موثقة.</p></div>';
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-brain-action]'); if (!target) return;
    const { brainAction: action, id } = target.dataset;
    if (action === 'navigate') navigate(id);
    if (action === 'file') fileDialog(id);
    if (action === 'add') openAdd();
    if (action === 'gap') gapDialog(id);
    if (action === 'edit-gap') editGap(id);
    if (action === 'run-gap') testGap(id, true);
    if (action === 'evidence') evidence(id);
    if (action === 'test') testDialog();
    if (action === 'go-gaps') { close(); navigate('gaps'); }
    if (action === 'filter-gaps') { gapFilter = id; refresh(); document.querySelector(`[data-brain-action="filter-gaps"][data-id="${id}"]`)?.focus({ preventScroll: true }); }
    if (action === 'toggle-file') {
      const f = file(id); if (!f || f.status !== 'ready') return;
      openDialog(f.active ? 'إيقاف استخدام المصدر' : 'تفعيل المصدر المراجع', `<div class="brain-dialog"><h3>${escape(f.name)}</h3><p>${f.active ? 'سيبقى الملف محفوظًا، وتتوقف أمثلته عن الظهور في اختبار المعرفة.' : 'سيصبح هذا المصدر متاحًا في اختبار المعرفة. راجع توافقه مع سياسة المتجر.'}</p>${button(f.active ? 'تأكيد الإيقاف' : 'تأكيد التفعيل', 'confirm-toggle', id, true)}<p class="hint">تغيير محلي في الموك أب فقط.</p></div>`);
    }
    if (action === 'confirm-toggle') { const f = file(id); if (f?.status === 'ready') { f.active = !f.active; if (!f.active) for (const g of data.gaps.filter(g => g.chosenSource === id && ['retest', 'resolved'].includes(g.state))) { g.state = 'retest'; g.tested = false; } persist(); close(); refresh(); toast('تم تحديث استخدام المصدر في المعاينة.'); } }
  });
  document.addEventListener('input', event => {
    if (event.target.dataset.brainInput !== 'search') return;
    search = event.target.value; const caret = event.target.selectionStart; refresh('brain-search'); document.getElementById('brain-search')?.setSelectionRange(caret, caret);
  });
  document.addEventListener('change', event => {
    if (event.target.dataset.brainInput === 'file-filter') { fileFilter = event.target.value; refresh('brain-file-filter'); }
    if (event.target.dataset.brainInput === 'period') { period = event.target.value; refresh('brain-period'); }
  });
  document.addEventListener('submit', event => {
    const form = event.target, type = form.dataset.brainForm; if (!type) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const values = new FormData(form), id = form.dataset.id;
    if (type === 'upload') {
      const attachment = form.querySelector('input[type=file]').files[0];
      if (!attachment || !/\.(pdf|docx|xlsx|txt)$/i.test(attachment.name) || attachment.size <= 0 || attachment.size > 5 * 1024 * 1024) { document.getElementById('brain-upload-error').textContent = 'اختر ملفًا غير فارغ من الأنواع المحددة بحجم لا يتجاوز 5 ميغابايت.'; return; }
      data.files.unshift({ id: `local-${Date.now()}-${data.files.length}`, name: attachment.name.slice(0, 200), type: attachment.name.split('.').pop().toUpperCase(), size: `${Math.max(1, Math.ceil(attachment.size / 1024))} كيلوبايت`, location: 'بانتظار المعالجة', date: 'أُضيف الآن في المعاينة', status: 'queued', active: false, facts: [] });
      persist(); close(); navigate('files'); toast('أُضيفت بيانات الملف محليًا. لم يُستخرج محتواه.');
    }
    if (type === 'approve-file') { const f = file(id); if (f?.status !== 'review' || !values.has('reviewed')) return; f.status = 'ready'; f.active = true; persist(); close(); refresh(); toast('تم اعتماد معلومات المثال وتفعيلها.'); }
    if (type === 'gap-draft') {
      const g = gap(id), answer = String(values.get('answer') || '').trim(), source = file(String(values.get('source') || ''));
      if (!g || !source?.facts.length || !eligibleSources(g).some(f => f.id === source.id) || answer.length < 15) { document.getElementById('brain-gap-error').textContent = 'اكتب إجابة واضحة من 15 حرفًا على الأقل، واختر مصدرًا للمراجعة.'; return; }
      g.answer = answer; g.chosenSource = source.id; g.state = 'draft'; g.tested = false; persist(); refresh(); gapDialog(id);
    }
    if (type === 'approve-gap') {
      const g = gap(id); if (g?.state !== 'draft' || !values.has('reviewed')) return;
      const source = file(g.chosenSource); if (!source || !eligibleSources(g).some(f => f.id === source.id)) return;
      g.state = 'retest';
      if (g.id === 'returns') { source.status = 'ready'; source.active = true; for (const f of data.files.filter(f => ['policy', 'legacy'].includes(f.id) && f.id !== g.chosenSource)) f.active = false; }
      persist(); refresh(); testGap(id);
    }
    if (type === 'resolve-gap') { const g = gap(id); if (g?.state !== 'retest' || !g.tested || !file(g.chosenSource)?.active || !values.has('reviewed')) return; g.state = 'resolved'; persist(); refresh(); testGap(id); toast('تم توثيق مراجعة الاختبار التوضيحي.'); }
    if (type === 'test') { document.getElementById('brain-test-output').innerHTML = testAnswer(String(values.get('question') || '').trim()); }
  });
  function reset() { data = JSON.parse(JSON.stringify(seed)); section = 'results'; search = ''; fileFilter = 'all'; gapFilter = 'all'; period = '30'; persist(); }
  return { render, openAdd, reset };
})();
