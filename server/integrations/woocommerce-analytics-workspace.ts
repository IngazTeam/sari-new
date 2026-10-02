import crypto from 'node:crypto';
import {bookingReadId} from '../../shared/booking-read';
import {wooOrderStates} from '../../shared/woocommerce-data-workspace';
import {wooAnalyticsInput,wooAnalyticsWorkspaceSchema} from '../../shared/woocommerce-analytics-workspace';
import {wooSnapshot,wooRows,wooCount,wooStamp,WooWorkspaceFault} from './woocommerce-workspace';
import {wooMoney,wooCurrency} from './woocommerce-data-workspace';
import {privacyHashExact} from '../accounts/privacy-hash';
export function wooPeriodDate(day:string,period:'daily'|'weekly'|'monthly'){
 if(period==='monthly')return day.slice(0,7)+'-01';if(period==='daily')return day;
 const date=new Date(day+'T00:00:00.000Z');date.setUTCDate(date.getUTCDate()-date.getUTCDay());return date.toISOString().slice(0,10);
}
const percentage=(n:number,total:number)=>total?Math.round(n/total*10000)/100:null;
function minor(value:unknown){const normalized=wooMoney(value);return normalized===null?null:BigInt(normalized.replace('.',''));}
function money(value:bigint){return `${value/BigInt(100)}.${String(value%BigInt(100)).padStart(2,'0')}`;}
function customerKey(email:unknown,phone:unknown){const e=typeof email==='string'?email.trim().toLowerCase():'';if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return privacyHashExact('woo-email:'+e);const p=typeof phone==='string'?phone.replace(/[\s()+.-]/g,''):'';return /^[0-9]{7,15}$/.test(p)?privacyHashExact('woo-phone:'+p):null;}
type Product={key:string;name:string;identity:'provider'|'name';quantity:number;revenue:bigint};
type Currency={orders:number;revenue:bigint;timeline:Map<string,{orders:number;revenue:bigint}>;products:Map<string,Product>;validLines:number;excludedLines:number;invalidArrays:number;fallbackIdentityLines:number};
function addProducts(group:Currency,lineItems:unknown){let items:unknown[];try{const parsed=typeof lineItems==='string'?JSON.parse(lineItems):null;if(!Array.isArray(parsed))throw Error();items=parsed;}catch{group.invalidArrays++;return;}
 for(const item of items){const r=item&&typeof item==='object'&&!Array.isArray(item)?item as any:{},name=typeof r.name==='string'?r.name.trim():'',amount=minor(r.total),quantity=r.quantity;
  if(!name||name.length>500||amount===null||typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<=0){group.excludedLines++;continue;}
  const provider=bookingReadId.safeParse(r.product_id).success,variation=typeof r.variation_id==='number'&&Number.isSafeInteger(r.variation_id)&&r.variation_id>=0?r.variation_id:0;
  if(r.product_id!=null&&r.product_id!==0&&!provider||r.variation_id!=null&&(typeof r.variation_id!=='number'||!Number.isSafeInteger(r.variation_id)||r.variation_id<0)){group.excludedLines++;continue;}
  const identity=provider?'provider':'name',key=crypto.createHash('sha256').update(JSON.stringify(provider?[r.product_id,variation]:['name',name])).digest('hex');
  group.validLines++;if(!provider)group.fallbackIdentityLines++;const current=group.products.get(key)??{key,name,identity,quantity:0,revenue:BigInt(0)};current.quantity+=quantity;current.revenue+=amount;if(!Number.isSafeInteger(current.quantity))throw new WooWorkspaceFault();group.products.set(key,current);
 }
}
/** Scan the full selected range in bounded batches, keeping one database snapshot.
 * Completed order totals include their stored tax/shipping. Item totals are a
 * separate measure. No conversation-to-order attribution is inferred. */
