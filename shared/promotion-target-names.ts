import {z} from 'zod';
import {promotionId} from './promotion-write';
import {promotionTargetChoice} from './promotion-targets';
export const promotionTargetNamesInput=z.object({id:promotionId,revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const promotionNamedTargets=z.object({ids:z.array(promotionId).max(1000).nullable(),choices:z.array(promotionTargetChoice).max(1000),missingIds:z.array(promotionId).max(1000)}).strict().superRefine((v,ctx)=>{
 const all=[...v.choices.map(r=>r.id),...v.missingIds];
 if(v.ids===null?all.length>0:new Set(v.ids).size!==v.ids.length||new Set(all).size!==all.length||all.length!==v.ids.length||all.some(id=>!v.ids!.includes(id)))ctx.addIssue({code:'custom',message:'Unmatched target names'});
});
const identity={actorId:promotionId,merchantId:promotionId,input:promotionTargetNamesInput,checkedAt:z.string().datetime()};
export const promotionTargetNamesResult=z.discriminatedUnion('state',[
 z.object({...identity,state:z.literal('ready'),products:promotionNamedTargets,categories:promotionNamedTargets}).strict(),
 z.object({...identity,state:z.enum(['changed','missing']),products:z.null(),categories:z.null()}).strict(),
]);
export type PromotionNamedTargets=z.infer<typeof promotionNamedTargets>;
