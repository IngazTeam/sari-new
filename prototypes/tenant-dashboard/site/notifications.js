// Local design preview. Never sends messages, requests credentials, or calls providers.
window.NotificationPreview = (() => {
  const key = 'sary-notification-preview-v1';
  const routes = ['scheduled-reports', 'whatsapp-auto-notifications', 'integrations-dashboard'];
  const handles = page => routes.some(route => page?.route === '/merchant/' + route);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const types = {daily:'يومي',weekly:'أسبوعي',monthly:'شهري'};
  const channels = {email:'البريد الإلكتروني',whatsapp:'واتساب',both:'البريد وواتساب'};
  const contents = {includeConversations:'المحادثات',includeOrders:'الطلبات',includeRevenue:'الإيرادات',includeProducts:'المنتجات',includeCustomers:'العملاء',includeAppointments:'المواعيد'};
  const events = {order_created:'طلب جديد',order_confirmed:'تأكيد الطلب',order_shipped:'شحن الطلب',order_delivered:'تسليم الطلب',order_cancelled:'إلغاء الطلب',appointment_created:'حجز موعد',appointment_reminder:'تذكير بالموعد',appointment_cancelled:'إلغاء الموعد',appointment_rescheduled:'تغيير الموعد'};
  const samples = {customerName:'ريم',orderNumber:'1048',total:'189',currency:'ر.س',trackingNumber:'DEMO-1048',deliveryDate:'30 سبتمبر',serviceName:'جلسة تذوق القهوة',appointmentDate:'30 سبتمبر',appointmentTime:'10:00 صباحًا',location:'فرع الرياض',newDate:'1 أكتوبر',newTime:'11:00 صباحًا'};
  const variables = event => event.startsWith('order_') ? ['customerName','orderNumber','total','currency','trackingNumber','deliveryDate'] : ['customerName','serviceName','appointmentDate','appointmentTime','location',...(event === 'appointment_rescheduled' ? ['newDate','newTime'] : [])];
  const defaults = {
    order_created:'مرحباً {{customerName}} 👋\nشكراً لطلبك! رقم الطلب: #{{orderNumber}}\nالمبلغ: {{total}} {{currency}}\nسنراجع طلبك ونطلعك على حالته.',
    order_confirmed:'مرحباً {{customerName}} 👋\nتم تأكيد طلبك #{{orderNumber}}. بدأ تجهيز الطلب وفق حالة المتجر.',
    order_shipped:'مرحباً {{customerName}} 📦\nطلبك #{{orderNumber}} في الطريق إليك.\nرقم التتبع: {{trackingNumber}}',
    order_delivered:'مرحباً {{customerName}} 🎉\nتم تسجيل طلبك #{{orderNumber}} كمُسلّم. لا تتردد في التواصل معنا لأي استفسار.',
    order_cancelled:'مرحباً {{customerName}}\nتم إلغاء طلبك #{{orderNumber}}. تواصل معنا لأي استفسار.',
    appointment_created:'مرحباً {{customerName}}\nتم تأكيد حجزك لخدمة {{serviceName}}.\n{{appointmentDate}} · {{appointmentTime}}\nالمكان: {{location}}',
    appointment_reminder:'تذكير: {{customerName}}\nموعدك لخدمة {{serviceName}} غداً.\n{{appointmentDate}} · {{appointmentTime}}\nالمكان: {{location}}',
    appointment_cancelled:'مرحباً {{customerName}}\nتم إلغاء موعدك لخدمة {{serviceName}} في {{appointmentDate}} · {{appointmentTime}}.',
    appointment_rescheduled:'مرحباً {{customerName}}\nتم تغيير موعدك لخدمة {{serviceName}}.\nالموعد الجديد: {{newDate}} · {{newTime}}\nالمكان: {{location}}',
  };
  const blankReport = () => ({name:'',isActive:true,lastSentAt:null,reportType:'weekly',scheduleDay:0,scheduleTime:'09:00',deliveryMethod:'email',recipientEmail:'',recipientPhone:'',...Object.fromEntries(Object.keys(contents).map(k => [k,true]))});
  const initial = () => ({
    reports:[{...blankReport(),id:1,name:'ملخص الأسبوع',recipientEmail:'owner@example.test',includeAppointments:false}],
    notifications:[{id:1,triggerType:'order_created',messageTemplate:defaults.order_created,isActive:true}],
    resolved:[],
  });
  let data; try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (!Array.isArray(data?.reports) || !Array.isArray(data?.notifications) || !Array.isArray(data?.resolved)) data = initial();
  let current = '', tab = 'overview', draft = null, kind = '', errors = {}, saveError = '', role = 'owner', failure = false, sample = 'records', pendingDelete = null;
  const canManage = () => role === 'owner';
  const button = (label, action, extra = '', primary = false) => `<button type="button" class="button ${primary ? 'primary' : ''}" data-nw-action="${action}" ${extra}>${e(label)}</button>`;
  const link = (label, route) => `<a class="button" href="#/page/merchant/${route}">${e(label)}</a>`;
  const badge = (label, muted = false) => `<span class="status ${muted ? 'gray' : ''}">${e(label)}</span>`;
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } };
  const rerender = () => render();
  const close = () => { document.getElementById('dialog').close(); draft = null; pendingDelete = null; };
  const notice = '<section class="nw-notice"><strong>جهّز الإعدادات وراجعها</strong><p>الإرسال التلقائي لهذه الإعدادات غير متاح في التطبيق الحالي. الحفظ هنا محلي ولا يرسل رسالة أو تقريرًا.</p></section>';
  function lab() {
    return `<details class="nw-lab"><summary>خيارات تجربة الموك أب</summary><div class="nw-fields"><label for="nw-role">دور المعاينة<select id="nw-role" data-nw-option="role"><option value="owner" ${role === 'owner' ? 'selected' : ''}>مالك · يمكنه التعديل</option><option value="viewer" ${role === 'viewer' ? 'selected' : ''}>مشاهد · قراءة فقط</option></select></label><label for="nw-save-mode">نتيجة الحفظ التجريبية<select id="nw-save-mode" data-nw-option="failure"><option value="success" ${!failure ? 'selected' : ''}>حفظ ناجح</option><option value="failure" ${failure ? 'selected' : ''}>فشل مع الاحتفاظ بالمسودة</option></select></label>${current.endsWith('integrations-dashboard') ? `<label for="nw-sample">عينة الإحصائيات<select id="nw-sample" data-nw-option="sample"><option value="records" ${sample === 'records' ? 'selected' : ''}>عمليات مسجلة</option><option value="empty" ${sample === 'empty' ? 'selected' : ''}>لا توجد عمليات</option></select></label>` : ''}</div><p>هذه الخيارات لتجربة التصميم فقط. لا تغيّر دورك أو بيانات أي متجر.</p></details>${!canManage() ? '<p class="nw-readonly">وضع المشاهد: يمكنك مراجعة البيانات. التعديل والحذف متاحان للمالك المخوّل.</p>' : ''}`;
  }
  const empty = (title, help) => `<section class="panel nw-empty"><span class="nw-symbol" aria-hidden="true">${icon('file')}</span><h2>${title}</h2><p>${help}</p>${button('إضافة إعداد جديد','new',!canManage() ? 'disabled' : '',true)}</section>`;
  function reports() {
    return notice + `<section class="nw-summary"><div><b>${data.reports.length}</b><span>تقارير محفوظة</span></div><div><b>6</b><span>أقسام يمكن تضمينها</span></div><div><b>غير متاح</b><span>الإرسال التلقائي</span></div></section>` + (data.reports.length ? `<div class="nw-cards">${data.reports.map(row => `<article class="panel nw-card"><header><span class="nw-symbol" aria-hidden="true">${icon('file')}</span>${badge(row.isActive === false ? 'إعداد معطّل' : 'إعداد محفوظ',true)}</header><h2>${e(row.name)}</h2><p>${e(types[row.reportType] || row.reportType)} · ${row.reportType === 'weekly' ? e(days[row.scheduleDay]) + ' · ' : row.reportType === 'monthly' ? 'يوم ' + e(row.scheduleDay) + ' · ' : ''}<bdi>${e(row.scheduleTime)}</bdi></p><dl class="nw-facts"><div><dt>طريقة التسليم المخططة</dt><dd>${e(channels[row.deliveryMethod])}</dd></div><div><dt>المستلم</dt><dd>${row.deliveryMethod !== 'whatsapp' ? `<bdi>${e(row.recipientEmail)}</bdi>` : ''}${row.deliveryMethod === 'both' ? '<br>' : ''}${row.deliveryMethod !== 'email' ? `<bdi>${e(row.recipientPhone)}</bdi>` : ''}</dd></div><div><dt>آخر إرسال مسجّل</dt><dd>${row.lastSentAt ? e(row.lastSentAt) + ' · سجل توضيحي' : 'لا يوجد إرسال مسجّل'}</dd></div><div><dt>محتوى التقرير</dt><dd>${Object.keys(contents).filter(k => row[k]).map(k => e(contents[k])).join('، ') || 'لم تُحدد أقسام'}</dd></div></dl><footer>${button('تعديل التقرير','edit',`data-id="${row.id}" ${canManage() ? '' : 'disabled'}`)}${button('حذف','delete',`data-id="${row.id}" aria-label="حذف ${e(row.name)}" ${canManage() ? '' : 'disabled'}`)}</footer></article>`).join('')}</div>` : empty('ابدأ بتقرير يناسب يومك','اختر الموعد والمحتوى والمستلم في نموذج واحد.'));
  }
  function notifications() {
    return notice + `<div class="nw-cards nw-two">${[['order_','إشعارات الطلبات'],['appointment_','إشعارات المواعيد']].map(([prefix,title]) => `<section class="panel nw-card"><header><h2>${title}</h2>${badge(String(data.notifications.filter(r => r.triggerType.startsWith(prefix)).length),true)}</header><div class="nw-records">${data.notifications.filter(r => r.triggerType.startsWith(prefix)).map(row => `<article class="nw-record"><div><h3>${e(events[row.triggerType] || row.triggerType)}</h3>${badge(row.isActive ? 'إعداد محفوظ' : 'إعداد معطّل',!row.isActive)}</div><p class="nw-excerpt">${e(row.messageTemplate)}</p><footer>${button('معاينة الرسالة','preview',`data-id="${row.id}"`)}${button('تعديل','edit',`data-id="${row.id}" aria-label="تعديل ${e(events[row.triggerType])}" ${canManage() ? '' : 'disabled'}`)}${button('حذف','delete',`data-id="${row.id}" aria-label="حذف ${e(events[row.triggerType])}" ${canManage() ? '' : 'disabled'}`)}</footer></article>`).join('') || '<p class="nw-empty-copy">لا توجد قوالب في هذا القسم بعد.</p>'}</div></section>`).join('')}</div><p class="nw-note">تبدأ كل رسالة بحدث واضح. راجع المتغيرات ونتيجة المعاينة قبل حفظ القالب.</p>`;
  }
  const stats = [{platform:'زد',syncs:8,success:7,errors:1,date:'28 سبتمبر 2026'},{platform:'Calendly',syncs:4,success:3,errors:1,date:'28 سبتمبر 2026'}];
  const issues = [{id:1,platform:'زد',createdAt:'28 سبتمبر 2026 · 10:30',title:'بيانات منتج غير مكتملة',message:'سجل توضيحي: تعذّر تحديث سعر أحد المنتجات. راجع بيانات المنتج في المصدر.',details:'DEMO-PRICE-1048 · لا توجد استجابة من مزود حقيقي.'},{id:2,platform:'Calendly',createdAt:'27 سبتمبر 2026 · 14:00',title:'مراجعة بيانات الموعد',message:'سجل توضيحي لاختبار عرض رسالة طويلة: '+ 'appointment_reference_'.repeat(8),details:'DEMO-APPOINTMENT-42 · نسخة توضيحية من تفاصيل الخطأ.'}];
  function integrations() {
    const rows = sample === 'empty' ? [] : stats, total = rows.reduce((n,r) => n+r.syncs,0), success = rows.reduce((n,r) => n+r.success,0), pending = sample === 'empty' ? [] : issues.filter(r => !data.resolved.includes(r.id));
    const overview = `<div class="nw-cards nw-two">${[['زد','متجر نواة','28 سبتمبر 2026 · 10:30','integrations/zid',true],['Calendly','حجوزات نواة','27 سبتمبر 2026 · 14:00','integrations/calendly',false]].map(([name,store,sync,route,active]) => `<article class="panel nw-card"><header><span class="nw-symbol" aria-hidden="true">${icon('link')}</span>${badge(active ? 'الربط مفعّل' : 'الربط متوقف',!active)}</header><h2>${name}</h2><p>${store}</p><dl class="nw-facts"><div><dt>آخر مزامنة مسجلة</dt><dd>${sample === 'empty' ? 'لم تتم المزامنة بعد' : sync}</dd></div><div><dt>مصدر الحالة</dt><dd>إعداد محفوظ في العينة؛ لا يثبت توفر المزود الآن.</dd></div></dl>${link('إعدادات '+name,route)}</article>`).join('')}</div>`;
    const statistics = rows.length ? `<section class="panel nw-card"><h2>إحصائيات المزامنة</h2><p>آخر 30 يومًا · بيانات توضيحية</p>${rows.map(r => `<article class="nw-stat-row"><div><h3>${r.platform}</h3><small>${r.date}</small></div><dl><div><dt>العمليات</dt><dd>${r.syncs}</dd></div><div><dt>ناجحة</dt><dd>${r.success}</dd></div><div><dt>أخطاء</dt><dd>${r.errors}</dd></div></dl></article>`).join('')}</section>` : '<section class="panel nw-empty"><h2>لا توجد عمليات مسجلة</h2><p>تظهر النسبة بعد تسجيل أول عملية، ولا تُستبدل بقيمة نجاح مفترضة.</p></section>';
    const errorsView = pending.length ? `<section class="nw-issues">${pending.map(r => `<article class="panel nw-card nw-issue"><header><div><small>${r.platform}</small><h2>${r.title}</h2></div>${badge('تحتاج مراجعة',true)}</header><p>${e(r.message)}</p><p class="hint">وقت التسجيل: ${e(r.createdAt)}</p><details><summary>تفاصيل السجل</summary><p>${e(r.details)}</p></details><footer><p>التعليم كمعالَج يغيّر السجل المحلي فقط، ولا يعيد المزامنة.</p>${button('تعليم كمعالَج','resolve',`data-id="${r.id}" ${canManage() ? '' : 'disabled'}`)}</footer></article>`).join('')}</section>` : '<section class="panel nw-empty"><h2>لا توجد أخطاء غير محلولة</h2><p>هذا يصف السجل المعروض، ولا يعني إجراء فحص مباشر للاتصال.</p></section>';
    return `<section class="nw-notice"><strong>صحة الاتصال تبدأ بدليل واضح</strong><p>هذه سجلات توضيحية للمزامنة. أرقام الأداء تخص العينة، ولا تمثل فحصًا مباشرًا لخدمات متجرك.</p></section><div class="kpis">${kpi('الربط المفعّل','1','من إعدادين توضيحيين','link')}${kpi('عمليات المزامنة',total,'آخر 30 يومًا · العينة','refresh')}${kpi('نسبة النجاح',total ? Math.round(success/total*100)+'%' : '—',total ? success+' من '+total+' عملية' : 'لا توجد عينة','chart')}${kpi('أخطاء تحتاج مراجعة',pending.length,'السجلات غير المعالَجة','alert')}</div><nav class="nw-tabs" aria-label="أقسام حالة التكاملات">${[['overview','نظرة عامة'],['stats','الإحصائيات'],['errors','الأخطاء']].map(([id,label]) => button(label,'tab',`data-value="${id}" aria-pressed="${tab === id}"`)).join('')}</nav>${tab === 'overview' ? overview : tab === 'stats' ? statistics : errorsView}`;
  }
  function field(name, label, {type='text', options, required=false, min, max, maxlength=200, help=''} = {}) {
    const id = 'nw-'+name, value = draft[name] ?? '';
    const attrs = `id="${id}" name="${name}" data-nw-field ${required ? 'required' : ''} ${errors[name] ? `aria-invalid="true" aria-describedby="${id}-error"` : help ? `aria-describedby="${id}-help"` : ''}`;
    const control = options ? `<select ${attrs}>${Object.entries(options).map(([v,label]) => `<option value="${e(v)}" ${String(value) === String(v) ? 'selected' : ''}>${e(label)}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea ${attrs} maxlength="${maxlength}" rows="6">${e(value)}</textarea>` : `<input ${attrs} type="${type}" value="${e(value)}" maxlength="${maxlength}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} ${['time','email','tel','number'].includes(type) ? 'dir="ltr"' : ''}>`;
    return `<div class="field"><label for="${id}">${label}${required ? ' *' : ''}</label>${control}${help ? `<small id="${id}-help">${help}</small>` : ''}${errors[name] ? `<p class="nw-field-error" id="${id}-error">${e(errors[name])}</p>` : ''}</div>`;
  }
  const check = (name, label) => `<label class="nw-check" for="nw-${name}"><input type="checkbox" id="nw-${name}" name="${name}" data-nw-field ${draft[name] ? 'checked' : ''}><span>${e(label)}</span></label>`;
  function messagePreview(template, event) {
    const available = variables(event), unknown = [...new Set([...template.matchAll(/{{\s*([\w]+)\s*}}/g)].map(m => m[1]).filter(k => !available.includes(k)))];
    const text = template.replace(/{{\s*([\w]+)\s*}}/g, (all,k) => available.includes(k) ? samples[k] : all);
    return `<span class="status gray">معاينة ببيانات مثال · دون إرسال</span><p class="nw-message">${e(text || 'ستظهر معاينة الرسالة هنا.')}</p>${unknown.length ? `<p class="nw-variable-warning">متغيرات تحتاج مراجعة لهذا الحدث: ${unknown.map(e).join('، ')}</p>` : ''}`;
  }
  function reportFields() {
    return field('name','اسم التقرير',{required:true})+`<fieldset><legend>الموعد</legend><div class="nw-fields">${field('reportType','نوع التقرير',{options:types})}${draft.reportType === 'weekly' ? field('scheduleDay','يوم الأسبوع',{options:Object.fromEntries(days.map((v,i) => [i,v]))}) : draft.reportType === 'monthly' ? field('scheduleDay','يوم الشهر',{type:'number',min:1,max:28,required:true,help:'من 1 إلى 28، ليبقى اليوم صالحًا في كل شهر.'}) : ''}${field('scheduleTime','الوقت المخطط',{type:'time',required:true})}</div></fieldset><fieldset><legend>المستلم وطريقة التسليم</legend>${field('deliveryMethod','طريقة التسليم',{options:channels})}<div class="nw-fields">${draft.deliveryMethod !== 'whatsapp' ? field('recipientEmail','البريد الإلكتروني',{type:'email',required:true,maxlength:320}) : ''}${draft.deliveryMethod !== 'email' ? field('recipientPhone','رقم واتساب',{type:'tel',required:true,maxlength:16,help:'أدخل رمز الدولة والرقم، مثل +966500000000.'}) : ''}</div></fieldset><fieldset><legend>محتوى التقرير</legend><div class="nw-checks">${Object.entries(contents).map(([name,label]) => check(name,label)).join('')}</div></fieldset>`;
  }
  function notificationFields() {
    return field('triggerType','نوع الحدث',{options:events})+`<div class="nw-template-heading"><h3>اكتب الرسالة بصوت متجرك</h3>${button('استعادة القالب الافتراضي','restore-template')}</div>`+field('messageTemplate','نص الرسالة',{type:'textarea',required:true,maxlength:4000})+`<p class="hint" id="nw-character-count">${draft.messageTemplate.length} / 4000 حرف</p><details class="nw-variables"><summary>إدراج متغير في الرسالة</summary><div>${variables(draft.triggerType).map(v => button('{{'+v+'}}','variable',`data-value="${v}"`)).join('')}</div></details>${check('isActive','الإعداد مفعّل عند توفر الإرسال')}<section class="nw-preview" id="nw-message-preview" aria-label="معاينة الرسالة">${messagePreview(draft.messageTemplate,draft.triggerType)}</section>`;
  }
  function editor() {
    openDialog(draft.id ? kind === 'reports' ? 'تعديل التقرير' : 'تعديل القالب' : kind === 'reports' ? 'تقرير جديد' : 'قالب رسالة جديد',`<form class="nw-editor" data-nw-form novalidate><div class="nw-editor-scroll">${saveError ? `<div class="nw-save-error" role="alert"><strong>تعذّر حفظ التغيير</strong><p>${e(saveError)}</p></div>` : ''}<p class="hint">${kind === 'reports' ? 'اختر المحتوى والمستلم والموعد. لن يبدأ إرسال تلقائي عند الحفظ.' : 'جهّز النص وراجعه ببيانات مثال. الحفظ لا يرسل رسالة.'}</p>${kind === 'reports' ? reportFields() : notificationFields()}</div><footer class="nw-savebar"><span>* حقل مطلوب</span>${button('إلغاء','close')}<button class="button primary" type="submit" ${canManage() ? '' : 'disabled'}>حفظ الإعداد</button></footer></form>`);
  }
  function openEditor(id) {
    if (!canManage()) return;
    kind = current.endsWith('scheduled-reports') ? 'reports' : 'notifications';
    draft = structuredClone(data[kind].find(r => r.id === Number(id)) || (kind === 'reports' ? blankReport() : {triggerType:'order_created',messageTemplate:defaults.order_created,isActive:true}));
    errors = {}; saveError = ''; editor();
  }
  function validate() {
    errors = {};
    if (kind === 'reports') {
      if (!draft.name.trim() || draft.name.trim().length > 200) errors.name = 'أدخل اسمًا للتقرير حتى 200 حرف.';
      if (!Object.hasOwn(types,draft.reportType)) errors.reportType = 'اختر نوع التقرير.';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.scheduleTime)) errors.scheduleTime = 'أدخل وقتًا صالحًا.';
      if (draft.reportType === 'weekly' && (!Number.isInteger(Number(draft.scheduleDay)) || Number(draft.scheduleDay) < 0 || Number(draft.scheduleDay) > 6)) errors.scheduleDay = 'اختر يومًا من الأسبوع.';
      if (draft.reportType === 'monthly' && (!Number.isInteger(Number(draft.scheduleDay)) || Number(draft.scheduleDay) < 1 || Number(draft.scheduleDay) > 28)) errors.scheduleDay = 'اختر يومًا من 1 إلى 28.';
      if (!Object.hasOwn(channels,draft.deliveryMethod)) errors.deliveryMethod = 'اختر طريقة التسليم.';
      if (draft.deliveryMethod !== 'whatsapp' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.recipientEmail) || draft.recipientEmail.length > 320)) errors.recipientEmail = 'أدخل بريدًا إلكترونيًا صالحًا للمستلم.';
      if (draft.deliveryMethod !== 'email' && !/^\+?[0-9]{7,15}$/.test(draft.recipientPhone)) errors.recipientPhone = 'أدخل رقمًا صالحًا من 7 إلى 15 رقمًا مع رمز الدولة.';
    } else {
      if (!Object.hasOwn(events,draft.triggerType)) errors.triggerType = 'اختر حدثًا من القائمة.';
      if (!draft.messageTemplate.trim() || draft.messageTemplate.trim().length > 4000) errors.messageTemplate = 'أدخل نص الرسالة حتى 4000 حرف.';
    }
    return !Object.keys(errors).length;
  }
  const canPrimary = page => page.route.endsWith('integrations-dashboard') || canManage();
  function renderPage(page) { current = page.route; return lab() + (current.endsWith('scheduled-reports') ? reports() : current.endsWith('whatsapp-auto-notifications') ? notifications() : integrations()); }
  function primary(page) { current = page.route; if (page.route.endsWith('integrations-dashboard')) { rerender(); toast('أُعيد عرض البيانات التوضيحية؛ لم نتصل بأي مزود.'); } else openEditor(); }
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-nw-action]'); if (!el) return;
    const {nwAction:action,id,value} = el.dataset;
    if (action === 'close') return close();
    if (action === 'tab') { tab = value; return rerender(); }
    if (action === 'new' || action === 'edit') return openEditor(id);
    if (action === 'preview') { const row = data.notifications.find(r => r.id === Number(id)); if (row) openDialog(events[row.triggerType],`<section class="nw-preview">${messagePreview(row.messageTemplate,row.triggerType)}</section><div class="dialog-foot">${button('إغلاق','close')}</div>`); return; }
    if (!canManage()) return;
    if (action === 'variable' && draft) { const input = document.getElementById('nw-messageTemplate'), token = '{{'+value+'}}', start = input.selectionStart, end = input.selectionEnd; if (draft.messageTemplate.length-(end-start)+token.length > 4000) return toast('وصلت إلى الحد الأقصى لطول الرسالة.'); draft.messageTemplate = draft.messageTemplate.slice(0,start)+token+draft.messageTemplate.slice(end); editor(); const next = document.getElementById('nw-messageTemplate'); next.focus(); next.setSelectionRange(start+token.length,start+token.length); }
    if (action === 'restore-template' && draft) { draft.messageTemplate = defaults[draft.triggerType]; delete errors.messageTemplate; editor(); }
    if (action === 'delete') { kind = current.endsWith('scheduled-reports') ? 'reports' : 'notifications'; const row = data[kind].find(r => r.id === Number(id)); if (!row) return; pendingDelete = row.id; openDialog('حذف هذا الإعداد؟',`<p>ستحذف «${e(row.name || events[row.triggerType])}» من الموك أب المحلي. لا يتأثر متجر حقيقي.</p><div class="dialog-foot">${button('إلغاء','close')}${button('تأكيد الحذف','confirm-delete')}</div>`); }
    if (action === 'confirm-delete' && pendingDelete !== null) { if (failure) return toast('تعذّر الحذف التجريبي؛ بقي السجل كما هو.'); data[kind] = data[kind].filter(r => r.id !== pendingDelete); const saved = persist(); close(); rerender(); toast(saved ? 'حُذف الإعداد المحلي.' : 'حُذف من الجلسة فقط؛ تعذّر حفظ التغيير في المتصفح.'); }
    if (action === 'resolve') { if (failure) return toast('تعذّر حفظ حالة السجل؛ ما يزال يحتاج مراجعة.'); if (!data.resolved.includes(Number(id))) data.resolved.push(Number(id)); const saved = persist(); rerender(); toast(saved ? 'عُلّم السجل المحلي كمعالَج.' : 'تغيّرت الحالة في الجلسة فقط؛ تعذّر الحفظ في المتصفح.'); }
  });
  document.addEventListener('input', event => {
    const el = event.target; if (!el.hasAttribute('data-nw-field') || !draft) return;
    draft[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? el.value === '' ? '' : Number(el.value) : el.value;
    if (errors[el.name]) { delete errors[el.name]; el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); document.getElementById(el.id+'-error')?.remove(); }
    if (el.name === 'messageTemplate') { document.getElementById('nw-message-preview').innerHTML = messagePreview(draft.messageTemplate,draft.triggerType); document.getElementById('nw-character-count').textContent = draft.messageTemplate.length+' / 4000 حرف'; }
  });
  document.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.nwOption) { if (el.dataset.nwOption === 'role') role = el.value; if (el.dataset.nwOption === 'failure') failure = el.value === 'failure'; if (el.dataset.nwOption === 'sample') sample = el.value; return rerender(); }
    if (!el.hasAttribute('data-nw-field') || !draft) return;
    if (el.tagName === 'SELECT') draft[el.name] = el.name === 'scheduleDay' ? Number(el.value) : el.value;
    if (el.name === 'reportType') draft.scheduleDay = draft.reportType === 'monthly' ? 1 : 0;
    if (['reportType','deliveryMethod','triggerType'].includes(el.name)) { editor(); document.getElementById(el.id)?.focus(); }
  });
  document.addEventListener('submit', event => {
    if (!event.target.hasAttribute('data-nw-form')) return; event.preventDefault(); if (!canManage() || !draft) return;
    if (!validate()) { editor(); document.querySelector('.nw-editor [aria-invalid="true"]')?.focus(); return; }
    if (failure) { saveError = 'هذه محاكاة لفشل الحفظ. مسودتك محفوظة في النموذج؛ يمكنك المتابعة أو إلغاء التجربة.'; editor(); document.querySelector('.nw-save-error')?.scrollIntoView?.({block:'nearest'}); return; }
    const entry = structuredClone(draft); entry.id ||= Math.max(0,...data[kind].map(r => r.id))+1;
    if (kind === 'reports') { entry.name = entry.name.trim(); entry.scheduleDay = Number(entry.scheduleDay); } else entry.messageTemplate = entry.messageTemplate.trim();
    const index = data[kind].findIndex(r => r.id === entry.id); if (index < 0) data[kind].unshift(entry); else data[kind][index] = entry;
    const saved = persist(); close(); rerender(); toast(saved ? 'حُفظ الإعداد في هذا المتصفح فقط.' : 'حُفظ في الجلسة فقط؛ التخزين المحلي غير متاح.');
  });
  return {handles,render:renderPage,primary,canPrimary,reset(){data=initial();draft=null;pendingDelete=null;role='owner';failure=false;sample='records';tab='overview';persist();}};
})();
