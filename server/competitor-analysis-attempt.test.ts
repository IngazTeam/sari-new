// @vitest-environment jsdom
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readCompetitorAttempt,rememberCompetitorAttempt,forgetCompetitorAttempt,scopedCompetitorReceipt} from '../client/src/lib/competitor-analysis-attempt';
import {clearKnowledgeWorkspace,knowledgeCacheEpoch} from '../client/src/lib/knowledge-workspace-cache';
beforeEach(()=>{clearKnowledgeWorkspace();sessionStorage.clear();});afterEach(()=>vi.restoreAllMocks());
it('persists only the opaque reference in the account and tenant scope',()=>{
 const id=randomUUID();rememberCompetitorAttempt('7:20',id,knowledgeCacheEpoch());expect(Object.values(sessionStorage)).toEqual([id]);expect(readCompetitorAttempt('7:20')).toBe(id);expect(readCompetitorAttempt('8:20')).toBeNull();expect(readCompetitorAttempt('7:21')).toBeNull();
});
it('does not overwrite an unresolved request or a changed session',()=>{
 const id=randomUUID(),epoch=knowledgeCacheEpoch();rememberCompetitorAttempt('7:20',id,epoch);expect(()=>rememberCompetitorAttempt('7:20',randomUUID(),epoch)).toThrow();expect(()=>forgetCompetitorAttempt('7:20',randomUUID(),epoch)).toThrow();clearKnowledgeWorkspace();expect(readCompetitorAttempt('7:20')).toBeNull();expect(()=>rememberCompetitorAttempt('7:20',id,epoch)).toThrow();
});
it('does not discard corrupt storage as if no request existed',()=>{sessionStorage.setItem('sary:competitor-analysis:v1:7:20','bad');expect(()=>readCompetitorAttempt('7:20')).toThrow();expect(()=>rememberCompetitorAttempt('7:20',randomUUID(),knowledgeCacheEpoch())).toThrow();});
it('surfaces storage refusal before admission is possible',()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});expect(()=>rememberCompetitorAttempt('7:20',randomUUID(),knowledgeCacheEpoch())).toThrow();});
it('clears only an exact reference in the current session',()=>{const id=randomUUID();rememberCompetitorAttempt('7:20',id,knowledgeCacheEpoch());sessionStorage.setItem('unrelated','keep');forgetCompetitorAttempt('7:20',id,knowledgeCacheEpoch());expect(readCompetitorAttempt('7:20')).toBeNull();expect(sessionStorage.getItem('unrelated')).toBe('keep');});
const base={actorId:7,merchantId:20,requestId:randomUUID(),state:'running',competitorId:8,reportAvailable:true};
it.each([{actorId:8},{merchantId:30},{requestId:randomUUID()},{token:'secret'},{state:'closed'},{competitorId:0}])('hides invalid or foreign receipt %j',patch=>expect(scopedCompetitorReceipt({...base,...patch},7,20,base.requestId)).toBeNull());
