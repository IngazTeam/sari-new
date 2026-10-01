// Local settings simulations only. The persona preview uses the actual app component.
window.AssistantPreview = (() => {
  const key='sary-assistant-preview-v1';
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tones=[['friendly','ودود'],['professional','رسمي'],['casual','عفوي'],['empathetic','متعاطف'],['persuasive','مقنع']];
  const initial=()=>({settings:{autoReplyEnabled:true,tone:'friendly',style:'saudi_dialect',emojiUsage:'moderate',brandVoice:'',personalityInstructions:'',language:'ar',responseDelay:2,maxResponseLength:200,workingHoursEnabled:false,workingHoursStart:'09:00',workingHoursEnd:'18:00',workingDays:['0','1','2','3','4'],welcomeMessage:'أهلًا بك! كيف أقدر أساعدك اليوم؟',outOfHoursMessage:'وصلتنا رسالتك. نعود إليك خلال أوقات العمل.',groupMode:'disabled',groupKeywords:'سعر، توفر',groupRedirectMessage:'يسعدنا مساعدتك في الخاص.',customInstructions:'',discountEnabled:false,maxPercent:10,expireHours:24,marginEnabled:false,minPercent:0,takeoverTimeoutMinutes:'15',takeoverResumeMessage:'مرحبًا! عدت لخدمتك.',takeoverCommandsEnabled:true},history:[]});
  let data;try{data=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  data={settings:{...initial().settings,...(data?.settings||{})},history:Array.isArray(data?.history)?data.history:[]};
  let current='',section='basics',draft=structuredClone(data.settings),errors={};
  const replyFields=['autoReplyEnabled','tone','style','emojiUsage','brandVoice','personalityInstructions','language','responseDelay','maxResponseLength','workingHoursEnabled','workingHoursStart','workingHoursEnd','workingDays','welcomeMessage','outOfHoursMessage','groupMode','groupKeywords','groupRedirectMessage','customInstructions'];
  const replySnapshot=value=>JSON.stringify(replyFields.map(name=>value[name]));
  let replyBase=structuredClone(data.settings), rememberedReply=null, restoreReply=false, replyConflict=false;
  const equalReply=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function reviewReply(){
    const modal=(title,description,body)=>openDialog(title,`<p class="hint">${e(description)}</p>${body}`);
    const changed=replyFields.filter(name=>!equalReply(draft[name],replyBase[name])&&!equalReply(data.settings[name],replyBase[name])&&!equalReply(draft[name],data.settings[name]));
    const names={autoReplyEnabled:'الرد التلقائي',tone:'النبرة',style:'أسلوب الكتابة',emojiUsage:'الرموز التعبيرية',brandVoice:'صوت العلامة',personalityInstructions:'تعليمات الشخصية',language:'اللغة',responseDelay:'مهلة الرد',maxResponseLength:'طول الرد',workingHoursEnabled:'تحديد أوقات العمل',workingHoursStart:'البداية',workingHoursEnd:'النهاية',workingDays:'الأيام',welcomeMessage:'رسالة الترحيب',outOfHoursMessage:'رسالة خارج الدوام',groupMode:'المجموعات',groupKeywords:'كلمات المجموعات',groupRedirectMessage:'التحويل للخاص',customInstructions:'التعليمات'};
    const value=v=>e(typeof v==='boolean'?(v?'مفعّل':'متوقف'):Array.isArray(v)?v.join('، '):v||'فارغ');
    modal('مراجعة تغييرات الإعدادات','اختر القيمة لكل حقل متعارض. تطبيق المراجعة يحدّث المسودة فقط؛ احفظها بعد المراجعة.',`<form data-as-form="reply-review" class="form-stack">${changed.length?'':'<p>تعديلاتك لا تتعارض مع الحقول التي تغيّرت؛ ستُدمج في المسودة.</p>'}${changed.map(name=>`<fieldset class="panel panel-pad"><legend>${names[name]}</legend>${['mine','latest'].map(choice=>`<label class="check-label" style="min-height:44px"><input type="radio" name="${name}" value="${choice}" required><span>${choice==='mine'?'تعديلي':'المحفوظ حاليًا'}<br><span style="white-space:pre-wrap;overflow-wrap:anywhere">${value((choice==='mine'?draft:data.settings)[name])}</span></span></label>`).join('')}</fieldset>`).join('')}<button type="submit" class="button primary">تطبيق المراجعة على المسودة</button></form>`);
  }
  const routes=['bot-settings','ai-hub'];
  const handles=p=>routes.includes(p.route.replace('/merchant/',''));
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(data));}catch{toast('تعذر الحفظ الدائم. التغييرات متاحة في الجلسة الحالية.');}};
  const btn=(label,action,extra='',primary=false)=>`<button type="button" class="button ${primary?'primary':''}" data-as-action="${action}" ${extra}>${e(label)}</button>`;
  const link=(label,route)=>`<a class="button" href="#/page/merchant/${route}">${e(label)}</a>`;
  const field=(name,label,{type='text',options,help='',min,max,maxlength=100,required=false}={})=>{
    const value=draft[name]??'',id=`as-${name}`;
    const attrs=`id="${id}" name="${name}" data-as-field="settings" ${required?'required':''} ${errors[name]?`aria-invalid="true" aria-describedby="${id}-error"`:''}`;
    const input=type==='checkbox'?`<input ${attrs} type="checkbox" ${value?'checked':''}>`:options?`<select class="control" ${attrs}>${options.map(([v,l])=>`<option value="${e(v)}" ${String(value)===String(v)?'selected':''}>${e(l)}</option>`).join('')}</select>`:type==='textarea'?`<textarea ${attrs} rows="4" maxlength="${maxlength}">${e(value)}</textarea>`:`<input ${attrs} type="${type}" value="${e(value)}" ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''} maxlength="${maxlength}" ${['time','number'].includes(type)?'dir="ltr"':''}>`;
    return `<div class="field ${type==='checkbox'?'as-check':''}">${type==='checkbox'?`<label for="${id}">${input}<span>${e(label)}</span></label>`:`<label for="${id}">${e(label)} ${required?'*':''}</label>${input}`}${help?`<small class="hint">${e(help)}</small>`:''}${errors[name]?`<p class="as-error" id="${id}-error" role="alert">${e(errors[name])}</p>`:''}</div>`;
  };
  const sections=[['basics','الرد والأسلوب'],['schedule','أوقات العمل'],['groups','المجموعات والتعليمات'],['sales','صلاحيات البيع'],['preview','المعاينة']];
  const languageOptions=[['ar','العربية'],['en','English'],['fr','Français'],['tr','Türkçe'],['es','Español'],['it','Italiano'],['both','عربي وإنجليزي']];
  function settings(){
    if(restoreReply)return `<section class="panel panel-pad"><h2>لديك مسودة إعدادات</h2><p>مسودة من زيارتك السابقة في هذا التبويب. لم تُحفظ في إعدادات المعاينة.</p>${btn('استعادة المسودة','restore-reply')}${btn('تجاهل المسودة','discard-reply')}</section>`;
    let body='';
    if(section==='basics')body=`${field('autoReplyEnabled','تفعيل الرد التلقائي',{type:'checkbox'})}<div class="field-grid">${field('tone','أسلوب الرد',{options:[...tones.slice(0,3),['enthusiastic','متحمس وإيجابي']]})}${field('language','لغة ردود المساعد',{options:languageOptions})}${field('responseDelay','مهلة الرد بالثواني',{type:'number',min:1,max:10,required:true})}${field('maxResponseLength','الحد الأقصى لطول الرد',{type:'number',min:50,max:500,required:true})}</div><section class="panel panel-pad form-stack"><h3>شخصية ساري وصوت العلامة</h3><div class="field-grid">${field('style','أسلوب الكتابة',{options:[['saudi_dialect','لهجة سعودية'],['formal_arabic','عربية فصحى'],['english','إنجليزي'],['bilingual','عربي وإنجليزي']]})}${field('emojiUsage','استخدام الرموز التعبيرية',{options:[['none','بدون رموز'],['minimal','قليل'],['moderate','معتدل'],['frequent','كثير']]})}</div><p class="hint">راجع توافق الأسلوب مع لغة الرد. اللغة غير العربية لها الأولوية.</p>${field('brandVoice','صوت العلامة التجارية',{type:'textarea',maxlength:2000})}<details ${draft.personalityInstructions?'open':''}><summary>تعليمات الشخصية الإضافية</summary>${field('personalityInstructions','تعليمات الشخصية الإضافية',{type:'textarea',maxlength:2000,help:'محفوظة من إعدادات الشخصية؛ تُطبق مع تعليمات التشغيل دون حذفها أو دمج النصين تلقائيًا.'})}</details></section><details class="as-template-picker"><summary>قوالب جاهزة · 9 خيارات</summary><p class="hint">اختيار القالب يغيّر مسودة الترحيب والأسلوب والمهلة. راجعها قبل الحفظ.</p><div class="as-pills">${['رسمي','ودود','عصري','مطعم','أزياء','إلكترونيات','تجميل','عقارات','خدمات'].map((name,i)=>btn(name,'bot-template',`data-index="${i}"`)).join('')}</div></details>`;
    if(section==='schedule')body=`<p class="hint">هذا جدول رد ساري الآلي، وهو مستقل عن أوقات النشاط في الإعداد الأولي. حفظ أوقات النشاط لا يغيّر هذا الجدول.</p>${field('workingHoursEnabled','تحديد أوقات العمل',{type:'checkbox'})}<fieldset ${draft.workingHoursEnabled||errors.workingHoursStart||errors.workingHoursEnd?'':'disabled'}><legend>جدول الرد</legend><div class="as-pills">${['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((day,i)=>btn(day,'day',`data-value="${i}" aria-pressed="${draft.workingDays.includes(String(i))}"`)).join('')}</div>${draft.workingDays.length?'':'<p class="hint">لم تحدد أي يوم. لن تتاح الردود المجدولة حتى تختار يومًا أو توقف تحديد أوقات العمل.</p>'}<div class="field-grid">${field('workingHoursStart','بداية الدوام',{type:'time'})}${field('workingHoursEnd','نهاية الدوام',{type:'time'})}</div></fieldset>${field('welcomeMessage','رسالة الترحيب',{type:'textarea',maxlength:1000})}${field('outOfHoursMessage','الرد خارج الدوام',{type:'textarea',maxlength:1000})}`;
    if(section==='groups')body=`${field('groupMode','التعامل مع المجموعات',{options:[['disabled','إيقاف كامل'],['mention_only','عند الإشارة للمساعد'],['keyword_only','كلمات مفتاحية'],['private_redirect','التحويل للخاص']]})}${draft.groupMode==='keyword_only'?field('groupKeywords','الكلمات المفتاحية',{help:'افصل بين الكلمات بفاصلة.'}):''}${draft.groupMode==='private_redirect'?field('groupRedirectMessage','رسالة التحويل للخاص',{type:'textarea',maxlength:500}):''}${field('customInstructions','تعليمات خاصة للمساعد',{type:'textarea',maxlength:2000,help:'قواعد التعامل وحدود الصلاحيات؛ لا تستبدل المصادر الموثقة.'})}`;
    if(section==='sales')body=policies();
    if(section==='preview')body=`<div class="as-chat"><h3>معاينة رسائل المسودة</h3><span class="status gray">عرض نصي · لا يختبر النموذج الفعلي</span>${draft.autoReplyEnabled?`<p class="as-reply">${e(draft.welcomeMessage)}</p>${draft.workingHoursEnabled?`<p class="hint">خارج أوقات العمل</p><p class="as-reply">${e(draft.outOfHoursMessage)}</p>`:'<p class="hint">جدول العمل متوقف في المسودة؛ رسالة خارج الدوام لا تنطبق.</p>'}`:'<p>الرد التلقائي متوقف في المسودة.</p>'}<p class="hint">هذه الرسائل لا تقيس احتراف المبيعات أو اكتمال المعرفة.</p></div><h3>اختبار الإعدادات المحفوظة</h3><p class="hint">يستخدم إعدادات المعاينة المحفوظة محليًا، ولا يشمل تعديلات المسودة. النتيجة مثال ثابت وليست إجابة من النموذج.</p><div class="as-pills">${btn('اختبر الرد','preview-store')}${btn('معاينة إرسال اختبار','test-message')}</div>`;
    return `${replyConflict?`<section class="panel panel-pad" role="alert"><p>تغيّرت الإعدادات المحفوظة. مسودتك لم تستبدلها؛ راجع أحدث نسخة قبل الحفظ.</p>${btn('مراجعة أحدث نسخة','review-reply')}</section>`:''}<div class="as-settings-layout"><aside class="as-settings-nav panel"><p class="eyebrow">اضبط المساعد</p>${sections.map(([id,l])=>btn(l,'section',`data-value="${id}" aria-pressed="${section===id}"`)).join('')}<hr>${link('الشخصيات','virtual-team')}${link('التدخل البشري','human-takeover')}${link('ملفات المعرفة','sari-brain')}</aside><section class="panel panel-pad"><header class="as-section-title"><h2>${sections.find(s=>s[0]===section)[1]}</h2><span class="status gray">مسودة محلية</span></header><form data-as-form="settings" class="form-stack">${body}${section!=='sales'?`<div class="as-savebar"><p class="hint">يحفظ إعدادات الرد. سياسات البيع تُحفظ كلٌ على حدة.</p><button type="submit" class="button primary" ${replyConflict?'disabled':''}>حفظ إعدادات الرد</button></div>`:''}</form></section></div>`;
  }
  function policies(){return `<p class="hint">الأرقام توضيحية. حفظ كل سياسة يتطلب مراجعة مستقلة؛ لا يغيّر أسعار متجر حقيقي.</p>${['discount','margin'].map(kind=>`<section class="as-policy"><h3>${kind==='discount'?'صلاحية منح الخصم':'الحد الأدنى لهامش الربح'}</h3>${field(kind==='discount'?'discountEnabled':'marginEnabled','تفعيل السياسة',{type:'checkbox'})}<div class="field-grid">${kind==='discount'?field('maxPercent','أقصى خصم %',{type:'number',min:1,max:50,required:true})+field('expireHours','صلاحية العرض بالساعات',{type:'number',min:1,max:168,required:true}):field('minPercent','أقل هامش ربح %',{type:'number',min:0,max:100,required:true})}</div><p class="hint">${kind==='discount'?'الخصم لا يتجاوز الحد المسموح، وتبقى قيود الربح والصلاحيات سارية.':'يُراجع بعد احتساب تكلفة المنتجات والضريبة والشحن والتكاليف الأخرى.'}</p><label class="check-label"><input id="as-review-${kind}" type="checkbox">راجعت أثر هذه السياسة على البيع</label>${btn('اعتماد السياسة','policy',`data-kind="${kind}"`)}<details><summary>سجل التغييرات</summary><ul>${data.history.filter(h=>h.kind===kind).map(h=>`<li>${e(h.text)}</li>`).join('')||'<li>لم تُحفظ تغييرات في هذه المعاينة.</li>'}</ul></details></section>`).join('')}`;}

  function latestOptions(){try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.settings)data.settings={...data.settings,...saved.settings};}catch{}}
  function hub(){const items=[['sari-brain','عقل ساري','النتائج، الملفات، فجوات المعرفة واحتراف المبيعات'],['virtual-team','شخصيات الفريق','الأدوار، الأسلوب، الكلمات والدوام'],['bot-settings','إعدادات المساعد','الرد، المجموعات، التعليمات وصلاحيات البيع'],['human-takeover','التدخل البشري','الإيقاف والاستئناف والمحادثات تحت إدارة الفريق'],['language-settings','لغة المحادثة','لغة المساعد ومعاينة الرد'],['test-sari','جرّب ساري','اختبار الردود قبل الاعتماد'],['sari-playground','مختبر ساري','تجارب المحادثة'],['quick-responses','الردود السريعة والكلمات','قواعد الكلمات والردود'],['ai-suggestions','الاقتراحات','فرص تحسين الرد'],['voice-messages','الرسائل الصوتية','الاستخدام والأداء'],['scheduled-messages','الرسائل المجدولة','المستلم والوقت والحالة'],['whatsapp-auto-notifications','تنبيهات واتساب','قوالب إشعارات المواعيد'],['sari-analytics','تحليلات ساري','مراجعة أداء المحادثات']];return `<div class="as-hub-grid">${items.map(([r,t,d])=>`<a class="panel as-hub-card" href="#/page/merchant/${r}"><span class="as-hub-dot"></span><h2>${t}</h2><p>${d}</p><span>افتح القسم ←</span></a>`).join('')}</div>`;}
  function renderPage(p){if(current!==p.route){if(current==='/merchant/bot-settings'&&replySnapshot(draft)!==replySnapshot(replyBase))rememberedReply={base:structuredClone(replyBase),draft:structuredClone(draft),section};current=p.route;latestOptions();draft=structuredClone(data.settings);section='basics';errors={};if(current==='/merchant/bot-settings'){replyBase=structuredClone(data.settings);restoreReply=Boolean(rememberedReply);replyConflict=false;}}return ({'bot-settings':settings,'ai-hub':hub})[p.route.replace('/merchant/','')]();}
  function primary(p){if(p.route.endsWith('/ai-hub'))location.hash='#/page/merchant/test-sari';else document.querySelector('[data-as-form]')?.requestSubmit();}
  function remember(event){const input=event.target;if(input.dataset.asField!=='settings')return;draft[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?input.value===''?'':Number(input.value):input.value;document.querySelectorAll('[id^="as-review-"]').forEach(n=>n.checked=false);}
  document.addEventListener('input',remember);
  document.addEventListener('change',event=>{remember(event);if(['groupMode','workingHoursEnabled','takeoverCommandsEnabled','language'].includes(event.target.name)&&event.target.dataset.asField==='settings')window.render();});

  let replyPreview=null;
  function openReplyPreview(){replyPreview={question:'',error:false,result:null};renderReplyPreview();}
  function renderReplyPreview(){
    const p=replyPreview;
    openDialog('اختبار شكل رد المساعد',`<div class="form-stack"><p>محاكاة تصميم محلية؛ لا تستدعي نموذجًا ولا تراسل العملاء. تستخدم بيانات المعاينة المحفوظة فقط.</p><div class="field"><label for="as-preview-question">سؤال العميل</label><textarea id="as-preview-question" maxlength="2000" rows="4">${e(p.question)}</textarea></div><p class="hint">كل سؤال مستقل. لا تحفظ هذه التجربة بعد إغلاقها.</p><div class="as-pills">${btn('اختبر الرد','preview-send','',true)}${btn('محاكاة تعذر الرد','preview-failure')}</div><div id="as-preview-result" role="status" aria-live="polite">${p.error?'<p role="alert">تعذر الرد في هذا المثال. بقي سؤالك؛ أعد الاختبار للمحاولة.</p>':p.result?`<h3>مثال ثابت لعرض النتيجة · لم يستدع نموذجًا</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">السؤال الذي جرى اختباره: ${e(p.result.question)}</p><p>مثال توضيحي: أهلًا، مساعد المتجر معك. ما التفاصيل التي تحتاج مساعدتنا فيها؟</p><small>لا يثبت جودة الرد أو اكتمال المعرفة أو نجاح المبيعات.</small>`:''}</div></div>`);
  }

  document.addEventListener('click',event=>{
    const node=event.target.closest('[data-as-action]');if(!node)return;const a=node.dataset.asAction;
    if(a==='restore-reply'&&rememberedReply){draft=rememberedReply.draft;replyBase=rememberedReply.base;section=rememberedReply.section;restoreReply=false;replyConflict=replySnapshot(replyBase)!==replySnapshot(data.settings);window.render();return;}
    if(a==='discard-reply'){rememberedReply=null;restoreReply=false;replyConflict=false;draft=structuredClone(data.settings);replyBase=structuredClone(data.settings);window.render();return;}
    if(a==='review-reply'){reviewReply();return;}
    if(a==='preview-store'){openReplyPreview();return;}
    if(a==='preview-send'||a==='preview-failure'){
      if(!replyPreview)return;
      const p=replyPreview;p.question=document.getElementById('as-preview-question').value.trim();
      if(!p.question||p.question.length>2000)return toast('اكتب سؤالًا لا يتجاوز 2000 حرف.');
      p.error=a==='preview-failure';p.result=p.error?null:{question:p.question};
      renderReplyPreview();return;
    }
    if(a==='close')document.getElementById('dialog').close();
    if(a==='section'){section=node.dataset.value;window.render();}
    if(a==='day'){const value=node.dataset.value;draft.workingDays=draft.workingDays.includes(value)?draft.workingDays.filter(x=>x!==value):[...draft.workingDays,value];window.render();}
    if(a==='bot-template'){const i=Number(node.dataset.index);draft.tone=['professional','friendly','casual','friendly','friendly','professional','friendly','professional','friendly'][i];draft.responseDelay=i===0||i===7?3:i===2?1:2;draft.welcomeMessage=['مرحبًا بكم. كيف يمكننا مساعدتكم؟','أهلًا! كيف أقدر أساعدك؟','هلا بك! وش تحتاج اليوم؟','أهلًا بك في مطعمنا. كيف نساعدك بطلبك؟','أهلًا! نساعدك في اختيار ما يناسبك.','مرحبًا. ما الجهاز أو المواصفات التي تبحث عنها؟','أهلًا بك. كيف يمكننا مساعدتك؟','مرحبًا بكم. ما العقار الذي تبحثون عنه؟','أهلًا بك. ما الخدمة التي تحتاجها؟'][i];draft.outOfHoursMessage='شكرًا لرسالتك. سنعود إليك خلال أوقات العمل.';window.render();toast('تم تطبيق القالب على المسودة.');}
    if(a==='test-message')openDialog('رسالة الاختبار',`<p>في التطبيق الفعلي تُرسل رسالة الترحيب المحفوظة إلى رقم المتجر المسجل. هذه معاينة محلية؛ لم تُرسل رسالة. لا تشمل تعديلات المسودة.</p><div class="as-note">${e(data.settings.welcomeMessage)}</div>`);
    if(a==='policy'){
      const kind=node.dataset.kind,names=kind==='discount'?['discountEnabled','maxPercent','expireHours']:['marginEnabled','minPercent'];
      if(!names.every(name=>document.getElementById(`as-${name}`)?.reportValidity()))return;
      if(!document.getElementById(`as-review-${kind}`).checked)return toast('راجع أثر السياسة وحدد مربع المراجعة قبل الاعتماد.');
      const before=names.map(n=>data.settings[n]).join(' / ');for(const n of names)data.settings[n]=draft[n];data.history.unshift({kind,text:`قبل: ${before} ← بعد: ${names.map(n=>draft[n]).join(' / ')} · حفظ محلي`});save();window.render();toast('تم حفظ السياسة محليًا.');
    }
  });
  document.addEventListener('submit',event=>{
    const type=event.target.dataset.asForm;if(!type)return;event.preventDefault();
    if(!event.target.reportValidity())return;
    if(type==='reply-review'){
      const merged=structuredClone(data.settings);
      for(const name of replyFields){if(equalReply(draft[name],replyBase[name]))continue;const choice=event.target.querySelector(`input[name="${name}"]:checked`);if(choice?.value!=='latest')merged[name]=draft[name];}
      draft=merged;replyBase=structuredClone(data.settings);rememberedReply=null;replyConflict=false;document.getElementById('dialog').close();window.render();return;
    }
    if(type==='settings'&&section==='sales')return toast('اعتمد كل سياسة من زرها بعد المراجعة.');
    const names=replyFields;
    if(type==='settings'){
      if(restoreReply)return;
      if(replySnapshot(replyBase)!==replySnapshot(data.settings)){replyConflict=true;window.render();return;}
      errors={};
      for(const name of ['workingHoursStart','workingHoursEnd'])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[name]))errors[name]='أدخل وقتًا صحيحًا بين 00:00 و23:59.';
      if(draft.workingHoursEnabled&&!errors.workingHoursStart&&!errors.workingHoursEnd&&draft.workingHoursStart===draft.workingHoursEnd)errors.workingHoursEnd='اختر وقت نهاية يختلف عن البداية. للعمل طوال اليوم، أوقف تحديد أوقات العمل.';
      if(Object.keys(errors).length){section='schedule';window.render();document.querySelector('[aria-invalid="true"]')?.focus();return;}
    }
    for(const name of names)data.settings[name]=draft[name];if(type==='settings'){replyBase=structuredClone(data.settings);rememberedReply=null;replyConflict=false;}save();toast('تم حفظ التغييرات محليًا.');
  });
  return {handles,render:renderPage,primary,reset(){data=initial();draft=structuredClone(data.settings);replyBase=structuredClone(data.settings);rememberedReply=null;restoreReply=false;replyConflict=false;current='';save();}};
})();
