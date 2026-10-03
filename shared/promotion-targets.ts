import {z} from 'zod';
import {promotionId} from './promotion-write';
export const promotionTargetSelection=z.object({kind:z.enum(['products','categories']),query:z.string().trim().max(100).default(''),page:z.number().int().min(1).max(1000000).default(1),selectedIds:z.array(promotionId).max(1000).refine(v=>new Set(v).size===v.length).default([])}).strict();
export const promotionTargetChoice=z.object({id:promotionId,name:z.string().max(255).nullable(),alternateName:z.string().max(255).nullable(),active:z.boolean().nullable()}).strict();
const choice=promotionTargetChoice;
export const promotionTargetChoices=z.object({actorId:promotionId,merchantId:promotionId,selection:promotionTargetSelection,total:z.number().int().nonnegative().safe(),pages:z.number().int().nonnegative().safe(),pageSize:z.literal(25),rows:z.array(choice).max(25),selected:z.array(choice).max(1000),missingIds:z.array(promotionId).max(1000)}).strict();
export type PromotionTargetSelection=z.infer<typeof promotionTargetSelection>;
