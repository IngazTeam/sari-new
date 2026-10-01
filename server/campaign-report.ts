import {sql,type SQL} from 'drizzle-orm';
import {getDb} from './db/connection';
import {databaseTimeEpoch} from './db/time';
import {campaignReportInput,campaignReportSchema,type CampaignReportSnapshot,type campaignReportReasons} from '../shared/campaign-report';

export class CampaignReportUnavailableError extends Error {constructor(){super('Campaign report is unavailable');this.name='CampaignReportUnavailableError';}}
export class CampaignReportMissingError extends Error {constructor(){super('Campaign report not found');this.name='CampaignReportMissingError';}}
type Row=Record<string,any>;
function integer(value:unknown):number{if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)))throw new CampaignReportUnavailableError();const result=Number(value);if(!Number.isSafeInteger(result)||result<0)throw new CampaignReportUnavailableError();return result;}
function identity(value:number){if(!Number.isSafeInteger(value)||value<=0)throw new CampaignReportUnavailableError();}
function one(rows:Row[]){if(rows.length!==1)throw new CampaignReportUnavailableError();return rows[0];}
function iso(value:string|Date){const time=databaseTimeEpoch(value);if(!Number.isFinite(time))throw new CampaignReportUnavailableError();return new Date(time).toISOString();}

/** Never expose a provider response, stack trace, credential or arbitrary legacy
 * error text to a report or CSV. Unknown evidence remains explicitly unknown. */
export function campaignReportReason(value:unknown):typeof campaignReportReasons[number]{
  if(value===null||value===undefined||value==='')return 'none';
  if(typeof value!=='string')return 'other';
  if(value==='merchant_acknowledged')return 'acknowledged';
  if(value==='consent_withdrawn_before_dispatch')return 'consent';
  if(value==='quiet_hours')return 'quiet_hours';
  if(value==='message_limit')return 'capacity';
  if(value==='provider_rate')return 'rate_limit';
  if(['inactive_subscription','campaign_or_merchant_inactive','campaign_authority_suppressed'].includes(value))return 'inactive';
  if(['ambiguous_provider_outcome','quota_without_delivery_receipt','quota_evidence_unavailable','campaign_retry_authority_unavailable'].includes(value))return 'uncertain';
  if(value==='retry_exhausted')return 'retry_exhausted';
  if(['database_unavailable','campaign_context_unavailable','delivery_service_unavailable'].includes(value))return 'unavailable';
  if(value==='provider_rejected'||/^http_4\d\d$/.test(value)&&value!=='http_408')return 'provider_rejected';
  return 'other';
}

/** Parent ownership, summary, filtered count and rows share a read-only snapshot.
 * Result records and queued recipients remain separate datasets, not merged
 * into an invented delivery state. Legacy unlinked logs remain visible. */
