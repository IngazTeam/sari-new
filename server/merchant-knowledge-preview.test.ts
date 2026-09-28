import { describe, expect, it, vi } from 'vitest';
import { readKnowledgePreview, KNOWLEDGE_PREVIEW_LIMIT } from '../shared/knowledge-preview';

const file = (content: string, name = 'سياسة البيع.TXT') => ({name,type:'',size:Buffer.byteLength(content),text:async()=>content});
describe('knowledge file preview integrity',()=>{
  it('retains the entire supported file and original name',async()=>{
    const content='سياسة الشحن والاسترجاع\n'.repeat(100);
    expect(await readKnowledgePreview(file(content))).toEqual({content,name:'سياسة البيع.TXT'});
  });
  it('rejects long content instead of silently losing policies at its end',async()=>{
    expect(await readKnowledgePreview(file('x'.repeat(KNOWLEDGE_PREVIEW_LIMIT)+'ممنوع الخصم'))).toEqual({error:'tooLong'});
    expect(await readKnowledgePreview(file('x'.repeat(KNOWLEDGE_PREVIEW_LIMIT)))).toHaveProperty('content');
  });
  it('rejects oversized files before reading them',async()=>{
    const text=vi.fn();
    expect(await readKnowledgePreview({...file(''),size:120001,text})).toEqual({error:'tooLong'});
    expect(text).not.toHaveBeenCalled();
  });
  it('distinguishes unsupported, empty and unreadable files',async()=>{
    expect(await readKnowledgePreview(file('data','catalog.pdf'))).toEqual({error:'unsupported'});
    expect(await readKnowledgePreview(file(' \n '))).toEqual({error:'empty'});
    expect(await readKnowledgePreview({...file('data'),text:async()=>{throw Error('read failure')}})).toEqual({error:'unreadable'});
  });
});
