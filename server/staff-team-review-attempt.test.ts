// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {readStaffTeamAttempt,prepareStaffTeamAttempt,completeStaffTeamAttempt,discardStaffTeamAttempt} from '../client/src/lib/staff-team-review-attempt';
const scope={merchantId:20,actorUserId:7,kind:'text' as const,sourceId:30,conversationId:4,authorUserId:8};
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('restores the original request and reason until a confirmed completion',()=>{
  const a=prepareStaffTeamAttempt(scope,'delivery_check'),b=prepareStaffTeamAttempt(scope,'incident_review');expect(b).toEqual(a);expect(readStaffTeamAttempt(scope)).toEqual({state:'ready',value:a});
  completeStaffTeamAttempt(scope,a.requestId);expect(readStaffTeamAttempt(scope)).toEqual({state:'missing'});expect(prepareStaffTeamAttempt(scope,'incident_review').requestId).not.toBe(a.requestId);
});
it.each([{merchantId:21},{actorUserId:9},{kind:'voice' as const},{sourceId:31},{conversationId:5},{authorUserId:9}])('isolates review scope %j',patch=>{
  const a=prepareStaffTeamAttempt(scope,'delivery_check'),b=prepareStaffTeamAttempt({...scope,...patch},'delivery_check');expect(b.requestId).not.toBe(a.requestId);
});
it('does not remove a successor on a late completion',()=>{
  const a=prepareStaffTeamAttempt(scope,'delivery_check');completeStaffTeamAttempt(scope,a.requestId);const b=prepareStaffTeamAttempt(scope,'incident_review');completeStaffTeamAttempt(scope,a.requestId);expect(readStaffTeamAttempt(scope)).toMatchObject({state:'ready',value:{requestId:b.requestId}});
});
it('rejects corrupted or transplanted records without replacing the request',()=>{
  const a=prepareStaffTeamAttempt(scope,'delivery_check'),key=sessionStorage.key(0)!;sessionStorage.setItem(key,JSON.stringify({...a,scope:{...scope,actorUserId:9}}));expect(readStaffTeamAttempt(scope).state).toBe('invalid');expect(()=>prepareStaffTeamAttempt(scope,'delivery_check')).toThrow();expect(JSON.parse(sessionStorage.getItem(key)!).requestId).toBe(a.requestId);
  sessionStorage.setItem(key,'malformed');expect(readStaffTeamAttempt(scope).state).toBe('invalid');expect(()=>prepareStaffTeamAttempt(scope,'delivery_check')).toThrow();
});
it('fails before checking when a durable request cannot be written or read',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{});expect(()=>prepareStaffTeamAttempt(scope,'delivery_check')).toThrow();vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('denied');});expect(readStaffTeamAttempt(scope).state).toBe('unavailable');expect(()=>prepareStaffTeamAttempt(scope,'delivery_check')).toThrow();
});
it('detects a failed cleanup and keeps the same retry identity',()=>{
  const a=prepareStaffTeamAttempt(scope,'delivery_check');vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{});expect(()=>completeStaffTeamAttempt(scope,a.requestId)).toThrow();expect(prepareStaffTeamAttempt(scope,'delivery_check').requestId).toBe(a.requestId);
});
it('explicit recovery removes only the selected administrative reference',()=>{
  prepareStaffTeamAttempt(scope,'delivery_check');const b=prepareStaffTeamAttempt({...scope,sourceId:31},'delivery_check');discardStaffTeamAttempt(scope);expect(readStaffTeamAttempt(scope).state).toBe('missing');expect(readStaffTeamAttempt({...scope,sourceId:31})).toMatchObject({state:'ready',value:{requestId:b.requestId}});
});
