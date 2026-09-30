// @vitest-environment jsdom
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {categoryToForm,categoryFormRequest,readCategoryDraft,saveCategoryDraft,clearCategoryDraft,type CategoryDraft} from '../client/src/lib/product-category-workspace';
import {knowledgeCacheEpoch,clearKnowledgeWorkspace} from '../client/src/lib/knowledge-workspace-cache';
const scope='9:7:products',prefix='sary:product-category:v1:',id='22222222-2222-4222-8222-222222222222';
const draft=():CategoryDraft=>({kind:'create',id:null,digest:'a'.repeat(64),form:{...categoryToForm(),name:'New'}});
beforeEach(()=>{sessionStorage.clear();});afterEach(()=>vi.restoreAllMocks());
describe('category draft and pending request recovery',()=>{
  it('keeps unfinished field input without silently converting invalid values',()=>{
    const d=draft();d.form.sortOrder='1e3';saveCategoryDraft(scope,d,knowledgeCacheEpoch());expect(readCategoryDraft(scope)).toEqual(d);expect(categoryFormRequest(d,id).success).toBe(false);
  });
  it('restores the exact original pending request and isolates actors and merchants',()=>{
    const d=draft(),r=categoryFormRequest(d,id);if(!r.success)throw Error();d.attempt=r.data;
    saveCategoryDraft(scope,d,knowledgeCacheEpoch());expect(readCategoryDraft(scope)?.attempt).toEqual(r.data);expect(readCategoryDraft('8:7:products')).toBeNull();expect(readCategoryDraft('9:8:products')).toBeNull();
  });
  it('rejects a request that no longer matches its draft',()=>{
    const d=draft(),r=categoryFormRequest(d,id);if(!r.success)throw Error();d.attempt=r.data;d.form.name='Changed';expect(()=>saveCategoryDraft(scope,d,knowledgeCacheEpoch())).toThrow();
  });
  it('expires ordinary drafts but never automatically erases a pending request',()=>{
    const d=draft();saveCategoryDraft(scope,d,knowledgeCacheEpoch());const key=prefix+scope,v=JSON.parse(sessionStorage.getItem(key)!);v.savedAt-=2*86400000;sessionStorage.setItem(key,JSON.stringify(v));expect(readCategoryDraft(scope)).toBeNull();
    const r=categoryFormRequest(d,id);if(!r.success)throw Error();d.attempt=r.data;saveCategoryDraft(scope,d,knowledgeCacheEpoch());const pending=JSON.parse(sessionStorage.getItem(key)!);pending.savedAt=0;sessionStorage.setItem(key,JSON.stringify(pending));expect(readCategoryDraft(scope)?.attempt).toEqual(r.data);
  });
  it('fails on malformed or oversized storage instead of returning an empty draft',()=>{
    sessionStorage.setItem(prefix+scope,'{');expect(()=>readCategoryDraft(scope)).toThrow();sessionStorage.setItem(prefix+scope,'x'.repeat(12001));expect(()=>readCategoryDraft(scope)).toThrow();
  });
  it('detects silent storage failure',()=>{
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{});expect(()=>saveCategoryDraft(scope,draft(),knowledgeCacheEpoch())).toThrow();
  });
  it('clears on logout and rejects delayed writes from the old session',()=>{
    const old=knowledgeCacheEpoch();saveCategoryDraft(scope,draft(),old);clearKnowledgeWorkspace();expect(readCategoryDraft(scope)).toBeNull();expect(()=>saveCategoryDraft(scope,draft(),old)).toThrow();
  });
  it('validates deletion identity and clears only the chosen scope',()=>{
    const d={...draft(),kind:'delete' as const,id:5};expect(categoryFormRequest(d,id)).toMatchObject({success:true,data:{id:5,kind:'delete'}});
    saveCategoryDraft(scope,d,knowledgeCacheEpoch());saveCategoryDraft('9:8:products',draft(),knowledgeCacheEpoch());clearCategoryDraft(scope,knowledgeCacheEpoch());expect(readCategoryDraft(scope)).toBeNull();expect(readCategoryDraft('9:8:products')).not.toBeNull();
  });
});
