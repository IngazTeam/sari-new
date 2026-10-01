import {webcrypto} from 'node:crypto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {staffAttemptIdentity} from '../client/src/lib/staff-attempt-identity';
let storage:Map<string,string>;
const digest='a'.repeat(64),old='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{storage=new Map();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});});
afterEach(()=>vi.unstubAllGlobals());
it.each(['reply','voice'] as const)('isolates new %s attempts by actor while reusing each actor request',kind=>{
  const a=staffAttemptIdentity(kind,7,digest),b=staffAttemptIdentity(kind,8,digest);expect(a.requestId).not.toBe(b.requestId);expect(staffAttemptIdentity(kind,7,digest).requestId).toBe(a.requestId);expect(staffAttemptIdentity(kind,8,digest).requestId).toBe(b.requestId);
});
it.each(['reply','voice'] as const)('preserves an unassigned legacy %s UUID until the server confirms its actor',kind=>{
  const legacy=`sary:staff-${kind}:v1:${digest}`;storage.set(legacy,old);
  const a=staffAttemptIdentity(kind,7,digest),b=staffAttemptIdentity(kind,8,digest);expect(a.requestId).toBe(old);expect(b.requestId).toBe(old);
  // A thrown server conflict does not call confirmOwner. Only A's verified result does.
  a.confirmOwner();expect(staffAttemptIdentity(kind,7,digest).requestId).toBe(old);expect(staffAttemptIdentity(kind,8,digest).requestId).not.toBe(old);
});
it('keeps ownership after legacy cleanup so another actor can recover their rejected alias',()=>{
  storage.set(`sary:staff-reply:v1:${digest}`,old);const a=staffAttemptIdentity('reply',7,digest);staffAttemptIdentity('reply',8,digest);a.confirmOwner();a.complete();
  expect(storage.has(`sary:staff-reply:v1:${digest}`)).toBe(false);expect(staffAttemptIdentity('reply',8,digest).requestId).not.toBe(old);
});
it('does not remove another actor request when an old completion returns',()=>{
  const a=staffAttemptIdentity('voice',7,digest),b=staffAttemptIdentity('voice',8,digest);a.complete();const newer=staffAttemptIdentity('voice',7,digest);a.complete();
  expect(staffAttemptIdentity('voice',7,digest).requestId).toBe(newer.requestId);expect(staffAttemptIdentity('voice',8,digest).requestId).toBe(b.requestId);
});
it('never treats a malformed legacy value or conflicting owner record as permission to issue a new UUID',()=>{
  storage.set(`sary:staff-reply:v1:${digest}`,'bad');expect(()=>staffAttemptIdentity('reply',7,digest)).toThrow();expect(storage.size).toBe(1);
  storage.set(`sary:staff-reply:v1:${digest}`,old);storage.set(`sary:staff-reply:v1-owner:${digest}`,JSON.stringify({actor:7,requestId:'00000000-0000-4000-8000-000000000002'}));expect(()=>staffAttemptIdentity('reply',7,digest)).toThrow();expect(storage.size).toBe(2);
});
it.each([0,-1,1.1,Number.MAX_SAFE_INTEGER+1])('rejects invalid actor %s',actor=>{expect(()=>staffAttemptIdentity('reply',actor,digest)).toThrow();expect(storage.size).toBe(0);});
it('does not clean an unproven legacy request',()=>{
  storage.set(`sary:staff-reply:v1:${digest}`,old);const a=staffAttemptIdentity('reply',7,digest);a.complete();expect(storage.get(`sary:staff-reply:v1:${digest}`)).toBe(old);
});
it('rejects empty retained identities and detects silent cleanup failures',()=>{
  storage.set(`sary:staff-reply:v2:7:${digest}`,'');expect(()=>staffAttemptIdentity('reply',7,digest)).toThrow();storage.clear();
  const attempt=staffAttemptIdentity('reply',7,digest);vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:()=>{}});expect(()=>attempt.complete()).toThrow();expect(staffAttemptIdentity('reply',7,digest).requestId).toBe(attempt.requestId);
});
