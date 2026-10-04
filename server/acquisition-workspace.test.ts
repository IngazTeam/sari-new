import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({authority:vi.fn(),execute:vi.fn()}));
vi.mock('./accounts/merchant-settings-authority',()=>({withMerchantOwnerSettings:m.authority}));
import {projectAcquisition,readAcquisitionWorkspace} from './analytics/acquisition-workspace';
import {acquisitionInput,acquisitionWorkspaceSchema} from '../shared/acquisition-workspace';
import {ALL_ROLES,hasPermission} from './_core/permissions';
const now='2026-10-04T12:00:00.000Z';
beforeEach(()=>{vi.clearAllMocks();m.authority.mockImplementation(async(_a,_m,_w,fn)=>fn({execute:m.execute}));});
const project=(rows:unknown)=>projectAcquisition(7,20,now,'all',rows);
it('keeps actual empty records distinct from unavailable storage',async()=>{
 expect(project([])).toMatchObject({totalProfiles:0,classifiedProfiles:0,otherProfiles:0,unattributedProfiles:0,sources:[],since:null});
 m.authority.mockRejectedValue(Error('database offline'));await expect(readAcquisitionWorkspace(7,20,{})).rejects.toThrow();
});
it('projects only counted categories and the correct denominator',()=>{
 const v=project([{source:'instagram',record_count:'2',preferences:'PRIVATE'},{source:'direct',record_count:1},{source:'unattributed',record_count:'3'},{source:'other',record_count:1}]);
 expect(v).toMatchObject({totalProfiles:7,classifiedProfiles:3,unattributedProfiles:3,otherProfiles:1});
 expect(v.sources[0]).toEqual({source:'unattributed',count:3,sharePermille:429});
 expect(v.sources.find(r=>r.source==='direct')?.count).toBe(1);expect(JSON.stringify(v)).not.toContain('PRIVATE');
});
it.each([null,{},[{source:'__proto__',record_count:1}],[{source:'PRIVATE',record_count:1}],[{source:'direct',record_count:1},{source:'direct',record_count:2}],Array.from({length:16},()=>({source:'direct',record_count:1}))])('rejects invalid or unbounded group envelopes %#',rows=>expect(()=>project(rows)).toThrow());
it.each([null,undefined,0,-1,1.5,'1.5','1e3','NaN',true,{},9007199254740992,'9007199254740992'])('rejects invalid aggregate count %j',record_count=>expect(()=>project([{source:'direct',record_count}])).toThrow());
it('rejects overflow of otherwise safe counts',()=>expect(()=>project([{source:'direct',record_count:Number.MAX_SAFE_INTEGER},{source:'other',record_count:1}])).toThrow());
it.each([{period:'year'},{period:'30d',merchantId:20},{period:30},null,{beforeId:1}])('rejects forged or unsupported input %j',input=>expect(acquisitionInput.safeParse(input).success).toBe(false));
it.each(['all','30d','90d'] as const)('uses the database clock and bound %s window in a live scoped read',async period=>{
 m.execute.mockResolvedValueOnce([[{checked_at:now}]]).mockResolvedValueOnce([[{source:'direct',record_count:'2'}]]);
 const r=await readAcquisitionWorkspace(7,20,{period});expect(m.authority).toHaveBeenCalledWith(7,20,false,expect.any(Function));
 expect(r.period).toBe(period);expect(r.checkedAt).toBe(now);
 const [sql,args]=m.execute.mock.calls[1];expect(args.slice(0,2)).toEqual([20,'2026-10-04 12:00:00.000']);
 expect(sql).toContain('GROUP BY source');expect(sql).not.toMatch(/SELECT \*|customer_phone|display_name/);
 expect(sql.includes('created_at>=?')).toBe(period!=='all');
 if(period!=='all')expect(args[2]).toBe(new Date(Date.parse(now)-(period==='30d'?30:90)*86400000).toISOString().slice(0,23).replace('T',' '));
});
it.each([null,[],[{checked_at:'bad'}],[{checked_at:now},{checked_at:now}]])('rejects an unavailable clock %# before counting',async rows=>{m.execute.mockResolvedValueOnce([rows]);await expect(readAcquisitionWorkspace(7,20,{})).rejects.toThrow();expect(m.execute).toHaveBeenCalledTimes(1);});
it('rejects input before entering authority or database work',async()=>{await expect(readAcquisitionWorkspace(7,20,{merchantId:99})).rejects.toThrow();expect(m.authority).not.toHaveBeenCalled();});
it.each([{totalProfiles:9},{classifiedProfiles:3},{otherProfiles:1},{unattributedProfiles:1},{since:now},{checkedAt:'bad',period:'30d'},{sources:[{source:'direct',count:2,sharePermille:200}]}])('rejects contradictory UI evidence %j',change=>expect(acquisitionWorkspaceSchema.safeParse({...project([{source:'direct',record_count:2}]),...change}).success).toBe(false));
it('keeps the current read authority aligned with the analytics permission',()=>expect(ALL_ROLES.every(role=>hasPermission(role,'analytics.read'))).toBe(true));
