import {sql} from 'drizzle-orm';
import {getDb} from './db/connection';
import {databaseTimeEpoch} from './db/time';
import {campaignDetailsInput,campaignDetailsSchema,type CampaignDetailsSnapshot} from '../shared/campaign-details';
import {parseCampaignAudience} from '../shared/campaign-audience';
import {campaignDefinitionKey} from './campaign-definition';

export class CampaignDetailsMissingError extends Error {constructor(){super('Campaign details not found');this.name='CampaignDetailsMissingError';}}
export class CampaignDetailsUnavailableError extends Error {constructor(){super('Campaign details unavailable');this.name='CampaignDetailsUnavailableError';}}
const integer=(value:unknown)=>{if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)))throw new CampaignDetailsUnavailableError();const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new CampaignDetailsUnavailableError();return n;};
const iso=(value:string|Date)=>{const time=databaseTimeEpoch(value);if(!Number.isFinite(time))throw new CampaignDetailsUnavailableError();return new Date(time).toISOString();};

/** Definition and recipient state share one snapshot. The digest binds reviewed
 * content to admission; tenant membership remains the authorization boundary. */
export async function readCampaignDetails(actorId:number,merchantId:number,raw:unknown,now=new Date()):Promise<CampaignDetailsSnapshot>{
  const{id}=campaignDetailsInput.parse(raw);
  if(![actorId,merchantId].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isFinite(now.getTime()))throw new CampaignDetailsUnavailableError();
  try{
    const db=await getDb();if(!db)throw new CampaignDetailsUnavailableError();
    return await db.transaction(async tx=>{
      const result=await tx.execute(sql`SELECT c.id,c.name,c.message,c.imageUrl,c.targetAudience,c.status,c.createdAt,c.scheduledAt,c.totalRecipients,c.sentCount,m.timezone
        FROM campaigns c INNER JOIN merchants m ON m.id=c.merchantId WHERE c.id=${id} AND c.merchantId=${merchantId}`);
      const rows=result[0] as unknown as Record<string,any>[];if(!Array.isArray(rows)||rows.length>1)throw new CampaignDetailsUnavailableError();if(!rows.length)throw new CampaignDetailsMissingError();const c=rows[0];
      if(integer(c.id)!==id)throw new CampaignDetailsUnavailableError();
      let timezone:string|null=c.timezone||'Asia/Riyadh';try{new Intl.DateTimeFormat('en',{timeZone:timezone!});}catch{timezone=null;}
      let audience:CampaignDetailsSnapshot['audience'];try{audience={status:'valid',filters:parseCampaignAudience(c.targetAudience)};}catch{audience={status:'invalid'};}
      const [counts]=await tx.execute(sql`SELECT COUNT(*) AS total,COALESCE(SUM(merchant_id<>${merchantId}),0) AS excluded,
        COALESCE(SUM(merchant_id=${merchantId} AND status='sent'),0) AS accepted,
        COALESCE(SUM(merchant_id=${merchantId} AND status IN ('pending','processing','failed')),0) AS awaiting,
        COALESCE(SUM(merchant_id=${merchantId} AND status='suppressed'),0) AS suppressed,
        COALESCE(SUM(merchant_id=${merchantId} AND status='manual_review'),0) AS needsReview
        FROM campaign_delivery_outbox WHERE campaign_id=${id}`);
      const countRows=counts as unknown as Record<string,any>[];if(!Array.isArray(countRows)||countRows.length!==1)throw new CampaignDetailsUnavailableError();const q=countRows[0],excludedRecipients=integer(q.excluded),total=integer(q.total)-excludedRecipients;
      return campaignDetailsSchema.parse({actorId,merchantId,canManage:false,checkedAt:now.toISOString(),timezone,audience,excludedRecipients,
        campaign:{id:integer(c.id),name:c.name,message:c.message,imageUrl:c.imageUrl,status:c.status,createdAt:iso(c.createdAt),scheduledAt:c.scheduledAt?iso(c.scheduledAt):null,
          recipients:integer(c.totalRecipients),accepted:integer(c.sentCount),basis:'stored_campaign_counters',definitionKey:campaignDefinitionKey(c as any)},
        queue:total?{total,accepted:integer(q.accepted),awaiting:integer(q.awaiting),suppressed:integer(q.suppressed),needsReview:integer(q.needsReview)}:null,
      });
    },{isolationLevel:'repeatable read',accessMode:'read only'});
  }catch(error){if(error instanceof CampaignDetailsMissingError)throw error;throw new CampaignDetailsUnavailableError();}
}
