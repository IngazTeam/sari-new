// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import ar from '../client/src/locales/ar.json';import en from '../client/src/locales/en.json';
const m=vi.hoisted(()=>({data:{} as any,error:null as any,loading:false,fetching:false,paused:false,language:'en',write:vi.fn(),receipt:vi.fn(),refresh:vi.fn(),back:vi.fn()}));
vi.mock('../client/src/lib/trpc',()=>({trpc:{products:{categories:{read:{useQuery:()=>({data:m.data,error:m.error,isLoading:m.loading,isFetching:m.fetching,fetchStatus:m.paused?'paused':'idle',refetch:m.refresh})},write:{useMutation:()=>({mutateAsync:m.write})}}},useUtils:()=>({products:{categories:{receipt:{fetch:m.receipt}}}})}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:m.language},t:(key:string,values:any={})=>String(key.split('.').reduce((v:any,k)=>v?.[k],m.language==='ar'?ar:en)??key).replace(/\{\{(\w+)\}\}/g,(_,k)=>String(values[k]??''))})}));
vi.mock('../client/src/components/merchant/WorkspaceState',()=>({WorkspaceState:({kind}:any)=>React.createElement('div',{'data-state':kind}),workspaceFailureKind:()=> 'error'}));
import {ProductCategoriesWorkspace} from '../client/src/components/merchant/ProductCategoriesWorkspace';
import {readCategoryDraft} from '../client/src/lib/product-category-workspace';
import {clearKnowledgeWorkspace} from '../client/src/lib/knowledge-workspace-cache';
const scope='9:7:products',digest='a'.repeat(64);
let host:HTMLDivElement,root:Root;
const copy=(key:keyof typeof en.categoryUx)=>(m.language==='ar'?ar:en).categoryUx[key];
const buttons=(key:keyof typeof en.categoryUx)=>Array.from(host.querySelectorAll('button')).filter(b=>b.textContent===copy(key));
const click=async(key:keyof typeof en.categoryUx)=>act(async()=>buttons(key)[0]!.click());
const input=(key:keyof typeof en.categoryUx)=>Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.startsWith(copy(key)))!.querySelector('input')!;
async function fill(key:keyof typeof en.categoryUx,value:string){await act(async()=>{const element=input(key);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
const render=async()=>act(async()=>root.render(React.createElement(ProductCategoriesWorkspace,{scope,back:m.back})));
const receipt=(request:any)=>({merchantId:7,actorId:9,requestId:request.requestId,kind:request.kind,categoryId:request.id??10,digest:'b'.repeat(64),confirmedAt:'2026-09-30T12:00:00.000Z'});
const category=(id=1,patch:any={})=>({id,merchantId:7,name:'Coffee '+id,nameEn:null,parentId:null,sortOrder:0,isActive:1,productCount:0,...patch});
async function reviewNew(){await click('add');await fill('name','New category');await act(async()=>input('reviewed').click());}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();m.data={merchantId:7,actorId:9,canManage:true,locked:false,digest,rows:[category()]};m.error=null;m.loading=m.fetching=m.paused=false;m.language='en';m.refresh.mockResolvedValue({data:m.data});m.write.mockImplementation(async request=>receipt(request));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
describe('actual category workspace',()=>{
  it.each(['ar','en'])('renders categories and field errors in %s without automatic writes',async language=>{
    m.language=language;await render();expect(host.textContent).toContain(copy('title'));expect(m.write).not.toHaveBeenCalled();
    await click('add');expect(input('name').getAttribute('aria-invalid')).toBe('true');expect(buttons('save')[0].disabled).toBe(true);
    await fill('name','New category');await fill('sortOrder','1e3');expect(buttons('save')[0].disabled).toBe(true);expect(host.textContent).not.toContain('categoryUx.');
  });
  it('saves only after review, checks receipt, and clears the accepted attempt',async()=>{
    await render();await click('add');await fill('name','New category');expect(buttons('save')[0].disabled).toBe(true);
    await act(async()=>input('reviewed').click());await click('save');expect(m.write).toHaveBeenCalledTimes(1);
    expect(m.write.mock.calls[0][0]).toMatchObject({kind:'create',reviewed:true,expectedDigest:digest,fields:{name:'New category'}});
    expect(readCategoryDraft(scope)).toBeNull();expect(host.textContent).toContain('confirmed receipt');
  });
  it('keeps invalid drafts across unmount and requires explicit discard',async()=>{
    await render();await click('add');await fill('name','Draft name');await click('back');expect(m.back).toHaveBeenCalled();
    await act(async()=>root.unmount());root=createRoot(host);await render();expect(input('name').value).toBe('Draft name');
    await click('discard');expect(readCategoryDraft(scope)).not.toBeNull();await click('confirmDiscard');expect(readCategoryDraft(scope)).toBeNull();
  });
  it.each(['error','loading','fetching','paused','foreign','malformed'])('hides editable data in %s',async state=>{
    if(state==='error')m.error=Error();else if(state==='foreign')m.data.merchantId=8;else if(state==='malformed')m.data.digest='bad';else (m as any)[state]=true;
    await render();expect(buttons('add')).toHaveLength(0);expect(host.textContent).not.toContain('Coffee 1');expect(m.write).not.toHaveBeenCalled();
  });
  it.each(['viewer','locked'])('allows viewing but blocks changes for %s',async state=>{
    if(state==='viewer')m.data.canManage=false;else m.data.locked=true;await render();expect(host.textContent).toContain('Coffee 1');expect(buttons('add')[0].disabled).toBe(true);expect(buttons('edit')[0].disabled).toBe(true);
  });
  it('blocks delete for product or child usage and rechecks the selected unused leaf',async()=>{
    m.data.rows=[category(1,{productCount:4}),category(2,{name:'Child',parentId:1}),category(3)];await render();expect(buttons('delete')[0].disabled).toBe(true);
    await act(async()=>buttons('delete')[2].click());expect(buttons('confirmDelete')[0].disabled).toBe(true);await act(async()=>input('reviewed').click());await click('confirmDelete');expect(m.write.mock.calls[0][0]).toMatchObject({kind:'delete',id:3});
  });
  it('retains pending write after an unknown failure and retries with the same UUID',async()=>{
    m.write.mockRejectedValueOnce(Error('connection lost'));await render();await reviewNew();await click('save');const request=m.write.mock.calls[0][0];expect(readCategoryDraft(scope)?.attempt).toEqual(request);expect(buttons('discard')).toHaveLength(0);
    await click('retrySame');expect(m.write.mock.calls[1][0]).toEqual(request);expect(readCategoryDraft(scope)).toBeNull();
  });
  it('recovers a valid receipt after returning to the workspace without sending again',async()=>{
    m.write.mockRejectedValueOnce(Error());await render();await reviewNew();await click('save');const request=m.write.mock.calls[0][0];m.receipt.mockResolvedValue(receipt(request));
    await act(async()=>root.unmount());root=createRoot(host);await render();expect(m.write).toHaveBeenCalledTimes(1);await click('recover');expect(m.write).toHaveBeenCalledTimes(1);expect(readCategoryDraft(scope)).toBeNull();
  });
  it.each([null,{merchantId:8},{kind:'delete'}, {requestId:'22222222-2222-4222-8222-222222222222'}])('does not accept inconclusive or mismatched receipt %j',async patch=>{
    m.write.mockRejectedValueOnce(Error());await render();await reviewNew();await click('save');const request=m.write.mock.calls[0][0];m.receipt.mockResolvedValue(patch?{...receipt(request),...patch}:null);await click('recover');expect(readCategoryDraft(scope)?.attempt).toEqual(request);expect(buttons('retrySame')).toHaveLength(1);
  });
  it('retains editable draft after definitive rejection and rejects stale data until reloaded',async()=>{
    m.write.mockRejectedValueOnce({data:{code:'CONFLICT'}});await render();await reviewNew();await click('save');expect(readCategoryDraft(scope)?.attempt).toBeUndefined();expect(input('name').value).toBe('New category');
    m.data={...m.data,digest:'b'.repeat(64)};await render();expect(buttons('save')[0].disabled).toBe(true);expect(host.textContent).toContain(copy('conflict'));await click('reload');expect(input('name').value).toBe('New category');expect(input('reviewed').checked).toBe(false);
  });
  it('does not write if storing the pending attempt fails',async()=>{
    await render();await reviewNew();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error();});await click('save');expect(m.write).not.toHaveBeenCalled();expect(host.textContent).toContain(copy('storageError'));
  });
  it('does not restore a result or request after logout',async()=>{
    let resolve!:(v:any)=>void;m.write.mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await reviewNew();await click('save');const request=m.write.mock.calls[0][0];clearKnowledgeWorkspace();await act(async()=>resolve(receipt(request)));expect(readCategoryDraft(scope)).toBeNull();expect(host.textContent).not.toContain('confirmed receipt');
  });
  it('paginates the entire bounded category list and searches without losing the draft',async()=>{
    m.data.rows=Array.from({length:25},(_,i)=>category(i+1));await render();expect(buttons('edit')).toHaveLength(20);await click('next');expect(buttons('edit')).toHaveLength(5);await fill('search','Coffee 25');expect(buttons('edit')).toHaveLength(1);expect(host.textContent).toContain('1 of 25 categories');
  });
});
