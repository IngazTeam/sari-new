import {expect,it} from 'vitest';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
import {projectPromotionWorkspace} from './promotion-workspace-source';
const now=new Date('2026-10-03T12:00:00Z');
const raw={id:1,merchantId:20,title:'Offer',description:'Full description',bannerImageUrl:null,type:'percentage',value:15,scope:'all',productIds:null,categoryIds:null,minOrderAmount:0,minQuantity:null,autoDiscountCodeId:null,startsAt:null,expiresAt:null,isActive:1,viewCount:999,clickCount:5,createdAt:'2026-10-03 10:00:00',updatedAt:'2026-10-03 10:00:00'};
const project=(source:any[]=[raw],input:object={},at=now)=>projectPromotionWorkspace(7,20,true,promotionWorkspaceInput.parse(input),source,at);
it('keeps every saved field and complete pagination without calling AI counters sales',()=>{
 const rows=Array.from({length:31},(_,i)=>({...raw,id:31-i,title:'Offer '+i})),first=project(rows),second=project(rows,{page:2});
 expect(first).toMatchObject({total:31,matched:31,pages:2,counts:{active:31},activeLimit:5,savedActiveCount:31,storedViewCount:31*999,storedClickCount:155,counterEvidence:'legacy_ai_context_and_banner_queue',salesAttribution:'not_verified',currencyEvidence:'not_recorded'});
 expect(first.rows).toHaveLength(25);expect(second.rows).toHaveLength(6);expect(first.rows[0]).toMatchObject({description:'Full description',minOrderAmount:0,startsAt:null,expiresAt:null});expect(first).not.toHaveProperty('conversionRate');
 expect(project(rows,{query:'Offer 30'}).rows[0].id).toBe(1);expect(project(rows,{page:99}).rows).toEqual([]);
});
it('distinguishes activation flags from current windows without mutating them',()=>{
 const source=[raw,{...raw,id:2,startsAt:'2027-01-01 00:00:00'},{...raw,id:3,expiresAt:'2026-10-03 12:00:00'},{...raw,id:4,isActive:0}];
 expect(project(source)).toMatchObject({savedActiveCount:3,counts:{active:1,scheduled:1,expired:1,inactive:1,invalid:0}});expect(source[2].isActive).toBe(1);expect(project(source,{state:'scheduled'}).rows[0].id).toBe(2);
});
it('preserves selected target identifiers, scoped linked discount and all optional content',()=>{
 const value={...raw,scope:'products',productIds:'[1,4]',categoryIds:'[]',bannerImageUrl:'https://example.test/banner.png',autoDiscountCodeId:9,linkedId:9,linkedMerchantId:20,linkedCode:'OWN',linkedType:'percentage',linkedValue:15,linkedActive:1};
 expect(project([value],{scope:'products',type:'percentage'}).rows[0]).toMatchObject({productIds:'[1,4]',productIdsParsed:[1,4],categoryIdsParsed:[],linkedDiscount:{id:9,code:'OWN',isActive:true}});
});
it.each([{title:' '},{type:'old'},{value:150},{scope:'products',productIds:null},{scope:'categories',categoryIds:'[]'},{productIds:'[1,1]'},{productIds:'["1"]'},{productIds:'[-1]'},{productIds:'bad'},{minQuantity:0},{minQuantity:1.2},{isActive:2},{startsAt:'2026-02-30 12:00:00'},{startsAt:'2026-10-03 13:00:00',expiresAt:'2026-10-03 12:00:00'},{viewCount:-1},{clickCount:'5'},{autoDiscountCodeId:9},{createdAt:'invalid'}])('preserves malformed records for review %j',patch=>{const row=project([{...raw,...patch}]).rows[0];expect(row.state).toBe('invalid');expect(row.issues.length).toBeGreaterThan(0);});
it('never discloses another tenant discount or source',()=>{
 const data=project([{...raw,autoDiscountCodeId:9,linkedId:9,linkedMerchantId:21,linkedCode:'PRIVATE',linkedType:'percentage',linkedValue:15,linkedActive:1}]);expect(data.rows[0].linkedDiscount).toBeNull();expect(JSON.stringify(data)).not.toContain('PRIVATE');expect(()=>project([{...raw,merchantId:21}])).toThrow();expect(()=>project([raw,raw])).toThrow();
});
it('retains unknown and overflowed counters instead of showing a zero result',()=>{expect(project([{...raw,viewCount:-1}])).toMatchObject({storedViewCount:null,invalidCounterRows:1,storedClickCount:5});expect(project([{...raw,viewCount:Number.MAX_SAFE_INTEGER},{...raw,id:2,viewCount:1}]).storedViewCount).toBeNull();});
it('binds review revision to actual saved content and not current clock time',()=>{const first=project().rows[0].revision;expect(project([raw],{},new Date(now.getTime()+1000)).rows[0].revision).toBe(first);for(const patch of [{title:'New'},{value:16},{description:null},{productIds:'[2]'},{viewCount:1000},{isActive:0}])expect(project([{...raw,...patch}]).rows[0].revision).not.toBe(first);});
it.each([{merchantId:99},{page:0},{page:1.2},{state:'paid'},{query:'x'.repeat(101)},{scope:'everyone'}])('rejects malformed or scope-forged selection %j',value=>expect(()=>promotionWorkspaceInput.parse(value)).toThrow());
