// Local subscription UX only. No checkout, cancellation, or provider API is called.
window.SubscriptionPreview = (() => {
  let state = 'active', paymentState = 'ready', cancelled = false;
  const routes = ['/merchant/subscription', '/merchant/subscriptions', '/merchant/my-subscription'];
  const button = (label, action) => `<button type="button" class="button" data-sb-action="${action}"${action==='keep'?' autofocus':''}>${label}</button>`;
  const link = (label, route) => `<a class="button" href="#/page${route}">${label}</a>`;
  const impact = 'الإلغاء يوقف الاستفادة من الاشتراك فورًا، حتى لو بقيت أيام مدفوعة. هذا الإجراء لا ينفذ استردادًا للمبلغ.';
  const options = (values, selected) => values.map(([value, label]) => `<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
  function usage() {
    const trial = state === 'trial', unlimited = state === 'unlimited';
    const data = [
      ['المحادثات',trial?12:720,unlimited?-1:trial?100:2000],
      ['الرسائل',trial?45:1320,-1],
      ['الرسائل الصوتية',trial?3:25,unlimited?-1:trial?20:100],
    ];
    return `<section class="panel panel-pad"><h2>استخدام الفترة الحالية</h2><p>عدادات الاشتراك منذ آخر تصفير. تختلف عن عدد العملاء وإجمالي رسائل المتجر.</p><div class="sb-usage">${data.map(([label,used,limit])=>`<section aria-label="${label}"><h3>${label}</h3><dl><div><dt>المستخدم</dt><dd>${used}</dd></div><div><dt>الحد</dt><dd>${limit===-1?'غير محدود':limit}</dd></div></dl>${limit>0?`<progress max="${limit}" value="${used}" aria-label="${label}"></progress>`:''}<p>${limit===-1?'غير محدود':`المتبقي: ${limit-used}`}</p></section>`).join('')}</div><p>آخر تصفير للعدادات: 1 سبتمبر 2026 · توضيحي</p></section>`;
  }
  function current() {
    if (state==='error') return `<section class="panel panel-pad" role="alert"><h2>تعذّر تحميل الاشتراك</h2><p>أعد المحاولة قبل اتخاذ قرار متعلق باشتراكك.</p>${button('إعادة المحاولة','retry')}</section>`;
    if (state==='loading') return '<section class="panel panel-pad" role="status" aria-busy="true">جارٍ تحميل الاشتراك…</section>';
    if (state==='none'||cancelled) return `<section class="panel panel-pad"><h2>لا يوجد اشتراك ساري حاليًا</h2><p>${cancelled?'أُلغي الاشتراك التجريبي داخل الموك أب فقط. لم يتغير أي حساب حقيقي.':'اختر باقة للمتابعة. يبقى سجل المدفوعات متاحًا أدناه.'}</p>${link('عرض الباقات','/merchant/subscription/plans')}</section>`;
    const trial=state==='trial';
    return `<section class="panel panel-pad"><span class="eyebrow">اشتراكك الحالي · مثال</span><h2>${trial?'فترة تجريبية':'باقة النمو'}</h2><span class="status gray">${trial?'فترة تجريبية':'نشط'}</span><dl class="sb-facts"><div><dt>الأيام المتبقية</dt><dd>${trial?5:18}</dd></div><div><dt>دورة الاشتراك</dt><dd>شهري</dd></div><div><dt>بداية الاشتراك</dt><dd>1 سبتمبر 2026</dd></div><div><dt>${trial?'نهاية التجربة':'نهاية الاشتراك'}</dt><dd>${trial?'17':'30'} سبتمبر 2026</dd></div>${trial?'':'<div><dt>حد العملاء</dt><dd>2000</dd></div><div><dt>أرقام واتساب</dt><dd>3</dd></div>'}</dl>${trial?'<p class="summary-box">ينتهي اشتراكك قريبًا؛ راجع موعد النهاية والباقات المتاحة.</p>':''}<div class="sb-actions">${link('عرض الباقات','/merchant/subscription/plans')}${link('مقارنة الباقات','/merchant/subscription/compare')}${link('بقية حدود الاستخدام','/merchant/usage-dashboard')}</div></section>${usage()}${trial?'':`<details class="panel panel-pad"><summary>إدارة الاشتراك</summary><p>${impact}</p>${button('إلغاء الاشتراك','cancel')}</details>`}`;
  }
  function payments() {
    const data = [['#101','اشتراك','249 SAR','مكتملة'],['#102','ترقية','100 SAR','معلّقة'],['#103','إضافة','50 SAR','فشلت'],['#104','تجديد','249 SAR','مستردة']];
    return `<section class="panel panel-pad"><h2>سجل المدفوعات</h2><p>حالة المعاملة المسجلة؛ المعاملة المعلّقة لا تعني تفعيل الاشتراك.</p>${paymentState==='error'?`<div role="alert" class="summary-box"><h3>تعذّر تحميل المدفوعات</h3>${button('إعادة تحميل المدفوعات','retry-payments')}</div>`:paymentState==='empty'?'<p role="status">لا توجد معاملات مسجلة</p>':`<table class="sb-payments"><caption>معاملات توضيحية فقط</caption><thead><tr>${['المرجع','التاريخ','العملية','المبلغ','الحالة'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${data.map(row=>`<tr><th scope="row" data-label="المرجع">${row[0]}</th><td data-label="التاريخ">1 سبتمبر 2026</td><td data-label="العملية">${row[1]}</td><td data-label="المبلغ"><bdi>${row[2]}</bdi></td><td data-label="الحالة">${row[3]}</td></tr>`).join('')}</tbody></table>`}</section>`;
  }
  function renderPage() {
    return `<div class="sb-workspace"><p class="hint">مرجع بيانات المثال: 12 سبتمبر 2026 · أرقام توضيحية فقط</p><div class="sb-demo-controls"><label for="sb-state">حالة الاشتراك في المثال<select id="sb-state">${options([['active','نشط'],['trial','تجريبي دون باقة'],['unlimited','غير محدود'],['none','دون اشتراك سارٍ'],['error','خطأ التحميل'],['loading','جارٍ التحميل']],state)}</select></label><label for="sb-payments">حالة المدفوعات في المثال<select id="sb-payments">${options([['ready','معاملات توضيحية'],['empty','فارغ'],['error','خطأ التحميل']],paymentState)}</select></label>${button('تحديث البيانات','refresh')}</div>${current()}${payments()}</div>`;
  }
  document.addEventListener('change', event => {
    if (event.target.id==='sb-state') { state=event.target.value; cancelled=false; }
    else if (event.target.id==='sb-payments') paymentState=event.target.value;
    else return;
    const id=event.target.id; render(); document.getElementById(id)?.focus();
  });
  document.addEventListener('click', event => {
    const target=event.target.closest('[data-sb-action]'); if(!target)return;
    const action=target.dataset.sbAction;
    if(action==='cancel') {
      openDialog('إلغاء الاشتراك الحالي؟',`<p>${impact}</p><p class="hint">محاكاة فقط؛ لا تُلغى باقة حقيقية.</p><div class="sb-actions">${button('الاحتفاظ بالاشتراك','keep')}${button('نعم، إلغاء الاشتراك الآن','confirm')}</div>`);
      return;
    }
    if(action==='keep'){document.getElementById('dialog').close();return;}
    if(action==='confirm'){cancelled=true;document.getElementById('dialog').close();}
    if(action==='retry'||action==='refresh'){state='active';cancelled=false;}
    if(action==='retry-payments'||action==='refresh')paymentState='ready';
    render();
  });
  return { handles: page=>routes.includes(page.route), render: renderPage, primary: ()=>{location.hash='#/page/merchant/subscription/plans';} };
})();
