import {z} from 'zod';
import {serviceCatalogId} from './service-catalog-write';
import {catalogRecordSchema} from './service-catalog-workspace';
export const serviceDetailsInput=z.object({serviceId:serviceCatalogId}).strict();
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const serviceBookingStatus=z.enum(['pending','confirmed','in_progress','completed','cancelled','no_show','unknown']);
export const serviceBookingDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;});
export const serviceBookingTime=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const serviceDetailsSchema=z.object({
 actorId:serviceCatalogId,merchantId:serviceCatalogId,canManage:z.boolean(),checkedAt:z.string().datetime(),selection:serviceDetailsInput,
 service:catalogRecordSchema.options[0],
 bookings:z.object({total:count,counts:z.object({pending:count,confirmed:count,in_progress:count,completed:count,cancelled:count,no_show:count,unknown:count}).strict(),paidValue:z.object({minor:count.nullable(),eligible:count,invalid:count}).strict()}).strict(),
 recent:z.array(z.object({id:serviceCatalogId,customerName:z.string().nullable(),customerPhone:z.string().nullable(),date:serviceBookingDate.nullable(),startTime:serviceBookingTime.nullable(),endTime:serviceBookingTime.nullable(),durationMinutes:z.number().int().min(1).max(1439).nullable(),status:serviceBookingStatus,paymentStatus:z.enum(['unpaid','paid','refunded','unknown']),finalPrice:count.nullable()}).strict()).max(10),
 ratings:z.object({total:count,excluded:count,distribution:z.object({one:count,two:count,three:count,four:count,five:count}).strict()}).strict(),
}).strict().superRefine((value,ctx)=>{
 const b=value.bookings,p=b.paidValue,r=value.ratings;
 if(value.service.id!==value.selection.serviceId||Object.values(b.counts).reduce((a,n)=>a+n,0)!==b.total||p.eligible>b.counts.completed||p.invalid>p.eligible||(p.invalid>0)!==(p.minor===null)||p.eligible===0&&p.minor!==0||value.recent.length!==Math.min(10,b.total)||new Set(value.recent.map(row=>row.id)).size!==value.recent.length||Object.values(r.distribution).reduce((a,n)=>a+n,0)!==r.total)ctx.addIssue({code:'custom',message:'Inconsistent service details'});
});
export type ServiceDetailsWorkspace=z.infer<typeof serviceDetailsSchema>;
