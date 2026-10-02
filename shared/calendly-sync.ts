import {z} from 'zod';
import {serviceBookingDate} from './service-details-workspace';
export const calendlySyncPeriod=z.object({startDate:serviceBookingDate,endDate:serviceBookingDate}).strict().refine(v=>v.startDate<=v.endDate&&Date.parse(v.endDate+'T00:00:00Z')-Date.parse(v.startDate+'T00:00:00Z')<=92*86400000,'Choose at most 93 days');
export const calendlySyncCommand=z.object({requestId:z.string().uuid().toLowerCase(),revision:z.string().regex(/^[a-f0-9]{64}$/),period:calendlySyncPeriod}).strict();
