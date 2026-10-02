import {beforeEach,it,expect,vi} from 'vitest';
import {MySqlDialect} from 'drizzle-orm/mysql-core';
const m=vi.hoisted(()=>({db:vi.fn(),execute:vi.fn(),transaction:vi.fn()}));
vi.mock('./db/connection',()=>({getDb:m.db}));
import {readPlatformWorkspace} from './integrations/platform-workspace';
import {checkExistingIntegrations,validateNewPlatformConnection} from './integrations/platform-checker';
import {safePlatformUrl,platformWorkspaceSchema} from '../shared/platform-workspace';
const dialect=new MySqlDialect();
let rows:Record<string,any[]>,queries:Array<{sql:string,params:unknown[]}>;
beforeEach(()=>{
 vi.resetAllMocks();queries=[];rows={merchants:[{id:20,source:'none'}],products:[{total:601}],customer_profiles:[{total:502}],byaan_trainees:[{total:501}]};
 m.db.mockResolvedValue({transaction:m.transaction});m.transaction.mockImplementation(cb=>cb({execute:m.execute}));
 m.execute.mockImplementation(query=>{const q=dialect.sqlToQuery(query);queries.push(q);const table=/FROM (\w+)/.exec(q.sql)![1],key=table==='platform_integrations'?(q.sql.includes("'zid'")?'zid':'shopify'):table;return [rows[key]??[]];});
});
it('returns all five sources and complete counts in a read-only snapshot',async()=>{
 const result=await readPlatformWorkspace(7,20);expect(result).toMatchObject({actorId:7,merchantId:20,occupied:0,conflict:false,stats:{products:601,customers:502,audience:'customers'}});expect(result.platforms).toHaveLength(5);expect(result.platforms[3].state).toBe('unavailable');
 expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'repeatable read',accessMode:'read only'});
 expect(queries.every(q=>q.params.length===1&&q.params[0]===20)).toBe(true);
 expect(queries.some(q=>/SELECT\s+\*/i.test(q.sql))).toBe(false);
});
it.each(['active','syncing','paused','error','unrecognized'])('keeps a %s Salla link reserved and reports its stored state',async state=>{
 rows.salla_connections=[{storeUrl:'https://store.example.test/path?token=PRIVATE#secret',state,createdAt:'2026-10-02 10:00:00'}];
 const result=await readPlatformWorkspace(7,20);expect(result.platforms[0]).toMatchObject({occupiesSlot:true,state:state==='active'?'configured':state==='unrecognized'?'unknown':state,storeUrl:'https://store.example.test/path'});
 await expect(validateNewPlatformConnection(20,'زد')).rejects.toThrow('سلة');expect(await checkExistingIntegrations(20)).toHaveLength(1);
});
it('does not revive legacy Zid when its canonical connection is inactive',async()=>{
 rows.zid=[{active:0}];rows.zid_settings=[{active:1,storeUrl:'https://old.example.test'}];
 expect((await readPlatformWorkspace(7,20)).platforms[1]).toMatchObject({state:'disabled',legacy:false,occupiesSlot:false});expect(queries.some(q=>q.sql.startsWith('SELECT store_url')&&q.sql.includes('FROM zid_settings'))).toBe(false);
});
it('uses the single legacy Zid record only when no canonical record exists',async()=>{
 rows.zid_settings=[{active:1,storeUrl:'https://legacy.example.test'}];expect((await readPlatformWorkspace(7,20)).platforms[1]).toMatchObject({state:'configured',legacy:true,occupiesSlot:true});
});
it('shows all conflicting links and the active Byaan audience without hiding other platforms',async()=>{
 rows.merchants[0].source='byaan';rows.zid=[{active:1}];rows.woocommerce_settings=[{active:1,state:'error'}];rows.byaan_connections=[{active:0,state:'pending_verification',storeUrl:'academy.example.test'}];
 const value=await readPlatformWorkspace(7,20);expect(value).toMatchObject({occupied:3,conflict:true,stats:{customers:501,audience:'trainees'}});expect(value.platforms[4]).toMatchObject({state:'pending_verification',storeUrl:'https://academy.example.test/'});
 expect(queries.find(q=>q.sql.includes('FROM byaan_trainees'))?.sql).toContain("status='active'");
 expect(platformWorkspaceSchema.safeParse({...value,conflict:false}).success).toBe(false);
});
it.each(['merchants','salla_connections','zid','zid_settings','woocommerce_settings','shopify','byaan_connections','products','customer_profiles'])('rejects duplicate records or ambiguous counts in %s',async key=>{
 rows[key]=[{id:20,total:1},{id:20,total:1}];await expect(readPlatformWorkspace(7,20)).rejects.toThrow('Platform connection data unavailable');
});
it.each([null,-1,'bad',1.5,Number.MAX_SAFE_INTEGER+1])('rejects an invalid complete count %s rather than displaying zero',async total=>{rows.products=[{total}];await expect(readPlatformWorkspace(7,20)).rejects.toThrow('Platform connection data unavailable');});
it('fails closed on storage failure without disclosing the provider error',async()=>{
 m.execute.mockRejectedValue(Error('private password'));await expect(readPlatformWorkspace(7,20)).rejects.toThrow('Platform connection data unavailable');await expect(validateNewPlatformConnection(20,'سلة')).rejects.toThrow('Platform connection data unavailable');m.db.mockResolvedValue(null);await expect(readPlatformWorkspace(7,20)).rejects.toThrow('Platform connection data unavailable');
});
it.each(['javascript:alert(1)','data:text/html,secret','https://user:secret@example.test','//example.test','invalid'])('rejects unsafe display links %s',value=>expect(safePlatformUrl(value)).toBeNull());
it.each([0,-1,1.5,2147483648])('rejects invalid merchant identity %s before reading',async id=>{await expect(readPlatformWorkspace(7,id)).rejects.toBeTruthy();expect(m.db).not.toHaveBeenCalled();});
