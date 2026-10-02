import {z} from 'zod';
import {bookingReadId} from './booking-read';
const count=z.number().int().nonnegative().safe(),stamp=z.string().datetime().nullable();
export const wooMoneySchema=z.string().regex(/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/);
export const wooCurrencySchema=z.string().regex(/^[A-Z]{3}$/);
export const wooStockStates=['instock','outofstock','onbackorder','unknown'] as const;
export const wooOrderStates=['pending','processing','on-hold','completed','cancelled','refunded','failed','unknown'] as const;
export const wooSyncStates=['synced','pending','error','unknown'] as const;
export const wooCalendarDay=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00.000Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'Invalid calendar day');
export const wooDateFields={startDate:wooCalendarDay.optional(),endDate:wooCalendarDay.optional()};
export function validWooDateRange(value:{startDate?:string;endDate?:string}){return (!value.startDate&&!value.endDate)||!!value.startDate&&!!value.endDate&&value.startDate<=value.endDate&&Date.parse(value.endDate)-Date.parse(value.startDate)<366*86_400_000;}
const filters={search:z.string().trim().max(100).default(''),page:count.min(1).max(1_000_000).default(1)};
export const wooProductsInput=z.object({...filters,state:z.enum(['all',...wooStockStates]).default('all')}).strict();
export const wooOrdersInput=z.object({...filters,...wooDateFields,state:z.enum(['all',...wooOrderStates]).default('all')}).strict().refine(validWooDateRange,'Invalid date range');
export const wooOrderDetailsInput=z.object({id:bookingReadId,itemsPage:count.min(1).max(1_000_000).default(1)}).strict();
const base={id:bookingReadId,merchantId:bookingReadId,providerId:bookingReadId.nullable(),syncState:z.enum(wooSyncStates),lastSyncAt:stamp,providerUpdatedAt:stamp,invalidData:z.boolean()};
export const wooProductRow=z.object({...base,name:z.string().max(500),slug:z.string().max(500),sku:z.string().max(255).nullable(),price:wooMoneySchema.nullable(),regularPrice:wooMoneySchema.nullable(),salePrice:wooMoneySchema.nullable(),state:z.enum(wooStockStates),manageStock:z.boolean().nullable(),stockQuantity:z.number().int().safe().nullable(),imageUrl:z.string().max(2048).nullable()}).strict();
export const wooOrderRow=z.object({...base,orderNumber:z.string().max(100),state:z.enum(wooOrderStates),rawStatus:z.string().max(50),currency:wooCurrencySchema.nullable(),total:wooMoneySchema.nullable(),customerName:z.string().max(255).nullable(),customerPhone:z.string().max(50).nullable(),orderDate:stamp}).strict();
const page={actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),summary:z.object({stored:count,matched:count,groups:z.array(z.object({key:z.string(),count}).strict())}).strict(),pagination:z.object({page:count.min(1),pageSize:z.literal(25),total:count,pages:count}).strict()};
function validPage(value:{merchantId:number;selection:{page:number;state:string};summary:{stored:number;matched:number;groups:{key:string;count:number}[]};pagination:{page:number;total:number;pages:number};rows:{id:number;merchantId:number;state:string}[]},keys:readonly string[]){const {selection:s,summary:t,pagination:p,rows}=value;
 return t.stored>=t.matched&&t.groups.length===keys.length&&t.groups.every((g,i)=>g.key===keys[i])&&t.groups.reduce((n,g)=>n+g.count,0)===t.matched&&p.total===(s.state==='all'?t.matched:t.groups.find(g=>g.key===s.state)?.count)&&p.page===s.page&&p.pages===Math.ceil(p.total/25)&&rows.length===Math.min(25,Math.max(0,p.total-(p.page-1)*25))&&rows.every((r,i)=>r.merchantId===value.merchantId&&(s.state==='all'||r.state===s.state)&&(i===0||r.id<rows[i-1].id));
}
export const wooProductsWorkspaceSchema=z.object({...page,selection:wooProductsInput,currency:wooCurrencySchema.nullable(),rows:z.array(wooProductRow).max(25)}).strict().refine(v=>validPage(v,wooStockStates),'Inconsistent product page');
export const wooOrdersWorkspaceSchema=z.object({...page,selection:wooOrdersInput,rows:z.array(wooOrderRow).max(25)}).strict().refine(v=>validPage(v,wooOrderStates),'Inconsistent order page');
export const wooOrderItem=z.object({position:count.min(1),providerId:bookingReadId.nullable(),productId:bookingReadId.nullable(),variationId:count.nullable(),name:z.string().max(500).nullable(),sku:z.string().max(255).nullable(),quantity:count.min(1).nullable(),subtotal:wooMoneySchema.nullable(),total:wooMoneySchema.nullable(),invalidData:z.boolean()}).strict();
export const wooOrderDetails=z.object({...wooOrderRow.shape,revision:z.string().regex(/^[a-f0-9]{64}$/),customerEmail:z.string().max(255).nullable(),subtotal:wooMoneySchema.nullable(),shippingTotal:wooMoneySchema.nullable(),totalTax:wooMoneySchema.nullable(),discountTotal:wooMoneySchema.nullable(),paymentMethod:z.string().max(100).nullable(),paymentMethodTitle:z.string().max(255).nullable(),customerNote:z.string().nullable(),paidAt:stamp,completedAt:stamp,createdAt:stamp,updatedAt:stamp,
 items:z.object({validArray:z.boolean(),invalidItems:count,total:count,page:count.min(1),pageSize:z.literal(25),pages:count,rows:z.array(wooOrderItem).max(25)}).strict()}).strict();
export const wooOrderDetailsWorkspaceSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),selection:wooOrderDetailsInput,order:wooOrderDetails.nullable()}).strict().superRefine((v,ctx)=>{if(!v.order)return;const {order:o,selection:s}=v,i=o.items;
 if(o.merchantId!==v.merchantId||o.id!==s.id||i.page!==s.itemsPage||i.pages!==Math.ceil(i.total/25)||i.invalidItems>i.total||!i.validArray&&(i.total!==0||!o.invalidData)||i.rows.length!==Math.min(25,Math.max(0,i.total-(i.page-1)*25))||i.rows.some((r,n)=>r.position!==(i.page-1)*25+n+1))ctx.addIssue({code:'custom',message:'Inconsistent order detail'});
});
export type WooProductRow=z.infer<typeof wooProductRow>;
export type WooOrderRow=z.infer<typeof wooOrderRow>;
