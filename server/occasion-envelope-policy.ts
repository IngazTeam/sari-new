import {databaseTimeEpoch} from './db/time';
import {campaignMessageIssue} from '../shared/campaign-message';
import {getOccasionEndDate,type OccasionType} from '../shared/occasion-calendar';

/** Match the offer disclosed by the occasion review, including its actual expiry. */
export function validPreparedOccasion(campaign:any,discount:any,percent:number,type:OccasionType,occasionDate:Date,now:Date,statuses:readonly string[]=['draft','scheduled']):boolean {
 if(!campaign||!discount||!Number.isInteger(percent)||percent<5||percent>50)return false;
 let audience:unknown;try{audience=typeof campaign.targetAudience==='string'?JSON.parse(campaign.targetAudience):campaign.targetAudience;}catch{return false;}
 const expiry=databaseTimeEpoch(discount.expiresAt),end=getOccasionEndDate(type,occasionDate).getTime();
 return statuses.includes(campaign.status)&&campaign.imageUrl===null&&!campaignMessageIssue(campaign.message,null)
  &&audience!==null&&typeof audience==='object'&&!Array.isArray(audience)&&Object.keys(audience).length===0
  &&discount.type==='percentage'&&discount.value===percent&&discount.minOrderAmount===0&&discount.maxUses===2000
  &&Number.isInteger(discount.usedCount)&&discount.usedCount>=0&&discount.usedCount<2000&&discount.isActive===1
  &&discount.customer_phone===null&&expiry>now.getTime()&&Math.floor(expiry/1000)===Math.floor(end/1000);
}
