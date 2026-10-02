import {createHash} from 'node:crypto';
import {z} from 'zod';
import {cartItem,cartWorkspaceInput,cartWorkspaceSchema,type CartSelection,type CartWorkspaceRow} from '../shared/abandoned-cart-workspace';
export const CART_WORKSPACE_COLUMNS='id,merchantId,customerPhone,customerName,items,totalAmount,reminderSent,reminderSentAt,recovered,recoveredAt,createdAt,updatedAt';
export function projectCartWorkspace(actorId:number,merchantId:number,canManage:boolean,input:CartSelection,source:any[],now=new Date()){
 const selection=cartWorkspaceInput.parse(input);if(source.some(row=>row.merchantId!==merchantId))throw Error('Invalid cart source scope');
 const rows=source.map((raw):CartWorkspaceRow=>{
  const issues:string[]=[];
  const text=(v:any,field:string,max:number,nullable=false)=>{if(nullable&&v===null)return null;if(typeof v!=='string'||v.length>max||!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)){issues.push(field);return null;}return v;};
  const date=(v:any,field:string,nullable=false)=>{if(nullable&&v===null)return null;const s=v instanceof Date&&Number.isFinite(v.getTime())?v.toISOString():typeof v==='string'?v.replace(' ','T'):'';const d=new Date(s.endsWith('Z')?s:s+'Z');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,19)!==s.slice(0,19)){issues.push(field);return null;}return d.toISOString();};
  const flag=(v:any,field:string)=>{if(v!==0&&v!==1){issues.push(field);return null;}return v===1;};
  const customerName=text(raw.customerName,'name',255,true),customerPhone=text(raw.customerPhone,'phone',50),reminderSent=flag(raw.reminderSent,'reminder'),recovered=flag(raw.recovered,'recovery');
  const reminderSentAt=date(raw.reminderSentAt,'reminder_time',true),recoveredAt=date(raw.recoveredAt,'recovery_time',true),createdAt=date(raw.createdAt,'created'),updatedAt=date(raw.updatedAt,'updated');
  if(reminderSent===true&&!reminderSentAt||reminderSent===false&&reminderSentAt)issues.push('reminder_state');if(recovered===true&&!recoveredAt||recovered===false&&recoveredAt)issues.push('recovery_state');
  const totalAmount=typeof raw.totalAmount==='number'&&Number.isSafeInteger(raw.totalAmount)&&raw.totalAmount>=0?raw.totalAmount:null;if(totalAmount===null)issues.push('amount');
  let items:CartWorkspaceRow['items']=null,itemsRaw:string|null=null;
  try{if(typeof raw.items!=='string'||raw.items.length>100000)throw Error();items=z.array(cartItem).min(1).max(2000).parse(JSON.parse(raw.items));}catch{issues.push('items');itemsRaw=typeof raw.items==='string'&&raw.items.length<=100000?raw.items:null;}
  // The version is based on every persisted field; passing time alone cannot change it.
  const revision=createHash('sha256').update(JSON.stringify(CART_WORKSPACE_COLUMNS.split(',').map(key=>raw[key]))).digest('hex');
  return {id:raw.id,revision,customerName,customerPhone,totalAmount,items,itemsRaw,reminderSent,reminderSentAt,recovered,recoveredAt,createdAt,updatedAt,issues,state:issues.length?'invalid':recovered?'recovered':reminderSent?'reminded':'waiting'};
 });
 const counts={waiting:0,reminded:0,recovered:0,invalid:0},recorded={reminded:0,recovered:0,flagsUnknown:0,recoveredAmount:0 as number|null,amountRowsExcluded:0,recoveredWithoutReminder:0};
 for(const row of rows){counts[row.state]++;if(row.reminderSent)recorded.reminded++;if(row.reminderSent===null||row.recovered===null)recorded.flagsUnknown++;if(row.recovered){recorded.recovered++;if(row.reminderSent===false)recorded.recoveredWithoutReminder++;if(row.totalAmount===null)recorded.amountRowsExcluded++;else if(recorded.recoveredAmount!==null){const sum=recorded.recoveredAmount+row.totalAmount;recorded.recoveredAmount=Number.isSafeInteger(sum)?sum:null;}}}
 const q=selection.query.toLowerCase(),matched=rows.filter(row=>(selection.state==='all'||row.state===selection.state)&&(!q||String(row.id)===q||[row.customerName,row.customerPhone,...(row.items??[]).map(i=>i.productName)].some(v=>v?.toLowerCase().includes(q))));
 return cartWorkspaceSchema.parse({actorId,merchantId,checkedAt:now.toISOString(),canManage,selection,pageSize:25,total:rows.length,matched:matched.length,pages:Math.ceil(matched.length/25),counts,recorded,currency:null,amountUnit:'source_unspecified',salesAttribution:'not_verified',rows:matched.slice((selection.page-1)*25,selection.page*25)});
}