export async function readCampaignReport(actorId:number,merchantId:number,raw:unknown,now=new Date()):Promise<CampaignReportSnapshot>{
  identity(actorId);identity(merchantId);const selection=campaignReportInput.parse(raw);if(!Number.isFinite(now.getTime()))throw new CampaignReportUnavailableError();
  try{
    const db=await getDb();if(!db)throw new CampaignReportUnavailableError();
    return await db.transaction(async tx=>{
      const read=async(query:SQL)=>{const result=await tx.execute(query);if(!Array.isArray(result[0]))throw new CampaignReportUnavailableError();return result[0] as Row[];};
      const campaignRows=await read(sql`SELECT c.id,c.name,c.message,c.imageUrl,c.status,c.createdAt,c.scheduledAt,c.totalRecipients,c.sentCount,m.timezone
        FROM campaigns c INNER JOIN merchants m ON m.id=c.merchantId WHERE c.id=${selection.id} AND c.merchantId=${merchantId}`);
      if(!campaignRows.length)throw new CampaignReportMissingError();const c=one(campaignRows);
      let timezone:string|null=c.timezone||'Asia/Riyadh';try{new Intl.DateTimeFormat('en',{timeZone:timezone!});}catch{timezone=null;}
      const validLink=sql`(l.campaign_outbox_id IS NULL OR EXISTS(SELECT 1 FROM campaign_delivery_outbox linked
        WHERE linked.id=l.campaign_outbox_id AND linked.campaign_id=${selection.id} AND linked.merchant_id=${merchantId} AND linked.customer_phone=l.customerPhone))`;
      const logsWhere=sql`l.campaignId=${selection.id} AND ${validLink}`;
      const logCounts=one(await read(sql`SELECT COUNT(*) AS total,COALESCE(SUM(l.status='success'),0) AS success,
        COALESCE(SUM(l.status='failed'),0) AS failed,COALESCE(SUM(l.status='pending'),0) AS pending FROM campaignLogs l WHERE ${logsWhere}`));
      const excludedLinks=integer(one(await read(sql`SELECT COUNT(*) AS total FROM campaignLogs l WHERE l.campaignId=${selection.id} AND NOT ${validLink}`)).total);
      const queueWhere=sql`o.campaign_id=${selection.id} AND o.merchant_id=${merchantId}`;
      const queueCounts=one(await read(sql`SELECT COUNT(*) AS total,COALESCE(SUM(o.status='pending'),0) AS pending,COALESCE(SUM(o.status='processing'),0) AS processing,
        COALESCE(SUM(o.status='sent'),0) AS sent,COALESCE(SUM(o.status='failed'),0) AS failed,COALESCE(SUM(o.status='suppressed'),0) AS suppressed,
        COALESCE(SUM(o.status='manual_review'),0) AS manualReview FROM campaign_delivery_outbox o WHERE ${queueWhere}`));
      const resultFilter=sql`${logsWhere} AND (${selection.status}='all' OR l.status=${selection.status})
        AND (${selection.search}='' OR LOCATE(LOWER(${selection.search}),LOWER(l.customerPhone))>0 OR LOCATE(LOWER(${selection.search}),LOWER(COALESCE(l.customerName,'')))>0)`;
      const recipientFilter=sql`${queueWhere} AND (${selection.status}='all' OR o.status=${selection.status}) AND (${selection.search}='' OR LOCATE(${selection.search},o.customer_phone)>0)`;
      const total=integer(one(await read(selection.view==='results'?sql`SELECT COUNT(*) AS total FROM campaignLogs l WHERE ${resultFilter}`:sql`SELECT COUNT(*) AS total FROM campaign_delivery_outbox o WHERE ${recipientFilter}`)).total);
      const source=await read(selection.view==='results'?
        sql`SELECT l.id,l.customerPhone,l.customerName,l.status,l.errorMessage,l.sentAt FROM campaignLogs l WHERE ${resultFilter} ORDER BY l.sentAt DESC,l.id DESC LIMIT 25 OFFSET ${(selection.page-1)*25}`:
        sql`SELECT o.id,o.customer_phone,o.status,o.attempts,o.quota_reserved,o.last_error,o.updated_at,o.sent_at FROM campaign_delivery_outbox o WHERE ${recipientFilter} ORDER BY o.updated_at DESC,o.id DESC LIMIT 25 OFFSET ${(selection.page-1)*25}`);
      const rows=source.map(row=>selection.view==='results'?{kind:'result' as const,id:integer(row.id),phone:row.customerPhone,name:row.customerName,status:row.status,reason:campaignReportReason(row.errorMessage),recordedAt:iso(row.sentAt)}:
        {kind:'recipient' as const,id:integer(row.id),phone:row.customer_phone,name:null,status:row.status,attempts:integer(row.attempts),quotaHeld:integer(row.quota_reserved)===1,reason:campaignReportReason(row.last_error),recordedAt:iso(row.updated_at),acceptedAt:row.sent_at?iso(row.sent_at):null});
      if(selection.view==='recipients'&&source.some(row=>![0,1].includes(integer(row.quota_reserved))))throw new CampaignReportUnavailableError();
      const results={total:integer(logCounts.total),success:integer(logCounts.success),failed:integer(logCounts.failed),pending:integer(logCounts.pending),excludedLinks};
      const recipients={total:integer(queueCounts.total),pending:integer(queueCounts.pending),processing:integer(queueCounts.processing),sent:integer(queueCounts.sent),failed:integer(queueCounts.failed),suppressed:integer(queueCounts.suppressed),manualReview:integer(queueCounts.manualReview)};
      return campaignReportSchema.parse({actorId,merchantId,canManage:false,selection,checkedAt:now.toISOString(),timezone,
        campaign:{id:integer(c.id),name:c.name,message:c.message,imageUrl:c.imageUrl,status:c.status,createdAt:iso(c.createdAt),scheduledAt:c.scheduledAt?iso(c.scheduledAt):null,recipients:integer(c.totalRecipients),accepted:integer(c.sentCount),basis:'stored_campaign_counters'},
        summary:{results:{...results,successRate:results.total?Math.round(results.success/results.total*1000)/10:0},recipients},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows});
    },{isolationLevel:'repeatable read',accessMode:'read only'});
  }catch(error){if(error instanceof CampaignReportMissingError)throw error;throw new CampaignReportUnavailableError();}
}
