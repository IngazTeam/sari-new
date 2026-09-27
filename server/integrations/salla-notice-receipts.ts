import type { PoolConnection } from 'mysql2/promise';
import { noticePlan,noticeRecord,noticeOutcome,noticeHash,type NoticePlan,type NoticeOutcome } from './notice-evidence';
import { noticeSummary,noticeResult } from '../../shared/notice-evidence';
type Effect={id:number;merchant_id:number;creation_id:number;local_order_id:number;claim_token:string;context_hash:string;kind:string;dispatch_started_at?:unknown};
export const SALLA_NOTICE_REQUIREMENTS=[{table:'salla_notice_receipts',columns:['effect_id','merchant_id','creation_id','local_order_id','claim_token','context_hash','evidence','evidence_hash','fully_accepted','created_at','updated_at'],
  uniqueIndexes:[{name:'salla_notice_effect_once',columns:['effect_id']}],checkConstraints:['chk_salla_notice_receipt']}];
export async function readNoticeRecord(c:PoolConnection,e:Effect,lock:'FOR SHARE'|'FOR UPDATE'='FOR SHARE') {
  const [rows]=await c.execute<any[]>(`SELECT * FROM salla_notice_receipts WHERE effect_id=? ${lock}`,[e.id]);
  if(!rows.length)return null;
  const r=rows[0],raw=typeof r.evidence==='string'?JSON.parse(r.evidence):r.evidence,record=noticeRecord.parse(raw);
  if(r.merchant_id!==e.merchant_id||r.creation_id!==e.creation_id||r.local_order_id!==e.local_order_id||r.claim_token!==e.claim_token||r.context_hash!==e.context_hash
    ||noticeHash(raw)!==r.evidence_hash||noticeHash(record)!==r.evidence_hash
    ||(e.kind==='owner_notice'?record.plan.method!=='owner':e.kind!=='merchant_notice'||record.plan.method==='owner')
    ||Number(r.fully_accepted)!==Number(record.entries.every(t=>t.state==='accepted'))
    ||record.entries.some(t=>['dispatching','accepted','rejected','unknown'].includes(t.state))&&!e.dispatch_started_at)throw Error('Notice evidence mismatch');
  return {row:r,record};
}
export async function saveNoticePlan(c:PoolConnection,e:Effect,value:NoticePlan) {
  const plan=noticePlan.parse(value);
  if(e.kind==='owner_notice'?plan.method!=='owner':e.kind!=='merchant_notice'||plan.method==='owner')throw Error('Notice channel mismatch');
  const record=noticeRecord.parse({version:1,plan,entries:plan.targets.map(t=>({key:t.key,state:t.initial,outcome:null}))});
  await c.execute(`INSERT INTO salla_notice_receipts(effect_id,merchant_id,creation_id,local_order_id,claim_token,context_hash,evidence,evidence_hash)
    VALUES (?,?,?,?,?,?,?,?)`,[e.id,e.merchant_id,e.creation_id,e.local_order_id,e.claim_token,e.context_hash,JSON.stringify(record),noticeHash(record)]);
}
async function write(c:PoolConnection,e:Effect,value:unknown) {
  const record=noticeRecord.parse(value);
  await c.execute(`UPDATE salla_notice_receipts SET evidence=?,evidence_hash=?,fully_accepted=?,updated_at=UTC_TIMESTAMP(3) WHERE effect_id=?`,
    [JSON.stringify(record),noticeHash(record),Number(record.entries.every(t=>t.state==='accepted')),e.id]);
}
export async function startNoticeTarget(c:PoolConnection,e:Effect,key:string) {
  const saved=await readNoticeRecord(c,e,'FOR UPDATE'),entry=saved?.record.entries.find(t=>t.key===key);
  if(!saved||!entry||entry.state!=='ready')throw Error('Notice target unavailable');entry.state='dispatching';await write(c,e,saved.record);
}
export async function finishNoticeTarget(c:PoolConnection,e:Effect,key:string,value:NoticeOutcome) {
  const outcome=noticeOutcome.parse(value),saved=await readNoticeRecord(c,e,'FOR UPDATE'),entry=saved?.record.entries.find(t=>t.key===key);
  if(!saved||!entry)throw Error('Notice target unavailable');
  if(entry.outcome){if(noticeHash(entry.outcome)!==noticeHash(outcome))throw Error('Notice receipt is immutable');return;}
  if(outcome.state==='blocked'?entry.state!=='ready':entry.state!=='dispatching')throw Error('Notice outcome not authorized');
  entry.state=outcome.state;entry.outcome=outcome;await write(c,e,saved.record);
}
export async function inspectNoticeEvidence(c:PoolConnection,e:Effect) {
  if(!['owner_notice','merchant_notice'].includes(e.kind))return undefined;
  const saved=await readNoticeRecord(c,e);if(!saved)return undefined;
  const targets=saved.record.entries.map((entry,i)=>({channel:saved.record.plan.targets[i].channel,state:entry.state}));
  return noticeSummary.parse({result:noticeResult(targets),targets});
}
