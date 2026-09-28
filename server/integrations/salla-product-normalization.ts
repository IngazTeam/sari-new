import { z } from 'zod';
import { majorToMinor } from '../../shared/product-money';
import { sallaExternalId } from '../../shared/salla-sales-observations';

const amount=z.union([z.number().finite().nonnegative(),z.string().regex(/^\d+(?:\.\d{1,2})?$/)]);
const money=z.object({amount,currency:z.enum(['SAR','USD'])});
const id=z.union([sallaExternalId,z.number().int().positive().safe().transform(String)]);
const quantity=z.number().int().nonnegative().max(2147483647);
const url=z.string().max(500).transform(v=>{
  if(!v)return null;const parsed=new URL(v);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port)throw Error('Invalid product URL');return parsed.toString();
});
const text=(limit:number)=>z.string().max(limit).transform(v=>v.replace(/<[^>]*>/g,'').trim());
const product=z.object({id,name:text(255).refine(v=>v.length>0),description:text(60000).nullish(),
  price:money,regular_price:money.nullish(),status:z.string().min(1).max(40),is_available:z.boolean(),
  quantity:quantity.nullable(),unlimited_quantity:z.boolean(),type:z.string().min(1).max(40),
  options:z.array(z.unknown()).max(500).optional(),skus:z.array(z.unknown()).max(5000).optional(),
  main_image:url.nullish(),url:url.nullish(),urls:z.object({customer:url.nullish()}).optional(),
  categories:z.array(z.object({name:text(100)})).max(100).optional(),sku:z.string().max(100).nullish(),
});
export function sallaProductProjectionId(storeId:string,productId:string) {
  return `salla:${sallaExternalId.parse(storeId)}:${sallaExternalId.parse(productId)}`;
}
/** `price` is the provider's current amount. A zero sale_price is not a free product.
 * Options are displayed but cannot enter our simple-item checkout without selection support. */
export function normalizeSallaProduct(raw:unknown) {
  const p=product.parse(raw),price=majorToMinor(p.price.amount);
  if(price>2147483647)throw Error('Product price too large');
  if(p.regular_price&&p.regular_price.currency!==p.price.currency)throw Error('Product currency mismatch');
  const regular=p.regular_price?majorToMinor(p.regular_price.amount):price;
  if(regular>2147483647)throw Error('Product price too large');
  if(!p.unlimited_quantity&&p.quantity===null)throw Error('Product quantity unavailable');
  const supported=['product','digital','service'].includes(p.type);
  const active=supported&&p.status==='sale'&&p.is_available&&(p.unlimited_quantity||(p.quantity??0)>0);
  return {externalId:p.id,name:p.name,description:p.description??'',price,currency:p.price.currency,
    compareAtPrice:regular>price?regular:null,stock:p.quantity??0,trackInventory:p.unlimited_quantity?0:1,
    isActive:active?1:0,status:active?'active':'draft',productType:p.type==='digital'?'digital':p.type==='service'?'service':'physical',
    hasVariants:p.options===undefined||p.skus===undefined||p.options.length>0||p.skus.length>0?1:0,
    imageUrl:p.main_image??null,productUrl:p.urls?.customer??p.url??null,category:p.categories?.[0]?.name??null,sku:p.sku??null};
}
export type NormalizedSallaProduct=ReturnType<typeof normalizeSallaProduct>;
export function readSallaProductResponse(raw:unknown,expectedId:string) {
  const result=z.object({status:z.literal(200),success:z.literal(true),data:z.unknown()}).parse(raw);
  const p=normalizeSallaProduct(result.data);if(p.externalId!==sallaExternalId.parse(expectedId))throw Error('Product identity mismatch');return p;
}
export function readSallaProductPage(raw:unknown,page:number) {
  const result=z.object({status:z.literal(200),success:z.literal(true),data:z.array(z.unknown()).max(50),
    pagination:z.object({currentPage:z.number().int().positive(),totalPages:z.number().int().min(0).max(200)})}).parse(raw);
  const p=result.pagination;
  if(p.currentPage!==page||p.totalPages<page&&!(page===1&&p.totalPages===0&&result.data.length===0)||result.data.length===0&&page<p.totalPages)throw Error('Invalid Salla pagination');
  const items=result.data.map(normalizeSallaProduct);if(new Set(items.map(p=>p.externalId)).size!==items.length)throw Error('Duplicate product in page');
  return {items,hasMore:page<p.totalPages};
}
