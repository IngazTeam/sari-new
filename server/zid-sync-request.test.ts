import {expect,it} from 'vitest';
import {zidSyncRequest,zidSyncLookup,zidSyncReceipt} from '../shared/zid-sync-request';
const intent={requestId:'1a5b6c7d-1234-4321-8765-123456789abc',revision:'a'.repeat(64),resource:'all'};
const receipt={...intent,actorId:7,merchantId:20,outcome:'pending',resources:[{kind:'products',logId:null,state:'not_started',itemsSynced:null}],createdAt:'2026-10-02T10:00:00.000Z',checkedAt:'2026-10-02T10:00:00.000Z',replayed:false};
it('requires a stable request identity and reviewed revision and normalizes UUID casing',()=>{expect(zidSyncRequest.parse({...intent,requestId:intent.requestId.toUpperCase()})).toEqual(intent);expect(zidSyncLookup.parse({requestId:intent.requestId})).toEqual({requestId:intent.requestId});});
it.each([{requestId:'bad'},{revision:'bad'},{resource:'inventory'},{actorId:7},{merchantId:20},{resource:undefined},{revision:undefined},{requestId:undefined}])('rejects malformed or scope-bearing request input %j',extra=>expect(zidSyncRequest.safeParse({...intent,...extra}).success).toBe(false));
it('accepts progress and partial evidence without inventing completed counts',()=>{expect(zidSyncReceipt.safeParse(receipt).success).toBe(true);expect(zidSyncReceipt.safeParse({...receipt,outcome:'failed',resources:[{kind:'products',logId:1,state:'completed',itemsSynced:3},{kind:'orders',logId:2,state:'failed',itemsSynced:null},{kind:'customers',logId:null,state:'not_started',itemsSynced:null}]}).success).toBe(true);});
it.each([
 {outcome:'success'},
 {resources:[]},
 {resources:[{kind:'products',logId:null,state:'completed',itemsSynced:3}]},
 {resources:[{kind:'products',logId:1,state:'failed',itemsSynced:0}]},
 {resources:[{kind:'products',logId:null,state:'failed',itemsSynced:null}]},
 {resources:[{kind:'products',logId:1,state:'not_started',itemsSynced:null}]},
 {outcome:'interrupted',resources:[{kind:'products',logId:1,state:'pending',itemsSynced:null}]},
 {resources:[{kind:'products',logId:1,state:'completed',itemsSynced:-1}]},
 {resource:'orders'},
 {resources:[{kind:'products',logId:1,state:'completed',itemsSynced:3},{kind:'products',logId:2,state:'completed',itemsSynced:3}]},
 {resources:[{kind:'customers',logId:1,state:'completed',itemsSynced:3},{kind:'orders',logId:2,state:'completed',itemsSynced:3}]},
])('rejects inconsistent sync evidence %j',extra=>expect(zidSyncReceipt.safeParse({...receipt,...extra}).success).toBe(false));
