import {createZidSyncReview,type ZidSyncResource,type ZidSyncLifecycle} from './zid-sync-review';
import {withZidSyncLock} from './zid-sync-lock';
import {getValidZidApiCredentials} from './zid-token-manager';
import {fetchAllZidProducts,fetchZidStoreIdentity} from './zid-product-sync';
import {fetchAllZidOrders,fetchAllZidCustomers} from './zid-commerce-sync';
import {requireZidProductStore} from './zid-product-normalization';
import {upsertNormalizedProductsFromZid,upsertNormalizedOrdersFromZid,upsertNormalizedCustomersFromZid} from '../db';

/** Every dashboard provider request, batch persistence and completion checks the same selected authority. */
export async function runReviewedZidSync(actorId:number,merchantId:number,input:{resource:ZidSyncResource;revision?:string},fetchImpl?:typeof fetch,lifecycle?:ZidSyncLifecycle){
 return withZidSyncLock(merchantId,async()=>{
  const review=await createZidSyncReview(actorId,merchantId,input.resource,input.revision,lifecycle);
  const credentials=await getValidZidApiCredentials({merchantId,fetchImpl,beforeRead:review.beforeCredentials,afterRefresh:review.afterRefresh});
  const apiCredentials={authorizationToken:credentials.authorizationToken,managerToken:credentials.managerToken};
  const provider={credentials:apiCredentials,fetchImpl,beforeRequest:review.checkpoint};
  const identity=await fetchZidStoreIdentity(provider);
  const storeId=requireZidProductStore(identity.storeId,review.storeId);
  const summary:string[]=[],resources:Array<{kind:Exclude<ZidSyncResource,'all'>;logId:number;count:number}>=[];
  for(const kind of review.enabled){
   const logId=await review.startLog(kind);
   try{
    let count=0;
    if(kind==='products'){
     const startedAt=new Date(),products=await fetchAllZidProducts({...provider,storeId,now:startedAt});
     const result=await upsertNormalizedProductsFromZid(merchantId,products,{storeId,startedAt,guard:review.persist});
     count=products.length;summary.push(`${result.upsertedProducts} منتج (${result.disabledProducts} عُطّل لغيابه)`);
    }else if(kind==='orders'){
     const orders=await fetchAllZidOrders({...provider,storeId});
     const result=await upsertNormalizedOrdersFromZid(merchantId,orders,review.persist);
     count=orders.length;summary.push(`${result.sourceOrders} طلب (${result.projectedOrders} قابل للعرض والتواصل)`);
    }else{
     const customers=await fetchAllZidCustomers(provider);
     const result=await upsertNormalizedCustomersFromZid(merchantId,customers,review.persist);
     count=customers.length;summary.push(`${result.sourceCustomers} عميل (${result.contactableCustomers} نشط برقم صالح، ${result.deactivatedCustomers} عُطّل لغيابه)`);
    }
    await review.finishLog(logId,kind,count);resources.push({kind,logId,count});
   }catch(error){await review.failLog(logId).catch(()=>undefined);throw error;}
  }
  await review.finish();return {success:true as const,message:`تمت مزامنة ${summary.join('، ')} بنجاح`,resources};
 });
}
