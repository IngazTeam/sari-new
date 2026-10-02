import {wooAccessSchema} from '../../../shared/woocommerce-access';
import {wooWorkspaceSchema,wooLogsInput,wooLogsWorkspaceSchema,wooLogStates,wooLogKinds,wooLogRow} from '../../../shared/woocommerce-workspace';
import {wooProductsInput,wooOrdersInput,wooOrderDetailsInput,wooProductsWorkspaceSchema,wooOrdersWorkspaceSchema,wooOrderDetailsWorkspaceSchema,wooProductRow,wooOrderRow,wooOrderStates,wooStockStates,wooOrderDetails,type WooProductRow,type WooOrderRow} from '../../../shared/woocommerce-data-workspace';
import {wooIncidentsInput,wooIncidentsWorkspace,wooReceiptStates,wooReceiptTopics,wooReconciliationRequest,type WooIncidentRow} from '../../../shared/woocommerce-incidents';
import {wooAnalyticsInput,wooAnalyticsWorkspaceSchema} from '../../../shared/woocommerce-analytics-workspace';
import {wooConnectionCommand} from '../../../shared/woocommerce-connection';
import {wooSyncRequest} from '../../../shared/woocommerce-sync-request';
import {wooOrderActionLookup,wooOrderActionWorkspace,wooOrderStatusRequest,wooOrderNotificationRequest,normalizeWooRecipient} from '../../../shared/woocommerce-order-action';
import {wooOperationLookup,wooOperationReceipt,wooOperationReviewWorkspace,type WooOperationReceipt,type WooOperationKind} from '../../../shared/woocommerce-operation';
import {wooStoreDestination} from '../../../client/src/lib/woocommerce-workspace';
import type {ByaanConnectionPreviewStore} from './byaan-connection-preview-model';
import type {z} from 'zod';
export const wooPreviewQueries=['woocommerce.getAccess','woocommerce.getWorkspace','woocommerce.getProductsWorkspace','woocommerce.getOrdersWorkspace','woocommerce.getOrderDetailsWorkspace','woocommerce.getAnalyticsWorkspace','woocommerce.getLogsWorkspace','woocommerce.getIncidentsWorkspace','woocommerce.getOrderActionWorkspace','woocommerce.getOperation','woocommerce.getBlockingOperation'] as const;
export const wooPreviewMutations=['woocommerce.requestReviewedConnection','woocommerce.requestReviewedSync','woocommerce.requestReviewedReconciliation','woocommerce.requestReviewedOrderStatus','woocommerce.requestReviewedNotification','woocommerce.acknowledgeOperation'] as const;
const fault=(code='PRECONDITION_FAILED',reason='changed')=>({message:'woo_operation:'+reason,data:{code}});
const minor=(s:string)=>BigInt(s.replace('.','')),money=(n:bigint)=>String(n/BigInt(100))+'.'+String(n%BigInt(100)).padStart(2,'0');
// Example identity only; production uses cryptographic digests. No credentials are retained.
const identity=(s:string)=>{let hash=2166136261;for(const char of s)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16).padStart(8,'0').repeat(8);};
type Operation={payload:any;fingerprint:string;receipt:WooOperationReceipt;outcome:WooOperationReceipt['outcome']};
/** In-memory, disposable model for the actual UI. No provider, channel or database access. */
export class WooPreviewStore {
 writes=0;private version=0;private products:WooProductRow[]=[];private orders:WooOrderRow[]=[];private logs:z.infer<typeof wooLogRow>[]=[];private incidents:WooIncidentRow[]=[];private orderVersions=new Map<number,number>();private notes=new Map<number,string>();private operations=new Map<string,Operation>();private hooked=true;
 constructor(private actorId:number,private merchantId:number,private now:string,private mode:()=>string,private hub:ByaanConnectionPreviewStore){
  if(mode()==='empty')return;
  for(let id=31;id>=1;id--){
   const date=new Date(Date.parse(now)-(31-id)*86400000).toISOString(),legacy=mode()==='legacy'&&id===31,base={id,merchantId,providerId:80000+id,lastSyncAt:now,providerUpdatedAt:now,syncState:'synced' as const,invalidData:legacy};
   this.products.push(wooProductRow.parse({...base,name:`${merchantId===269?'نواة · Nawa':'مدار · Madar'} · منتج تجريبي ${id}`,slug:'sample-'+id,sku:'LOCAL-'+id,price:legacy?null:'150.00',regularPrice:'160.00',salePrice:'150.00',state:legacy?'unknown':wooStockStates[id%3],manageStock:id%4===0?false:true,stockQuantity:id%4===0?null:id,imageUrl:null}));
   const state=legacy?'unknown':wooOrderStates[id%7];this.orders.push(wooOrderRow.parse({...base,orderNumber:'LOCAL-'+id,state,rawStatus:legacy?'legacy':state,currency:legacy?null:id%2?'SAR':'USD',total:legacy?null:id===31?'26.00':'150.00',customerName:`عميل محلي · Local ${merchantId}-${id}`,customerPhone:id%3===0?null:'966500000001',orderDate:date}));
   this.logs.push(wooLogRow.parse({id,merchantId,kind:wooLogKinds[id%4],state:wooLogStates[id%4],direction:'import',processed:31,succeeded:id%4===1?31:0,failed:0,durationSeconds:2,hasErrors:id%4===3,createdAt:now,startedAt:now,completedAt:id%4===0?null:now,invalidData:false}));
   if(id<=27)this.incidents.push({id,merchantId,revision:this.definition('incident'+id),topic:wooReceiptTopics[id%6],resourceId:80000+id,state:'manual_review',attempts:3,createdAt:now,processedAt:null,hasError:true,invalidData:false,reviewable:true});
  }
 }
 private scope(){return {actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now};}
 private definition(key='connection'){return identity(this.merchantId+':'+this.version+':'+key);}
 private platform(){return this.hub.read('integrations.workspace') as import('../../../shared/platform-workspace').PlatformWorkspace;}
 private workspace(){const p=this.platform().platforms.find(row=>row.platform==='woocommerce')!,present=p.present;
  return wooWorkspaceSchema.parse({...this.scope(),revision:this.definition(),present,state:present?'configured':'unlinked',connectionStatus:present?'connected':null,storeUrl:present?p.storeUrl:null,storeName:present?'متجر ووكومرس · Woo '+this.merchantId:null,storeVersion:present?'9':null,storeCurrency:present?'SAR':null,hasConsumerKey:present,hasConsumerSecret:present,createdAt:present?this.now:null,lastTestAt:present?this.now:null,lastSyncAt:present?p.lastSyncAt:null,counts:{storedProducts:this.products.length,storedOrders:this.orders.length,syncLogs:this.logs.length},syncSummary:Object.fromEntries(wooLogStates.map(key=>[key,this.logs.filter(r=>r.state===key).length])),webhooks:{ready:present&&this.hooked,identityStored:present&&this.hooked,registeredTopics:present&&this.hooked?6:0,registrationsValid:present&&this.hooked,stored:this.incidents.length,recentTotal:this.incidents.length,recentCompleted:0,awaiting:0,needsReview:this.incidents.filter(r=>r.reviewable).length,suppressed:this.incidents.filter(r=>r.state==='suppressed').length,unknown:0,oldestPendingAt:null}});
 }
 private page(selection:any,stored:any[],matched:any[],states:readonly string[]){const rows=matched.filter(r=>selection.state==='all'||r.state===selection.state);return {...this.scope(),selection,summary:{stored:stored.length,matched:matched.length,groups:states.map(key=>({key,count:matched.filter(r=>r.state===key).length}))},pagination:{page:selection.page,pageSize:25,total:rows.length,pages:Math.ceil(rows.length/25)},rows:rows.slice((selection.page-1)*25,selection.page*25)};}
 private inRange(row:WooOrderRow,selection:{startDate?:string;endDate?:string}){return !selection.startDate||!!row.orderDate&&row.orderDate.slice(0,10)>=selection.startDate&&row.orderDate.slice(0,10)<=selection.endDate!;}
 private details(id:number,page=1){const row=this.orders.find(r=>r.id===id);if(!row)return null;const total=id===31?26:1,invalid=row.invalidData;return wooOrderDetails.parse({...row,revision:identity(this.merchantId+':order:'+id+':'+(this.orderVersions.get(id)??0)),customerEmail:'sample'+id+'@example.test',subtotal:row.total,shippingTotal:'0.00',totalTax:'0.00',discountTotal:'0.00',paymentMethod:'cod',paymentMethodTitle:'الدفع عند الاستلام · Cash on delivery',customerNote:this.notes.get(id)??'ملاحظة محلية قابلة للتعديل · Local note',paidAt:null,completedAt:row.state==='completed'?this.now:null,createdAt:this.now,updatedAt:this.now,items:{validArray:true,invalidItems:invalid?1:0,total,page,pageSize:25,pages:Math.ceil(total/25),rows:Array.from({length:Math.min(25,Math.max(0,total-(page-1)*25))},(_,i)=>{const position=(page-1)*25+i+1;return {position,providerId:position,productId:position,variationId:0,name:'بند محلي · Item '+position,sku:'LINE-'+position,quantity:1,subtotal:id===31?'1.00':row.total,total:id===31?'1.00':row.total,invalidData:invalid&&position===1};})}});}
 private analytics(input:unknown){const selection=wooAnalyticsInput.parse(input),rows=this.orders.filter(r=>this.inRange(r,selection)),completed=rows.filter(r=>r.state==='completed'),eligible=completed.filter(r=>r.currency&&r.total),percentage=(n:number,d:number)=>d?Math.round(n/d*10000)/100:null;
  const bucket=(day:string)=>{const date=new Date(day+'T00:00:00Z');if(selection.period==='monthly')date.setUTCDate(1);if(selection.period==='weekly')date.setUTCDate(date.getUTCDate()-date.getUTCDay());return date.toISOString().slice(0,10);};
  const days:string[]=[];for(let date=Date.parse(selection.startDate);date<=Date.parse(selection.endDate);date+=86400000){const key=bucket(new Date(date).toISOString().slice(0,10));if(!days.includes(key))days.push(key);}
  const currencies=Array.from(new Set(eligible.map(r=>r.currency!))).sort().map(currency=>{const orders=eligible.filter(r=>r.currency===currency),sum=orders.reduce((n,r)=>n+minor(r.total!),BigInt(0)),products=new Map<number,{key:string;name:string;identity:'provider';quantity:number;revenue:string}>();let validLines=0;
   for(const order of orders)for(let page=1;page<=this.details(order.id)!.items.pages;page++)for(const item of this.details(order.id,page)!.items.rows){validLines++;const prior=products.get(item.productId!)??{key:identity('product:'+item.productId),name:item.name!,identity:'provider' as const,quantity:0,revenue:'0.00'};prior.quantity+=item.quantity!;prior.revenue=money(minor(prior.revenue)+minor(item.total!));products.set(item.productId!,prior);}
   return {currency,orders:orders.length,revenue:money(sum),averageOrderValue:money((sum+BigInt(Math.floor(orders.length/2)))/BigInt(orders.length)),timeline:days.map(date=>{const selected=orders.filter(r=>bucket(r.orderDate!.slice(0,10))===date);return {date,orders:selected.length,revenue:money(selected.reduce((n,r)=>n+minor(r.total!),BigInt(0)))};}),products:{distinct:products.size,limit:10,validLines,excludedLines:0,invalidArrays:0,fallbackIdentityLines:0,rows:Array.from(products.values()).sort((a,b)=>b.quantity-a.quantity||a.key.localeCompare(b.key)).slice(0,10)}};});
  return wooAnalyticsWorkspaceSchema.parse({...this.scope(),timezone:'UTC',selection,summary:{storedOrders:this.orders.length,orders:rows.length,statuses:wooOrderStates.map(key=>({key,count:rows.filter(r=>r.state===key).length})),completed:completed.length,completionRate:percentage(completed.length,rows.length),eligibleCompleted:eligible.length,excludedCompleted:completed.length-eligible.length},currencies,customers:{definition:'email_first_phone_fallback',identifiedOrders:rows.length,unidentifiedOrders:0,identities:rows.length,singleOrder:rows.length,repeat:0,repeatRate:rows.length?0:null},conversations:{createdInRange:rows.length?18:0,attributionAvailable:false,conversionRate:null,whatsappOrders:null,whatsappRevenue:null}});
 }
 read(name:string,raw:unknown={}){
  switch(name){
   case 'woocommerce.getAccess':return wooAccessSchema.parse({actorId:this.actorId,merchantId:this.merchantId,integrationsManage:this.mode()!=='readonly',ordersManage:this.mode()!=='readonly',analyticsRead:true});
   case 'woocommerce.getWorkspace':return this.workspace();
   case 'woocommerce.getProductsWorkspace':{const s=wooProductsInput.parse(raw),matched=this.products.filter(r=>[r.name,r.sku,r.providerId].some(v=>String(v).toLowerCase().includes(s.search.toLowerCase())));return wooProductsWorkspaceSchema.parse({...this.page(s,this.products,matched,wooStockStates),currency:this.workspace().storeCurrency});}
   case 'woocommerce.getOrdersWorkspace':{const s=wooOrdersInput.parse(raw),matched=this.orders.filter(r=>this.inRange(r,s)&&[r.orderNumber,r.customerName,r.customerPhone,r.providerId,'sample'+r.id+'@example.test'].some(v=>String(v).toLowerCase().includes(s.search.toLowerCase())));return wooOrdersWorkspaceSchema.parse(this.page(s,this.orders,matched,wooOrderStates));}
   case 'woocommerce.getOrderDetailsWorkspace':{const selection=wooOrderDetailsInput.parse(raw);return wooOrderDetailsWorkspaceSchema.parse({...this.scope(),selection,order:this.details(selection.id,selection.itemsPage)});}
   case 'woocommerce.getOrderActionWorkspace':{const {orderId}=wooOrderActionLookup.parse(raw),order=this.details(orderId),configured=this.workspace().state==='configured',recipient=normalizeWooRecipient(order?.customerPhone),ready=this.mode()!=='unavailable-reference';return wooOrderActionWorkspace.parse({...this.scope(),revision:this.definition(),configured,order,recipient,notificationChannelReady:ready,canChangeStatus:!!(configured&&order?.providerId&&order.providerUpdatedAt&&order.state!=='unknown'),canNotify:!!(configured&&order?.providerId&&recipient&&ready)});}
   case 'woocommerce.getAnalyticsWorkspace':return this.analytics(raw);
   case 'woocommerce.getLogsWorkspace':{const s=wooLogsInput.parse(raw),matched=this.logs.filter(r=>(s.kind==='all'||s.kind===r.kind)&&(s.direction==='all'||s.direction===r.direction)&&String(r.id).includes(s.search));return wooLogsWorkspaceSchema.parse(this.page(s,this.logs,matched,wooLogStates));}
   case 'woocommerce.getIncidentsWorkspace':{const s=wooIncidentsInput.parse(raw),matched=this.incidents.filter(r=>(s.resource==='all'||r.topic.startsWith(s.resource+'.'))&&[r.id,r.resourceId].some(v=>String(v).includes(s.search)));return wooIncidentsWorkspace.parse(this.page(s,this.incidents,matched,wooReceiptStates));}
   case 'woocommerce.getOperation':{const {requestId}=wooOperationLookup.parse(raw),op=this.operations.get(requestId);if(!op)throw fault('NOT_FOUND','missing');return this.result(op);}
   case 'woocommerce.getBlockingOperation':{const op=Array.from(this.operations.values()).find(r=>r.receipt.outcome==='pending'||r.receipt.reviewRequired);return wooOperationReviewWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,operation:op?this.result(op):null});}
  }
  throw Error('Unmapped WooCommerce preview read');
 }
 private result(op:Operation){
  if(op.receipt.outcome!=='pending'||op.outcome==='pending')return wooOperationReceipt.parse({...op.receipt,replayed:true});
  const input=op.payload,kind=op.receipt.kind;let result:WooOperationReceipt['result']=null;
  if(op.outcome==='success'){
   if(kind==='connect'||kind==='verify'||kind==='disconnect'){
    const replacing=kind==='connect'&&this.workspace().present&&this.workspace().storeUrl!==input.storeUrl,cleared=kind==='disconnect'||replacing;
    if(cleared){this.products=[];this.orders=[];this.incidents=[];this.logs=[];}
    this.version++;if(kind==='connect')this.hooked=true;
    if(kind!=='verify')this.hub.updateWoo({present:kind==='connect',occupiesSlot:kind==='connect',state:kind==='connect'?'configured':'unlinked',storeUrl:kind==='connect'?input.storeUrl:null,createdAt:kind==='connect'?this.now:null,lastSyncAt:null,hasSyncErrors:false,legacy:false},kind==='connect'?'woocommerce':this.platform().source==='woocommerce'?'none':undefined);
    result={type:'connection',revision:this.definition(),configured:kind!=='disconnect',remoteCleanup:'not_needed',verification:kind==='disconnect'?'not_checked':this.hooked?'api_and_webhooks':'api',localCopies:cleared?'cleared':'retained'};
   }else if(kind==='sync_products'||kind==='sync_orders'||kind==='reconcile'){
    let reconciled=0;if(kind==='reconcile')for(const chosen of input.incidents){const row=this.incidents.find(r=>r.id===chosen.id)!;row.state='suppressed';row.reviewable=false;row.processedAt=this.now;row.revision=this.definition('closed'+row.id);reconciled++;}
    const products=kind==='sync_orders'?null:this.products.length,orders=kind==='sync_products'?null:this.orders.length,id=(this.logs[0]?.id??0)+1;
    this.logs.unshift(wooLogRow.parse({id,merchantId:this.merchantId,kind:kind==='reconcile'?'manual':kind==='sync_products'?'products':'orders',state:'success',direction:'import',processed:(products??0)+(orders??0),succeeded:(products??0)+(orders??0),failed:0,durationSeconds:1,hasErrors:false,createdAt:this.now,startedAt:this.now,completedAt:this.now,invalidData:false}));
    this.hub.updateWoo({lastSyncAt:this.now});result={type:'sync',products,orders,reconciled};
   }else if(kind==='order_status'){const row=this.orders.find(r=>r.id===input.orderId)!;row.state=input.status;row.rawStatus=input.status;if('note' in input)this.notes.set(row.id,input.note);this.orderVersions.set(row.id,(this.orderVersions.get(row.id)??0)+1);result={type:'order',orderId:row.id,status:input.status};}
   else result={type:'notification',orderId:input.orderId,accepted:true,duplicate:false};
  }
  op.receipt=wooOperationReceipt.parse({...op.receipt,outcome:op.outcome,started:op.outcome!=='rejected',reviewRequired:op.outcome==='unknown',result});return {...op.receipt,replayed:true};
 }
 mutate(name:string,raw:unknown){
  if(this.mode()==='readonly')throw fault('FORBIDDEN','forbidden');
  if(name==='woocommerce.acknowledgeOperation'){const {requestId}=wooOperationLookup.parse(raw),op=this.operations.get(requestId);if(!op||op.receipt.outcome!=='unknown')throw fault();op.receipt.reviewRequired=false;this.writes++;return wooOperationReviewWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,operation:op.receipt});}
  const input:any=name==='woocommerce.requestReviewedConnection'?wooConnectionCommand.parse(raw):name==='woocommerce.requestReviewedSync'?wooSyncRequest.parse(raw):name==='woocommerce.requestReviewedReconciliation'?wooReconciliationRequest.parse(raw):name==='woocommerce.requestReviewedOrderStatus'?wooOrderStatusRequest.parse(raw):name==='woocommerce.requestReviewedNotification'?wooOrderNotificationRequest.parse(raw):null;if(!input)throw Error('Unmapped WooCommerce preview mutation');
  const kind:WooOperationKind=name.endsWith('Connection')?input.action:name.endsWith('Sync')?'sync_'+input.resource as WooOperationKind:name.endsWith('Reconciliation')?'reconcile':name.endsWith('OrderStatus')?'order_status':'order_notify',fingerprint=identity(JSON.stringify(input));
  const old=this.operations.get(input.requestId);if(old){if(old.receipt.kind!==kind||old.fingerprint!==fingerprint)throw fault();return this.result(old);}
  const current=this.workspace();if(input.revision!==current.revision)throw fault();
  if(Array.from(this.operations.values()).some(o=>o.receipt.outcome==='pending'||o.receipt.reviewRequired))throw fault('CONFLICT','busy');if(this.operations.size>=6)throw fault('TOO_MANY_REQUESTS','rate_limited');
  if(kind==='connect'){
   const destination=wooStoreDestination(input.storeUrl),changed=current.present&&current.storeUrl!==destination;if(!destination)throw fault('BAD_REQUEST');input.storeUrl=destination;
   if(this.platform().platforms.some(p=>p.platform!=='woocommerce'&&p.occupiesSlot)||changed&&!input.replaceLocalCopies||(!current.present||changed)&&(!input.consumerKey||!input.consumerSecret))throw fault();
  }else if(!current.present||kind!=='disconnect'&&current.state!=='configured')throw fault();
  if(kind==='order_status'||kind==='order_notify'){const action=this.read('woocommerce.getOrderActionWorkspace',{orderId:input.orderId}) as z.infer<typeof wooOrderActionWorkspace>;if(action.order?.revision!==input.orderRevision||kind==='order_status'&&!action.canChangeStatus||kind==='order_notify'&&(!action.canNotify||action.recipient!==input.recipient))throw fault();}
  if(kind==='reconcile'&&input.incidents.some((i:any)=>!this.incidents.some(r=>r.id===i.id&&r.revision===i.revision&&r.reviewable)))throw fault();
  const {consumerKey:discardKey,consumerSecret:discardSecret,...payload}=input;
  const receipt=wooOperationReceipt.parse({...this.scope(),requestId:input.requestId,revision:input.revision,kind,outcome:'pending',started:false,reviewRequired:false,result:null,createdAt:this.now,replayed:false});
  this.operations.set(input.requestId,{payload,fingerprint,receipt,outcome:this.mode()==='oauth-disabled'?'pending':this.mode()==='destination-missing'?'unknown':this.mode()==='credentials-invalid'?'rejected':'success'});this.writes++;return receipt;
 }
}
