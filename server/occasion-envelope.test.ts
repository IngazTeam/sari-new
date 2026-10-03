// Atomic-envelope/admission tests isolate the separately tested persistent authority gate.
vi.mock('./occasion-worker-authority',()=>({lockOccasionWorkerAuthority:vi.fn().mockResolvedValue({}),bindOccasionPreparedEnvelope:vi.fn(),ensureOccasionAuthorizationSchema:vi.fn(),OccasionAuthorizationDenied:class extends Error{}}));
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({pool:vi.fn(),getConnection:vi.fn(),execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn()}));
vi.mock('./db',()=>({getPool:m.pool}));
vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:vi.fn()}));
import {prepareOccasionCampaignEnvelope,OccasionEnvelopeStateUnknownError} from './automation/occasion-campaigns';
const input={merchantId:7,occasionCampaignId:9,occasion:{type:'national_day' as const,year:2026,name:'Forged display name',discountPercent:99},now:new Date('2026-09-23T09:00:00Z')};
let row:any,merchant:any,linked:any,discount:any,outbox:any[],hint:any;
beforeEach(()=>{
 vi.resetAllMocks();m.pool.mockResolvedValue(m);m.getConnection.mockResolvedValue(m);
 merchant={id:7,status:'active',businessName:'Local shop'};hint=null;linked=null;outbox=[];
 row={id:9,merchantId:7,campaignId:null,occasionType:'national_day',year:2026,enabled:1,discountPercentage:23,status:'pending',discountCode:null,messageTemplate:null,recipientCount:0,sentAt:null};
 discount={type:'percentage',value:23,minOrderAmount:0,maxUses:2000,usedCount:0,isActive:1,expiresAt:'2026-09-23 20:59:59',customer_phone:null};
 m.execute.mockImplementation(async(sql:string)=>{
  if(sql.includes('FROM merchants'))return [[merchant]];
  if(sql.includes('SELECT campaign_id FROM occasion_campaigns'))return [[{campaign_id:hint}]];
  if(sql.includes('FROM occasion_campaigns'))return [[row]];
  if(sql.includes('FROM campaigns'))return [linked?[linked]:[]];
  if(sql.includes('FROM discount_codes'))return [discount?[discount]:[]];
  if(sql.includes('FROM campaign_delivery_outbox'))return [outbox];
  if(sql.includes('INSERT INTO campaigns'))return [{insertId:77,affectedRows:1}];
  return [{affectedRows:1}];
 });
});
const prepared=()=>{hint=77;row.campaignId=77;row.discountCode='LOCAL';linked={id:77,merchantId:7,status:'draft',message:'Reviewed message',imageUrl:null,targetAudience:'{}'};};
const writes=()=>m.execute.mock.calls.filter(([s])=>/^(INSERT|UPDATE)/.test(s));
it('creates one atomic envelope with calendar-owned name and locked saved discount',async()=>{
 expect(await prepareOccasionCampaignEnvelope(input)).toEqual({campaignId:77,created:true});
 expect(writes()).toHaveLength(3);const campaign=writes().find(([s])=>s.includes('INSERT INTO campaigns'))![1];
 expect(campaign[1]).toBe('مناسبة: اليوم الوطني السعودي 2026');expect(campaign[2]).toContain('23%');expect(campaign[2]).not.toContain('Forged');
 expect(writes().find(([s])=>s.includes('INSERT INTO discount_codes'))![1][3]).toEqual(new Date('2026-09-23T20:59:59Z'));
 expect(m.commit).toHaveBeenCalledOnce();expect(m.rollback).not.toHaveBeenCalled();expect(m.release).toHaveBeenCalledOnce();
});
it('reuses an exact prepared envelope with parent then campaign then occasion locks',async()=>{
 prepared();expect(await prepareOccasionCampaignEnvelope(input)).toEqual({campaignId:77,created:false});expect(writes()).toHaveLength(0);
 const locked=m.execute.mock.calls.map(([s])=>s).filter(s=>s.includes('FOR UPDATE'));
 expect(locked[0]).toContain('FROM merchants');expect(locked[1]).toContain('FROM campaigns');expect(locked[2]).toContain('FROM occasion_campaigns');
 expect(m.execute.mock.calls.find(([s])=>s.includes('FROM discount_codes'))).toEqual([expect.stringContaining('FOR SHARE'),[7,'LOCAL']]);
});
it.each([{merchantId:0},{occasionCampaignId:2147483648},{now:new Date('invalid')},{now:new Date('2026-09-24T09:00:00Z')},{occasion:{...input.occasion,year:2027}}])('rejects invalid or out-of-season preparation %# before storage',async patch=>{
 await expect(prepareOccasionCampaignEnvelope({...input,...patch})).rejects.toThrow();expect(m.pool).not.toHaveBeenCalled();
});
it.each([{enabled:0},{status:'sending'},{merchantId:8},{id:10},{campaignId:88},{messageTemplate:'Unused custom template'},{recipientCount:1},{sentAt:'2026-09-23 00:00:00'},{discountPercentage:null},{discountPercentage:23.5},{discountPercentage:51},{discountCode:'ORPHAN'}])('rejects invalid locked definition %# without writes',async patch=>{
 Object.assign(row,patch);await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(writes()).toHaveLength(0);expect(m.rollback).toHaveBeenCalledOnce();
});
it.each([{status:'suspended'},{id:8},{businessName:''}])('rejects invalid merchant %#',async patch=>{Object.assign(merchant,patch);await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(writes()).toHaveLength(0);});
it.each([{merchantId:8},{status:'sending'},{targetAudience:'{"purchaseCountMin":1}'},{targetAudience:'[]'},{targetAudience:'invalid'},{imageUrl:'https://example.test/a.png'},{message:''},{message:'a'.repeat(5000)}])('rejects changed prepared campaign %#',async patch=>{
 prepared();Object.assign(linked,patch);await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(writes()).toHaveLength(0);
});
it.each([{type:'fixed'},{value:24},{minOrderAmount:1},{maxUses:100},{usedCount:2000},{usedCount:-1},{usedCount:0.5},{isActive:0},{customer_phone:'99900000001'},{expiresAt:'2026-09-24 20:59:59'},{expiresAt:'2026-09-23 08:00:00'},{expiresAt:null}])('rejects changed or expired discount %#',async patch=>{
 prepared();Object.assign(discount,patch);await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(writes()).toHaveLength(0);
});
it('rejects prepared rows with existing outbox entries and missing discount',async()=>{
 prepared();outbox=[{id:1}];await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();outbox=[];discount=null;await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(writes()).toHaveLength(0);
});
it('destroys an uncertain commit without rollback or any second attempt',async()=>{
 m.commit.mockRejectedValue(Error('private connection detail'));await expect(prepareOccasionCampaignEnvelope(input)).rejects.toBeInstanceOf(OccasionEnvelopeStateUnknownError);
 expect(writes()).toHaveLength(3);expect(m.commit).toHaveBeenCalledOnce();expect(m.rollback).not.toHaveBeenCalled();expect(m.destroy).toHaveBeenCalledOnce();expect(m.release).not.toHaveBeenCalled();
});
it('destroys a connection after failed rollback',async()=>{
 m.execute.mockRejectedValue(Error('read failed'));m.rollback.mockRejectedValue(Error('rollback failed'));await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow('read failed');expect(m.destroy).toHaveBeenCalledOnce();expect(m.release).not.toHaveBeenCalled();
});
it('rolls back all writes on a failed final link',async()=>{
 const original=m.execute.getMockImplementation()!;m.execute.mockImplementation(async(sql:string,...args:any[])=>sql.startsWith('UPDATE occasion_campaigns')?[{affectedRows:0}]:original(sql,...args));
 await expect(prepareOccasionCampaignEnvelope(input)).rejects.toThrow();expect(m.commit).not.toHaveBeenCalled();expect(m.rollback).toHaveBeenCalledOnce();
});
