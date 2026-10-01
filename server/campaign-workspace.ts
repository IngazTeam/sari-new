import { sql, type SQL } from 'drizzle-orm';
import { getDb } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { campaignListInput,campaignPageSize,campaignWorkspaceSchema,type CampaignWorkspace } from '../shared/campaign-workspace';

export class CampaignWorkspaceUnavailableError extends Error {
  constructor(){super('Campaign workspace is unavailable');this.name='CampaignWorkspaceUnavailableError';}
}
type Row=Record<string,any>;
type Read=(query:SQL)=>Promise<Row[]>;
function integer(value:unknown):number {
  if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)))throw new CampaignWorkspaceUnavailableError();
  const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw new CampaignWorkspaceUnavailableError();return number;
}
const identity=(value:number)=>{if(!Number.isSafeInteger(value)||value<=0)throw new CampaignWorkspaceUnavailableError();};
const one=(rows:Row[])=>{if(rows.length!==1)throw new CampaignWorkspaceUnavailableError();return rows[0];};
const rate=(accepted:number,total:number)=>total>0?Math.round(accepted/total*1000)/10:0;
function iso(value:string|Date):string {const time=databaseTimeEpoch(value);if(!Number.isFinite(time))throw new CampaignWorkspaceUnavailableError();return new Date(time).toISOString();}
function totalsQuery(merchantId:number) {
  return sql`SELECT COUNT(*) AS total,
    COALESCE(SUM(status='draft'),0) AS draft,COALESCE(SUM(status='scheduled'),0) AS scheduled,
    COALESCE(SUM(status='sending'),0) AS sending,COALESCE(SUM(status='completed'),0) AS completed,COALESCE(SUM(status='failed'),0) AS failed,
    COALESCE(SUM(CASE WHEN status IN ('sending','completed','failed') THEN sentCount ELSE 0 END),0) AS accepted,
    COALESCE(SUM(CASE WHEN status IN ('sending','completed','failed') THEN totalRecipients ELSE 0 END),0) AS recipients,
    COALESCE(SUM(CASE WHEN status='completed' THEN sentCount ELSE 0 END),0) AS completedAccepted,
    COALESCE(SUM(CASE WHEN status='completed' THEN totalRecipients ELSE 0 END),0) AS completedRecipients,
    COALESCE(SUM(sentCount IS NULL OR totalRecipients IS NULL OR sentCount<0 OR totalRecipients<0 OR sentCount>totalRecipients),0) AS invalidCounters
    FROM campaigns WHERE merchantId=${merchantId}`;
}
function totals(row:Row) {
  const summary={total:integer(row.total),draft:integer(row.draft),scheduled:integer(row.scheduled),sending:integer(row.sending),completed:integer(row.completed),failed:integer(row.failed),accepted:integer(row.accepted),recipients:integer(row.recipients)};
  const completedAccepted=integer(row.completedAccepted),completedRecipients=integer(row.completedRecipients);
  if(integer(row.invalidCounters)!==0 || summary.accepted>summary.recipients || completedAccepted>completedRecipients
    || summary.draft+summary.scheduled+summary.sending+summary.completed+summary.failed!==summary.total)throw new CampaignWorkspaceUnavailableError();
  return {summary:{...summary,unconfirmed:summary.recipients-summary.accepted,acceptanceRate:rate(summary.accepted,summary.recipients),acceptanceBasis:'stored_campaign_counters' as const},
    legacy:{totalCampaigns:summary.total,completedCampaigns:summary.completed,activeCampaigns:summary.sending+summary.scheduled,draftCampaigns:summary.draft,
      totalAcceptedByProvider:completedAccepted,totalUnconfirmed:completedRecipients-completedAccepted,providerAcceptanceRate:rate(completedAccepted,completedRecipients)}};
}
/** Preserve the existing completed-campaign metric, but aggregate the entire tenant. */
export async function readCampaignStatistics(merchantId:number) {
  identity(merchantId);
  try {const db=await getDb();if(!db)throw new CampaignWorkspaceUnavailableError();
    const result=await db.execute(totalsQuery(merchantId));return totals(one(result[0] as unknown as Row[])).legacy;
  }catch{throw new CampaignWorkspaceUnavailableError();}
}

