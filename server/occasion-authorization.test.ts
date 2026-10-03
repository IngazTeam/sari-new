import {beforeEach,it,expect,vi} from 'vitest';
import {buildOccasionAuthorization,occasionAuthorizationContract,occasionAuthorizationDigest,parseOccasionAuthorization,writeOccasionAuthorization,revokeOccasionAuthorization,occasionCampaignDigest,occasionDiscountDigest} from './occasion-authorization';
const terms={effect:'allow_automatic_admission',occasionType:'new_year',year:2027,discountPercent:15,discountMaxUses:2000,discountMinOrder:0,discountExpiry:'occasion_end',audience:'eligible_conversations',audienceLimit:2000,timezone:'Asia/Riyadh',calendar:'gregory_and_islamic_umalqura',sendsImmediately:false,deliveryGuaranteed:false,salesVerified:false,messagePreview:'Reviewed [CODE] message',messageSource:'generated',savedTemplateUsed:false};
const contract=()=>buildOccasionAuthorization({actorId:7,merchantId:20,reviewRevision:'a'.repeat(64),eligible:true,target:{action:'toggle',id:9,enabled:true},row:{id:9,occasionType:'new_year',year:2027},terms} as any,'Local shop',null,null,new Date('2026-10-03T09:00:00Z'));
const stored=()=>{const c=contract();return {actor_id:7,merchant_id:20,occasion_id:9,active:1,revoked_at:null,review_revision:c.reviewRevision,contract_digest:occasionAuthorizationDigest(c),reviewed_contract:JSON.stringify(c)};};
const execute=vi.fn();beforeEach(()=>execute.mockReset().mockResolvedValue([{insertId:31,affectedRows:1}]));
it('binds a generated authorization to actor, tenant, review, text and exact occasion end',()=>{
 expect(contract()).toMatchObject({version:1,actorId:7,merchantId:20,occasionId:9,expiresAt:'2027-01-01T20:59:59.000Z',campaignId:null,discountId:null,terms:{messagePreview:'Reviewed [CODE] message'}});expect(parseOccasionAuthorization(stored(),20,9)).toEqual(contract());
});
it('preserves contract identity when MySQL reorders JSON object keys',()=>{const r=stored();r.reviewed_contract=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(r.reviewed_contract)).reverse()));expect(parseOccasionAuthorization(r,20,9)).toEqual(contract());});
it.each([{actor_id:8},{merchant_id:21},{occasion_id:10},{active:null},{active:0},{revoked_at:new Date()},{review_revision:'b'.repeat(64)},{contract_digest:'b'.repeat(64)},{reviewed_contract:'invalid'}])('rejects missing, revoked or forged scope %#',patch=>{expect(parseOccasionAuthorization({...stored(),...patch},20,9)).toBeNull();});
it('rejects altered contract content and mismatched scopes inside a valid digest',()=>{
 const c=contract(),r=stored();c.businessName='Changed';r.reviewed_contract=JSON.stringify(c);expect(parseOccasionAuthorization(r,20,9)).toBeNull();c.merchantId=21;r.contract_digest=occasionAuthorizationDigest(c);r.reviewed_contract=JSON.stringify(c);expect(parseOccasionAuthorization(r,20,9)).toBeNull();expect(parseOccasionAuthorization(null,20,9)).toBeNull();
});
it('revokes the prior grant then appends a new scoped immutable snapshot',async()=>{
 const c=contract();await writeOccasionAuthorization({execute} as any,c);expect(execute).toHaveBeenCalledTimes(2);expect(execute.mock.calls[0]).toEqual([expect.stringContaining('SET active=NULL'),[9,20]]);
 const args=execute.mock.calls[1][1];expect(args[0]).toMatch(/^[a-f0-9-]{36}$/);expect(args.slice(1,7)).toEqual([9,20,7,c.reviewRevision,occasionAuthorizationDigest(c),JSON.stringify(c)]);expect(args.slice(7)).toEqual([null,null,null,null]);
});
it('does not infer a legacy actor during revocation',async()=>{await revokeOccasionAuthorization({execute} as any,20,9);expect(execute).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('merchant_id=? AND active=1'),[9,20]);});
it('propagates failed inserts to the enclosing transaction',async()=>{execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{insertId:0,affectedRows:0}]);await expect(writeOccasionAuthorization({execute} as any,contract())).rejects.toThrow('persisted');});
it('rejects partial prepared evidence and promises inconsistent with the selected occasion',()=>{expect(()=>occasionAuthorizationContract.parse({...contract(),campaignId:1})).toThrow();expect(()=>occasionAuthorizationContract.parse({...contract(),terms:{...terms,discountPercent:90}})).toThrow();});
it('fingerprints stable campaign content and discount terms, excluding lifecycle and redeemed usage',()=>{
 const campaign={id:1,merchantId:20,name:'Occasion',message:'Reviewed',imageUrl:null,targetAudience:'{}',scheduledAt:null,status:'draft'},discount={id:2,type:'percentage',value:15,minOrderAmount:0,maxUses:2000,usedCount:0,isActive:1,expiresAt:'2027-01-01 20:59:59',customer_phone:null};
 expect(occasionCampaignDigest({...campaign,status:'sending'})).toBe(occasionCampaignDigest(campaign));expect(occasionCampaignDigest({...campaign,message:'Edited'})).not.toBe(occasionCampaignDigest(campaign));
 expect(occasionDiscountDigest({...discount,usedCount:1})).toBe(occasionDiscountDigest(discount));expect(occasionDiscountDigest({...discount,maxUses:10})).not.toBe(occasionDiscountDigest(discount));
});
