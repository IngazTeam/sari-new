// Local campaign-performance preview. No API, provider, or sending calls.
window.CampaignPreview = (() => {
  let tab = 'list', days = 30, state = 'ready';
  const button = (label, action, value, selected = false) => `<button type="button" class="button ${selected ? 'primary' : ''}" data-cp-action="${action}" data-value="${value}" aria-pressed="${selected}">${label}</button>`;
  const rows = () => Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.UTC(2026, 8, 28 - days + index + 1));
    return { date: day.toISOString().slice(0, 10), accepted: state === 'empty' ? 0 : (index + 2) % 5 === 0 ? 12 : (index + 1) % 3 === 0 ? 4 : 0 };
  });
  function performance() {
    const data = rows(), total = data.reduce((sum, row) => sum + row.accepted, 0);
    const chart = `<figure dir="ltr"><svg viewBox="0 0 640 164" role="img" aria-label="اتجاه قبول توضيحي خلال ${days} يومًا؛ أعلى قيمة يومية 12"><path d="M12 148H628" stroke="currentColor" opacity=".2"/><polyline fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke" points="${data.map((row, index) => `${12 + index * 616 / (days - 1)},${148 - row.accepted * 11}`).join(' ')}"/></svg><figcaption><time>${data[0].date}</time><time>${data.at(-1).date}</time></figcaption></figure>`;
    const error = '<div role="alert" class="summary-box"><h3>تعذّر تحميل بيانات الحملات</h3><p>لا يمكن تأكيد الأرقام الآن. أعد المحاولة لتحميلها.</p>'+button('إعادة المحاولة','retry','ready')+'</div>';
    const loading = '<p role="status" aria-busy="true">جارٍ تحميل بيانات الحملات…</p>';
    return `<div class="cp-workspace"><div class="cp-heading"><div><h2>ما الذي وصل إلى مزود واتساب؟</h2><p>هذه الأرقام تثبت قبول المزود للرسالة فقط. لا تثبت التسليم أو القراءة أو تحقيق مبيعات.</p></div>${button('تحديث البيانات','retry','ready')}</div>
      <label class="cp-states" for="cp-state">حالة بيانات المثال <select id="cp-state"><option value="ready" ${state==='ready'?'selected':''}>بيانات توضيحية</option><option value="empty" ${state==='empty'?'selected':''}>دون عينة</option><option value="error" ${state==='error'?'selected':''}>فشل التحميل</option><option value="loading" ${state==='loading'?'selected':''}>جارٍ التحميل</option></select></label>
      <section class="panel panel-pad"><h3>ملخص الحملات المكتملة · جميع الفترات</h3>${state==='error'?error:state==='loading'?loading:`<p>${state==='empty'?0:3} حملات مكتملة · مثال</p><dl class="cp-metrics"><div><dt>قبول مؤكد من المزود</dt><dd>${state==='empty'?0:180}</dd></div><div><dt>نسبة قبول المزود</dt><dd>${state==='empty'?'—':'90%'}</dd><p>${state==='empty'?'لا توجد عينة لحساب النسبة':'من أصل 200 مستلم في الحملات المكتملة'}</p></div><div><dt>دون قبول مؤكد</dt><dd>${state==='empty'?0:20}</dd><p>قد يشمل فشل الإرسال أو الاستبعاد؛ راجع تقرير الحملة لمعرفة السبب.</p></div></dl>`}</section>
      <section class="panel panel-pad"><h3>القبول اليومي</h3><p>سجلات القبول لجميع الحملات خلال الفترة المختارة. الأيام حسب UTC؛ تغيير الفترة يغيّر هذا القسم فقط.</p><div class="cp-period" role="group" aria-label="فترة الاتجاه اليومي">${[7,30,90].map(value=>button(`${value} ${value===7?'أيام':'يومًا'}`,'period',value,days===value)).join('')}</div>
      ${state==='error'?error:state==='loading'?loading:`<p role="status">${total} رسالة بقبول مؤكد خلال الفترة · مثال</p>${total?chart:'<div class="summary-box"><h3>لا توجد رسائل بقبول مؤكد خلال هذه الفترة</h3><p>جرّب فترة أطول أو راجع الحملات. هذا لا يصف حالة التسليم لدى العميل.</p></div>'}<details class="cp-daily"><summary>عرض الأرقام اليومية</summary><table><caption>القبول اليومي · بيانات توضيحية</caption><thead><tr><th scope="col">التاريخ (UTC)</th><th scope="col">قبول مؤكد من المزود</th></tr></thead><tbody>${data.reverse().map(row=>`<tr><th scope="row"><time>${row.date}</time></th><td>${row.accepted}</td></tr>`).join('')}</tbody></table></details>`}</section></div>`;
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-cp-action]');
    if (!target) return;
    if (target.dataset.cpAction === 'tab') tab = target.dataset.value;
    if (target.dataset.cpAction === 'period') days = Number(target.dataset.value);
    if (target.dataset.cpAction === 'retry') state = 'ready';
    const action = target.dataset.cpAction, value = target.dataset.value;
    render();
    document.querySelector(`[data-cp-action="${action}"][data-value="${value}"]`)?.focus();
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'cp-state') return;
    state = event.target.value; render(); document.getElementById('cp-state')?.focus();
  });
  return {
    handles: page => page.route === '/merchant/campaigns',
    render: (page, list) => `<div class="cp-tabs" role="group" aria-label="عرض الحملات">${button('قائمة الحملات','tab','list',tab==='list')}${button('أداء الحملات','tab','performance',tab==='performance')}</div>${tab==='performance'?performance():list}`,
  };
})();
