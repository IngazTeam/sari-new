import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as db from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { detectCurrentOccasion, generateOccasionMessage, getOccasionDiscountPercentage, getUpcomingOccasions } from './automation/occasion-campaigns';

describe('occasion policy and generated content',()=>{
  it('detects a real fixed occasion deterministically',()=>expect(detectCurrentOccasion(new Date('2026-09-23T09:00:00Z'))).toMatchObject({type:'national_day',year:2026,discountPercent:23}));
  it('keeps recommended discounts server-owned',()=>{expect(getOccasionDiscountPercentage('ramadan')).toBe(20);expect(getOccasionDiscountPercentage('national_day')).toBe(23);expect(getOccasionDiscountPercentage('eid_fitr')).toBe(25);});
  it.each(['أحمد',null])('generates truthful message variables for %s',name=>{const message=generateOccasionMessage('اليوم الوطني السعودي',name,'LOCALCODE',23,'متجر الاختبار');for(const value of ['اليوم الوطني السعودي','LOCALCODE','23%','متجر الاختبار',name?'مرحباً أحمد!':'مرحباً!'])expect(message).toContain(value);});
  it('returns a non-empty sorted bounded upcoming calendar',()=>{const upcoming=getUpcomingOccasions(new Date('2026-01-10T09:00:00Z'));expect(upcoming).toHaveLength(6);expect(upcoming.every(row=>row.daysUntil>=0&&row.daysUntil<=370)).toBe(true);expect(upcoming).toEqual([...upcoming].sort((a,b)=>a.daysUntil-b.daysUntil));});
});
describe.skipIf(!process.env.DATABASE_URL)('occasion persistence on disposable tenants',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,id:number;
  beforeEach(async()=>{owner=await createDisposableMerchant('occasion-storage');id=(await db.createOccasionCampaign({merchantId:owner.merchantId,occasionType:'national_day',year:2026,enabled:1,discountPercentage:23,status:'pending'}))!.id;});
  afterEach(async()=>{await cleanupDisposableMerchants([owner.userId]);});afterAll(db.closeDb);
  it('creates and retrieves its exact scoped fixture',async()=>{expect(await db.getOccasionCampaignById(id)).toMatchObject({id,merchantId:owner.merchantId,occasionType:'national_day',year:2026,status:'pending'});});
  it('lists its own non-empty records',async()=>{expect(await db.getOccasionCampaignsByMerchantId(owner.merchantId)).toEqual([expect.objectContaining({id,merchantId:owner.merchantId})]);});
  it('finds a definition by tenant, type and year',async()=>{expect(await db.getOccasionCampaignByTypeAndYear(owner.merchantId,'national_day',2026)).toMatchObject({id});expect(await db.getOccasionCampaignByTypeAndYear(owner.merchantId,'ramadan',2026)).toBeUndefined();});
  it('toggles only the pending fixture',async()=>{expect(await db.setPendingOccasionEnabled(id,owner.merchantId,false)).toBe(true);expect(await db.getOccasionCampaignById(id)).toMatchObject({enabled:0,status:'pending'});});
  it('retains the legacy internal completion helper and exact acceptance count',async()=>{await db.markOccasionCampaignSent(id,150);expect(await db.getOccasionCampaignById(id)).toMatchObject({status:'completed',recipientCount:150,sentAt:expect.any(String)});});
  it('computes exact statistics from the fixture',async()=>{expect(await db.getOccasionCampaignsStats(owner.merchantId)).toEqual({totalCampaigns:1,completedCampaigns:0,acceptedRecipients:0});await db.markOccasionCampaignSent(id,150);expect(await db.getOccasionCampaignsStats(owner.merchantId)).toEqual({totalCampaigns:1,completedCampaigns:1,acceptedRecipients:150});});
});
