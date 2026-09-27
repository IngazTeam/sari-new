import type {PoolConnection} from 'mysql2/promise';
import {z} from 'zod';
import {staffTeamListInput,staffTeamCheckInput,staffTeamCheckResult,staffTeamOutcome,staffTeamPage,staffTeamAuditPage} from '../../shared/staff-team-review';
import {hasPermission} from '../_core/permissions';
import {assertRuntimeSchema} from '../db/schema-readiness';
import {databaseTimeEpoch} from '../db/time';
import {checkoutTransaction} from './checkout-agreements';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {parseStaffJson} from './sales-staff-acceptance-contract';
import {assertDashboardStaffSchema,reconcileDashboardStaffInTransaction} from './staff-dashboard-reply';
import {assertDashboardVoiceSchema,reconcileDashboardVoiceInTransaction} from './staff-dashboard-voice';
import {reconcileStaffCompatibilityInTransaction} from './staff-compatibility-settlement';
import {isStaffTextCompatibility} from './staff-dashboard-compatibility';
import {inspectStaffAttemptItem} from './staff-attempt-review';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const table=(kind:'text'|'voice')=>kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices';
const unavailable=():never=>{throw Error('Team attempt review unavailable');};
const request=staffTeamCheckInput.extend({merchantId:id,reviewerUserId:id}).strict();
const snapshot=z.object({version:z.literal('staff-team-review.v1'),request,beforeDigest:digest,afterDigest:digest,result:staffTeamOutcome,
  observedAt:z.string().datetime({precision:3}),scope:z.literal('sql_review_only')}).strict();
type ListInput=z.infer<typeof staffTeamListInput>;
export async function assertStaffTeamReviewSchema(kind:'text'|'voice'){
  await (kind==='text'?assertDashboardStaffSchema():assertDashboardVoiceSchema());
  await assertRuntimeSchema('staff team reviews',[{table:'ai_sales_staff_reviews',columns:['reviewer_user_id','author_user_id','conversation_id','source_kind','source_id','request_id','request_digest','snapshot','snapshot_digest','created_at'],
    uniqueIndexes:[{name:'uq_staff_review_request',columns:['merchant_id','request_id']}]}],{cacheSuccess:false});
}
/** Hold current persisted administrative authority throughout settlement and audit commit. */
export async function authorizeStaffTeamReview(c:PoolConnection,merchant:number,reviewer:number){
  const [m]=await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[merchant]);
  const [u]=await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE',[reviewer]);
  const [members]=await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchant,reviewer]);
  if(m.length!==1||m[0].status==='suspended'||u.length!==1||u[0].account_status!=='active'||members.length>1)return unavailable();
  if(members.length?(!members[0].is_active||!hasPermission(members[0].role,'conversations.review')):m[0].userId!==reviewer)return unavailable();
}
function filters(input:ListInput,authorColumn:string){
  return {sql:`${input.conversationId?' AND conversation_id=?':''}${input.authorUserId?` AND ${authorColumn}=?`:''}${input.beforeId?' AND id<?':''}`,
    args:[...(input.conversationId?[input.conversationId]:[]),...(input.authorUserId?[input.authorUserId]:[]),...(input.beforeId?[input.beforeId]:[])]};
}
function readAudit(row:any){
  const raw=parseStaffJson(row.snapshot),s=snapshot.parse(raw),r=s.request;
  if(hash(raw)!==row.snapshot_digest||hash(s)!==row.snapshot_digest||hash(r)!==row.request_digest||r.merchantId!==row.merchant_id
    ||r.reviewerUserId!==row.reviewer_user_id||r.authorUserId!==row.author_user_id||r.conversationId!==row.conversation_id||r.kind!==row.source_kind
    ||r.sourceId!==row.source_id||r.requestId!==row.request_id||s.observedAt!==new Date(databaseTimeEpoch(row.created_at)).toISOString())return unavailable();
  return s;
}
const sourceDigest=(row:any)=>hash({actor:row.actor_user_id,conversation:row.conversation_id,request:row.request_id,status:row.status,
  intent:row.intent??null,intentDigest:row.intent_digest??null,basis:row.basis,basisDigest:row.basis_digest,
  phoneDigest:hash(row.customer_phone),textDigest:hash(row.reply_text??null),mediaDigest:hash(row.media_url??null),
  receipt:row.provider_message_id,projection:row.projected_message_id,compatibilityResult:row.compatibility_result??null});
