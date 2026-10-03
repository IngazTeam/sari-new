import {z} from 'zod';
import {promotionId,promotionCreateInput,promotionUpdateInput,promotionWriteFields} from './promotion-write';
import {promotionWorkspaceRow} from './promotion-workspace';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const promotionActionTarget=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),data:promotionCreateInput}).strict(),
 z.object({action:z.literal('update'),data:promotionUpdateInput}).strict(),
 z.object({action:z.literal('toggle'),id:promotionId,enabled:z.boolean()}).strict(),
 z.object({action:z.literal('delete'),id:promotionId}).strict(),
]);
export const promotionActionReview=z.object({actorId:promotionId,merchantId:promotionId,target:promotionActionTarget,reviewRevision:hash,checkedAt:z.string().datetime(),expiresAt:z.string().datetime(),before:promotionWorkspaceRow.nullable(),proposed:promotionWriteFields.nullable(),effect:z.enum(['create_active','update','enable','disable','delete']),retainsLinkedDiscount:z.boolean(),activeSlots:z.number().int().nonnegative(),candidateState:z.enum(['active','scheduled','expired','inactive','deleted']),newDiscount:z.object({type:z.enum(['percentage','fixed']),value:z.number().int().positive(),minOrderAmount:z.number().int().nonnegative(),expiresAt:z.string().nullable()}).strict().nullable(),salesVerified:z.literal(false),currencyEvidence:z.literal('not_recorded')}).strict();
export const promotionActionApply=z.object({target:promotionActionTarget,reviewRevision:hash,checkedAt:z.string().datetime(),requestKey:z.string().uuid()}).strict();
export const promotionActionResult=z.object({requestKey:z.string().uuid(),actorId:promotionId,merchantId:promotionId,id:promotionId,action:z.enum(['create','update','toggle','delete']),active:z.boolean().nullable(),retainedDiscount:z.boolean(),savedAt:z.string().datetime()}).strict();
export const promotionReceiptInput=z.object({requestKey:z.string().uuid()}).strict();
export type PromotionActionTarget=z.infer<typeof promotionActionTarget>;
export type PromotionActionReview=z.infer<typeof promotionActionReview>;
export type PromotionActionResult=z.infer<typeof promotionActionResult>;
