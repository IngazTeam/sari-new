import {z} from 'zod';
import {bookingReadId} from './booking-read';
export const wooAccessSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,integrationsManage:z.boolean(),ordersManage:z.boolean(),analyticsRead:z.boolean()}).strict();
