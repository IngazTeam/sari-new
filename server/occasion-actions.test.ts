import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({pool:vi.fn(),getConnection:vi.fn(),query:vi.fn(),execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn()}));
vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:vi.fn()}));
vi.mock('./db/connection',()=>({getPool:m.pool}));
import {reviewOccasionAction,applyOccasionAction} from './occasion-actions';
import {getUpcomingOccasions} from './automation/occasion-campaigns';
let raw:any,member:any,merchant:any,account:string,linked:any,deliveries:any[];
const base=()=>({id:9,merchantId:20,campaign_id:null,occasionType:'new_year',year:2027,enabled:0,discountCode:null,discountPercentage:15,messageTemplate:null,sentAt:null,recipientCount:0,status:'pending',createdAt:'2026-10-03 00:00:00',updatedAt:'2026-10-03 00:00:00'});
const create={action:'create' as const,occasionType:'new_year' as const,year:2027},enable={action:'toggle' as const,id:9,enabled:true};
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-03T10:00:00Z'));vi.resetAllMocks();raw=base();member={role:'manager',is_active:1};merchant={userId:7,status:'active',businessName:'Test shop'};account='active';linked=null;deliveries=[];
 m.pool.mockResolvedValue(m);m.getConnection.mockResolvedValue(m);
 m.execute.mockImplementation(async(sql:string)=>{
  if(sql.includes('FROM merchants'))return [[merchant]];
  if(sql.includes('FROM users'))return [[{account_status:account}]];
  if(sql.includes('FROM merchant_members'))return [[member]];
  if(sql.includes('FROM occasion_campaigns'))return [raw?[raw]:[]];
  if(sql.includes('FROM occasion_authorizations'))return [[]];
  if(sql.includes('FROM campaigns'))return [linked?[linked]:[]];
  if(sql.includes('FROM campaign_delivery_outbox'))return [deliveries];
  return [{insertId:12,affectedRows:1}];
 });
});
const mutations=()=>m.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql));
const apply=async(target:any)=>{const r=await reviewOccasionAction(7,20,target);return applyOccasionAction(7,20,{target,reviewRevision:r.reviewRevision,acknowledged:true});};
it('reviews creating disabled without discount, envelope or sending side effects',async()=>{raw=null;const r=await reviewOccasionAction(7,20,create);expect(r).toMatchObject({actorId:7,merchantId:20,eligible:true,reason:'ready',row:null,terms:{effect:'save_disabled',discountPercent:15,discountMaxUses:2000,sendsImmediately:false}});expect(r.terms.messagePreview).toContain('[CODE]');expect(mutations()).toHaveLength(0);expect(await apply(create)).toMatchObject({id:12,enabled:false,sentImmediately:false});expect(mutations()).toHaveLength(1);expect(mutations()[0][0]).toContain("VALUES (?,?,?,0,?,'pending')");});
it('reviews enabling against scoped current content and writes only absolute enabled flag',async()=>{const r=await reviewOccasionAction(7,20,enable);expect(r.eligible).toBe(true);expect(r.terms.effect).toBe('allow_automatic_admission');expect(await apply(enable)).toMatchObject({id:9,enabled:true,sentImmediately:false});expect(mutations().filter(([sql])=>sql.startsWith('UPDATE occasion_campaigns'))).toEqual([[expect.stringContaining("WHERE merchantId=? AND id=? AND status='pending' AND enabled=?"),[1,20,9,0]]]);});
it('disables an expired pending definition without pretending to revoke accepted messages',async()=>{raw.enabled=1;raw.year=2020;expect(await apply({...enable,enabled:false})).toMatchObject({enabled:false,effect:'disable_future_admission'});});
it.each(['viewer','sales_supervisor','unknown','revoked','account','merchant'])('rejects %s before any target read',async kind=>{if(['viewer','sales_supervisor','unknown'].includes(kind))member.role=kind;if(kind==='revoked')member.is_active=0;if(kind==='account')account='deletion_pending';if(kind==='merchant')merchant.status='suspended';await expect(reviewOccasionAction(7,20,enable)).rejects.toMatchObject({reason:'forbidden'});expect(m.execute.mock.calls.some(([s])=>s.includes('FROM occasion_campaigns'))).toBe(false);});
it('rejects duplicate creation and missing foreign target',async()=>{expect((await reviewOccasionAction(7,20,create)).reason).toBe('duplicate');raw=null;await expect(reviewOccasionAction(7,20,enable)).rejects.toMatchObject({reason:'missing'});expect(mutations()).toHaveLength(0);});
it.each(['sending','completed','failed','stale-year','custom-template','old-count','sent','bad-discount','no-change','foreign-link','outbox'])('does not enable invalid or unreviewable state %s',async state=>{
 if(['sending','completed','failed'].includes(state))raw.status=state;
 if(state==='stale-year')raw.year=2020;if(state==='custom-template')raw.messageTemplate='Not actually used by the worker';if(state==='old-count')raw.recipientCount=12;if(state==='sent')raw.sentAt='2026-10-03 00:00:00';if(state==='bad-discount')raw.discountPercentage=51;if(state==='no-change')raw.enabled=1;
 if(state==='foreign-link')raw.campaign_id=40;
 if(state==='outbox'){raw.campaign_id=40;linked={id:40,merchantId:20,name:'Own',status:'draft',message:'Exact reviewed message'};deliveries=[{campaignId:40,merchantId:20,status:'sent',count:1}];}
 const r=await reviewOccasionAction(7,20,enable);expect(r.eligible).toBe(false);await expect(applyOccasionAction(7,20,{target:enable,reviewRevision:r.reviewRevision,acknowledged:true})).rejects.toMatchObject({reason:'invalid'});expect(mutations()).toHaveLength(0);
});
it.each(['row','target','actor','merchant','business'])('rejects altered %s after review',async kind=>{const r=await reviewOccasionAction(7,20,enable);let actorId=7,merchantId=20,target=enable;if(kind==='row')raw.discountPercentage=25;if(kind==='target')target={...enable,enabled:false};if(kind==='actor')actorId=8;if(kind==='merchant'){merchantId=21;raw.merchantId=21;}if(kind==='business')merchant.businessName='Changed name';await expect(applyOccasionAction(actorId,merchantId,{target,reviewRevision:r.reviewRevision,acknowledged:true})).rejects.toMatchObject({reason:'stale'});expect(mutations()).toHaveLength(0);});
it('locks the linked campaign before the occasion and includes its exact message in revision',async()=>{raw.campaign_id=40;linked={id:40,merchantId:20,name:'Own',status:'draft',message:'Exact reviewed message'};const r=await reviewOccasionAction(7,20,enable);expect(r.terms.messagePreview).toBe('Exact reviewed message');const sql=m.execute.mock.calls.map(([s])=>s);expect(sql.findIndex(s=>s.includes('FROM campaigns'))).toBeLessThan(sql.findIndex(s=>s.includes('FROM occasion_campaigns')&&s.includes('FOR UPDATE')));linked.message='Changed';await expect(applyOccasionAction(7,20,{target:enable,reviewRevision:r.reviewRevision,acknowledged:true})).rejects.toMatchObject({reason:'stale'});});
it('rejects changed link after waiting for canonical campaign lock',async()=>{raw.campaign_id=40;const execute=m.execute.getMockImplementation()!;m.execute.mockImplementation(async(sql:string,...args:any[])=>{const result=await execute(sql,...args);if(sql.includes('SELECT campaign_id FROM occasion_campaigns'))return [[{campaign_id:99}]];return result;});await expect(reviewOccasionAction(7,20,enable)).rejects.toMatchObject({reason:'stale'});});
it('rejects mixed-tenant outbox evidence',async()=>{raw.campaign_id=40;linked={id:40,merchantId:20,name:'Own',status:'draft',message:'Message'};deliveries=[{campaignId:40,merchantId:21,status:'sent',count:1}];await expect(reviewOccasionAction(7,20,enable)).rejects.toMatchObject({reason:'unavailable'});});
it('destroys uncertain commit without retrying or rolling it back',async()=>{const r=await reviewOccasionAction(7,20,enable);m.commit.mockRejectedValue(Error('Disconnected'));await expect(applyOccasionAction(7,20,{target:enable,reviewRevision:r.reviewRevision,acknowledged:true})).rejects.toMatchObject({reason:'unknown'});expect(mutations()).toHaveLength(3);expect(m.destroy).toHaveBeenCalledOnce();expect(m.rollback).not.toHaveBeenCalled();});
it('destroys failed rollback and hides raw SQL errors',async()=>{m.execute.mockRejectedValue(Error('SECRET'));m.rollback.mockRejectedValue(Error());await expect(reviewOccasionAction(7,20,enable)).rejects.toMatchObject({reason:'unavailable'});expect(m.destroy).toHaveBeenCalledOnce();});
it.each([{}, {target:enable,reviewRevision:'0'.repeat(64),acknowledged:false},{target:{...enable,merchantId:20},reviewRevision:'0'.repeat(64),acknowledged:true}])('rejects malformed or forged request %#',async value=>{expect(()=>applyOccasionAction(7,20,value)).toThrow();expect(m.pool).not.toHaveBeenCalled();});
describe('current occasion selection',()=>{
 it('offers the remaining days of Ramadan and Eid with today as the first available admission date',()=>{expect(getUpcomingOccasions(new Date('2026-03-01T09:00:00Z')).find(o=>o.type==='ramadan')).toMatchObject({year:2026,date:'2026-03-01',daysUntil:0});expect(getUpcomingOccasions(new Date('2026-03-22T09:00:00Z')).find(o=>o.type==='eid_fitr')).toMatchObject({year:2026,date:'2026-03-22',daysUntil:0});});
 it('moves to the next occurrence after the final Riyadh day',()=>{const r=getUpcomingOccasions(new Date('2026-03-24T09:00:00Z')).find(o=>o.type==='eid_fitr')!;expect(r.year).toBe(2027);expect(r.daysUntil).toBeGreaterThan(0);});
});
