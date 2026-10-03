import {z} from 'zod';
import {promotionTypes,promotionScopes} from './promotion-workspace';
export const promotionId=z.number().int().positive().max(2147483647);
const text=(max:number)=>z.string().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v));
export const promotionWriteFields=z.object({title:text(255).trim().min(1).optional(),description:text(65535).nullable().optional(),bannerImageUrl:text(500).nullable().optional(),type:z.enum(promotionTypes).optional(),value:z.number().int().min(0).max(100000).nullable().optional(),scope:z.enum(promotionScopes).optional(),productIds:text(65535).nullable().optional(),categoryIds:text(65535).nullable().optional(),minOrderAmount:z.number().int().min(0).max(1000000).nullable().optional(),minQuantity:z.number().int().min(1).max(10000).nullable().optional(),startsAt:z.string().max(40).nullable().optional(),expiresAt:z.string().max(40).nullable().optional()}).strict();
export const promotionCreateInput=promotionWriteFields.extend({title:text(255).trim().min(1),type:z.enum(promotionTypes),autoGenerateCode:z.boolean().optional(),autoCodeValue:z.number().int().positive().max(100000).optional(),autoCodeType:z.enum(['percentage','fixed']).optional()});
export const promotionUpdateInput=promotionWriteFields.extend({id:promotionId});
export const promotionMutationInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),data:promotionCreateInput}).strict(),
 z.object({action:z.literal('update'),data:promotionUpdateInput}).strict(),
 z.object({action:z.literal('toggle'),id:promotionId}).strict(),
 z.object({action:z.literal('delete'),id:promotionId}).strict(),
]);
export type PromotionMutation=z.infer<typeof promotionMutationInput>;
