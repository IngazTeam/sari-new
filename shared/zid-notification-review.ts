import {z} from 'zod';
import {bookingReadId} from './booking-read';
const revision=z.string().regex(/^[a-f0-9]{64}$/);
export const zidNoticeSelection=z.object({id:bookingReadId,revision}).strict();
export const zidNoticeReviewInput=z.object({items:z.array(zidNoticeSelection).min(1).max(25)}).strict().refine(v=>new Set(v.items.map(x=>x.id)).size===v.items.length,'Duplicate incident');
export const zidNoticeReviewSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),total:z.number().int().nonnegative().safe(),rows:z.array(zidNoticeSelection.extend({orderId:z.string().max(255),storeId:z.string().max(64),attempts:z.number().int().nonnegative(),createdAt:z.string().datetime().nullable()})).max(25)}).strict().refine(v=>v.rows.length===Math.min(v.total,25)&&v.rows.every((r,i)=>i===0||r.id<v.rows[i-1].id),'Inconsistent incident review');
export const zidNoticeReviewReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,acknowledged:z.number().int().min(1).max(25),ids:z.array(bookingReadId).min(1).max(25)}).strict().refine(v=>v.acknowledged===v.ids.length&&new Set(v.ids).size===v.ids.length,'Inconsistent acknowledgement');