export async function readWooAnalyticsWorkspace(actorId:number,merchantId:number,input:unknown){const selection=wooAnalyticsInput.parse(input);return wooSnapshot(actorId,merchantId,async tx=>{
 const merchant=await wooRows(tx,'SELECT id FROM merchants WHERE id=?',[merchantId]);if(merchant.length!==1)throw new WooWorkspaceFault();
 const counts=await wooRows(tx,`SELECT COUNT(*) AS storedOrders,COALESCE(SUM(order_date>=? AND order_date<DATE_ADD(?,INTERVAL 1 DAY)),0) AS rangeOrders FROM woocommerce_orders WHERE merchant_id=?`,[selection.startDate,selection.endDate,merchantId]);
 const conversations=await wooRows(tx,'SELECT COUNT(*) AS count FROM conversations WHERE merchantId=? AND createdAt>=? AND createdAt<DATE_ADD(?,INTERVAL 1 DAY)',[merchantId,selection.startDate,selection.endDate]);if(counts.length!==1||conversations.length!==1)throw new WooWorkspaceFault();
 const statuses=new Map<string,number>(wooOrderStates.map(key=>[key,0])),currencies=new Map<string,Currency>(),customers=new Map<string,number>();let cursor=0,orders=0,identifiedOrders=0,excludedCompleted=0;
 while(true){const batch=await wooRows(tx,`SELECT id,status,currency,total,order_date AS orderDate,customer_email AS email,customer_phone AS phone,line_items AS lineItems FROM woocommerce_orders WHERE merchant_id=? AND order_date>=? AND order_date<DATE_ADD(?,INTERVAL 1 DAY) AND id>? ORDER BY id ASC LIMIT 250`,[merchantId,selection.startDate,selection.endDate,cursor]);if(!batch.length)break;
  for(const row of batch){const id=bookingReadId.parse(row.id);if(id<=cursor)throw new WooWorkspaceFault();cursor=id;orders++;
   const state=wooOrderStates.includes(row.status)?row.status:'unknown';statuses.set(state,statuses.get(state)!+1);
   const customer=customerKey(row.email,row.phone);if(customer){identifiedOrders++;customers.set(customer,(customers.get(customer)??0)+1);}
   if(state!=='completed')continue;const currency=wooCurrency(row.currency),amount=minor(row.total),date=wooStamp(row.orderDate);if(!currency||amount===null||!date){excludedCompleted++;continue;}
   const group=currencies.get(currency)??{orders:0,revenue:BigInt(0),timeline:new Map(),products:new Map(),validLines:0,excludedLines:0,invalidArrays:0,fallbackIdentityLines:0};group.orders++;group.revenue+=amount;
   const key=wooPeriodDate(date.slice(0,10),selection.period),bucket=group.timeline.get(key)??{orders:0,revenue:BigInt(0)};bucket.orders++;bucket.revenue+=amount;group.timeline.set(key,bucket);addProducts(group,row.lineItems);currencies.set(currency,group);
  }
 }
 if(orders!==wooCount(counts[0].rangeOrders))throw new WooWorkspaceFault();const completed=statuses.get('completed')!,singleOrder=Array.from(customers.values()).filter(n=>n===1).length,repeat=customers.size-singleOrder;
 const dates=new Set<string>();for(let date=new Date(selection.startDate+'T00:00:00.000Z');date.toISOString().slice(0,10)<=selection.endDate;date.setUTCDate(date.getUTCDate()+1))dates.add(wooPeriodDate(date.toISOString().slice(0,10),selection.period));
 return wooAnalyticsWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),timezone:'UTC',selection,
  summary:{storedOrders:wooCount(counts[0].storedOrders),orders,statuses:wooOrderStates.map(key=>({key,count:statuses.get(key)!})),completed,completionRate:percentage(completed,orders),eligibleCompleted:completed-excludedCompleted,excludedCompleted},
  currencies:Array.from(currencies).sort(([a],[b])=>a.localeCompare(b)).map(([currency,g])=>({currency,orders:g.orders,revenue:money(g.revenue),averageOrderValue:money((g.revenue+BigInt(Math.floor(g.orders/2)))/BigInt(g.orders)),
   timeline:Array.from(dates).map(date=>({date,orders:g.timeline.get(date)?.orders??0,revenue:money(g.timeline.get(date)?.revenue??BigInt(0))})),
   products:{distinct:g.products.size,limit:10,validLines:g.validLines,excludedLines:g.excludedLines,invalidArrays:g.invalidArrays,fallbackIdentityLines:g.fallbackIdentityLines,rows:Array.from(g.products.values()).sort((a,b)=>b.quantity-a.quantity||a.key.localeCompare(b.key)).slice(0,10).map(p=>({...p,revenue:money(p.revenue)}))}})),
  customers:{definition:'email_first_phone_fallback',identifiedOrders,unidentifiedOrders:orders-identifiedOrders,identities:customers.size,singleOrder,repeat,repeatRate:percentage(repeat,customers.size)},
  conversations:{createdInRange:wooCount(conversations[0].count),attributionAvailable:false,conversionRate:null,whatsappOrders:null,whatsappRevenue:null}});
 });}
