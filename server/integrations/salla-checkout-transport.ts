import axios from 'axios';
import { z } from 'zod';
import { majorToMinor } from '../../shared/product-money';
import { sallaExternalId } from '../../shared/salla-sales-observations';
import { sallaOrderSku } from './salla-order-items';

const cartId=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const count=z.number().int().min(1).max(10000);
export const cartSelection=z.array(z.object({externalId:sallaExternalId,sku:sallaOrderSku,quantity:count}).strict()).min(1).max(20);
function storeLocation(value:string) {
  const u=new URL(value),prefix=u.pathname==='/'?'':u.pathname.replace(/\/$/,'');
  const base=u.origin+prefix;
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash
    ||(value!==base&&value!==base+'/')
    ||(u.hostname==='salla.sa'?!/^\/[a-zA-Z0-9_-]{1,100}$/.test(prefix):prefix!==''))throw Error('Invalid store URL');
  return base;
}
export const cartContext=z.object({storeId:sallaExternalId,storeUrl:z.string().max(255)}).strict().superRefine((v,c)=>{
  try{storeLocation(v.storeUrl);}
  catch{c.addIssue({code:'custom',message:'Invalid store URL'});}
});
const amount=z.object({value:z.union([z.number(),z.string()]).transform(majorToMinor),currency:z.literal('SAR')});
const line=z.object({id:cartId,product_id:sallaExternalId,sku:sallaOrderSku,quantity:count,
  variant_id:z.union([z.null(),z.literal('')]).optional(),options:z.array(z.unknown()).max(0),
  attachments:z.array(z.unknown()).max(0).optional(),notes:z.union([z.null(),z.literal('')]).optional(),
});
const envelope=z.object({success:z.literal(true),status:z.union([z.literal(200),z.literal(201)]),data:z.object({
  id:cartId,store_id:sallaExternalId,checkout_url:z.string().max(2048),currency:z.object({code:z.literal('SAR')}),
  items:z.array(line).max(20),options:z.array(z.unknown()).max(0).optional(),
  amounts:z.object({total:z.object({amount})}),
})});
export type CartContext=z.infer<typeof cartContext>;
export type CartSelection=z.infer<typeof cartSelection>;
export function readCheckoutCart(raw:unknown,context:CartContext,expected:CartSelection|[],expectedId?:string) {
  const ctx=cartContext.parse(context),selection=expected.length?cartSelection.parse(expected):[];
  if(new Set(selection.map(i=>i.sku)).size!==selection.length)throw Error('Duplicate cart SKU');
  const {data}=envelope.parse(raw),checkoutUrl=storeLocation(ctx.storeUrl)+'/checkout/'+data.id;
  if(data.store_id!==ctx.storeId||expectedId!==undefined&&data.id!==cartId.parse(expectedId)
    ||data.checkout_url!==checkoutUrl
    ||data.items.length!==selection.length||new Set(data.items.map(i=>i.id)).size!==data.items.length
    ||new Set(data.items.map(i=>i.sku)).size!==data.items.length||new Set(data.items.map(i=>i.product_id)).size!==data.items.length
    ||data.items.some(i=>!selection.some(s=>s.externalId===i.product_id&&s.sku===i.sku&&s.quantity===i.quantity)))throw Error('Cart evidence mismatch');
  return {cartId:data.id,checkoutUrl,observedTotalMinor:data.amounts.total.amount.value,currency:'SAR' as const,
    items:data.items.map(i=>({sku:i.sku,quantity:i.quantity,cartItemId:i.id,productId:i.product_id})),
    pricing:'review_at_checkout' as const,orderCreated:false as const};
}
const base='https://api.salla.dev/store/v2/checkout';
const http=axios.create({timeout:10000,maxContentLength:2*1024*1024,maxBodyLength:2*1024*1024,maxRedirects:0});
function headers(ctx:CartContext){return {'Store-Identifier':ctx.storeId,'s-source':'app','s-app-name':'sari','s-app-version':'1.0.0','Content-Type':'application/json'};}

/** Guest Storefront API only. Merchant OAuth credentials and customer PII are
 * never forwarded. The caller durably reserves the attempt before this runs. */
export async function prepareCheckoutCart(context:CartContext,input:CartSelection,beforeWrite:()=>Promise<void>) {
  const ctx=cartContext.parse(context),selection=cartSelection.parse(input);
  if(new Set(selection.map(i=>i.sku)).size!==selection.length)throw Error('Duplicate cart SKU');
  await beforeWrite();
  const created=await http.post(base+'/generate',{source:'sari'},{headers:headers(ctx),params:{include_items:true}});
  const empty=readCheckoutCart(created.data,ctx,[]);
  for(const item of selection){
    await beforeWrite();
    const ack=await http.post(base+'/'+empty.cartId+'/items',{identifier_type:'sku',identifier:item.sku,quantity:item.quantity},
      {headers:headers(ctx),params:{include_items:true}});
    // Some documented mutation responses describe the line instead of the cart.
    // A successful acknowledgement alone cannot establish completed contents.
    z.object({success:z.literal(true),status:z.union([z.literal(200),z.literal(201)])}).parse(ack.data);
  }
  return readCurrentCheckoutCart(ctx,selection,empty.cartId);
}
export async function readCurrentCheckoutCart(context:CartContext,input:CartSelection,id:string) {
  const ctx=cartContext.parse(context),selection=cartSelection.parse(input),key=cartId.parse(id);
  const response=await http.get(base+'/'+key,{headers:headers(ctx),params:{include_items:true}});
  return readCheckoutCart(response.data,ctx,selection,key);
}
