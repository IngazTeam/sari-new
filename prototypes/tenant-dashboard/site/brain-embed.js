// Same-origin, allowlisted communication between the central mockup and its actual-component previews.
(() => {
  const pages = new Set(['knowledge-groups.html','sales-knowledge.html','brain-preview.html','reply-quality.html','knowledge-activity.html','personas.html','assistant-options.html','assistant-settings.html','dashboard.html','sales-analytics.html','messages-analytics.html','inbox.html','campaign-workspace.html','service-workspace.html']);
  const dashboardDestinations=new Set(["/merchant/conversations","/merchant/conversations?needs_human=1","/merchant/conversations?phone=ux-customer-051","/merchant/conversations?phone=ux-customer-052","/merchant/products","/merchant/campaigns","/merchant/campaigns/new","/merchant/reviews","/merchant/reports","/merchant/analytics","/merchant/analytics-hub","/merchant/orders","/merchant/services/new","/merchant/sales-hub","/merchant/setup-wizard","/merchant/bot-settings","/merchant/whatsapp","/merchant/whatsapp-instances","/merchant/test-sari","/merchant/my-subscription","/merchant/subscription/plans","/merchant/subscription/compare","/merchant/platform-integrations","/merchant/sari-brain","/merchant/sari-brain?view=overview","/merchant/sari-brain?view=sources","/merchant/sari-brain?view=knowledge&pane=conflicts","/merchant/sari-brain?view=knowledge&pane=pages","/merchant/sari-brain?view=knowledge&pane=faq","/merchant/sari-brain?view=knowledge&pane=sections","/merchant/sari-brain?view=sales"]);
  const messagesDestinations=new Set(['/merchant/tools','/merchant/dashboard']);
  const inboxDestinations=new Set(['/merchant/tools','/merchant/dashboard','/merchant/whatsapp-instances']);
  const isInbox=url=>url.pathname==='/inbox.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const isCampaign=url=>url.pathname==='/campaign-workspace.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const campaignState=search=>{
    if(typeof search!=='string'||search.length>1400)return null;
    const input=new URLSearchParams(search),output=new URLSearchParams(),seen=new Set();let path='/merchant/campaigns';
    for(const [key,value] of input){
      if(key==='embed'&&value==='brain')continue;
      if(seen.has(key))return null;seen.add(key);
      const valid=key==='path'?/^\/merchant\/campaigns(?:\/new|\/[1-9]\d{0,15}(?:\/edit|\/report)?)?$/.test(value):key==='lang'?['ar','en'].includes(value):key==='tenant'?['258','259'].includes(value):key==='scenario'?/^[a-z-]{1,24}$/.test(value):key==='q'?value.length<=200&&!/[\u0000-\u001f]/.test(value):key==='page'?/^[1-9]\d{0,6}$/.test(value)&&Number(value)<=1000000:key==='status'?['all','draft','scheduled','sending','completed','failed','pending','processing','sent','suppressed','manual_review','success'].includes(value):key==='review'?['1','send'].includes(value):key==='tab'?['list','performance'].includes(value):key==='days'?['7','30','90'].includes(value):key==='view'?['recipients','results'].includes(value):false;
      if(!valid)return null;if(key==='path')path=value;else output.set(key,value);
    }
    return path+(output.size?'?'+output.toString():'');
  };
  const isService=url=>url.pathname==='/service-workspace.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const serviceState=search=>{
    if(typeof search!=='string'||search.length>1400)return null;
    const input=new URLSearchParams(search),output=new URLSearchParams(),seen=new Set();let path='/merchant/services';
    for(const [key,value] of input){
      if(key==='embed'&&value==='brain')continue;
      if(seen.has(key))return null;seen.add(key);
      const valid=key==='path'?/^\/merchant\/(?:services(?:\/new|\/[1-9]\d{0,9}(?:\/edit)?)?|service-categories|service-packages|staff|bookings)$/.test(value)&&(!/\/services\/\d/.test(value)||Number(value.split('/')[3])<=2147483647):key==='lang'?['ar','en'].includes(value):key==='tenant'?['269','270'].includes(value):key==='scenario'?/^[a-z-]{1,24}$/.test(value):key==='q'?value.length<=200&&!/[\u0000-\u001f]/.test(value):key==='page'?/^[1-9]\d{0,6}$/.test(value)&&Number(value)<=1000000:key==='status'?['all','active','inactive','pending','confirmed','in_progress','completed','cancelled','no_show','unknown'].includes(value):key==='payment'?['all','unpaid','paid','refunded','unknown'].includes(value):['from','to'].includes(key)?/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value:['service','staff'].includes(key)?/^[1-9]\d{0,9}$/.test(value)&&Number(value)<=2147483647:['edit','booking'].includes(key)?value==='new'||/^[1-9]\d{0,9}$/.test(value)&&Number(value)<=2147483647:false;
      if(!valid)return null;if(key==='path')path=value;else output.set(key,value);
    }
    return path+(output.size?'?'+output.toString():'');
  };
  const inboxState=search=>{
    if(typeof search!=='string'||search.length>2800)return null;
    const input=new URLSearchParams(search),output=new URLSearchParams(),seen=new Set();
    for(const [key,value] of input){
      if(key==='embed'&&value==='brain')continue;
      if(seen.has(key))return null;seen.add(key);
      const valid=key==='lang'?['ar','en'].includes(value):key==='tenant'?['235','236'].includes(value):key==='scenario'?/^[a-z-]{1,24}$/.test(value):key==='phone'?value.length<=200&&!/[\u0000-\u001f]/.test(value):key==='page'?/^[1-9]\d{0,5}$/.test(value)&&Number(value)<=100000:key==='conversationId'?/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value)):key==='history'?value.length<=1700&&/^[1-9]\d*(,[1-9]\d*){0,99}$/.test(value):key==='stage'?/^[a-z_]{1,30}$/.test(value):key==='needs_human'?value==='1':false;
      if(!valid)return null;output.set(key,value);
    }
    return output.toString();
  };
  const isMessages=url=>url.pathname==='/messages-analytics.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const salesDestinations=new Set(['/merchant/reports','/merchant/products','/merchant/campaigns','/merchant/customers','/merchant/sari-brain?view=sales','/merchant/analytics-hub']);
  const isSales=url=>url.pathname==='/sales-analytics.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const isDashboard=url=>url.pathname==='/dashboard.html' && new URLSearchParams(url.search).get('embed')==='brain';
  const assistantTools = new Set(['sari-brain','virtual-team','human-takeover','language-settings','bot-settings','test-sari','sari-playground','quick-responses','ai-suggestions','voice-messages','scheduled-messages','whatsapp-auto-notifications','sari-analytics'].map(page=>'/merchant/'+page));
  const isAssistantHub = url => url.pathname==='/assistant-settings.html' && url.search==='?embed=brain&page=hub';
  const embedded = parent !== window && new URLSearchParams(location.search).get('embed') === 'brain' && pages.has(location.pathname.split('/').pop());
  if (embedded) {
    document.documentElement.dataset.brainEmbedded = 'true';
    if(isService(location)){const sync=()=>{if(serviceState(location.search)!==null)parent.postMessage({type:'sary-brain-preview',action:'serviceState',search:location.search},location.origin);};addEventListener('popstate',sync);sync();}
    if(isCampaign(location)){
      const sync=()=>{const route=campaignState(location.search);if(route!==null)parent.postMessage({type:'sary-brain-preview',action:'campaignState',search:location.search},location.origin);};
      addEventListener('popstate',sync);sync();
    }
    if(isInbox(location)){
      const sync=()=>{const search=inboxState(location.search);if(search!==null)parent.postMessage({type:'sary-brain-preview',action:'inboxState',search},location.origin);};
      addEventListener('popstate',sync);sync();
    }
    document.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a[href]');
      if(!anchor || event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
      const url=new URL(anchor.getAttribute('href'),location.href);
      const tool = url.hash.startsWith('#/page') ? url.hash.slice(6) : '';
      if(isService(location) && url.origin===location.origin && url.pathname==='/' && !url.search && new Set(['/merchant/tools','/merchant/dashboard','/merchant/bookings','/merchant/calendar']).has(tool)){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'serviceTool',route:tool},location.origin);return;}
      if(isCampaign(location) && url.origin===location.origin && url.pathname==='/' && !url.search && messagesDestinations.has(tool)){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'campaignTool',route:tool},location.origin);return;}
      if(isInbox(location) && url.origin===location.origin && url.pathname==='/' && !url.search && inboxDestinations.has(tool)){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'inboxTool',route:tool},location.origin);return;}
      if(isMessages(location) && url.origin===location.origin && url.pathname==='/' && !url.search && messagesDestinations.has(tool)){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'messagesTool',route:tool},location.origin);return;}
      if(isSales(location) && url.origin===location.origin && url.pathname==='/' && !url.search && salesDestinations.has(tool)){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'salesTool',route:tool},location.origin);return;}
      if(isDashboard(location) && url.origin===location.origin && url.pathname==='/' && !url.search && dashboardDestinations.has(tool)){
        event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'dashboardTool',route:tool},location.origin);return;
      }
      if(isAssistantHub(location) && url.origin===location.origin && url.pathname==='/' && !url.search && assistantTools.has(tool)){
        event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'assistantTool',route:tool},location.origin);return;
      }
      const destination = {'#/page/merchant/test-sari':'testSession','#/page/merchant/bot-settings':'assistantSettings','#/page/merchant/ai-hub':'assistantHub','#/page/merchant/whatsapp':'whatsapp'}[url.hash];
      const conversation = /^#\/page\/merchant\/conversations\?phone=(ux-customer-0(?:5[1-9]|6[0-2]))$/.exec(url.hash);
      if(url.origin===location.origin && conversation){event.preventDefault();parent.postMessage({type:'sary-brain-preview',action:'conversation',phone:conversation[1]},location.origin);return;}
      if(url.origin===location.origin && destination){
        event.preventDefault(); parent.postMessage({type:'sary-brain-preview',action:'navigate',destination},location.origin);
      }
    });
    let previous = -1, previousModal = false, scheduled = false;
    const measure = () => {
      scheduled = false;
      const main = document.querySelector('main');
      if (!main) return;
      const modal=Boolean(document.querySelector('[role="dialog"][data-state="open"],dialog[open]'));
      if(modal!==previousModal){previousModal=modal;parent.postMessage({type:'sary-brain-preview',action:'modal',open:modal},location.origin);}
      const height = Math.ceil(main.getBoundingClientRect().height + 24);
      if (height === previous) return;
      previous = height;
      parent.postMessage({type:'sary-brain-preview',action:'resize',height},location.origin);
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } };
    const observer = new MutationObserver(schedule);
    const observeBody = () => {
      if (!document.body) return;
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
      if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.body);
      schedule();
    };
    if (document.body) observeBody();
    else document.addEventListener('DOMContentLoaded',observeBody,{once:true});
    addEventListener('resize',schedule);
    document.fonts?.ready.then(schedule);
    schedule();
    return;
  }
  // Keep example question drafts for tab switches, in parent memory only.
  const drafts=new Map();let epoch=0;
  const validKey=key=>typeof key==='string' && /^central:15[34]:(model|guardrail|failed|rate|forbidden|pending)$/.test(key);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const warn=event=>{if(drafts.size){event.preventDefault();event.returnValue='';}};
  window.SaryBrainPrototypeCache={
    epoch:()=>epoch,
    read:key=>validKey(key)&&drafts.has(key)?clone(drafts.get(key)):null,
    write:(key,draft,expectedEpoch)=>{if(!validKey(key)||expectedEpoch!==epoch||!draft||typeof draft.content!=='string'||draft.type!=='custom')return;if(!drafts.size)addEventListener('beforeunload',warn);drafts.set(key,clone(draft));},
    discard:key=>{drafts.delete(key);if(!drafts.size)removeEventListener('beforeunload',warn);},
    clear:()=>{epoch++;drafts.clear();removeEventListener('beforeunload',warn);}
  };
  const destinations = {
    whatsapp:()=>{location.hash='#/page/merchant/whatsapp';},
    assistantHub:()=>{location.hash='#/page/merchant/ai-hub';},
    assistantSettings:()=>{location.hash='#/page/merchant/bot-settings';},
    documents:()=>window.SaryBrainPreview?.openAdd(), upload:()=>window.SaryBrainPreview?.openAdd(),
    pages:()=>window.SaryBrainPreview?.navigate('knowledge','pages'), faqs:()=>window.SaryBrainPreview?.navigate('knowledge','faq'),
    sections:()=>window.SaryBrainPreview?.navigate('knowledge','sections'), conflicts:()=>window.SaryBrainPreview?.navigate('knowledge','conflicts'),
    sales:()=>window.SaryBrainPreview?.navigate('sales'), products:()=>{location.hash='#/page/merchant/products';}, settings:()=>{location.hash='#/page/merchant/settings';}, testSession:()=>{location.hash='#/page/merchant/test-sari';}
  };
  const modalHeight=()=>Math.max(320,Math.min(900,window.innerHeight-164));
  addEventListener('resize',()=>document.querySelectorAll('iframe[data-brain-preview][data-modal="true"]').forEach(frame=>{frame.style.height=modalHeight()+'px';}));
  addEventListener('message',event=>{
    if (event.origin !== location.origin || !event.source) return;
    const frame = [...document.querySelectorAll('iframe[data-brain-preview]')].find(frame=>frame.contentWindow===event.source);
    if (!frame) return;
    const url = new URL(frame.getAttribute('src'),location.href);
    if (url.origin !== location.origin || !pages.has(url.pathname.split('/').pop()) || url.searchParams.get('embed') !== 'brain') return;
    const message=event.data;
    if (!message || typeof message !== 'object' || message.type!=='sary-brain-preview') return;
    if(message.action==='inboxTool' && isInbox(url) && inboxDestinations.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='serviceTool' && isService(url) && new Set(['/merchant/tools','/merchant/dashboard','/merchant/bookings','/merchant/calendar']).has(message.route))location.hash='#/page'+message.route;
    if(message.action==='serviceState' && isService(url) && /^#\/page\/merchant\/(?:services|service-categories|service-packages|staff|bookings)(?:\/|\?|$)/.test(location.hash)){const route=serviceState(message.search);if(route!==null){history.replaceState(null,'','#/page'+route);window.syncServicePreviewContext?.(route);}}
    if(message.action==='campaignTool' && isCampaign(url) && messagesDestinations.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='campaignState' && isCampaign(url) && /^#\/page\/merchant\/campaigns(?:\/|\?|$)/.test(location.hash)){
      const route=campaignState(message.search);if(route!==null){history.replaceState(null,'','#/page'+route);window.syncCampaignPreviewContext?.(route);}
    }
    if(message.action==='inboxState' && isInbox(url) && location.hash.split('?')[0]==='#/page/merchant/conversations'){
      const search=inboxState(message.search);
      if(search!==null)history.replaceState(null,'','#/page/merchant/conversations'+(search?'?'+search:''));
    }
    if(message.action==='messagesTool' && isMessages(url) && messagesDestinations.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='salesTool' && isSales(url) && salesDestinations.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='dashboardTool' && isDashboard(url) && dashboardDestinations.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='assistantTool' && isAssistantHub(url) && assistantTools.has(message.route))location.hash='#/page'+message.route;
    if(message.action==='conversation' && typeof message.phone==='string' && /^ux-customer-0(?:5[1-9]|6[0-2])$/.test(message.phone) && url.pathname==='/assistant-options.html')location.hash='#/page/merchant/conversations?phone='+encodeURIComponent(message.phone);
    if(message.action==='resize' && Number.isFinite(message.height) && message.height>=0 && message.height<=20000){
      frame.dataset.contentHeight=String(Math.max(640,Math.ceil(message.height)));
      if(frame.dataset.modal!=='true')frame.style.height=frame.dataset.contentHeight+'px';
      frame.dataset.ready='true';
    }
    if(message.action==='modal' && typeof message.open==='boolean' && String(message.open)!==frame.dataset.modal){
      frame.dataset.modal=String(message.open);
      frame.style.height=(message.open?modalHeight():Number(frame.dataset.contentHeight)||760)+'px';
      if(message.open)frame.scrollIntoView?.({block:'start',behavior:'instant'});
    }
    if(message.action==='navigate' && Object.hasOwn(destinations,message.destination)) destinations[message.destination]();
  });
})();