/** The page, complete counts and queue state share one repeatable-read snapshot.
 * Historical sentCount is a stored campaign counter, not a reconstructed delivery/read receipt. */
export async function readCampaignWorkspace(actorId:number,merchantId:number,raw:unknown,now=new Date()):Promise<CampaignWorkspace> {
  identity(actorId);identity(merchantId);const selection=campaignListInput.parse(raw);
  if(!Number.isFinite(now.getTime()))throw new CampaignWorkspaceUnavailableError();
  try {
    const db=await getDb();if(!db)throw new CampaignWorkspaceUnavailableError();
    return await db.transaction(async tx=>{
      const read:Read=async query=>{const result=await tx.execute(query);if(!Array.isArray(result[0]))throw new CampaignWorkspaceUnavailableError();return result[0] as Row[];};
      const merchant=one(await read(sql`SELECT id,timezone FROM merchants WHERE id=${merchantId}`));
      if(integer(merchant.id)!==merchantId)throw new CampaignWorkspaceUnavailableError();
      let timezone:string|null=merchant.timezone||'Asia/Riyadh';
      try{new Intl.DateTimeFormat('en',{timeZone:timezone!});}catch{timezone=null;}
      const summary=totals(one(await read(totalsQuery(merchantId)))).summary;
      const where=sql`merchantId=${merchantId} AND (${selection.status}='all' OR status=${selection.status})
        AND (${selection.search}='' OR LOCATE(LOWER(${selection.search}),LOWER(name))>0)`;
      const total=integer(one(await read(sql`SELECT COUNT(*) AS total FROM campaigns WHERE ${where}`)).total);
      const source=await read(sql`SELECT id,name,status,createdAt,scheduledAt,totalRecipients,sentCount FROM campaigns
        WHERE ${where} ORDER BY createdAt DESC,id DESC LIMIT ${campaignPageSize} OFFSET ${(selection.page-1)*campaignPageSize}`);
      const ids=source.map(row=>integer(row.id));
      const queues=ids.length?await read(sql`SELECT campaign_id,COUNT(*) AS total,SUM(status='sent') AS accepted,
        SUM(status IN ('pending','processing','failed')) AS awaiting,SUM(status='suppressed') AS suppressed,SUM(status='manual_review') AS needsReview
        FROM campaign_delivery_outbox WHERE merchant_id=${merchantId} AND campaign_id IN (${sql.join(ids.map(id=>sql`${id}`),sql`,`)}) GROUP BY campaign_id`):[];
      const byCampaign=new Map(queues.map(row=>[integer(row.campaign_id),{total:integer(row.total),accepted:integer(row.accepted),awaiting:integer(row.awaiting),suppressed:integer(row.suppressed),needsReview:integer(row.needsReview)}]));
      const needsReview=integer(one(await read(sql`SELECT COUNT(*) AS total FROM campaign_delivery_outbox o
        JOIN campaigns c ON c.id=o.campaign_id AND c.merchantId=o.merchant_id
        WHERE o.merchant_id=${merchantId} AND o.status='manual_review'`)).total);
      const rows=source.map(row=>({id:integer(row.id),name:row.name,status:row.status,createdAt:iso(row.createdAt),scheduledAt:row.scheduledAt?iso(row.scheduledAt):null,
        recipients:integer(row.totalRecipients),accepted:integer(row.sentCount),queue:byCampaign.get(integer(row.id))??null}));
      return campaignWorkspaceSchema.parse({actorId,merchantId,canManage:false,selection,checkedAt:now.toISOString(),timezone,summary,needsReview,
        pagination:{page:selection.page,pageSize:campaignPageSize,total,pages:Math.ceil(total/campaignPageSize)},rows});
    },{isolationLevel:'repeatable read',accessMode:'read only'});
  }catch{throw new CampaignWorkspaceUnavailableError();}
}