export async function listTeamStaffAttempts(merchant:number,reviewer:number,raw:ListInput){
  id.parse(merchant);id.parse(reviewer);const input=staffTeamListInput.parse(raw);await assertStaffTeamReviewSchema(input.kind);
  return checkoutTransaction(async c=>{
    await authorizeStaffTeamReview(c,merchant,reviewer);const f=filters(input,'actor_user_id');
    const [rows]=await c.execute<any[]>(`SELECT * FROM ${table(input.kind)} WHERE merchant_id=?${f.sql} ORDER BY id DESC LIMIT 21 FOR SHARE`,[merchant,...f.args]);
    const items=[];for(const row of rows.slice(0,20))items.push({attempt:await inspectStaffAttemptItem(c,input.kind,row,merchant,row.actor_user_id,row.conversation_id),conversationId:row.conversation_id,authorUserId:row.actor_user_id});
    return staffTeamPage.parse({items,nextCursor:rows.length>20?items.at(-1)!.attempt.id:null});
  });
}
export async function listStaffTeamReviews(merchant:number,reviewer:number,raw:ListInput){
  id.parse(merchant);id.parse(reviewer);const input=staffTeamListInput.parse(raw);await assertStaffTeamReviewSchema(input.kind);
  return checkoutTransaction(async c=>{
    await authorizeStaffTeamReview(c,merchant,reviewer);const f=filters(input,'author_user_id');
    const [rows]=await c.execute<any[]>(`SELECT * FROM ai_sales_staff_reviews WHERE merchant_id=? AND source_kind=?${f.sql} ORDER BY id DESC LIMIT 21 FOR SHARE`,[merchant,input.kind,...f.args]);
    const items=rows.slice(0,20).map(row=>{const s=readAudit(row),r=s.request;return {id:row.id,kind:r.kind,sourceId:r.sourceId,conversationId:r.conversationId,
      authorUserId:r.authorUserId,reviewerUserId:r.reviewerUserId,reason:r.reason,createdAt:s.observedAt,result:s.result};});
    return staffTeamAuditPage.parse({items,nextCursor:rows.length>20?items.at(-1)!.id:null});
  });
}
/** No sending, uploads or manual acceptance: settlement and immutable audit share one transaction. */
export async function checkTeamStaffAttempt(merchant:number,reviewer:number,raw:z.infer<typeof staffTeamCheckInput>){
  id.parse(merchant);id.parse(reviewer);const input=staffTeamCheckInput.parse(raw);await assertStaffTeamReviewSchema(input.kind);
  const r=request.parse({...input,merchantId:merchant,reviewerUserId:reviewer});
  return checkoutTransaction(async c=>{
    await authorizeStaffTeamReview(c,merchant,reviewer);
    const [prior]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_reviews WHERE merchant_id=? AND request_id=? FOR UPDATE',[merchant,input.requestId]);
    if(prior.length){if(prior.length!==1)return unavailable();const saved=readAudit(prior[0]);if(hash(saved.request)!==hash(r))return unavailable();return staffTeamCheckResult.parse({reviewId:prior[0].id,result:saved.result});}
    const [rows]=await c.execute<any[]>(`SELECT * FROM ${table(input.kind)} WHERE id=? AND merchant_id=? FOR UPDATE`,[input.sourceId,merchant]);
    if(rows.length!==1||rows[0].actor_user_id!==input.authorUserId||rows[0].conversation_id!==input.conversationId)return unavailable();
    const beforeDigest=sourceDigest(rows[0]);let result:z.infer<typeof staffTeamOutcome>;
    await c.query('SAVEPOINT staff_team_settlement');
    try{
      const compatible=input.kind==='text'?isStaffTextCompatibility(rows[0]):Number(rows[0].compatibility)===1;
      result=staffTeamOutcome.parse(await (compatible?reconcileStaffCompatibilityInTransaction(c,input.kind,merchant,input.sourceId,undefined,input.conversationId)
        :input.kind==='text'?reconcileDashboardStaffInTransaction(c,merchant,input.sourceId):reconcileDashboardVoiceInTransaction(c,merchant,input.sourceId)));
    }catch{
      await c.query('ROLLBACK TO SAVEPOINT staff_team_settlement');
      result={success:false,status:'unavailable',persisted:false};
    }
    await c.query('RELEASE SAVEPOINT staff_team_settlement');
    const [[after]]=await c.execute<any[]>(`SELECT * FROM ${table(input.kind)} WHERE id=? AND merchant_id=?`,[input.sourceId,merchant]);
    const [[time]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const s=snapshot.parse({version:'staff-team-review.v1',request:r,beforeDigest,afterDigest:sourceDigest(after),result,observedAt:new Date(databaseTimeEpoch(time.now)).toISOString(),scope:'sql_review_only'});
    const [saved]=await c.execute<any>(`INSERT INTO ai_sales_staff_reviews (merchant_id,reviewer_user_id,author_user_id,conversation_id,source_kind,source_id,request_id,request_digest,snapshot,snapshot_digest,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[merchant,reviewer,input.authorUserId,input.conversationId,input.kind,input.sourceId,input.requestId,hash(r),JSON.stringify(s),hash(s),s.observedAt.slice(0,23).replace('T',' ')]);
    return staffTeamCheckResult.parse({reviewId:Number(saved.insertId),result});
  });
}
