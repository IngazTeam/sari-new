import {it,expect} from 'vitest';
import {assertPromotionReviewTime} from './promotion-actions';
import {promotionActionTarget,promotionActionApply} from '../shared/promotion-actions';
it.each([-1,300001,NaN])('rejects invalid review age %s',age=>{expect(()=>assertPromotionReviewTime('2026-10-03T00:00:00Z',Date.parse('2026-10-03T00:00:00Z')+age)).toThrow('promotion_write:stale');});
it.each([0,300000])('accepts an unexpired review age %s',age=>{expect(()=>assertPromotionReviewTime('2026-10-03T00:00:00Z',Date.parse('2026-10-03T00:00:00Z')+age)).not.toThrow();});
it.each([{action:'toggle',id:1},{action:'toggle',id:1,enabled:true,merchantId:9},{action:'delete',id:-1},{action:'create',data:{title:'Offer',type:'fixed',value:5,isActive:1}}])('rejects forged or incomplete action %j',target=>{expect(promotionActionTarget.safeParse(target).success).toBe(false);});
it('requires a durable request key and a review timestamp',()=>{const base={target:{action:'toggle',id:1,enabled:false},reviewRevision:'a'.repeat(64),checkedAt:'2026-10-03T00:00:00Z',requestKey:'23e7d06e-a668-41ac-8327-f920a7d7c662'};expect(promotionActionApply.safeParse(base).success).toBe(true);for(const patch of [{requestKey:'bad'},{checkedAt:'bad'},{actorId:9}])expect(promotionActionApply.safeParse({...base,...patch}).success).toBe(false);});
