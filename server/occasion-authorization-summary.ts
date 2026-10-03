import {createHash} from 'node:crypto';
import {occasionAuthorizationSummary,missingOccasionAuthorization} from '../shared/occasion-workspace';
import {parseOccasionAuthorization} from './occasion-authorization';
import {databaseTimeEpoch} from './db/time';

/** Saved approval evidence only. Execution still checks current permissions and exact content. */
export function summarizeOccasionAuthorization(row:any,merchantId:number,occasionId:number,now:Date){
 if(!row)return missingOccasionAuthorization();
 if(row.merchant_id!==merchantId||row.occasion_id!==occasionId)throw Error('Invalid occasion authorization scope');
 const revision=createHash('sha256').update(JSON.stringify([row.id,row.active,row.actor_id,row.review_revision,row.contract_digest,row.prepared_campaign_id,row.prepared_campaign_digest,row.prepared_discount_id,row.prepared_discount_digest,row.created_at,row.revoked_at])).digest('hex');
 const reviewed=databaseTimeEpoch(row.created_at),validStamp=Number.isFinite(reviewed)&&reviewed<=now.getTime();
 const revoked=row.active===null&&Number.isFinite(databaseTimeEpoch(row.revoked_at));
 const contract=parseOccasionAuthorization(revoked?{...row,active:1,revoked_at:null}:row,merchantId,occasionId);
 return occasionAuthorizationSummary.parse({state:!contract||!validStamp?'invalid':revoked?'revoked':Date.parse(contract.expiresAt)<=now.getTime()?'expired':'recorded',actorId:contract?.actorId??null,reviewedAt:validStamp?new Date(reviewed).toISOString():null,expiresAt:contract?.expiresAt??null,revision});
}
