import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {wooCalendarDay,validWooDateRange,wooCurrencySchema,wooMoneySchema,wooOrderStates} from './woocommerce-data-workspace';
const count=z.number().int().nonnegative().safe(),rate=z.number().min(0).max(100).nullable();
export const wooAnalyticsInput=z.object({startDate:wooCalendarDay,endDate:wooCalendarDay,period:z.enum(['daily','weekly','monthly']).default('daily')}).strict().refine(validWooDateRange,'Invalid date range');
export const wooAnalyticsWorkspaceSchema=z.object({
 actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),timezone:z.literal('UTC'),selection:wooAnalyticsInput,
 summary:z.object({storedOrders:count,orders:count,statuses:z.array(z.object({key:z.enum(wooOrderStates),count}).strict()).length(8),completed:count,completionRate:rate,eligibleCompleted:count,excludedCompleted:count}).strict(),
 currencies:z.array(z.object({currency:wooCurrencySchema,orders:count.min(1),revenue:wooMoneySchema,averageOrderValue:wooMoneySchema,
  timeline:z.array(z.object({date:wooCalendarDay,orders:count,revenue:wooMoneySchema}).strict()).min(1).max(366),
  products:z.object({distinct:count,limit:z.literal(10),validLines:count,excludedLines:count,invalidArrays:count,fallbackIdentityLines:count,rows:z.array(z.object({key:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(1).max(500),identity:z.enum(['provider','name']),quantity:count.min(1),revenue:wooMoneySchema}).strict()).max(10)}).strict(),
 }).strict()),
 customers:z.object({definition:z.literal('email_first_phone_fallback'),identifiedOrders:count,unidentifiedOrders:count,identities:count,singleOrder:count,repeat:count,repeatRate:rate}).strict(),
 conversations:z.object({createdInRange:count,attributionAvailable:z.literal(false),conversionRate:z.null(),whatsappOrders:z.null(),whatsappRevenue:z.null()}).strict(),
}).strict().superRefine((v,ctx)=>{
 const invalid=()=>ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce analytics'}),s=v.summary,c=v.customers;
 const percentage=(n:number,total:number)=>total?Math.round(n/total*10000)/100:null,minor=(text:string)=>BigInt(text.replace('.',''));
 if(s.storedOrders<s.orders||s.statuses.some((g,i)=>g.key!==wooOrderStates[i])||s.statuses.reduce((n,g)=>n+g.count,0)!==s.orders||s.completed!==s.statuses.find(g=>g.key==='completed')?.count||s.eligibleCompleted+s.excludedCompleted!==s.completed||s.completionRate!==percentage(s.completed,s.orders)||v.currencies.reduce((n,g)=>n+g.orders,0)!==s.eligibleCompleted||new Set(v.currencies.map(g=>g.currency)).size!==v.currencies.length||c.identifiedOrders+c.unidentifiedOrders!==s.orders||c.singleOrder+c.repeat!==c.identities||c.singleOrder+2*c.repeat>c.identifiedOrders||c.identities>c.identifiedOrders||c.repeatRate!==percentage(c.repeat,c.identities))invalid();
 for(const g of v.currencies){const sum=g.timeline.reduce((n,row)=>n+minor(row.revenue),BigInt(0)),p=g.products;
  if(g.timeline.reduce((n,row)=>n+row.orders,0)!==g.orders||sum!==minor(g.revenue)||minor(g.averageOrderValue)!==(sum+BigInt(Math.floor(g.orders/2)))/BigInt(g.orders)||g.timeline.some((row,i)=>i>0&&row.date<=g.timeline[i-1].date)||p.rows.length!==Math.min(10,p.distinct)||p.fallbackIdentityLines>p.validLines||p.distinct>p.validLines||p.invalidArrays>g.orders||new Set(p.rows.map(r=>r.key)).size!==p.rows.length||p.rows.some((row,i)=>i>0&&(row.quantity>p.rows[i-1].quantity||row.quantity===p.rows[i-1].quantity&&row.key<p.rows[i-1].key)))invalid();
 }
});
export type WooAnalyticsWorkspace=z.infer<typeof wooAnalyticsWorkspaceSchema>;
