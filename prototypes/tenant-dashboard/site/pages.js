// Local interactions only. No provider calls, credentials, sending or payments.
window.TenantPages = (() => {
  const pages = window.TENANT_PAGES;
  const key = 'sary-page-mockups-v2';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* Private browsing. */ }
  let current, query = '', filter = 'all', period = '7', step = 0, selection = null, mode = 'normal', draft = {};
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href = route => `#/page${route}`;
  const action = (label, name, primary = false, extra = '') => `<button type="button" class="button ${primary ? 'primary' : ''}" data-page-action="${name}" ${extra}>${e(label)}</button>`;
  const link = (label, route, primary = false) => `<a class="button ${primary ? 'primary' : ''}" href="${href(route)}">${e(label)}</a>`;
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { toast('تعذر الحفظ في هذا المتصفح. بقيت التغييرات في الجلسة الحالية.'); } };
  const get = () => saved[current.route] || {};
  const store = patch => { saved[current.route] = {...get(), ...patch}; persist(); };
  function find(path) { return pages.find(p=>p.route===path) || pages.find(p=>p.route.includes(':') && new RegExp('^'+p.route.replace(/:[^/]+/g,'[^/]+')+'$').test(path)); }
  function reset(page) { current = page; query = ''; filter = 'all'; selection = null; step = 0; mode = 'normal'; draft = {}; }
  const related = page => pages.filter(p=>!p.redirect && p.group===page.group && p.route!==page.route && !p.route.includes(':') && p.kind!=='state').slice(0,4);
  const localNote = '<p class="page-local-note">نموذج تفاعلي · بيانات توضيحية محفوظة في هذا المتصفح فقط.</p>';
  function head(page) {
    const note = (window.PipelinePreview?.handles(page) || window.PerformancePreview?.handles(page) || window.TestMetricsPreview?.handles(page) || window.OverviewPreview?.handles(page)) ? '<p class="page-local-note">نموذج تفاعلي · بيانات مصطنعة لتجربة التصميم؛ لا تمثل نتائج متجر حقيقي.</p>' : window.InsightsPreview?.handles(page) ? '<p class="page-local-note">نموذج تفاعلي · تغييرات سجلات الكلمات في جلسة هذه الصفحة فقط، وتعود العينات الأصلية عند إعادة التحميل.</p>' : localNote;
    return `<div class="page-breadcrumb"><a href="#/overview">مساحة العمل</a><span>/</span><a href="${href('/merchant/tools')}">جميع الصفحات</a><span>/</span><span>${e(page.title)}</span></div>
      <header class="page-head"><div><div class="eyebrow">متجر نواة / ${e(labels[page.group] || 'مساحة العمل')}</div><h1>${e(window.PipelinePreview?.handles(page)?window.PipelinePreview.heading():page.route==='/merchant/test-sari'?'جرّب ساري':page.title)}</h1><p>${intro(page)}</p></div><div class="head-actions">${action(window.PipelinePreview?.handles(page)?window.PipelinePreview.primaryLabel():window.PerformancePreview?.handles(page)?window.PerformancePreview.primaryLabel():window.TestMetricsPreview?.handles(page)?window.TestMetricsPreview.primaryLabel():window.OverviewPreview?.handles(page)?window.OverviewPreview.primaryLabel():window.InsightsPreview?.handles(page)?window.InsightsPreview.primaryLabel():window.QuickResponsePreview?.handles(page)?window.QuickResponsePreview.primaryLabel():window.WebsiteImportPreview?.handles(page)?window.WebsiteImportPreview.primaryLabel():window.WebsiteReportsPreview?.handles(page)?'تحليل وتحديث المعرفة':page.action, 'primary', true, (window.PipelinePreview?.handles(page) && !window.PipelinePreview.canPrimary()) || (window.PerformancePreview?.handles(page) && !window.PerformancePreview.canPrimary()) || (window.TestMetricsPreview?.handles(page) && !window.TestMetricsPreview.canPrimary()) || (window.OverviewPreview?.handles(page) && !window.OverviewPreview.canPrimary()) || (window.InsightsPreview?.handles(page) && !window.InsightsPreview.canPrimary()) || (window.QuickResponsePreview?.handles(page) && !window.QuickResponsePreview.canPrimary()) || (window.NotificationPreview?.handles(page) && !window.NotificationPreview.canPrimary(page)) ? 'disabled' : '')}${action('حالات الصفحة', 'states')}</div></header>${note}`;
  }
  function intro(p) {
    if (p.route==='/merchant/test-sari') return 'اختبر إجابات مساعدك وقيّمها.';
    if (window.PipelinePreview?.handles(p)) return window.PipelinePreview.intro();
    if (window.PerformancePreview?.handles(p)) return 'قارن النشاط والطلبات والتقييمات المحفوظة بعينة واضحة وفترتين متساويتين.';
    if (window.TestMetricsPreview?.handles(p)) return 'راجع جلسات الاختبار المحفوظة والعينات وحدود القياس قبل تعديل المساعد.';
    if (window.OverviewPreview?.handles(p)) return 'صورة واضحة من السجلات المحفوظة، بفترة واحدة لكل الأقسام.';
    if (window.InsightsPreview?.handles(p)) return 'راجع ما تقوله البيانات، وحجم العينة وحدودها، قبل تغيير ردود المساعد.';
    const specific = {'/merchant/scheduled-reports':'حدّد ما تريد مراجعته، ولمن، وفي أي موعد. إعداد واضح في نموذج واحد.','/merchant/whatsapp-auto-notifications':'اختر الحدث، واكتب رسالة مناسبة، ثم راجع كيف ستظهر للعميل.','/merchant/integrations-dashboard':'راجع سجلات المزامنة والأخطاء، وافتح إعدادات المصدر عند الحاجة.'};
    if (specific[p.route]) return specific[p.route];
    return ({list:'المعلومات المهمة أولًا. ابحث، راجع التفاصيل، ثم اختر الإجراء المناسب.',form:'اضبط الأساسيات من مكان واحد. يمكنك مراجعة التغييرات قبل حفظها.',integration:'حالة الاتصال ومصدر البيانات وآخر مزامنة، بوضوح في صفحة واحدة.',analytics:'اختر الفترة، وافهم كل مؤشر، ثم صدّر البيانات التي تراجعها.',detail:'السجل وتفاصيله وآخر إجراء، دون فقدان سياق عملك.',calendar:'مواعيد فريقك في عرض واضح، مع التفاصيل وإجراءات المتابعة.',knowledge:'المعلومة من مصدرها، ومراجعتها قبل استخدامها في الرد.',privacy:'تحكّم ببياناتك وموافقاتك من مكان واحد.',pipeline:'تابع الفرص خطوة بخطوة، وافتح كل فرصة لمعرفة الإجراء التالي.',plans:'قارن على أساس احتياج نشاطك، ثم راجع التفاصيل قبل الاختيار.',import:'راجع الأعمدة والسجلات قبل الاعتماد.',result:'راجع الحالة المؤكدة قبل اتخاذ الخطوة التالية.'})[p.kind] || 'خطوة واضحة في كل مرة، والأدوات المرتبطة قريبة منك.';
  }
  function side(page, title = 'خطوتك التالية') {
    return `<aside class="panel panel-pad page-aside"><span class="eyebrow">${title}</span><h2>أكمل من هنا</h2><p>انتقل مباشرة إلى ما تحتاجه بعد مراجعة هذه الصفحة.</p><div class="page-related">${related(page).map(p=>`<a href="${href(p.route)}">${e(p.title)} ${icon('left')}</a>`).join('')}</div><div class="summary-box"><strong>القرار بيدك</strong><p>تظهر نتيجة الحفظ هنا. الإجراءات الخارجية تحتاج تأكيدًا في التطبيق الفعلي.</p></div></aside>`;
  }
  function cells(p, i) {
    return p.labels.map((label, column)=> {
      if(column===0) return i === 0 ? p.sample : `${p.sample} · ${i+1}`;
      if(/قيمة|مبلغ|سعر|إجمالي/.test(label)) return `${[256,150,480,72,320][i%5]} ر.س`;
      if(/تاريخ|موعد|وقت|تحديث|مزامنة|نشاط|صلاحية/.test(label)) return ['اليوم، 10:30','أمس، 15:20','25 سبتمبر، 09:00'][i%3];
      if(/حالة|نتيجة|توفّر|التوفر|مرحلة|متابعة/.test(label)) return i%3===0?'تحتاج مراجعة':'مكتمل';
      if(/عميل|عضو|مسؤول|مقدم/.test(label)) return ['نورة أحمد','سارة محمد','خالد عبدالله'][i%3];
      if(/مخزون|نقاط|مرات|مقاعد|متدرب|عدد|سجلات|طلبات|المحادثات|العملاء|الخدمات/.test(label)) return String([24,8,16,3,12][i%5]);
      if(/بريد/.test(label)) return `team${i+1}@example.test`;
      if(/مصدر/.test(label)) return i%2?'محلي':'سلة';
      if(/دور|تخصص/.test(label)) return ['الدعم','المبيعات','مدير المتجر'][i%3];
      if(/مدة/.test(label)) return '60 دقيقة';
      if(/موافقة/.test(label)) return 'بحاجة إلى تحقق';
      return ['قيد المراجعة','تمت المراجعة','محفوظ'][i%3];
    });
  }
  function rows(page) { return get().rows || Array.from({length:8},(_,i)=>({id:i+1,cells:cells(page,i),state:i%3===0?'review':'done'})); }
  function toolbar() { return `<div class="toolbar"><div class="search-field">${icon('search')}<label class="sr-only" for="page-search">ابحث في الصفحة</label><input class="control" id="page-search" placeholder="ابحث بالاسم أو المرجع…" value="${e(query)}" data-page-input="search"></div><label class="sr-only" for="page-filter">الحالة</label><select id="page-filter" class="control" data-page-input="filter"><option value="all">كل الحالات</option><option value="review" ${filter==='review'?'selected':''}>تحتاج مراجعة</option><option value="done" ${filter==='done'?'selected':''}>مكتملة</option></select>${action('تصدير المعروض','export')}</div>`; }
  function list(p) {
    const all = rows(p), shown = all.filter(r=>r.cells.join(' ').includes(query) && (filter==='all'||r.state===filter));
    return `<div class="page-summary"><span><b>${all.length}</b> سجلات</span><span><b>${all.filter(r=>r.state==='review').length}</b> تحتاج مراجعة</span><span>آخر عرض · الآن</span></div>${toolbar()}<section class="panel"><div class="table-scroll page-data-table"><table><caption class="sr-only">${e(p.title)}</caption><thead><tr>${p.labels.map(c=>`<th scope="col">${e(c)}</th>`).join('')}<th scope="col">الإجراء</th></tr></thead><tbody>${shown.map(r=>`<tr>${r.cells.map((v,i)=>`<td data-label="${e(p.labels[i])}">${i===0?`<strong>${e(v)}</strong><small>#${1048+r.id}</small>`:e(v)}</td>`).join('')}<td>${action('عرض التفاصيل','detail',false,`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div>${shown.length?'':`<div class="empty"><h2>لا توجد نتائج مطابقة</h2><p>جرّب اسمًا آخر أو أزل التصفية.</p>${action('مسح البحث والتصفية','clear')}</div>`}<div class="table-bottom"><span role="status">${shown.length} من ${all.length} سجل</span><span>بيانات توضيحية · صفحة واحدة</span></div></section>`;
  }
  function field(label, i, value = '') {
    const check = /تفعيل|تنبيه|إشعارات|إلغاء الحجز|تأكيد الحجز|تعديل الموعد|تحديث الشحن|تأكيد الطلب|اكتمال الطلب/.test(label);
    if(check)return `<label class="check-label"><input type="checkbox" name="f${i}" ${value===false?'':'checked'}><span>${e(label)}</span></label>`;
    const options = /اللغة|لغة المساعد/.test(label)?['العربية','الإنجليزية']: /أسلوب|اللهجة/.test(label)?['ودود وواضح','رسمي ومختصر']: /نوع النشاط/.test(label)?['منتجات','خدمات','منتجات وخدمات']: /الجمهور/.test(label)?['عملاء وافقوا على التسويق','عملاء متكررون بموافقة']: /عملة/.test(label)?['الريال السعودي','الدولار الأمريكي']:null;
    const textarea = /وصف|محتوى|نص الرسالة|رسالة الترحيب|قالب الرسالة|حدود|عبارات/.test(label);
    const numeric = /بالريال|بالدقائق|نقاط لكل|صلاحية النقاط|قيمة استبدال|^السعر$|^المخزون$|^الكمية$/.test(label);
    return `<div class="field"><label for="page-f${i}">${e(label)}${i===0?' *':''}</label>${options?`<select id="page-f${i}" name="f${i}">${options.map(o=>`<option ${o===value?'selected':''}>${e(o)}</option>`).join('')}</select>`:textarea?`<textarea id="page-f${i}" name="f${i}" ${i===0?'required':''} rows="4" maxlength="1000">${e(value)}</textarea>`:`<input id="page-f${i}" name="f${i}" ${i===0?'required':''} type="${numeric?'number':/بريد/.test(label)?'email':/رابط الموقع|رابط المتجر/.test(label)?'url':'text'}" ${numeric?'min="1" max="100000"':''} maxlength="200" value="${e(value)}" placeholder="${e(label)}">`}</div>`;
  }
  function form(p) {
    const values = get().values || {};
    return `<div class="setting-layout"><form class="panel panel-pad form-stack" data-page-form="settings"><div class="panel-head"><div><h2>المعلومات الأساسية</h2><p>الحقول المطلوبة بعلامة *</p></div><span class="status gray">${get().values?'محفوظ محليًا':'مسودة'}</span></div>${p.labels.map((v,i)=>field(v,i,values[`f${i}`] ?? (i===0?p.sample:''))).join('')}<details class="page-optional"><summary>تفاصيل إضافية · اختياري</summary>${field('ملاحظة للفريق',10,values.f10||'')}</details><div class="setting-footer"><button class="button primary" type="submit">${e(p.action)}</button><span class="hint">تظهر خلاصة التغييرات بعد الحفظ.</span></div><p class="page-save-status" role="status">${get().savedAt?'تم حفظ التغييرات في هذا المتصفح.':''}</p></form>${side(p)}</div>`;
  }
  function detail(p, row) {
    row ||= {cells:cells(p,0),id:1};
    return `<div class="setting-layout"><section class="panel panel-pad"><div class="panel-head"><div><span class="eyebrow">سجل #${1048+row.id}</span><h2>${e(row.cells[0])}</h2></div><span class="status amber">للمراجعة</span></div><dl class="page-facts">${p.labels.map((v,i)=>`<div><dt>${e(v)}</dt><dd>${e(row.cells[i])}</dd></div>`).join('')}</dl><h3>سجل النشاط</h3><ol class="page-timeline"><li><b>تم إنشاء السجل</b><span>اليوم · 09:30</span></li><li><b>مراجعة التفاصيل</b><span>البيانات جاهزة لمراجعتك</span></li><li><b>الخطوة التالية</b><span>اختر الإجراء بعد التأكد من المعلومات</span></li></ol><div class="dialog-foot">${action('العودة للقائمة','back')}${action('إضافة ملاحظة','note',true)}</div>${get().note?`<p class="summary-box">${e(get().note)}</p>`:''}</section>${side(p)}</div>`;
  }
  function analytics(p) {
    const factor=period==='30'?3:1;
    return `<div class="toolbar"><label for="page-period">الفترة</label><select id="page-period" class="control" data-page-input="period"><option value="7">آخر 7 أيام</option><option value="30" ${period==='30'?'selected':''}>آخر 30 يومًا</option></select><span class="hint">قيم توضيحية لتجربة المقارنة · SAR</span></div><div class="kpis">${p.labels.map((label,i)=>`<div class="panel kpi"><span class="kpi-top">${e(label)}</span><div class="kpi-value">${[1840,42,38,16][i%4]*factor}</div><p class="kpi-note">ضمن الفترة المختارة</p></div>`).join('')}</div><div class="setting-layout"><section class="panel panel-pad"><div class="panel-head"><div><h2>${e(p.sample)}</h2><p>اتجاه النشاط خلال ${period} أيام</p></div><span class="status gray">توضيحي</span></div><div class="page-chart" role="img" aria-label="رسم توضيحي لاتجاه النشاط خلال ${period} أيام">${[36,56,44,78,60,91,73].map((v,i)=>`<div><span style="height:${v}%" title="${v*factor} سجل"></span><small>${i+1}</small></div>`).join('')}</div><details class="page-optional"><summary>تعريف المؤشرات وطريقة القراءة</summary><p>تعرض هذه المعاينة بيانات مصطنعة. في التطبيق تعتمد القيم على الفترة والعملة وحالة السجل، ولا يُعد الطلب تحصيلًا مؤكدًا قبل تأكيد الدفع.</p></details></section>${side(p)}</div>`;
  }
  function integration(p) {
    const connected=!!get().connected;
    return `<div class="setting-layout"><section class="panel panel-pad"><div class="panel-head"><span class="icon-tile">${icon('link')}</span><span class="status ${connected?'':'amber'}">${connected?'متصل تجريبيًا':'غير متصل'}</span></div><h2>${e(p.sample)}</h2><p class="hint">${connected?'نجحت محاكاة التحقق المحلي. لا يوجد اتصال بمزوّد خارجي.':'ابدأ الربط ثم راجع نطاق البيانات قبل تفعيل المزامنة.'}</p><ol class="page-timeline"><li><b>اختيار المصدر</b><span>${e(p.title)}</span></li><li><b>التفويض</b><span>${connected?'تمت المحاكاة':'بانتظار البدء'}</span></li><li><b>التحقق والمزامنة</b><span>${connected?'12 سجلًا توضيحيًا':'لم تتم مزامنة بيانات بعد'}</span></li></ol><div class="dialog-foot">${action(connected?'مزامنة تجريبية':'ابدأ تجربة الربط','connect',true)}${connected?action('فصل الربط التجريبي','disconnect'):''}</div><details class="page-optional"><summary>ما الذي ستتم مزامنته؟</summary><div class="form-stack">${p.labels.map(v=>`<label class="check-label"><input type="checkbox" checked><span>${e(v)}</span></label>`).join('')}</div></details><p role="status" class="page-save-status">${get().synced?'اكتملت المزامنة التوضيحية · الآن':''}</p></section>${side(p,'بعد الربط')}</div>`;
  }
  function hub(p) { const members=pages.filter(x=>!x.redirect&&x.group===p.group&&!x.route.includes(':')&&x.route!==p.route&&x.kind!=='state'&&(!p.route.includes('integrations')||x.kind==='integration'));return `<div class="page-hub">${members.slice(0,12).map((x,i)=>`<a class="panel panel-pad page-hub-card" href="${href(x.route)}"><span class="icon-tile">${icon(['box','chart','chat','link'][i%4])}</span><h2>${e(x.title)}</h2><p>${intro(x)}</p><span class="text-link">افتح الصفحة ${icon('left')}</span></a>`).join('')}</div>`; }
  function pipeline(p) {return `<div class="page-board">${['جديدة','تحتاج متابعة','عرض سعر','مكتملة'].map((s,i)=>`<section class="panel panel-pad"><div class="panel-head"><h2>${s}</h2><span class="status gray">2</span></div>${[0,1].map(j=>`<button class="page-opportunity" data-page-action="detail" data-id="${i*2+j+1}"><small>فرصة #${i*2+j+1}</small><b>${e(p.sample)} ${j+1}</b><span>${['نورة أحمد','خالد محمد'][j]} · ${450+j*200} ر.س</span><em>عرض الخطوة التالية ←</em></button>`).join('')}</section>`).join('')}</div>`; }
  function knowledge() { return window.SaryBrainPreview.render(); }
  function media(p) {return `${toolbar()}<div class="page-hub">${['دليل المنتجات','صورة بن كولومبيا','سياسة الاسترجاع',...(get().files||[])].filter(x=>x.includes(query)).map((s,i)=>`<article class="panel page-media"><div class="page-media-preview">${icon(i===1?'box':'file')}<span>${i===1?'JPG':'PDF'}</span></div><div class="panel-pad"><h2>${e(s)}</h2><p class="hint">${i===1?'صورة':'مستند'} · معاينة محلية</p>${action('عرض التفاصيل','media',false,`data-title="${e(s)}"`)}</div></article>`).join('')}</div>`; }
  function importer(p) {return `<div class="setting-layout"><section class="panel panel-pad"><div class="page-dropzone">${icon('upload')}<h2>${p.route.includes('export')?'حدد البيانات للتصدير':'راجع ملفك قبل الاستيراد'}</h2><p>جرّب المعاينة بسجلات محلية لتحديد الأعمدة والأخطاء.</p>${action('استخدم ملفًا توضيحيًا','preview-import',true)}</div>${get().importPreview?`<div class="page-import-preview"><h3>معاينة 3 سجلات</h3><div class="summary-box">سجلان جاهزان · سجل واحد يحتاج سعرًا</div><div class="table-scroll"><table><thead><tr><th>الاسم</th><th>السعر</th><th>الحالة</th></tr></thead><tbody><tr><td>بن كولومبيا</td><td>64</td><td>جاهز</td></tr><tr><td>كوب نواة</td><td>48</td><td>جاهز</td></tr><tr><td>عدة ترشيح</td><td>—</td><td>السعر مطلوب</td></tr></tbody></table></div>${action('اعتماد السجلين الصحيحين محليًا','confirm-import',true)}</div>`:''}<p class="page-save-status" role="status">${get().imported?'تم اعتماد سجلين في المعاينة. بقي السجل الناقص للمراجعة.':''}</p></section>${side(p)}</div>`; }
  function assistant(p) { return `<div class="setting-layout"><section class="panel panel-pad"><div class="panel-head"><div><h2>اسأل من منظور عميلك</h2><p>إجابة محلية ثابتة لتجربة الواجهة.</p></div><span class="status gray">اختبار</span></div><div class="page-answer" role="status">${get().answer?`<p>سعر بن كولومبيا 64 ر.س للعبوة 250 جم. هل تفضّل الحبوب أم الطحنة المقطرة؟</p><small>المصدر: كتالوج المعاينة · منتج #1</small>`:'اكتب سؤالًا لتراجع شكل الإجابة ومصدرها.'}</div><form class="form-stack" data-page-form="assistant">${field('سؤال العميل',0,'')}<button class="button primary" type="submit">اختبر الإجابة</button></form></section>${side(p)}</div>`; }
  function setup(p) {const stages=[['نشاطك',['اسم النشاط','نوع النشاط','رقم التواصل']],['ما تقدمه',['اسم أول منتج أو خدمة','السعر بالريال']],['مساعدك',['أسلوب الرد','رسالة الترحيب']],['المراجعة',[]]];return `<div class="setting-layout"><form class="panel panel-pad form-stack" data-page-form="setup"><nav class="page-steps" aria-label="مراحل الإعداد">${stages.map((s,i)=>`<span ${i===step?'aria-current="step"':''}>${i+1} · ${s[0]}</span>`).join('')}</nav><h2>${stages[step][0]}</h2>${step<3?stages[step][1].map((v,i)=>field(v,i,draft[`${step}-${i}`]||'')).join(''):`<dl class="page-facts">${Object.entries(draft).filter(([k])=>k.endsWith('-0')).map(([k,v])=>`<div><dt>${stages[Number(k[0])][0]}</dt><dd>${e(v)}</dd></div>`).join('')}</dl><p>ربط واتساب خطوة مستقلة بعد الإعداد.</p>`}<div class="dialog-foot">${step?action('السابق','previous'):''}<button class="button primary" type="submit">${step===3?'اعتماد المعاينة':'متابعة'}</button></div></form>${side(p)}</div>`;}
  function plans(p) {return `<div class="page-plans">${['البداية','النمو','الأعمال'].map((name,i)=>`<section class="panel panel-pad ${i===1?'page-recommended':''}"><span class="eyebrow">${i===1?'للنشاط المتنامي':'خيار مرن'}</span><h2>${name}</h2><p class="plan-price">${[99,249,499][i]} <small>ر.س / شهر · توضيحي</small></p><ul><li>${[500,2000,5000][i]} محادثة</li><li>${[1,3,10][i]} أعضاء للفريق</li><li>معرفة ومتابعة وتقارير</li></ul><p class="hint">أسعار مصطنعة للموك أب؛ راجع الباقات الفعلية عند الشراء.</p>${action('راجع الاختيار','choose-plan',i===1,`data-plan="${i}"`)}</section>`).join('')}</div>`;}
  function billing(p) {return `<div class="setting-layout"><section class="panel panel-pad"><span class="status gray">اشتراك توضيحي</span><h2>باقة النمو</h2><p class="plan-price">249 <small>ر.س / شهر · توضيحي</small></p><div class="summary-box"><b>720 من 2,000 محادثة</b><progress value="720" max="2000" aria-label="استهلاك المحادثات"></progress><p>الفترة الحالية · 1–30 سبتمبر</p></div><div class="dialog-foot">${link('مقارنة الباقات','/merchant/subscription/compare',true)}${link('حدود الاستخدام','/merchant/usage-dashboard')}</div><h3>الفواتير</h3><div class="list-row"><div><b>فاتورة سبتمبر</b><p>249 ر.س · بيانات توضيحية</p></div>${action('معاينة','invoice')}</div></section>${side(p)}</div>`;}
  function checkout(p) {const choice=Number.isInteger(saved.selectedPlan)&&saved.selectedPlan>=0&&saved.selectedPlan<3?saved.selectedPlan:1;return `<div class="setting-layout"><section class="panel panel-pad"><h2>راجع اشتراكك</h2><dl class="page-facts"><div><dt>الباقة</dt><dd>${['البداية','النمو','الأعمال'][choice]}</dd></div><div><dt>الفترة</dt><dd>شهر واحد</dd></div><div><dt>الإجمالي شامل الضريبة</dt><dd>${[99,249,499][choice]} ر.س · توضيحي</dd></div></dl><div class="summary-box">هذه معاينة محلية. لا تُدخل بيانات بطاقة ولا يتم تحصيل أي مبلغ.</div><div class="dialog-foot">${link('تغيير الباقة','/merchant/subscription/plans')}${action('معاينة نتيجة الدفع','payment',true)}</div></section>${side(p)}</div>`;}
  function result(p) {
    const integration = p.route.includes('/zid/');
    const cancelled = p.route.includes('cancel');
    return `<section class="panel page-result"><span class="icon-tile">${icon(cancelled?'alert':'clock')}</span><h2>${cancelled?'لم يكتمل الدفع':integration?'جارٍ التحقق من ربط زد':'بانتظار تأكيد الدفع'}</h2><p>${integration?'راجع حالة اتصال متجرك قبل مزامنة المنتجات والطلبات.':'راجع حالة اشتراكك قبل إعادة محاولة الدفع.'}</p>${get().verified?`<div class="summary-box" role="status">${integration?'اكتملت محاكاة التحقق من الربط. لم يُربط متجر حقيقي.':'اكتملت محاكاة التحقق محليًا. ليست عملية دفع حقيقية.'}</div>`:''}<div class="dialog-foot">${action('جرّب التحقق','verify',true)}${link(integration?'مراجعة اتصال زد':'مراجعة الاشتراك',integration?'/merchant/integrations/zid':'/merchant/subscriptions')}</div></section>`;
  }
  function privacy(p) {return `<div class="setting-layout"><section class="panel panel-pad"><h2>بياناتك تحت تحكمك</h2>${[['نسخة من بياناتك','اطلب ملفًا بمعلومات حسابك ونشاطك.','export-private'],['الموافقات','راجع الموافقات التي اخترتها.','consents'],['الجلسات','راجع الأجهزة التي تستخدم حسابك.','sessions']].map(([a,b,c])=>`<div class="list-row"><div><h3>${a}</h3><p>${b}</p></div>${action('مراجعة',c)}</div>`).join('')}<details class="page-optional"><summary>إغلاق الحساب · إجراء حساس</summary><p>يتطلب تأكيد الهوية ومراجعة أثر الحذف في التطبيق الفعلي.</p>${action('راجع أثر الإغلاق','close-account')}</details></section>${side(p)}</div>`;}
  function guide(p) {return `<div class="setting-layout"><section class="panel panel-pad"><h2>أربع خطوات واضحة</h2><ol class="page-timeline">${p.labels.map((l,i)=>`<li><b>${i+1}. ${e(l)}</b><span>تظهر نتيجة الخطوة قبل المتابعة، ويمكن العودة لتصحيحها.</span></li>`).join('')}</ol>${link('افتح ربط واتساب','/merchant/whatsapp',true)}</section>${side(p)}</div>`;}
  function analysis(p) {return form(p)+(get().analyzed?'<section class="panel panel-pad"><h2>معاينة نتائج التحليل</h2><div class="summary-box">3 صفحات معرفة · سياستان · 5 أسئلة شائعة. بيانات توضيحية؛ لم يُجلب الموقع.</div></section>':'');}
  function state(p, kind) {
    const config = {missing:['404','هذه الصفحة ليست هنا','قد يكون الرابط تغير. ابحث عن الأداة أو عد إلى مساحة عملك.'],error:['500','تعذّر عرض الصفحة','حدث خلل أثناء التحميل. أعد المحاولة أو افتح قسمًا آخر.'],offline:['CONNECTION','تعذّر الاتصال','تحقق من اتصالك ثم أعد المحاولة. تبقى البيانات غير المؤكدة غير معروضة.'],forbidden:['403','تحتاج صلاحية لهذا القسم','اطلب من مالك المتجر مراجعة صلاحياتك أو افتح قسمًا آخر.'],session:['401','سجّل الدخول إلى مساحة عملك','عند انتهاء الجلسة تعود إلى تسجيل الدخول قبل الوصول إلى بيانات متجرك.'],loading:['LOADING','نجهّز مساحة عملك','جارٍ تحميل أحدث البيانات…'],empty:['START','مساحتك جاهزة للبداية','لا توجد عناصر بعد. أضف أول عنصر لتبدأ.']}[kind] || ['404','هذه الصفحة ليست هنا','ارجع إلى مساحة العمل.'];
    return `<section class="page-recovery" data-preview-state="${kind}" ${kind==='loading'?'aria-busy="true"':''}><div class="page-recovery-art" aria-hidden="true"><span>${icon(kind==='missing'?'search':kind==='empty'?'spark':'refresh')}</span><b>${config[0]}</b></div><div><p class="eyebrow">مساحة التاجر · ساري</p><h1>${config[1]}</h1><p>${config[2]}</p>${kind==='loading'?'<div class="skeleton skeleton-row" role="status" aria-label="جارٍ التحميل"></div>':''}<div class="page-recovery-actions">${action(kind==='empty'?'أضف أول عنصر':kind==='session'?'معاينة استعادة الجلسة':kind==='missing'||kind==='forbidden'?'العودة لمساحة العمل':'إعادة المحاولة','recover',true)}${link('ابحث عن أداة','/merchant/tools')}</div><p class="hint">تحتاج مساعدة؟ ${link('خيارات الدعم','/merchant/settings')}</p></div></section>`;
  }
  function renderPage(p) {
    if(current?.route!==p.route)reset(p);
    if(/^\/merchant\/(?:services(?:\/|$)|payments(?:\/|$)|payment-links$|usage$|usage-dashboard$|notifications$|merchant-payments$|payment-settings$|settings$|currency-settings$|notification-settings$|competitor-analysis$|order-notifications$|reviews$|booking-reviews$|scheduled-messages$|media-library$|promotions$|discounts$|referrals$|abandoned-carts$|occasion-campaigns$|service-categories$|service-packages$|staff$|bookings$|integrations\/(?:byaan|zid|calendly)$|zid\/(?:settings|products|sync-logs|callback)$|woocommerce\/(?:settings|products|orders|analytics)$|byaan-dashboard$|salla$|platform-integrations$|calendar(?:\/settings)?$)/.test(p.route)){const raw=location.hash.slice(6).split('?'),path=/^\/merchant\/(?:services(?:\/|$)|payments(?:\/|$)|payment-links$|usage$|usage-dashboard$|notifications$|merchant-payments$|payment-settings$|settings$|currency-settings$|notification-settings$|competitor-analysis$|order-notifications$|reviews$|booking-reviews$|scheduled-messages$|media-library$|promotions$|discounts$|referrals$|abandoned-carts$|occasion-campaigns$|service-categories$|service-packages$|staff$|bookings$|integrations\/(?:byaan|zid|calendly)$|zid\/(?:settings|products|sync-logs|callback)$|woocommerce\/(?:settings|products|orders|analytics)$|byaan-dashboard$|salla$|platform-integrations$|calendar(?:\/settings)?$)/.test(raw[0])?raw[0]:'/merchant/services',target=new URLSearchParams(raw[1]);target.set('embed','brain');target.set('path',path);return '<section><p class="page-local-note">الصفحة من مكونات التطبيق الفعلية · <a href="./service-workspace.html?'+e(target.toString().replace('embed=brain&','').replace('embed=brain',''))+'">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="معاينة صفحة التطبيق" src="./service-workspace.html?'+e(target.toString())+'" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(/^\/merchant\/campaigns(?:\/|$)/.test(p.route)){const raw=location.hash.slice(6).split('?'),path=/^\/merchant\/campaigns(?:\/|$)/.test(raw[0])?raw[0]:'/merchant/campaigns',target=new URLSearchParams(raw[1]);target.set('embed','brain');target.set('path',path);return '<section><p class="page-local-note">الحملات من صفحات التطبيق الفعلية · <a href="./campaign-workspace.html?'+e(target.toString().replace('embed=brain&','').replace('embed=brain',''))+'">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب الحملات" src="./campaign-workspace.html?'+e(target.toString())+'" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(p.route==='/merchant/conversations'){const query=new URLSearchParams(location.hash.split('?')[1]),target=new URLSearchParams({embed:'brain'});for(const key of ['lang','tenant','scenario','phone','page','conversationId','history','stage','needs_human'])if(query.has(key))target.set(key,query.get(key));return '<section><p class="page-local-note">المحادثات من شاشة التطبيق الفعلية · <a href="./inbox.html?'+e(target.toString().replace('embed=brain&','').replace('embed=brain',''))+'">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب المحادثات" src="./inbox.html?'+e(target.toString())+'" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(mode!=='normal')return state(p,mode);
    if(p.kind==='state')return state(p,p.state);
    if(p.redirect)return renderPage(find(p.redirect));
    if(['message-analytics','sari-analytics','advanced-analytics','analytics-dashboard','voice-messages','analysis'].some(name=>p.route==='/merchant/'+name)){const query=new URLSearchParams(location.hash.split('?')[1]),target=new URLSearchParams({embed:'brain'});for(const key of ['lang','range','tab','tenant','scenario'])if(query.has(key))target.set(key,query.get(key));return '<section><p class="page-local-note">تحليلات الرسائل من شاشة التطبيق الفعلية · <a href="./messages-analytics.html">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب تحليلات الرسائل" src="./messages-analytics.html?'+e(target.toString())+'" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(p.route==='/merchant/analytics'){const query=new URLSearchParams(location.hash.split('?')[1]),target=new URLSearchParams({embed:'brain'});for(const key of ['lang','range','tab','tenant','scenario'])if(query.has(key))target.set(key,query.get(key));return '<section><p class="page-local-note">تحليلات المبيعات من شاشة التطبيق الفعلية · <a href="./sales-analytics.html">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب تحليلات المبيعات" src="./sales-analytics.html?'+e(target.toString())+'" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(p.route==='/merchant/dashboard')return '<section><p class="page-local-note">الرئيسية من شاشة التطبيق الفعلية · <a href="./dashboard.html">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب الرئيسية" src="./dashboard.html?embed=brain" style="width:100%;height:1100px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';
    if(p.route==='/merchant/ai-hub')return '<section><p class="page-local-note">مركز المساعد من شاشة التطبيق الفعلية · <a href="./assistant-settings.html?page=hub">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب مركز المساعد" src="./assistant-settings.html?embed=brain&page=hub" style="width:100%;height:1000px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';
    if(p.route==='/merchant/bot-settings')return '<section class="space-y-4"><p class="page-local-note">شاشة التطبيق الفعلية ببيانات محاكاة معزولة · <a href="./assistant-settings.html">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب سلوك المساعد" src="./assistant-settings.html?embed=brain" style="width:100%;height:1000px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';
    if(['/merchant/human-takeover','/merchant/language-settings'].includes(p.route)){const pane=p.route.endsWith('human-takeover')?'takeover':'language';return '<section class="space-y-4"><p class="page-local-note">شاشات التطبيق الفعلية ببيانات محاكاة معزولة · <a href="./assistant-options.html?page='+pane+'">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب خيارات المساعد" src="./assistant-options.html?embed=brain&page='+pane+'" style="width:100%;height:1000px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';}
    if(p.route==='/merchant/virtual-team')return '<section class="space-y-4"><p class="page-local-note">محرر التطبيق الفعلي ببيانات محاكاة معزولة · <a href="./personas.html">فتح المعاينة المستقلة</a></p><iframe data-brain-preview title="موك أب شخصيات العمل" src="./personas.html?embed=brain" style="width:100%;height:900px;border:0;display:block;scroll-margin-top:80px"></iframe></section>';
    if(window.OrderPreview?.handles(p))return window.OrderPreview.render();
    if(window.ToolsPreview?.handles(p))return window.ToolsPreview.render();
    if(window.ReportPreview?.handles(p))return window.ReportPreview.render();
    if(window.CustomerPreview?.handles(p))return window.CustomerPreview.render();
    if(window.SetupPreview?.handles(p))return window.SetupPreview.render();
    if(window.ProductPreview?.handles(p))return window.ProductPreview.render();
    if(window.ImportPreview?.handles(p))return window.ImportPreview.render(p);
    if(window.QuotationPreview?.handles(p))return window.QuotationPreview.render();
    const renderers={list,form,detail,analytics,integration,hub,pipeline,knowledge,media,import:importer,assistant,setup,plans,billing,checkout,result,privacy,guide,analysis,overview:()=>renderPage(find('/merchant/dashboard')),inbox:()=>inbox()};
      const content=window.PipelinePreview?.handles(p)?window.PipelinePreview.render(p):window.PerformancePreview?.handles(p)?window.PerformancePreview.render(p):window.TestMetricsPreview?.handles(p)?window.TestMetricsPreview.render(p):window.OverviewPreview?.handles(p)?window.OverviewPreview.render(p):window.InsightsPreview?.handles(p)?window.InsightsPreview.render(p):window.QuickResponsePreview?.handles(p)?window.QuickResponsePreview.render(p):window.WebsiteImportPreview?.handles(p)?window.WebsiteImportPreview.render(p):window.WebsiteReportsPreview?.handles(p)?window.WebsiteReportsPreview.render(p):window.WhatsAppPreview?.handles(p)?window.WhatsAppPreview.render(p):window.SubscriptionPreview?.handles(p)?window.SubscriptionPreview.render(p):window.TestingPreview?.handles(p)?window.TestingPreview.render(p):window.NotificationPreview?.handles(p)?window.NotificationPreview.render(p):selection?detail(p,rows(p).find(r=>r.id===selection)):renderers[p.kind](p);
    return (['overview','inbox'].includes(p.kind)?`<div class="page-breadcrumb">${link('جميع الصفحات','/merchant/tools')}${action('حالات الصفحة','states')}</div>`:head(p))+content;
  }
  function rerender(keep = false) { render(keep); }
  function createDialog() {
    const labels=current.kind==='knowledge'?['اسم المصدر','وصف المصدر']:current.kind==='media'?['اسم الملف','نوع الملف']:current.labels.slice(0,3);
    openDialog(current.action,`<form class="form-stack" data-page-form="create">${labels.map((v,i)=>field(v,i,'')).join('')}<p class="hint">إضافة محلية لتجربة سير العمل.</p><div class="dialog-foot"><button type="submit" class="button primary">حفظ المعاينة</button>${action('إلغاء','cancel')}</div></form>`);
  }
  function primary() {
    if(window.PipelinePreview?.handles(current))return window.PipelinePreview.primary(current);
    if(window.PerformancePreview?.handles(current))return window.PerformancePreview.primary(current);
    if(window.TestMetricsPreview?.handles(current))return window.TestMetricsPreview.primary(current);
    if(window.OverviewPreview?.handles(current))return window.OverviewPreview.primary(current);
    if(window.InsightsPreview?.handles(current))return window.InsightsPreview.primary(current);
    if(window.QuickResponsePreview?.handles(current))return window.QuickResponsePreview.primary(current);
    if(window.WebsiteImportPreview?.handles(current))return window.WebsiteImportPreview.primary(current);
    if(window.WebsiteReportsPreview?.handles(current))return window.WebsiteReportsPreview.primary(current);
    if(window.WhatsAppPreview?.handles(current))return window.WhatsAppPreview.primary(current);
    if(window.SubscriptionPreview?.handles(current))return window.SubscriptionPreview.primary(current);
    if(window.TestingPreview?.handles(current))return window.TestingPreview.primary(current);
    if(window.NotificationPreview?.handles(current))return window.NotificationPreview.primary(current);
    if(current.kind==='list'){
      if(current.route==='/merchant/campaigns'){location.hash=href('/merchant/campaigns/new');return;}
      if(/فتح|مراجعة|متابعة|عرض التفاصيل/.test(current.action)){selection=rows(current)[0]?.id;return rerender();}
      if(/مزامنة|تحديث|مقروء/.test(current.action)){store({synced:true});return review('اكتملت المعاينة','تم تحديث العرض التجريبي محليًا دون الاتصال بمزوّد خارجي.');}
      if(/نسخ/.test(current.action))return review('رابط الدعوة التوضيحي','https://example.test/invite/nawa');
      return createDialog();
    }
    if(current.kind==='knowledge')return window.SaryBrainPreview.openAdd();
    if(['media','pipeline'].includes(current.kind))return createDialog();
    if(['form','analysis','setup','assistant'].includes(current.kind))return document.querySelector('[data-page-form]')?.requestSubmit();
    if(current.kind==='integration')return connect();
    if(current.kind==='analytics')return csv('sary-report.csv',current.labels,[current.labels.map((_,i)=>[1840,42,38,16][i%4]*(period==='30'?3:1))]);
    if(current.kind==='import'){store({importPreview:true});return rerender();}
    if(current.kind==='directory'){document.getElementById('page-search')?.focus();return;}
    if(current.kind==='plans'||current.kind==='billing'){location.hash=href('/merchant/subscription/compare');return;}
    if(current.kind==='checkout'){location.hash=href('/merchant/payment/success');return;}
    if(current.kind==='detail'){return review('مراجعة السجل','راجع تفاصيل السجل ومصدره، ثم أضف ملاحظة داخلية لتوثيق المتابعة.');}
    if(current.kind==='result'){if(current.route.includes('/zid/')){location.hash=href('/merchant/integrations/zid');return;}store({verified:true});return rerender();}
    if(current.kind==='privacy'){return review('نسخة البيانات','يمكن طلب نسخة ومتابعة حالة تجهيزها. هذا النموذج لا يجمع أو يصدّر بيانات حقيقية.');}
    if(current.kind==='guide'){location.hash=href('/merchant/whatsapp');return;}
    location.hash=href(related(current)[0]?.route||'/merchant/tools');
  }
  function review(title,text) { openDialog(title,`<p>${e(text)}</p><div class="dialog-foot">${action('تمت المراجعة','cancel',true)}</div>`); }
  function connect(){store({connected:true,synced:true});rerender();toast('اكتملت محاكاة الربط فقط؛ لم يُتصل بخدمة خارجية.');}
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-page-action]');if(!el)return;
    const a=el.dataset.pageAction;
    if(a==='primary')primary();
    else if(a==='create')createDialog();
    else if(a==='detail'){selection=Number(el.dataset.id);rerender();document.getElementById('main').focus();}
    else if(a==='back'){selection=null;rerender();}
    else if(a==='clear'){query='';filter='all';rerender();}
    else if(a==='cancel')document.getElementById('dialog').close();
    else if(a==='export'){const filtered=rows(current).filter(r=>r.cells.join(' ').includes(query)&&(filter==='all'||r.state===filter));csv('sary-page.csv',current.labels,filtered.map(r=>r.cells));}
    else if(a==='connect')connect();
    else if(a==='disconnect'){store({connected:false,synced:false});rerender();}
    else if(a==='media')review(el.dataset.title,'ملف توضيحي؛ يظهر نوعه واستخدامه قبل النسخ أو الاستبدال.');
    else if(a==='source')review('مراجعة المصدر','الشحن خلال 2–4 أيام عمل. المصدر: سياسة الشحن. تُراجع المعلومة قبل تفعيلها في ردود المساعد.');
    else if(a==='preview-import'){store({importPreview:true});rerender();}
    else if(a==='confirm-import'){store({importPreview:false,imported:true});rerender();}
    else if(a==='previous'){step=Math.max(0,step-1);rerender();}
    else if(a==='choose-plan'){saved.selectedPlan=Number(el.dataset.plan);persist();location.hash=href('/merchant/checkout');}
    else if(a==='payment'){location.hash=href('/merchant/payment/success');}
    else if(a==='verify'){store({verified:true});rerender();}
    else if(a==='note')openDialog('ملاحظة داخلية',`<form class="form-stack" data-page-form="note">${field('الملاحظة',0,get().note||'')}<button class="button primary" type="submit">حفظ الملاحظة</button></form>`);
    else if(a==='states')openDialog('جرّب حالات هذه الصفحة',`<div class="page-state-options">${[['normal','البيانات'],['empty','فارغة'],['loading','تحميل'],['error','خطأ'],['offline','انقطاع الاتصال'],['forbidden','صلاحية'],['session','الجلسة'],['missing','404']].map(([id,label])=>action(label,'state',false,`data-value="${id}"`)).join('')}</div><div class="dialog-foot"><button type="button" class="button" data-action="reset-confirm">إعادة ضبط بيانات النموذج</button></div>`);
    else if(a==='state'){mode=el.dataset.value;document.getElementById('dialog').close();rerender();}
    else if(a==='recover'){if(current.kind==='state')location.hash=href('/merchant/dashboard');else{mode='normal';rerender();}}
    else if(a==='invoice')review('فاتورة سبتمبر','249 ر.س شامل الضريبة · فاتورة توضيحية غير صالحة للاستخدام المحاسبي.');
    else if(a==='close-account')review('راجع أثر إغلاق الحساب','يتوقف الوصول إلى المتجر، وتُراجع طلبات الاحتفاظ النظامي. لا ينفّذ هذا النموذج حذفًا.');
    else if(a==='sessions')review('الجلسات النشطة','هذا المتصفح · الجلسة الحالية. في التطبيق يمكنك إنهاء جلسة أخرى بعد مراجعة الجهاز.');
    else if(a==='consents')review('الموافقات','الشروط والخصوصية موافقتان مطلوبتان. الرسائل التسويقية اختيارية ومستقلة.');
    else if(a==='export-private')review('تصدير البيانات','تظهر حالة الطلب وموعد التجهيز ورابط التنزيل بعد تأكيد الهوية.');
  });
  document.addEventListener('input',event=>{if(event.target.dataset.pageInput==='search'){query=event.target.value;rerender(true);}});
  document.addEventListener('change',event=>{if(event.target.dataset.pageInput==='filter'){filter=event.target.value;rerender();}if(event.target.dataset.pageInput==='period'){period=event.target.value;rerender();}});
  document.addEventListener('submit',event=>{
    const type=event.target.dataset.pageForm;if(!type)return;event.preventDefault();
    if(!event.target.reportValidity())return;
    const values=Object.fromEntries(new FormData(event.target));
    event.target.querySelectorAll('input[type=checkbox][name]').forEach(input=>{values[input.name]=input.checked;});
    if(type==='settings'){store({values,savedAt:Date.now(),analyzed:current.kind==='analysis'});rerender();toast(current.kind==='analysis'?'اكتملت معاينة التحليل دون جلب الموقع.':'تم حفظ التغييرات محليًا.');}
    if(type==='assistant'){store({answer:true});rerender();}
    if(type==='note'){store({note:values.f0});document.getElementById('dialog').close();rerender();}
    if(type==='create'){
      if(current.kind==='knowledge')store({sources:[...(get().sources||[]),values.f0]});
      else if(current.kind==='media')store({files:[...(get().files||[]),values.f0]});
      else {const list=rows(current);store({rows:[{id:Date.now(),cells:current.labels.map((_,i)=>values[`f${i}`]||'مسودة'),state:'review'},...list]});}
      document.getElementById('dialog').close();rerender();toast('أُضيف السجل إلى المعاينة.');
    }
    if(type==='setup'){
      for(const [k,v]of Object.entries(values))draft[`${step}-${k.replace('f','')}`]=v;
      const last=3;
      if(step<last){step++;rerender();}else{store({draft});toast('تم حفظ المعاينة محليًا.');location.hash=href('/merchant/dashboard');}
    }
  });
  return { find, render:renderPage, reset, href, pages, resetData(){saved={};persist();if(current)reset(current);} };
})();
