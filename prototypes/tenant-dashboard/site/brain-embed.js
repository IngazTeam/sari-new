// Same-origin, allowlisted communication between the central mockup and its actual-component previews.
(() => {
  const pages = new Set(['knowledge-groups.html','sales-knowledge.html','brain-preview.html','reply-quality.html','knowledge-activity.html']);
  const embedded = parent !== window && new URLSearchParams(location.search).get('embed') === 'brain' && pages.has(location.pathname.split('/').pop());
  if (embedded) {
    document.documentElement.dataset.brainEmbedded = 'true';
    document.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a[href]');
      if(!anchor || event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
      const url=new URL(anchor.getAttribute('href'),location.href);
      if(url.origin===location.origin && url.hash==='#/page/merchant/test-sari'){
        event.preventDefault(); parent.postMessage({type:'sary-brain-preview',action:'navigate',destination:'testSession'},location.origin);
      }
    });
    let previous = -1, scheduled = false;
    const measure = () => {
      scheduled = false;
      const main = document.querySelector('main');
      if (!main) return;
      const height = Math.ceil(main.getBoundingClientRect().height + 24);
      if (height === previous) return;
      previous = height;
      parent.postMessage({type:'sary-brain-preview',action:'resize',height},location.origin);
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.body);
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
    documents:()=>window.SaryBrainPreview?.openAdd(), upload:()=>window.SaryBrainPreview?.openAdd(),
    pages:()=>window.SaryBrainPreview?.navigate('knowledge','pages'), faqs:()=>window.SaryBrainPreview?.navigate('knowledge','faq'),
    sections:()=>window.SaryBrainPreview?.navigate('knowledge','sections'), conflicts:()=>window.SaryBrainPreview?.navigate('knowledge','conflicts'),
    sales:()=>window.SaryBrainPreview?.navigate('sales'), products:()=>{location.hash='#/page/merchant/products';}, settings:()=>{location.hash='#/page/merchant/settings';}, testSession:()=>{location.hash='#/page/merchant/test-sari';}
  };
  addEventListener('message',event=>{
    if (event.origin !== location.origin || !event.source) return;
    const frame = [...document.querySelectorAll('iframe[data-brain-preview]')].find(frame=>frame.contentWindow===event.source);
    if (!frame) return;
    const url = new URL(frame.getAttribute('src'),location.href);
    if (url.origin !== location.origin || !pages.has(url.pathname.split('/').pop()) || url.searchParams.get('embed') !== 'brain') return;
    const message=event.data;
    if (!message || typeof message !== 'object' || message.type!=='sary-brain-preview') return;
    if(message.action==='resize' && Number.isFinite(message.height) && message.height>=0 && message.height<=20000){
      frame.style.height=Math.max(640,Math.ceil(message.height))+'px';
      frame.dataset.ready='true';
    }
    if(message.action==='navigate' && Object.hasOwn(destinations,message.destination)) destinations[message.destination]();
  });
})();
