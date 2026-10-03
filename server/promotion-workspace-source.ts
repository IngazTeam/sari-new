import {createHash} from 'node:crypto';
import {promotionWorkspaceInput,promotionWorkspaceSchema,promotionTypes,promotionScopes,type PromotionSelection,type PromotionWorkspaceRow} from '../shared/promotion-workspace';
export const PROMOTION_FIELDS={id:'id',merchantId:'merchant_id',title:'title',description:'description',bannerImageUrl:'banner_image_url',type:'type',value:'value',scope:'scope',productIds:'product_ids',categoryIds:'category_ids',minOrderAmount:'min_order_amount',minQuantity:'min_quantity',autoDiscountCodeId:'auto_discount_code_id',startsAt:'starts_at',expiresAt:'expires_at',isActive:'is_active',viewCount:'view_count',clickCount:'click_count',createdAt:'created_at',updatedAt:'updated_at'} as const;
export const PROMOTION_SELECT=Object.entries(PROMOTION_FIELDS).map(([name,column])=>`p.${column} AS ${name}`).join(',');
export function projectPromotionWorkspace(actorId:number,merchantId:number,canManage:boolean,input:PromotionSelection,source:any[],now=new Date()){
 const selection=promotionWorkspaceInput.parse(input);
 if(source.some(r=>r.merchantId!==merchantId)||new Set(source.map(r=>r.id)).size!==source.length)throw Error('Invalid promotion source scope');
 const rows:PromotionWorkspaceRow[]=source.map(raw=>{
  const issues:string[]=[];
  const text=(v:any,key:string,max:number,nullable=true)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||!nullable&&!v.trim()){issues.push(key);return null;}return v;};
  const integer=(v:any,key:string,max=Number.MAX_SAFE_INTEGER,nullable=true,min=0)=>{if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max){issues.push(key);return null;}return v;};
  const date=(v:any,key:string,nullable=true)=>{if(nullable&&v===null)return null;const s=v instanceof Date&&Number.isFinite(v.getTime())?v.toISOString():typeof v==='string'?v.replace(' ','T'):'';const d=new Date(s.endsWith('Z')?s:s+'Z');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,19)!==s.slice(0,19)){issues.push(key);return null;}return d.toISOString();};
  const title=text(raw.title,'title',255,false),description=text(raw.description,'description',65535),bannerImageUrl=text(raw.bannerImageUrl,'banner',500);
  const type=promotionTypes.includes(raw.type)?raw.type:null,scope=promotionScopes.includes(raw.scope)?raw.scope:null;if(type===null)issues.push('type');if(scope===null)issues.push('scope');
  const value=integer(raw.value,'value',type==='percentage'?100:100000);if(['percentage','fixed'].includes(type)&&(!value||value<=0))issues.push('value');
  const productIds=text(raw.productIds,'products',65535),categoryIds=text(raw.categoryIds,'categories',65535);
  const ids=(value:string|null,key:string)=>{if(value===null)return null;try{const values=JSON.parse(value);if(!Array.isArray(values)||values.length>1000||values.some(v=>typeof v!=='number'||!Number.isInteger(v)||v<=0||v>2147483647)||new Set(values).size!==values.length)throw Error();return values as number[];}catch{issues.push(key);return null;}};
  const productIdsParsed=ids(productIds,'products'),categoryIdsParsed=ids(categoryIds,'categories');if(scope==='products'&&!productIdsParsed?.length||scope==='categories'&&!categoryIdsParsed?.length)issues.push('scope_targets');
  const minOrderAmount=integer(raw.minOrderAmount,'minimum_order',1000000),minQuantity=integer(raw.minQuantity,'minimum_quantity',10000,true,1);
  const startsAt=date(raw.startsAt,'start'),expiresAt=date(raw.expiresAt,'expiry'),createdAt=date(raw.createdAt,'created',false),updatedAt=date(raw.updatedAt,'updated',false);if(startsAt&&expiresAt&&Date.parse(startsAt)>=Date.parse(expiresAt))issues.push('date_order');
  const isActive=raw.isActive===1?true:raw.isActive===0?false:null;if(isActive===null)issues.push('active');
  const viewCount=integer(raw.viewCount,'views',Number.MAX_SAFE_INTEGER,false),clickCount=integer(raw.clickCount,'clicks',Number.MAX_SAFE_INTEGER,false);
  const autoDiscountCodeId=integer(raw.autoDiscountCodeId,'discount_id',2147483647,true,1);let linkedDiscount:PromotionWorkspaceRow['linkedDiscount']=null;
  if(autoDiscountCodeId!==null){if(raw.linkedId===autoDiscountCodeId&&raw.linkedMerchantId===merchantId&&typeof raw.linkedCode==='string'&&raw.linkedCode.length>0&&raw.linkedCode.length<=50&&['percentage','fixed'].includes(raw.linkedType)&&Number.isSafeInteger(raw.linkedValue)&&raw.linkedValue>=0&&[0,1].includes(raw.linkedActive))linkedDiscount={id:autoDiscountCodeId,code:raw.linkedCode,type:raw.linkedType,value:raw.linkedValue,isActive:raw.linkedActive===1};else issues.push('discount_link');}
  const state=issues.length?'invalid':!isActive?'inactive':expiresAt&&Date.parse(expiresAt)<=now.getTime()?'expired':startsAt&&Date.parse(startsAt)>now.getTime()?'scheduled':'active';
  const revision=createHash('sha256').update(JSON.stringify([Object.keys(PROMOTION_FIELDS).map(k=>raw[k]),linkedDiscount])).digest('hex');
  return {id:raw.id,revision,title,description,bannerImageUrl,type,value,scope,productIds,categoryIds,productIdsParsed,categoryIdsParsed,minOrderAmount,minQuantity,autoDiscountCodeId,linkedDiscount,startsAt,expiresAt,isActive,viewCount,clickCount,createdAt,updatedAt,state,issues:Array.from(new Set(issues))};
 });
 const counts={active:0,scheduled:0,expired:0,inactive:0,invalid:0};let storedViewCount:number|null=0,storedClickCount:number|null=0,invalidCounterRows=0;
 const sum=(a:number|null,b:number|null)=>a===null||b===null||!Number.isSafeInteger(a+b)?null:a+b;
 for(const row of rows){counts[row.state]++;storedViewCount=sum(storedViewCount,row.viewCount);storedClickCount=sum(storedClickCount,row.clickCount);if(row.viewCount===null||row.clickCount===null)invalidCounterRows++;}
 const q=selection.query.toLowerCase(),matches=rows.filter(r=>(selection.state==='all'||r.state===selection.state)&&(selection.type==='all'||r.type===selection.type)&&(selection.scope==='any'||r.scope===selection.scope)&&(!q||[String(r.id),r.title,r.description,r.linkedDiscount?.code,r.productIds,r.categoryIds].some(v=>v?.toLowerCase().includes(q))));
 return promotionWorkspaceSchema.parse({actorId,merchantId,canManage,checkedAt:now.toISOString(),selection,pageSize:25,total:rows.length,matched:matches.length,pages:Math.ceil(matches.length/25),counts,savedActiveCount:rows.filter(r=>r.isActive===true).length,activeLimit:5,storedViewCount,storedClickCount,invalidCounterRows,counterEvidence:'legacy_ai_context_and_banner_queue',salesAttribution:'not_verified',currencyEvidence:'not_recorded',scopeEvidence:'saved_identifiers',rows:matches.slice((selection.page-1)*25,selection.page*25)});
}
