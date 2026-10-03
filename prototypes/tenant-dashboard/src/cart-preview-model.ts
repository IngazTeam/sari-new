import {cartWorkspaceInput,cartWorkspaceSchema,cartRecoveryReviewInput,cartRecoveryReviewSchema,cartRecoveryRecordInput,type CartWorkspaceRow} from '../../../shared/abandoned-cart-workspace';
import {cartReminderHistoryInput,cartReminderHistorySchema,cartReminderReviewInput,cartReminderReviewSchema,cartReminderReceiptInput,cartReminderSendInput,cartReminderReceiptSchema,type CartReminderReceipt} from '../../../shared/abandoned-cart-reminder';
import type {DiscountPreviewStore} from './discount-preview-model';
import type {ServiceMode} from './service-preview-model';

export const cartPreviewQueries=['abandonedCarts.workspace','abandonedCarts.reminderHistory','abandonedCarts.reminderReceipt'] as const;
export const cartPreviewMutations=['abandonedCarts.reviewRecovery','abandonedCarts.recordRecovery','abandonedCarts.reviewReminder','abandonedCarts.sendReviewedReminder'] as const;
const fault=(code:string)=>({message:'Local cart simulation',data:{code}});

/** Disposable examples: no network, database, actual quota or provider delivery. */
export class CartPreviewStore {
  writes=0;
  private rows:CartWorkspaceRow[]=[];
  private receipts:CartReminderReceipt[]=[];
  private requests=new Map<string,string>();
  private reviews=new Map<string,string>();
  private version=0;
  constructor(readonly actorId:number,readonly merchantId:number,readonly now:string,private mode:()=>ServiceMode,private discounts:DiscountPreviewStore){
    if(mode()==='empty')return;
    for(let id=31;id>=1;id--)this.rows.push({
      id,revision:this.marker(id,0),customerName:`${merchantId===269?'نواة · Nawa':'مدار · Madar'} ${id}`,customerPhone:'+966500000000',totalAmount:250,
      items:[{productId:1,productName:'حقيبة عملية للرحلات والعمل · Travel bag',quantity:2,price:125,variant:{color:'أزرق · Blue',size:'كبير · Large'}}],itemsRaw:null,
      reminderSent:id===2,reminderSentAt:id===2?now:null,recovered:id===3,recoveredAt:id===3?now:null,createdAt:now,updatedAt:now,state:id===2?'reminded':id===3?'recovered':'waiting',issues:[],
    });
    for(let id=1;id<=31;id++)this.receipts.push({id,operationKey:`00000000-0000-4000-8000-${String(merchantId*1000+id).padStart(12,'0')}`,merchantId,actorId,cartId:2,state:id===31?'accepted':id%2?'rejected':'suppressed',createdAt:now,updatedAt:now,quotaReserved:id===31,providerAccepted:id===31,salesVerified:false});
  }
  // Local markers only. The real server computes hashes and locks persisted evidence.
  private marker(id:number,version:number){return [this.actorId,this.merchantId,id,version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  private snapshot(){return this.rows.map(value=>{const row=structuredClone(value);if(this.mode()==='legacy'&&row.id%3===1){row.items=null;row.itemsRaw='{"old":"<img src=x onerror=alert(1)>"}';row.totalAmount=null;row.issues=['amount','items'];row.state='invalid';row.revision=this.marker(row.id,999);}return row;});}
  private owned(id:number){const row=this.snapshot().find(r=>r.id===id);if(!row)throw fault('NOT_FOUND');return row;}
  private latest(id:number){return [...this.receipts].reverse().find(r=>r.cartId===id)??null;}
  read(name:string,input:unknown={}){
    if(name==='abandonedCarts.reminderReceipt'){
      const selection=cartReminderReceiptInput.parse(input),receipt=this.receipts.find(r=>r.operationKey===selection.operationKey);
      if(!receipt)throw fault('NOT_FOUND');return cartReminderReceiptSchema.parse(receipt);
    }
    if(name==='abandonedCarts.reminderHistory'){
      const {page}=cartReminderHistoryInput.parse(input),rows=[...this.receipts].reverse();
      return cartReminderHistorySchema.parse({actorId:this.actorId,merchantId:this.merchantId,page,pages:Math.ceil(rows.length/25),total:rows.length,rows:rows.slice((page-1)*25,page*25)});
    }
    if(name!=='abandonedCarts.workspace')throw fault('NOT_FOUND');
    const selection=cartWorkspaceInput.parse(input),all=this.snapshot(),counts={waiting:0,reminded:0,recovered:0,invalid:0},recorded={reminded:0,recovered:0,flagsUnknown:0,recoveredAmount:0,amountRowsExcluded:0,recoveredWithoutReminder:0};
    for(const row of all){counts[row.state]++;if(row.reminderSent)recorded.reminded++;if(row.recovered){recorded.recovered++;if(!row.reminderSent)recorded.recoveredWithoutReminder++;if(row.totalAmount===null)recorded.amountRowsExcluded++;else recorded.recoveredAmount+=row.totalAmount;}}
    const q=selection.query.toLowerCase(),matches=all.filter(r=>(selection.state==='all'||r.state===selection.state)&&(!q||String(r.id)===q||[r.customerName,r.customerPhone,...(r.items??[]).map(i=>i.productName)].some(v=>v?.toLowerCase().includes(q))));
    return cartWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,canManage:this.mode()!=='readonly',selection,pageSize:25,total:all.length,matched:matches.length,pages:Math.ceil(matches.length/25),counts,recorded,currency:null,amountUnit:'source_unspecified',salesAttribution:'not_verified',rows:matches.slice((selection.page-1)*25,selection.page*25)});
  }
  private review(input:unknown){
    const selection=cartReminderReviewInput.parse(input),row=this.owned(selection.cartId),latest=this.latest(row.id),blockers:Array<'cart_state'|'channel'|'consent'|'discount'|'prior_reminder'>=[];
    if(row.state!=='waiting')blockers.push('cart_state');
    if(this.mode()==='unavailable-reference')blockers.push('channel','consent');
    if(latest&&!['rejected','suppressed'].includes(latest.state))blockers.push('prior_reminder');
    const discount=selection.discountId===null?null:this.discounts.read('discounts.workspace',{query:String(selection.discountId)}).rows.find(r=>r.id===selection.discountId)??null;
    if(selection.discountId!==null&&(!discount||discount.state!=='available'||discount.type!=='percentage'||(discount.minOrderAmount??0)>0||discount.customerPhone&&discount.customerPhone!==row.customerPhone))blockers.push('discount');
    const text=selection.locale==='ar'?`مرحبًا ${row.customerName}، هل تحتاج مساعدة لإكمال سلتك؟\n${row.items?.map(i=>i.productName).join('\n')??''}${discount?`\nكود ${discount.code}: خصم ${discount.value}% وفق شروطه.`:''}\nلإيقاف الرسائل أرسل «إيقاف».`:`Hello ${row.customerName}, would you like help completing your cart?\n${row.items?.map(i=>i.productName).join('\n')??''}${discount?`\nCode ${discount.code}: ${discount.value}% off, subject to its terms.`:''}\nReply STOP to opt out.`;
    const signature=JSON.stringify([selection,row.revision,discount?.revision,latest,blockers,text]);
    let expectedRevision=this.reviews.get(signature);if(!expectedRevision){expectedRevision=this.marker(row.id,++this.version);this.reviews.set(signature,expectedRevision);}
    return cartReminderReviewSchema.parse({actorId:this.actorId,merchantId:this.merchantId,selection,row,expectedRevision,checkedAt:this.now,eligible:!blockers.length,blockers,recipient:row.customerPhone,text,channel:blockers.includes('channel')?null:{id:this.merchantId,provider:'mock'},discount,latest,quotaRemaining:100-this.receipts.filter(r=>r.quotaReserved).length,quotaUnlimited:false,currency:null,salesVerified:false});
  }
  mutate(name:string,input:unknown){
    if(this.mode()==='readonly')throw fault('FORBIDDEN');
    if(name==='abandonedCarts.reviewRecovery'){
      const {cartId}=cartRecoveryReviewInput.parse(input),row=this.owned(cartId);
      return cartRecoveryReviewSchema.parse({actorId:this.actorId,merchantId:this.merchantId,row,eligible:['waiting','reminded'].includes(row.state),effect:'record_only',salesVerified:false});
    }
    if(name==='abandonedCarts.recordRecovery'){
      const value=cartRecoveryRecordInput.parse(input),row=this.owned(value.cartId);
      if(row.revision!==value.expectedRevision)throw fault('CONFLICT');if(!['waiting','reminded'].includes(row.state))throw fault('PRECONDITION_FAILED');
      const stored=this.rows.find(r=>r.id===row.id)!;stored.recovered=true;stored.recoveredAt=this.now;stored.state='recovered';stored.revision=this.marker(row.id,++this.version);this.writes++;
      return {success:true,cartId:row.id,effect:'record_only' as const,salesVerified:false as const};
    }
    if(name==='abandonedCarts.reviewReminder')return this.review(input);
    if(name!=='abandonedCarts.sendReviewedReminder')throw fault('NOT_FOUND');
    const value=cartReminderSendInput.parse(input),signature=JSON.stringify(value),previous=this.receipts.find(r=>r.operationKey===value.operationKey);
    if(previous){if(this.requests.get(value.operationKey)!==signature)throw fault('CONFLICT');return cartReminderReceiptSchema.parse(previous);}
    const checked=this.review({cartId:value.cartId,discountId:value.discountId,locale:value.locale});
    if(checked.expectedRevision!==value.expectedRevision)throw fault('CONFLICT');if(!checked.eligible)throw fault('PRECONDITION_FAILED');
    const state=this.mode()==='destination-missing'?'unknown':this.mode()==='credentials-invalid'?'rejected':this.mode()==='oauth-disabled'?'reserved':'accepted';
    const receipt=cartReminderReceiptSchema.parse({id:this.receipts.length+1,operationKey:value.operationKey,merchantId:this.merchantId,actorId:this.actorId,cartId:value.cartId,state,createdAt:this.now,updatedAt:this.now,quotaReserved:state!=='rejected',providerAccepted:state==='accepted',salesVerified:false});
    if(state==='accepted'){const row=this.rows.find(r=>r.id===value.cartId)!;row.reminderSent=true;row.reminderSentAt=this.now;row.state='reminded';row.revision=this.marker(row.id,++this.version);}
    this.receipts.push(receipt);this.requests.set(value.operationKey,signature);this.writes++;return structuredClone(receipt);
  }
}
